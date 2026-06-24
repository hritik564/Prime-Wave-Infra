import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "../auth/auth.routes";
import usersRouter from "../users/users.routes";
import adminRouter from "../admin/admin.routes";
import walletsRouter from "../wallets/wallets.routes";
import investmentsRouter from "../investments/investments.routes";
import binaryRouter from "../binary/binary.routes";
import { levelIncomeRouter } from "../levelIncome";
import { salaryRouter } from "../salary";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth",         authRouter);
router.use("/users",        usersRouter);
router.use("/admin",        adminRouter);
router.use("/wallets",      walletsRouter);
router.use("/investments",  investmentsRouter);
router.use("/binary",       binaryRouter);
router.use("/level-income", levelIncomeRouter);
router.use("/salary",       salaryRouter);

export default router;
