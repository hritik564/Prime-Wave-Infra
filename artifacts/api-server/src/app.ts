import express, { type Express } from "express";
import path from "node:path";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import pinoHttp from "pino-http";
import { logger } from "./lib/logger";
import { env } from "./config/env";
import { globalLimiter } from "./middleware/rateLimiter.middleware";
import { errorMiddleware } from "./middleware/error.middleware";
import { isMaintenanceMode, maintenanceWebGate } from "./middleware/maintenance.middleware";
import router from "./routes";

const app: Express = express();

if (isMaintenanceMode()) {
  logger.info("Maintenance mode active — public web traffic gated");
}

// ── Trust proxy ───────────────────────────────────────────────────────────────
app.set("trust proxy", 1);

// ── [DIAGNOSTIC] Health probe — MUST stay first, zero middleware dependencies ─
// Try/catch added per diagnostic request. Synchronous stderr.write used so the
// error cannot be lost if pino's stdout stream is buffered (Cloud Run pipes
// stdout; process.exit() does NOT flush stdio buffers, so pino may drop logs).
app.get(["/api", "/api/healthz"], (_req, res) => {
  try {
    res.json({
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const stack = err instanceof Error ? err.stack : String(err);
    const file  = err instanceof Error
      ? (err as NodeJS.ErrnoException).code ?? "unknown"
      : "unknown";

    // Synchronous write — survives process.exit() buffering:
    process.stderr.write(
      `[HEALTH-HANDLER-EXCEPTION] ${new Date().toISOString()}\n` +
      `stack: ${stack}\n` +
      `file: ${file}\n`,
    );

    // Pino (may or may not flush before caller exits):
    logger.error({ err, stack }, "[DIAG] GET /api handler threw");

    // Still return 500 so the caller sees something:
    if (!res.headersSent) {
      res.status(500).json({ status: "error", message: String(err) });
    }
  }
});

// ── Security headers ─────────────────────────────────────────────────────────
app.use(helmet());

// ── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors());

// ── HTTP logging ─────────────────────────────────────────────────────────────
if (env.NODE_ENV === "development") {
  app.use(
    morgan("dev", {
      stream: { write: (msg) => logger.info(msg.trimEnd()) },
    }),
  );
}

app.use(
  pinoHttp({
    logger,
    autoLogging: env.NODE_ENV !== "development",
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// ── Global rate limit ─────────────────────────────────────────────────────────
app.use(globalLimiter);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api", router);

// ── Production maintenance gate ─────────────────────────────────────────────
// Health and API routes remain reachable above; this blocks only web traffic
// before static assets and the SPA fallback are served.
app.use(maintenanceWebGate);

// ── Production frontend ──────────────────────────────────────────────────────
// The production Autoscale service is the API process.  It also serves the
// already-built Vite output so the frontend and /api share one deployment.
if (env.NODE_ENV === "production") {
  const frontendDistDir = path.resolve(process.cwd(), "artifacts/prime-wave/dist/public");
  const frontendIndex = path.join(frontendDistDir, "index.html");

  app.use(express.static(frontendDistDir));
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
      next();
      return;
    }

    res.sendFile(frontendIndex, (err) => {
      if (err) next(err);
    });
  });
}

// ── Centralized error handler (must be last) ──────────────────────────────────
app.use(errorMiddleware);

export default app;
