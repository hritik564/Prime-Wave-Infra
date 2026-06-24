import { z } from "zod";

export const placeUserSchema = z.object({
  userId:   z.string().min(1, "userId is required"),
  position: z.enum(["LEFT", "RIGHT"], {
    errorMap: () => ({ message: "position must be LEFT or RIGHT" }),
  }),
});

export const treeQuerySchema = z.object({
  userId: z.string().optional(),
  depth:  z.coerce.number().int().min(1).max(5).default(5),
});

export const nodeQuerySchema = z.object({
  userId: z.string().optional(),
});

export type PlaceUserInput  = z.infer<typeof placeUserSchema>;
export type TreeQuery       = z.infer<typeof treeQuerySchema>;
export type NodeQuery       = z.infer<typeof nodeQuerySchema>;
