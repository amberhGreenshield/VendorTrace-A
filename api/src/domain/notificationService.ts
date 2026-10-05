import type { Prisma } from "@prisma/client";
import { NotificationConfig, recipientsForTeam, toTeamKey } from "./notificationConfig.js";
import { TEAM_LABELS } from "./schema.js";

export interface NotificationCase {
  id: string;
  caseNumber: string;
  vendorName: string;
}
export interface NotificationStage {
  stageKey: string;
  team: string;
}
export interface PlannedNotification {
  dedupeKey: string;
  caseId: string;
  kind: "teamInbox" | "upguardSetup";
  teamKey: string;
  stageKey: string | null;
  recipient: string;
  subject: string;
  body: string;
  mode: NotificationConfig["mode"];
  status: "pending" | "previewed";
}

function oneLine(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 200);
}

function caseLink(config: NotificationConfig, caseNumber: string): string {
  // The current frontend has no case deep-link route. Link to the app and identify the case to open.
  return config.appUrl
    ? `\nOpen VendorTrace: ${config.appUrl}\nFind case ${oneLine(caseNumber)} in your team's dashboard.\n`
    : "\nOpen VendorTrace and find this case in your team's dashboard.\n";
}

export function planNotifications(
  caseRecord: NotificationCase,
  activatedStages: NotificationStage[],
  upguardSetupRequired: boolean,
  config: NotificationConfig,
): PlannedNotification[] {
  const plans: PlannedNotification[] = [];
  const vendor = oneLine(caseRecord.vendorName);
  const caseNumber = oneLine(caseRecord.caseNumber);
  const prefix = config.mode === "live" ? "" : "[TEST] ";
  const status = config.mode === "preview" ? "previewed" : "pending";
  for (const stage of activatedStages) {
    const team = toTeamKey(stage.team);
    for (const recipient of recipientsForTeam(config, team)) {
      plans.push({
        dedupeKey: `${caseRecord.id}:team:${stage.stageKey}:${recipient}`,
        caseId: caseRecord.id,
        kind: "teamInbox",
        teamKey: team,
        stageKey: stage.stageKey,
        recipient,
        subject: `${prefix}[${TEAM_LABELS[team]}] Case ready for review — ${vendor} (${caseNumber})`,
        body: `A case has entered the ${TEAM_LABELS[team]} team's inbox and is ready for review.\n\nVendor: ${vendor}\nCase: ${caseNumber}\nReview stage: ${oneLine(stage.stageKey)}\n${caseLink(config, caseNumber)}`,
        mode: config.mode,
        status,
      });
    }
  }
  if (upguardSetupRequired) {
    for (const recipient of recipientsForTeam(config, "SecurityGovernance")) {
      plans.push({
        dedupeKey: `${caseRecord.id}:upguard:${recipient}`,
        caseId: caseRecord.id,
        kind: "upguardSetup",
        teamKey: "SecurityGovernance",
        stageKey: null,
        recipient,
        subject: `${prefix}[Security Governance] UpGuard setup required — ${vendor} (${caseNumber})`,
        body: `A newly created VendorTrace case requires an UpGuard security assessment based on its TPRM answers.\n\nVendor: ${vendor}\nCase: ${caseNumber}\n\nPlease arrange the UpGuard assessment with the vendor through your approved contact process.\nThis is an advance setup request; it does not mean the Security Governance review stage is active yet.\n${caseLink(config, caseNumber)}`,
        mode: config.mode,
        status,
      });
    }
  }
  return Array.from(new Map(plans.map((plan) => [plan.dedupeKey, plan])).values());
}

/** Called inside the same DB transaction as creation or stage activation. */
export async function enqueueNotifications(
  tx: Prisma.TransactionClient,
  caseRecord: NotificationCase,
  activatedStages: NotificationStage[],
  upguardSetupRequired: boolean,
  config: NotificationConfig,
): Promise<void> {
  const data = planNotifications(caseRecord, activatedStages, upguardSetupRequired, config);
  if (data.length) await tx.emailNotification.createMany({ data, skipDuplicates: true });
}
