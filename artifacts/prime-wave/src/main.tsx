import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

window.addEventListener("unhandledrejection", (event) => {
  const r = event.reason;
  const isErr = r instanceof Error;
  if (!isErr) {
    console.error("[PW] Non-Error unhandled rejection:", {
      type: typeof r,
      constructor: r?.constructor?.name ?? "(none)",
      value: (() => { try { return JSON.stringify(r); } catch { return String(r); } })(),
    });
  }
});

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

createRoot(root).render(<App />);
