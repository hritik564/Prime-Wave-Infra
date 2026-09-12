import type { Request, Response, NextFunction } from "express";

export const MAINTENANCE_TITLE = "Service Unavailable · 503";
export const MAINTENANCE_DETAIL = "Please try again later.";
export const MAINTENANCE_RETRY_AFTER_SECONDS = 3600;

const MAINTENANCE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${MAINTENANCE_TITLE}</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: Georgia, "Times New Roman", serif;
        background: #050b1a;
        color: rgba(255,255,255,0.9);
      }
      * { box-sizing: border-box; }
      body {
        min-height: 100vh;
        margin: 0;
        display: grid;
        place-items: center;
        padding: 24px;
        background:
          radial-gradient(circle at 50% 20%, rgba(212,175,55,0.12), transparent 34rem),
          #050b1a;
      }
      main {
        width: min(100%, 460px);
        padding: 48px 36px;
        text-align: center;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 18px;
        background: rgba(14,27,55,0.88);
        box-shadow: 0 24px 70px rgba(0,0,0,0.42);
      }
      .mark {
        width: 54px;
        height: 54px;
        margin: 0 auto 28px;
        display: grid;
        place-items: center;
        border-radius: 14px;
        background: #d4af37;
        color: #050b1a;
        font: 700 18px Arial, sans-serif;
      }
      h1 {
        margin: 0;
        font-size: clamp(22px, 5vw, 30px);
        font-weight: 500;
        letter-spacing: -0.02em;
      }
      p {
        margin: 14px 0 0;
        color: rgba(255,255,255,0.62);
        font: 14px Arial, sans-serif;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="mark" aria-hidden="true">PW</div>
      <h1>${MAINTENANCE_TITLE}</h1>
      <p>${MAINTENANCE_DETAIL}</p>
    </main>
  </body>
</html>`;

export function isMaintenanceMode(): boolean {
  return process.env["MAINTENANCE_MODE"] === "true";
}

function setMaintenanceHeaders(res: Response): void {
  res
    .set("Retry-After", String(MAINTENANCE_RETRY_AFTER_SECONDS))
    .set("Cache-Control", "no-store");
}

export function maintenanceWebGate(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!isMaintenanceMode() || req.path.startsWith("/api")) {
    next();
    return;
  }

  setMaintenanceHeaders(res);
  res.status(503).type("html").send(MAINTENANCE_HTML);
}

export function rejectAdminLoginDuringMaintenance(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!isMaintenanceMode()) {
    next();
    return;
  }

  setMaintenanceHeaders(res);
  res.status(503).json({
    success: false,
    message: `${MAINTENANCE_TITLE}\n${MAINTENANCE_DETAIL}`,
  });
}