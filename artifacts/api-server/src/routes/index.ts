import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "../auth/auth.routes";
import usersRouter from "../users/users.routes";
import adminRouter from "../admin/admin.routes";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/admin", adminRouter);

export default router;
