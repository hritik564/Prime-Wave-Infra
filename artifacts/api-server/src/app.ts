import express, { type Express } from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import pinoHttp from "pino-http";
import { logger } from "./lib/logger";
import { env } from "./config/env";
import { globalLimiter } from "./middleware/rateLimiter.middleware";
import { errorMiddleware } from "./middleware/error.middleware";
import router from "./routes";

const app: Express = express();

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

// ── Centralized error handler (must be last) ──────────────────────────────────
app.use(errorMiddleware);

export default app;
