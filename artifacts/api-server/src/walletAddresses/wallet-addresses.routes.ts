import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { addWalletAddressSchema } from "./wallet-addresses.schema";
import {
  listWalletAddressesHandler,
  addWalletAddressHandler,
  deleteWalletAddressHandler,
  setPrimaryWalletAddressHandler,
} from "./wallet-addresses.controller";

const router = Router();

router.use(requireAuth);

router.get("/",      listWalletAddressesHandler);
router.post("/",     validate(addWalletAddressSchema), addWalletAddressHandler);
router.delete("/:id", deleteWalletAddressHandler);
router.put("/:id/primary", setPrimaryWalletAddressHandler);

export default router;
