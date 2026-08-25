import { useState } from "react";
import Header from "../components/Header";
import { Case, TEAM_LABELS } from "../lib/schema";
import { parseTprmWorkbook, TprmParseError } from "../lib/tprmParser";
import { evaluateRules } from "../lib/rulesEngine";
import { createCaseViaApi } from "../lib/caseStore";
import { getBlankTprmTemplateUrl } from "../lib/sharepointService";

interface NewCaseIntakeProps {
  businessOwner: string;
  businessOwnerEmail: string;
  onBack: () => void;
  onCreated: (c: Case) => void;
}

type Step = "download" | "upload" | "preview" | "creating" | "error";

export default function NewCaseIntake({ businessOwner, businessOwnerEmail, onBack, onCreated }: NewCaseIntakeProps) {
  const [step, setStep] = useState<Step>("download");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof parseTprmWorkbook>> | null>(null);
  const [triggeredTeams, setTriggeredTeams] = useState<string[]>([]);
  const [requiredAssessments, setRequiredAssessments] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [downloaded, setDownloaded] = useState(false);

  async function handleFileSelected(selected: File) {
    setFile(selected);
    setErrorMessage("");
    try {
      // Client-side parse, purely for this instant preview — the server
      // re-parses and re-runs the rules itself as the authoritative version
      // when the case is actually submitted below.
      const facts = await parseTprmWorkbook(selected);
      const evaluation = evaluateRules(facts);
      setPreview(facts);
      setTriggeredTeams(Array.from(evaluation.triggeredTeams).map((t) => TEAM_LABELS[t]));
      setRequiredAssessments(
        Array.from(evaluation.requiredAssessments).map((a) => (a === "PIA" ? "Privacy Impact Assessment (PIA)" : "Data & AI Impact Assessment"))
      );
      setStep("preview");
    } catch (err) {
      setErrorMessage(err instanceof TprmParseError ? err.message : "Couldn't read that file. Please make sure it's the standard TPRM .xlsx workbook.");
      setStep("error");
    }
  }

  async function handleConfirmCreate() {
    if (!file) return;
    setStep("creating");
    try {
      const formData = new FormData();
      formData.append("tprmFile", file);
      formData.append("businessOwner", businessOwner);
      formData.append("businessOwnerEmail", businessOwnerEmail);
      const created = await createCaseViaApi(formData);
      onCreated(created);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong creating the case. Please try again.");
      setStep("error");
    }
  }

  return (
    <div style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif", minHeight: "100vh", background: "#f1f5f9" }}>
      <Header onBack={onBack} title="Start New Vendor Assessment" subtitle="Business Owner" />
      <div style={{ maxWidth: 640, margin: "32px auto", padding: "0 24px" }}>
        {step === "download" && (
          <div style={{ background: "#fff", borderRadius: 12, padding: 32, boxShadow: "0 1px 6px rgba(0,0,0,0.07)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#0f4c3a", letterSpacing: 0.4, marginBottom: 6 }}>STEP 1 OF 2</div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#0f4c3a", margin: "0 0 8px" }}>Download the blank TPRM workbook</h2>
            <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6, margin: "0 0 20px" }}>
              We'll pull a fresh copy of the Third-Party Risk and Criticality Assessment straight from the TPRM
              SharePoint library and save it to your computer. Fill in Step 1–3 (Start Here, Criticality Assessment,
              and TP Risk Assessment) exactly as laid out, save your changes, then come back here and upload your
              completed copy.
            </p>
            <a
              href={getBlankTprmTemplateUrl()}
              download
              onClick={() => setDownloaded(true)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 8, background: "#0f4c3a", color: "#fff",
                borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 600, textDecoration: "none",
                boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
              }}
            >
              📥 Download Blank TPRM Workbook
            </a>
            <div style={{ marginTop: 24, display: "flex", gap: 10 }}>
              <button
                onClick={() => setStep("upload")}
                style={{
                  padding: "10px 20px", border: "none", borderRadius: 8,
                  background: downloaded ? "#0f4c3a" : "#94a3b8", color: "#fff",
                  fontWeight: 600, fontSize: 13, cursor: "pointer",
                }}
              >
                I've filled it out — continue to upload
              </button>
            </div>
            {!downloaded && (
              <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 10 }}>
                Tip: download the template above first — you'll need your completed copy on the next step.
              </p>
            )}
          </div>
        )}

        {step === "upload" && (
          <div style={{ background: "#fff", borderRadius: 12, padding: 32, boxShadow: "0 1px 6px rgba(0,0,0,0.07)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#0f4c3a", letterSpacing: 0.4, marginBottom: 6 }}>STEP 2 OF 2</div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#0f4c3a", margin: "0 0 8px" }}>Upload your completed TPRM workbook</h2>
            <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6, margin: "0 0 20px" }}>
              Upload the same workbook you downloaded and filled in. We'll read the vendor's legal name,
              description, risk tier, and answers automatically to create the case and figure out which teams need to be involved.
            </p>
            <label
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                gap: 8, border: "2px dashed #cbd5e1", borderRadius: 10, padding: "36px 20px",
                cursor: "pointer", color: "#64748b", fontSize: 13,
              }}
            >
              <span style={{ fontSize: 28 }}>📄</span>
              <span>Click to choose your completed .xlsx file</span>
              <input
                type="file"
                accept=".xlsx"
                style={{ display: "none" }}
                onChange={(e) => e.target.files?.[0] && handleFileSelected(e.target.files[0])}
              />
            </label>
            <button
              onClick={() => setStep("download")}
              style={{ marginTop: 16, padding: "9px 18px", border: "1.5px solid #cbd5e1", borderRadius: 8, background: "#fff", color: "#64748b", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
            >
              Back to download step
            </button>
          </div>
        )}

        {step === "error" && (
          <div style={{ background: "#fff", borderRadius: 12, padding: 32, boxShadow: "0 1px 6px rgba(0,0,0,0.07)" }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#991b1b", margin: "0 0 8px" }}>Couldn't process that file</h2>
            <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6, margin: "0 0 20px" }}>{errorMessage}</p>
            <button
              onClick={() => setStep("upload")}
              style={{ padding: "9px 18px", border: "1.5px solid #0f4c3a", borderRadius: 8, background: "#fff", color: "#0f4c3a", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
            >
              Try another file
            </button>
          </div>
        )}

        {(step === "preview" || step === "creating") && preview && (
          <div style={{ background: "#fff", borderRadius: 12, padding: 32, boxShadow: "0 1px 6px rgba(0,0,0,0.07)" }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "#0f4c3a", margin: "0 0 4px" }}>Confirm before creating the case</h2>
            <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 20px" }}>Extracted from {file?.name}</p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
              <Field label="Legal Name of Third Party" value={preview.legalName} />
              <Field label="Arrangement Type" value={preview.arrangementType} />
              <Field label="Business Lines Impacted" value={preview.businessLines} />
              <Field label="Contract Owner / Sponsor" value={preview.contractOwner} />
              <Field label="Risk Tier" value={preview.riskTier ?? "Not yet rated"} />
              <Field label="Criticality" value={preview.criticality ?? "—"} />
            </div>
            <Field label="Description of Services" value={preview.description} fullWidth />

            <div style={{ margin: "20px 0" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", marginBottom: 8 }}>TEAMS THAT WILL BE INVOLVED — PVM, BUSINESS ARCHITECTURE &amp; RISK REVIEW TOGETHER FIRST</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                <Chip label="PVM" />
                <Chip label="Business Architecture" />
                <Chip label="Risk" />
                {triggeredTeams.map((t) => (
                  <Chip key={t} label={t} />
                ))}
                <Chip label="Enterprise Architecture" />
              </div>
            </div>

            {requiredAssessments.length > 0 && (
              <div style={{ margin: "20px 0" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", marginBottom: 8 }}>ASSESSMENTS REQUIRED IN THIS CASE</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {requiredAssessments.map((a) => (
                    <Chip key={a} label={a} tone="warn" />
                  ))}
                </div>
              </div>
            )}

            <p style={{ fontSize: 12, color: "#64748b", lineHeight: 1.6, margin: "16px 0 24px" }}>
              Submitting will create the case and open the review workflow. Once SharePoint access is approved,
              the backend will create a folder named <strong>{preview.legalName}</strong>, upload the completed
              workbook, and add only the required assessment templates. Until then, the case will be clearly marked
              as SharePoint setup pending rather than showing fake document links.
            </p>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setStep("upload")}
                disabled={step === "creating"}
                style={{ padding: "10px 20px", border: "1.5px solid #cbd5e1", borderRadius: 8, background: "#fff", color: "#64748b", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
              >
                Back
              </button>
              <button
                onClick={handleConfirmCreate}
                disabled={step === "creating"}
                style={{ padding: "10px 20px", border: "none", borderRadius: 8, background: "#0f4c3a", color: "#fff", fontWeight: 600, fontSize: 13, cursor: step === "creating" ? "default" : "pointer", opacity: step === "creating" ? 0.7 : 1 }}
              >
                {step === "creating" ? "Creating case…" : "Submit & Create Case"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, fullWidth }: { label: string; value: string; fullWidth?: boolean }) {
  return (
    <div style={{ gridColumn: fullWidth ? "1 / -1" : undefined }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, color: "#334155" }}>{value || "—"}</div>
    </div>
  );
}

function Chip({ label, tone = "default" }: { label: string; tone?: "default" | "warn" }) {
  const styles = tone === "warn" ? { bg: "#fef3c7", color: "#92400e" } : { bg: "#e0f2ec", color: "#0f4c3a" };
  return (
    <span style={{ background: styles.bg, color: styles.color, borderRadius: 999, padding: "4px 12px", fontSize: 12, fontWeight: 600 }}>
      {label}
    </span>
  );
}
