import { prisma } from "../db.js";
import { isAssessmentComplete } from "../domain/caseEngine.js";
import { sendAssessmentReminder } from "../domain/notificationService.js";

// ─── Business-owner assessment reminders ────────────────────────────────────
// A required assessment (PIA / DIA / UpGuard) that the business owner hasn't
// marked complete gets a reminder 7 days after it was assigned, then another
// every 7 days until it's done. One email per case lists everything overdue.
//
// The job is safe to run as often as you like (it runs hourly inside the API
// and can also be triggered via POST /api/jobs/assessment-reminders): each
// assessment is "claimed" with a conditional update before the email goes
// out, so two API instances can't double-send, and a failed send is rolled
// back so it's retried next run.
//
// Timing is configurable without code changes:
//   REMINDER_FIRST_AFTER_DAYS  (default 7)
//   REMINDER_REPEAT_EVERY_DAYS (default 7 — set to 1 for daily follow-ups)
//   REMINDERS_ENABLED=false    turns the hourly in-process run off

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ReminderSettings {
  firstAfterDays: number;
  repeatEveryDays: number;
}

export function reminderSettings(): ReminderSettings {
  const num = (v: string | undefined, d: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : d;
  };
  return {
    firstAfterDays: num(process.env.REMINDER_FIRST_AFTER_DAYS, 7),
    repeatEveryDays: num(process.env.REMINDER_REPEAT_EVERY_DAYS, 7),
  };
}

interface AssessmentRow {
  id: number;
  key: string;
  label: string;
  status: string;
  applicable: boolean;
  fileUrl: string | null;
  requiredSince: Date | null;
  boCompletedAt: Date | null;
  lastReminderAt: Date | null;
}

/** Pure: is a reminder due for this assessment at `now`? */
export function isReminderDue(a: AssessmentRow, now: Date, s: ReminderSettings = reminderSettings()): boolean {
  if (!a.applicable || !a.requiredSince) return false;
  if (isAssessmentComplete(a)) return false;
  if (a.lastReminderAt) return now.getTime() - a.lastReminderAt.getTime() >= s.repeatEveryDays * DAY_MS;
  return now.getTime() - a.requiredSince.getTime() >= s.firstAfterDays * DAY_MS;
}

export interface ReminderRunResult {
  casesChecked: number;
  emailsSent: number;
  assessmentsReminded: number;
  skippedNoEmail: string[];
  failed: string[];
}

export async function runAssessmentReminders(now: Date = new Date()): Promise<ReminderRunResult> {
  const settings = reminderSettings();
  const result: ReminderRunResult = { casesChecked: 0, emailsSent: 0, assessmentsReminded: 0, skippedNoEmail: [], failed: [] };

  const cases = await prisma.case.findMany({
    where: { overallStatus: { in: ["new", "inProgress"] } },
    include: { assessments: true },
  });

  for (const c of cases as any[]) {
    result.casesChecked++;
    const due = (c.assessments as AssessmentRow[]).filter((a) => isReminderDue(a, now, settings));
    if (due.length === 0) continue;
    if (!c.businessOwnerEmail) {
      result.skippedNoEmail.push(c.caseNumber);
      continue;
    }

    // Claim each assessment: only succeeds if nobody else reminded it since we read it.
    const claimed: AssessmentRow[] = [];
    for (const a of due) {
      const { count } = await prisma.caseAssessment.updateMany({
        where: { id: a.id, lastReminderAt: a.lastReminderAt, boCompletedAt: null },
        data: { lastReminderAt: now, reminderCount: { increment: 1 } },
      });
      if (count === 1) claimed.push(a);
    }
    if (claimed.length === 0) continue;

    try {
      await sendAssessmentReminder({
        to: c.businessOwnerEmail,
        businessOwner: c.businessOwner,
        caseNumber: c.caseNumber,
        vendorName: c.vendorName,
        overdue: claimed.map((a) => ({
          label: a.label,
          daysOutstanding: Math.floor((now.getTime() - a.requiredSince!.getTime()) / DAY_MS),
          fileUrl: a.fileUrl,
        })),
      });
      result.emailsSent++;
      result.assessmentsReminded += claimed.length;
    } catch (err) {
      // Put things back so the next run tries again.
      console.error(`Reminder email for ${c.caseNumber} failed:`, err);
      result.failed.push(c.caseNumber);
      for (const a of claimed) {
        await prisma.caseAssessment.updateMany({
          where: { id: a.id, lastReminderAt: now },
          data: { lastReminderAt: a.lastReminderAt, reminderCount: { decrement: 1 } },
        });
      }
    }
  }

  return result;
}

/** Runs shortly after startup and then hourly. Delays (e.g. the app sleeping) only push reminders later — nothing is lost or doubled. */
export function startReminderScheduler(): void {
  if (process.env.REMINDERS_ENABLED === "false") {
    console.log("Assessment reminders: disabled (REMINDERS_ENABLED=false).");
    return;
  }
  const tick = () =>
    runAssessmentReminders()
      .then((r) => {
        if (r.emailsSent || r.skippedNoEmail.length || r.failed.length) console.log("Assessment reminders:", JSON.stringify(r));
      })
      .catch((err) => console.error("Assessment reminder run failed:", err));
  setTimeout(tick, 60_000).unref();
  setInterval(tick, 60 * 60_000).unref();
}
