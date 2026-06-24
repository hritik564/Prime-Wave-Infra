import { Router } from "express";
import {
  create,
  list,
  getById,
  claimPrincipalHandler,
  claimRoiHandler,
  getEarningsHandler,
} from "./investments.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { requireBusinessAccess } from "../middleware/businessAccess.middleware";
import { validate } from "../middleware/validate.middleware";
import { createInvestmentSchema, listInvestmentsQuerySchema } from "./investments.schema";

const router = Router();

// All investment routes require authentication
router.use(requireAuth);

// POST /api/investments — create (deducts deposit wallet)
router.post("/", requireBusinessAccess, validate(createInvestmentSchema), create);

// GET /api/investments — paginated list, filterable by status
router.get("/", validate(listInvestmentsQuerySchema, "query"), list);

// GET /api/investments/:id — single investment
router.get("/:id", getById);

// GET /api/investments/:id/earnings — ROI earnings summary
router.get("/:id/earnings", getEarningsHandler);

// POST /api/investments/:id/claim-roi — move claimableROI to income wallet
router.post("/:id/claim-roi", requireBusinessAccess, claimRoiHandler);

// POST /api/investments/:id/claim-principal — move principal to income wallet
router.post("/:id/claim-principal", requireBusinessAccess, claimPrincipalHandler);

export default router;
