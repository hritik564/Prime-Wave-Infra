---
name: Generated Zod compatibility
description: API generator compatibility constraint when introducing integer response fields.
---

API schema generation must remain compatible with the workspace's installed Zod major. Do not hand-edit generated schemas or upgrade shared validation dependencies just to accommodate a newly emitted builder.

**Why:** The current generator emitted a Zod-4-only integer builder while the shared library used Zod 3; generation succeeded but the generated-library typecheck failed.

**How to apply:** Run generation with the shared-library typecheck after contract changes. Where needed, a numeric schema with `multipleOf: 1` preserves integer validation without requiring a major-version change. Recheck this constraint if the generator or Zod major changes.
