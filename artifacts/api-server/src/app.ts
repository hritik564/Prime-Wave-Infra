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

// ── Global rate limit ─────────────────────────────────────────────────────────
app.use(globalLimiter);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api", router);

// ── Centralized error handler (must be last) ──────────────────────────────────
app.use(errorMiddleware);

export default app;
