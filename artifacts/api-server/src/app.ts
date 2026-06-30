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
import { HealthCheckResponse } from "@workspace/api-zod";

const app: Express = express();

// ── Trust proxy ───────────────────────────────────────────────────────────────
// Replit runs behind a reverse proxy that sets X-Forwarded-For.
// This lets express-rate-limit and req.ip identify clients correctly.
app.set("trust proxy", 1);

// ── Security headers ─────────────────────────────────────────────────────────
app.use(helmet());

// ── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors());

// ── HTTP logging ─────────────────────────────────────────────────────────────
// Development: morgan for human-readable request logs in the console
if (env.NODE_ENV === "development") {
  app.use(
    morgan("dev", {
      stream: { write: (msg) => logger.info(msg.trimEnd()) },
    }),
  );
}

// Production: structured JSON request logs via pino-http
app.use(
  pinoHttp({
    logger,
    // Skip pino request logs in development to avoid duplication with morgan
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

// ── Healthcheck (before rate limiter — startup probe must always pass) ────────
// Cloud Run sends the startup probe immediately at container boot, before the
// process is fully initialised. Registering this here ensures it bypasses the
// in-memory rate limiter so the probe always gets an instant 200.
app.get("/api/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// ── Global rate limit ─────────────────────────────────────────────────────────
app.use(globalLimiter);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api", router);

// ── Centralized error handler (must be last) ──────────────────────────────────
app.use(errorMiddleware);

export default app;
