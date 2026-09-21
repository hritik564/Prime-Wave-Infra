import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../");
const readProjectFile = (relativePath: string) =>
  readFileSync(resolve(projectRoot, relativePath), "utf8");

describe("credential reset UI state regression contract", () => {
  it("renders the tracked random run from the database-backed preview", () => {
    const page = readProjectFile("prime-wave/src/pages/admin/AdminSettingsPage.tsx");
    const api = readProjectFile("prime-wave/src/lib/api.ts");

    expect(page).not.toContain("STALE_RANDOM_BULK_RESET");
    expect(page).toContain("bulkPreview.legacyRun.status");
    expect(page).toContain("bulkPreview.legacyRun.failureReason");
    expect(api).toContain("legacyRun: BulkPasswordResetRunResult | null");
  });
});