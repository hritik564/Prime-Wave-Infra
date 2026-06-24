import { Router } from "express";
import { create, list, getById, claimPrincipalHandler } from "./investments.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { requireBusinessAccess } from "../middleware/businessAccess.middleware";
import { validate } from "../middleware/validate.middleware";
import { createInvestmentSchema, listInvestmentsQuerySchema } from "./investments.schema";

const router = Router();

// All investment routes require authentication + active business access
router.use(requireAuth);

// POST /api/investments — create a new investment (deducts from deposit wallet)
router.post(
  "/",
  requireBusinessAccess,
  validate(createInvestmentSchema),
  create,
);

// GET /api/investments — paginated list, optionally filtered by status
router.get(
  "/",
  validate(listInvestmentsQuerySchema, "query"),
  list,
);

// GET /api/investments/:id — single investment detail
router.get("/:id", getById);

// POST /api/investments/:id/claim-principal — move principal to income wallet
router.post(
  "/:id/claim-principal",
  requireBusinessAccess,
  claimPrincipalHandler,
);

export default router;
