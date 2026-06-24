import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { listNotificationsSchema } from "./notifications.schema";
import {
  listNotificationsHandler,
  markNotificationReadHandler,
  markAllReadHandler,
  unreadCountHandler,
} from "./notifications.controller";

const router = Router();

router.use(requireAuth);

router.get(
  "/",
  validate(listNotificationsSchema, "query"),
  listNotificationsHandler,
);

router.get("/unread-count", unreadCountHandler);

router.post("/:id/read", markNotificationReadHandler);

router.post("/read-all", markAllReadHandler);

export default router;
