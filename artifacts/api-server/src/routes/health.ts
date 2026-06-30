import { Router, type IRouter } from "express";

const router: IRouter = Router();

// GET /api/healthz — kept for backward compatibility; primary probe is GET /api.
// Both are registered before all middleware in app.ts so they are always reachable.
router.get("/healthz", (_req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

export default router;
