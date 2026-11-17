// A small, self-dismissing message at the top of the screen — used instead
// of the browser's alert() box, which blocks the page and looks broken.
export function showNotice(message: string, tone: "info" | "error" = "info") {
  if (typeof document === "undefined") return;
  const el = document.createElement("div");
  el.setAttribute("role", tone === "error" ? "alert" : "status");
  el.textContent = message;
  Object.assign(el.style, {
    position: "fixed", top: "68px", left: "50%", transform: "translateX(-50%)", zIndex: "1000",
    maxWidth: "min(560px, calc(100vw - 32px))", padding: "10px 16px", borderRadius: "8px",
    fontFamily: "'Inter', 'Segoe UI', sans-serif", fontSize: "13px", lineHeight: "1.45",
    boxShadow: "0 6px 20px rgba(0,0,0,0.15)",
    background: tone === "error" ? "#fef2f2" : "#eff6ff",
    border: `1px solid ${tone === "error" ? "#fecaca" : "#bfdbfe"}`,
    color: tone === "error" ? "#991b1b" : "#1e3a8a",
  } as Partial<CSSStyleDeclaration>);
  document.body.appendChild(el);
  window.setTimeout(() => el.remove(), 6000);
}
