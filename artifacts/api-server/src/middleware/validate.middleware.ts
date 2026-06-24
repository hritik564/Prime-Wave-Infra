import type { Request, Response, NextFunction } from "express";
import type { ZodSchema } from "zod";

type RequestPart = "body" | "query" | "params";

/**
 * Validates and coerces request data against a Zod schema.
 *
 * - For "body": mutates req.body in-place (Express allows this).
 * - For "query" / "params": Express 5 defines these as read-only getters on
 *   IncomingMessage, so writing back is not possible. Parsed data is stored
 *   in res.locals.parsed.<part> instead. Controllers must read from there
 *   when validating query/params via this middleware.
 */
export function validate(schema: ZodSchema, part: RequestPart = "body") {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[part]);

    if (!result.success) {
      next(result.error);
      return;
    }

    if (part === "body") {
      req.body = result.data;
    } else {
      // Store coerced data in res.locals — read with getParsed(res, "query")
      res.locals[`parsed_${part}`] = result.data;
    }

    next();
  };
}

/**
 * Retrieve Zod-parsed data stored by validate() for "query" or "params".
 * Falls back to the raw req value if the middleware was not used.
 */
export function getParsed<T>(res: Response, part: "query" | "params"): T {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return (res.locals[`parsed_${part}`] ?? {}) as T;
}
