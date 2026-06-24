import { Router } from "express";
import { getWallet, transfer, getHistory } from "./wallets.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { requireBusinessAccess } from "../middleware/businessAccess.middleware";
import { validate } from "../middleware/validate.middleware";
import { transferSchema, historyQuerySchema } from "./wallets.schema";

const router = Router();

// All wallet routes require authentication
router.use(requireAuth);

// GET /api/wallets — returns current balances (SUSPENDED users may view)
router.get("/", getWallet);

// POST /api/wallets/transfer — blocked for SUSPENDED/BLOCKED users
router.post(
  "/transfer",
  requireBusinessAccess,
  validate(transferSchema),
  transfer,
);

// GET /api/wallets/history — paginated transaction history
router.get("/history", validate(historyQuerySchema, "query"), getHistory);

export default router;
