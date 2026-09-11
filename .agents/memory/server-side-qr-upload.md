---
name: Server-side QR uploads
description: Production-safe upload pattern for private QR images stored in Replit App Storage
---

Private QR image uploads should go through the authenticated API and the Replit sidecar-backed Google Cloud Storage client instead of relying on a browser PUT to a cross-origin presigned URL.

**Why:** The browser upload-url request can succeed while the direct storage PUT fails with a WebKit-style `Load failed` before the API ever reaches PNG parsing or QR validation.

**How to apply:** Keep the storage bucket private, generate object paths server-side, validate PNG/QR/address before and after storage read-back, and return only the object path—not signed URLs or storage credentials—to the browser.