// TODO(Azure): wire this up to a real email provider once you decide which:
//   Option A — Microsoft Graph `sendMail` from a shared mailbox/service
//     account, using the SAME app registration + client secret as the
//     SharePoint integration (Mail.Send application permission). No new
//     Azure resource needed — reuses what you're already setting up.
//   Option B — Azure Communication Services Email (a dedicated Azure
//     resource for transactional email, not tied to a mailbox).
//   Option C — SendGrid (third-party, common on Azure but a separate
//     account/billing relationship).
// Whichever you pick, only the inside of `sendEmail()` below needs to
// change — everything that calls this file stays the same.

export interface EmailMessage {
  to: string[];
  subject: string;
  body: string;
}

async function sendEmail(message: EmailMessage): Promise<void> {
  // MOCKED — logs instead of actually sending. Replace this function body
  // with a real Graph/ACS/SendGrid call when ready.
  console.log(`[MOCK EMAIL] To: ${message.to.join(", ")}\nSubject: ${message.subject}\n${message.body}\n`);
}

/** Sent when a case's stage becomes active for a team — i.e. it's now sitting in their queue. */
export async function notifyCaseReadyForTeam(params: {
  teamName: string;
  teamMemberEmails: string[];
  caseNumber: string;
  vendorName: string;
  caseUrl?: string;
}): Promise<void> {
  const { teamName, teamMemberEmails, caseNumber, vendorName, caseUrl } = params;
  if (teamMemberEmails.length === 0) return; // no members on record yet — nothing to send

  await sendEmail({
    to: teamMemberEmails,
    subject: `[${teamName}] New case ready for review — ${vendorName} (${caseNumber})`,
    body:
      `A case has reached your team's queue and is ready for review.\n\n` +
      `Vendor: ${vendorName}\n` +
      `Case: ${caseNumber}\n` +
      (caseUrl ? `Open it here: ${caseUrl}\n` : ""),
  });
}

/** Link back into the app, when APP_URL is configured (e.g. https://<your-static-web-app>). */
function appLink(): string {
  const url = process.env.APP_URL?.trim();
  return url ? `\nOpen VendorTrace: ${url}\n` : "";
}

/**
 * Sent to a team that owns an assessment (Privacy → PIA, Data/AI → DIA,
 * Security Governance → UpGuard) when the business owner marks it complete.
 */
export async function notifyAssessmentCompleted(params: {
  teamName: string;
  teamMemberEmails: string[];
  caseNumber: string;
  vendorName: string;
  assessmentLabel: string;
  completedBy: string;
}): Promise<void> {
  const { teamName, teamMemberEmails, caseNumber, vendorName, assessmentLabel, completedBy } = params;
  if (teamMemberEmails.length === 0) return;
  await sendEmail({
    to: teamMemberEmails,
    subject: `[${teamName}] ${assessmentLabel} marked complete — ${vendorName} (${caseNumber})`,
    body:
      `The business owner has marked the ${assessmentLabel} complete on their side.\n\n` +
      `Vendor: ${vendorName}\n` +
      `Case: ${caseNumber}\n` +
      `Marked complete by: ${completedBy}\n` +
      appLink(),
  });
}

/** Sent to the same teams if the business owner un-marks it (e.g. they need to revise it). */
export async function notifyAssessmentReopened(params: {
  teamName: string;
  teamMemberEmails: string[];
  caseNumber: string;
  vendorName: string;
  assessmentLabel: string;
  reopenedBy: string;
}): Promise<void> {
  const { teamName, teamMemberEmails, caseNumber, vendorName, assessmentLabel, reopenedBy } = params;
  if (teamMemberEmails.length === 0) return;
  await sendEmail({
    to: teamMemberEmails,
    subject: `[${teamName}] ${assessmentLabel} reopened — ${vendorName} (${caseNumber})`,
    body:
      `The business owner has un-marked the ${assessmentLabel} as complete — they're still working on it.\n\n` +
      `Vendor: ${vendorName}\n` +
      `Case: ${caseNumber}\n` +
      `Reopened by: ${reopenedBy}\n` +
      appLink(),
  });
}

/** Reminder to the business owner listing every assessment that's overdue on one case. */
export async function sendAssessmentReminder(params: {
  to: string;
  businessOwner: string;
  caseNumber: string;
  vendorName: string;
  overdue: { label: string; daysOutstanding: number; fileUrl?: string | null }[];
}): Promise<void> {
  const { to, businessOwner, caseNumber, vendorName, overdue } = params;
  const lines = overdue
    .map((a) => `  • ${a.label} — assigned ${a.daysOutstanding} day${a.daysOutstanding === 1 ? "" : "s"} ago${a.fileUrl ? `\n    ${a.fileUrl}` : ""}`)
    .join("\n");
  await sendEmail({
    to: [to],
    subject: `Reminder: ${overdue.length === 1 ? overdue[0].label : `${overdue.length} assessments`} still to complete — ${vendorName} (${caseNumber})`,
    body:
      `Hi ${businessOwner},\n\n` +
      `This is a reminder that the following assessment${overdue.length === 1 ? " is" : "s are"} still waiting for you on ${vendorName} (${caseNumber}):\n\n` +
      `${lines}\n\n` +
      `Once you've finished, open the case in VendorTrace and click "Mark complete" so the reviewing team is notified. ` +
      `You'll get a reminder like this every 7 days until then.\n` +
      appLink(),
  });
}
