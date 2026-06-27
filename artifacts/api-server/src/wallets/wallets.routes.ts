import { Router } from "express";
import {
  getWallet,
  transfer,
  listTransfers,
  getTransferById,
  getHistory,
} from "./wallets.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { requireBusinessAccess } from "../middleware/businessAccess.middleware";
import { validate } from "../middleware/validate.middleware";
import { transferSchema, historyQuerySchema } from "./wallets.schema";

const router = Router();

// All wallet routes require authentication
router.use(requireAuth);

// GET /api/wallets — current balances
router.get("/", getWallet);

// POST /api/wallets/transfer — enqueue 72-hour income→withdrawal transfer
router.post(
  "/transfer",
  requireBusinessAccess,
  validate(transferSchema),
  transfer,
);

// GET /api/wallets/transfers — paginated list of income transfers with progress
router.get("/transfers", listTransfers);

// GET /api/wallets/transfers/:id — single transfer detail with full release history
router.get("/transfers/:id", getTransferById);

// GET /api/wallets/history — paginated transaction history
router.get("/history", validate(historyQuerySchema, "query"), getHistory);

export default router;
