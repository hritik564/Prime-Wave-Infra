import { Router } from "express";
import {
  placeUserHandler,
  getBinaryTreeHandler,
  getBinaryParentHandler,
  getBinaryChildrenHandler,
} from "./binary.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { placeUserSchema, treeQuerySchema, nodeQuerySchema } from "./binary.schema";

const router = Router();

router.use(requireAuth);

// POST /api/binary/place — sponsor places a referred user LEFT or RIGHT
router.post("/place", validate(placeUserSchema, "body"), placeUserHandler);

// GET /api/binary/tree[?userId=xxx&depth=N] — nested tree up to 5 levels
router.get("/tree", validate(treeQuerySchema, "query"), getBinaryTreeHandler);

// GET /api/binary/parent[?userId=xxx] — parent node of the given user
router.get("/parent", validate(nodeQuerySchema, "query"), getBinaryParentHandler);

// GET /api/binary/children[?userId=xxx] — left + right children of given user
router.get("/children", validate(nodeQuerySchema, "query"), getBinaryChildrenHandler);

export default router;
