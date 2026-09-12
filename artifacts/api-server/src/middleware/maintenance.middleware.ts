import type { Request, Response, NextFunction } from "express";

export const MAINTENANCE_TITLE = "Service Unavailable · 503";
export const MAINTENANCE_DETAIL = "Please try again later.";
export const MAINTENANCE_WEB_TITLE = "Dienst nicht verfügbar · 503";
export const MAINTENANCE_WEB_DESCRIPTION = "Der PrimeWave-Dienst ist derzeit nicht verfügbar.";
export const MAINTENANCE_WEB_DETAIL = "Bitte versuchen Sie es später erneut.";
export const MAINTENANCE_RETRY_AFTER_SECONDS = 3600;

const MAINTENANCE_HTML = `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${MAINTENANCE_WEB_TITLE}</title>
    <style>
      :root {
        font-family: Arial, Helvetica, sans-serif;
        background: #fff;
        color: #202124;
      }
      * { box-sizing: border-box; }
      body {
        min-height: 100vh;
        margin: 0;
        display: flex;
        align-items: center;
        padding: 24px;
        background: #fff;
      }
      main {
        width: min(100%, 760px);
        display: flex;
        align-items: flex-start;
        gap: 30px;
        margin-left: clamp(0px, 13vw, 180px);
      }
      .error-icon {
        flex: 0 0 116px;
        width: 116px;
        height: 154px;
        margin-top: 2px;
        color: #b8b8b8;
      }
      .error-icon .paper {
        fill: #b6b6b6;
      }
      .error-icon .fold,
      .error-icon .cut {
        fill: #fff;
      }
      .error-icon .pixel {
        fill: #ededed;
      }
      .content {
        min-width: 0;
      }
      h1 {
        margin: 0;
        font-size: clamp(30px, 3.4vw, 48px);
        line-height: 1.15;
        font-weight: 400;
        letter-spacing: -0.03em;
        white-space: nowrap;
      }
      h1 .status {
        color: #666;
      }
      .description,
      .retry-message {
        margin: 20px 0 0;
        font-size: clamp(16px, 1.7vw, 21px);
        line-height: 1.45;
      }
      .description {
        color: #737373;
      }
      .retry-message {
        margin-top: 10px;
        color: #202124;
        font-weight: 700;
      }
      button {
        margin-top: 28px;
        padding: 10px 22px;
        border: 1px solid #c7c7c7;
        border-radius: 6px;
        background: #fff;
        color: #3c4043;
        font: inherit;
        font-size: 16px;
        cursor: pointer;
      }
      button:hover {
        background: #f8f9fa;
      }
      button:focus-visible {
        outline: 2px solid #5f6368;
        outline-offset: 2px;
      }
      @media (max-width: 640px) {
        body {
          align-items: flex-start;
          padding: 18vh 24px 24px;
        }
        main {
          width: 100%;
          margin-left: 0;
          gap: 20px;
        }
        .error-icon {
          flex-basis: 72px;
          width: 72px;
          height: 96px;
        }
        h1 {
          font-size: clamp(25px, 7vw, 34px);
          white-space: normal;
        }
        .description,
        .retry-message {
          font-size: 16px;
        }
      }
      @media (max-width: 420px) {
        main {
          display: block;
        }
        .error-icon {
          width: 64px;
          height: 84px;
          margin-bottom: 22px;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <svg class="error-icon" viewBox="0 0 116 154" aria-hidden="true">
        <path class="paper" d="M8 0h73l27 27v86H8z"/>
        <path class="fold" d="M81 0v29h27z"/>
        <path class="cut" d="M78 0h3l27 27v3H78z"/>
        <rect class="pixel" x="8" y="92" width="16" height="16"/>
        <rect class="pixel" x="24" y="108" width="16" height="16"/>
        <rect class="pixel" x="40" y="124" width="16" height="16"/>
        <rect class="pixel" x="56" y="140" width="16" height="14"/>
        <rect class="pixel" x="72" y="108" width="16" height="16"/>
        <rect class="pixel" x="88" y="92" width="16" height="16"/>
        <rect class="pixel" x="40" y="92" width="16" height="16"/>
        <rect class="pixel" x="56" y="108" width="16" height="16"/>
      </svg>
      <div class="content">
        <h1>${MAINTENANCE_WEB_TITLE.replace(" · 503", "")}<span class="status"> · 503</span></h1>
        <p class="description">${MAINTENANCE_WEB_DESCRIPTION}</p>
        <p class="retry-message">${MAINTENANCE_WEB_DETAIL}</p>
        <form method="get" action="">
          <button type="submit">Seite neu laden</button>
        </form>
      </div>
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