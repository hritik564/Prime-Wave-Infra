import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "../auth/auth.routes";
import usersRouter from "../users/users.routes";
import adminRouter from "../admin/admin.routes";
import walletsRouter from "../wallets/wallets.routes";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/admin", adminRouter);
router.use("/wallets", walletsRouter);

export default router;
