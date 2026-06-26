import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

// "ResizeObserver loop completed with undelivered notifications" is a benign
// Chrome browser warning that fires when React Flow's ResizeObserver measures
// many nodes in the same animation frame cycle. Chrome emits it as a
// window.onerror event with event.error = null (not an Error instance).
// Replit's monitoring detects event.error instanceof Error === false and
// reports a false "uncaught exception" crash.
//
// We suppress it via two mechanisms:
//   1. window.onerror returning true (prevents default browser handling)
//   2. capture-phase addEventListener (stops propagation before Replit's
//      bubble-phase listener fires)
const RESIZE_OBSERVER_MSGS = [
  "ResizeObserver loop completed with undelivered notifications",
  "ResizeObserver loop limit exceeded",
];

function isResizeObserverError(message: unknown): boolean {
  return (
    typeof message === "string" &&
    RESIZE_OBSERVER_MSGS.some((m) => (message as string).includes(m))
  );
}

// Capture-phase listener — fires before bubble-phase listeners (including Replit's).
window.addEventListener(
  "error",
  (event) => {
    if (isResizeObserverError(event.message)) {
      event.stopImmediatePropagation();
      event.preventDefault();
    }
  },
  true, // capture phase
);

// Legacy window.onerror override — belt-and-suspenders.
const _prevOnError = window.onerror;
window.onerror = function (message, source, lineno, colno, error) {
  if (isResizeObserverError(message)) return true;
  if (_prevOnError) return _prevOnError.call(this, message, source, lineno, colno, error);
  return false;
};

window.addEventListener("unhandledrejection", (event) => {
  const r = event.reason;
  if (!(r instanceof Error)) {
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
