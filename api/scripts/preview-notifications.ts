import dotenv from "dotenv";
import { getNotificationConfig } from "../src/domain/notificationConfig.js";
import { planNotifications } from "../src/domain/notificationService.js";
import { buildCaseStages } from "../src/domain/hierarchy.js";
import { evaluateRules } from "../src/domain/rulesEngine.js";

dotenv.config({ path: ".env.notifications.local" });
const config = { ...getNotificationConfig({ ...process.env, NOTIFICATION_MODE: "preview" }), mode: "preview" as const };
if (!config.testEmail) throw new Error("Set NOTIFICATION_TEST_EMAIL for local preview");
const evaluation = evaluateRules({
  legalName: "Synthetic Demo Vendor", arrangementType: "Service", description: "Synthetic test data only",
  businessLines: "Test", contractOwner: "Synthetic Owner",
  q2_itInfrastructure: "Yes it will be an SSO integration only",
  q3_aiMl: "Yes", q4_dataProtection: "Yes the third party will access PI", q5_dataResidency: "Yes",
});
const stages = buildCaseStages(evaluation);
console.log(JSON.stringify(planNotifications(
  { id: "synthetic-preview-case", caseNumber: "#TEST-001", vendorName: "Synthetic Demo Vendor" },
  stages.filter((stage) => stage.status === "active"),
  evaluation.requiredAssessments.has("UpguardAssessment"), config,
), null, 2));
console.log("Preview only. No database writes and no emails sent.");
