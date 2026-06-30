import { Router } from "express";
import {
  getCompanyWalletsHandler,
  getDepositHistoryHandler,
  getDepositByIdHandler,
} from "./deposits.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { depositHistoryQuerySchema } from "./deposits.schema";

const router = Router();

// Public — any user can see available deposit wallets
router.get("/wallets", getCompanyWalletsHandler);

// Authenticated user routes
router.use(requireAuth);

// GET  /api/deposits/history
router.get("/history", validate(depositHistoryQuerySchema, "query"), getDepositHistoryHandler);

// GET  /api/deposits/:id
router.get("/:id", getDepositByIdHandler);

export default router;
