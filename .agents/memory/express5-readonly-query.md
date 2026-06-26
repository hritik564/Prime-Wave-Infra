---
name: Express 5 read-only req.query / req.params
description: In Express 5, req.query and req.params are getter-only; you cannot write to them from middleware.
---

## Rule

Never try to overwrite `req.query` or `req.params` in Express 5. They are defined as getter-only properties on `IncomingMessage` and any write silently fails or throws a TypeError.

**Why:** Express 5 tightened property descriptors. `(req as any).query = parsed` throws:
`TypeError: Cannot set property query of #<IncomingMessage> which has only a getter`

## How to apply

In `validate.middleware.ts`:
- `part === "body"` → assign to `req.body` as before (it is writable).
- `part === "query"` or `"params"` → store in `res.locals["parsed_<part>"]`.

In controllers that validate query/params via middleware, retrieve with:
```ts
import { getParsed } from "../middleware/validate.middleware";
const query = getParsed<HistoryQueryInput>(res, "query");
```

`getParsed` is exported from `validate.middleware.ts` and falls back to `{}` if the middleware was not used.

## Parameterized route AuthenticatedRequest cast

For routes with URL params (`:memberId`, etc.), TypeScript infers `Request<{memberId:string}, ...>` which does not overlap with the plain `Request` in `AuthenticatedRequest`. The direct cast `req as AuthenticatedRequest` fails with TS2352.

**Fix:** use a double cast — `req as unknown as AuthenticatedRequest` — on parameterized routes only.
