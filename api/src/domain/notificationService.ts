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
