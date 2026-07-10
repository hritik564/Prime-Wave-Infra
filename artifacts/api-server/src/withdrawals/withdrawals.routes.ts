import { Router } from "express";
import {
  createWithdrawalHandler,
  cancelWithdrawalHandler,
  getWithdrawalHistoryHandler,
  getWithdrawalByIdHandler,
  getWithdrawalSettingsHandler,
} from "./withdrawals.controller";
import { validate } from "../middleware/validate.middleware";
import { requireAuth } from "../middleware/auth.middleware";
import { createWithdrawalSchema, withdrawalHistoryQuerySchema } from "./withdrawals.schema";

const router = Router();

// All withdrawal routes require authentication
router.use(requireAuth);

router.get(
  "/settings",
  getWithdrawalSettingsHandler,
);

router.post(
  "/",
  validate(createWithdrawalSchema),
  createWithdrawalHandler,
);

router.post(
  "/:id/cancel",
  cancelWithdrawalHandler,
);

router.get(
  "/history",
  validate(withdrawalHistoryQuerySchema, "query"),
  getWithdrawalHistoryHandler,
);

router.get(
  "/:id",
  getWithdrawalByIdHandler,
);

export default router;
