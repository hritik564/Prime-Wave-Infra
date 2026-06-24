import { Router } from "express";
import { adminLogin } from "./admin.controller";
import { validate } from "../middleware/validate.middleware";
import { adminLoginSchema } from "./admin.schema";

const router = Router();

router.post("/login", validate(adminLoginSchema), adminLogin);

export default router;
