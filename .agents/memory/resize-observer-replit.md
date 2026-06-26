---
name: ResizeObserver false crash in Replit
description: React Flow triggers a Chrome ResizeObserver warning that Replit's monitoring misidentifies as a fatal crash — how to suppress it.
---

## The Rule

Add both a capture-phase `window.addEventListener("error", ...)` AND a `window.onerror` override in `main.tsx` to suppress `ResizeObserver loop` browser errors. Do this for any app that uses React Flow.

**Why:** Chrome fires `"ResizeObserver loop completed with undelivered notifications"` as a `window.onerror` event with `event.error = null` (not an Error instance) when React Flow's node ResizeObserver delivers notifications across animation frames. Replit's parent-frame monitoring detects `event.error instanceof Error === false` and reports "An uncaught exception occurred but the error was not an error object", then reloads the page. The app itself is completely functional — only Replit's monitoring is confused. `window.onerror` returning `true` alone is insufficient because Replit uses a separate `window.addEventListener("error", ...)` listener that fires independently.

**How to apply:** In `artifacts/<app>/src/main.tsx` (before `createRoot`):

```ts
const RESIZE_MSGS = [
  "ResizeObserver loop completed with undelivered notifications",
  "ResizeObserver loop limit exceeded",
];
function isResize(msg: unknown) {
  return typeof msg === "string" && RESIZE_MSGS.some(m => (msg as string).includes(m));
}
// Capture-phase — fires before Replit's bubble-phase listener
window.addEventListener("error", (event) => {
  if (isResize(event.message)) { event.stopImmediatePropagation(); event.preventDefault(); }
}, true);
// Legacy belt-and-suspenders
const _prev = window.onerror;
window.onerror = function(msg, src, line, col, err) {
  if (isResize(msg)) return true;
  return _prev ? _prev.call(this, msg, src, line, col, err) : false;
};
```
