import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../");
const readProjectFile = (relativePath: string) =>
  readFileSync(resolve(projectRoot, relativePath), "utf8");

describe("withdrawal admin action regression contract", () => {
  it("keeps only the intended financial actions for each state", () => {
    const policy = readProjectFile("prime-wave/src/pages/admin/withdrawal-action-policy.ts");
    expect(policy).toContain('PENDING: ["REJECT"]');
    expect(policy).toContain('APPROVED: ["REJECT", "MOVE_TO_MANUAL_REVIEW"]');
    expect(policy).toContain("PROCESSING: []");
    expect(policy).toContain('BROADCAST_UNKNOWN: ["REJECT_AND_REFUND"]');
    expect(policy).toContain('MANUAL_REVIEW: ["REJECT"]');
    expect(policy).toContain("COMPLETED: []");
    expect(policy).toContain("REJECTED: []");
  });

  it("does not expose removed actions through the withdrawal UI or client", () => {
    const page = readProjectFile("prime-wave/src/pages/admin/WithdrawalsPage.tsx");
    const modals = readProjectFile("prime-wave/src/pages/admin/WithdrawalModals.tsx");
    const api = readProjectFile("prime-wave/src/lib/api.ts");

    for (const obsoleteLabel of [
      "Place on Hold",
      "HoldModal",
      "Bulk Hold",
      "Assign Reviewer",
      "Re-process Withdrawal",
      "adminHoldWithdrawal",
      "adminReprocessWithdrawal",
    ]) {
      expect(`${page}\n${modals}\n${api}`).not.toContain(obsoleteLabel);
    }
  });

  it("removes the old admin endpoints instead of aliasing them", () => {
    const routes = readProjectFile("api-server/src/admin/admin.routes.ts");
    const controller = readProjectFile("api-server/src/admin/admin-withdrawals.controller.ts");
    const service = readProjectFile("api-server/src/admin/admin-withdrawals.service.ts");

    expect(routes).not.toContain('"/withdrawals/:id/hold"');
    expect(routes).not.toContain('"/withdrawals/:id/reprocess"');
    expect(routes).not.toContain('"/withdrawals/:id/release-hold"');
    expect(`${controller}\n${service}`).not.toContain("holdWithdrawal");
    expect(`${controller}\n${service}`).not.toContain("reprocessWithdrawal");
    expect(`${controller}\n${service}`).not.toContain("releaseHoldWithdrawal");
  });

  it("retains the intended UI action predicates", () => {
    const page = readProjectFile("prime-wave/src/pages/admin/WithdrawalsPage.tsx");
    expect(page).not.toContain("canApproveStatus");
    expect(page).not.toContain("Bulk Approve");
    expect(page).not.toContain("ApprovalModal");
    expect(page).not.toContain("Review, approve, reject");
    expect(page).toContain("canRejectStatus");
    expect(page).toContain("canMoveToManualReviewStatus");
    expect(page).toContain("canRejectAndRefundBroadcastUnknownStatus");
    expect(page).toContain('label:"Reject & Refund"');
    expect(page).toContain('label:"Move to Manual Review"');
  });

  it("exposes the false-positive correction only for the exact incident evidence", () => {
    const policy = readProjectFile("prime-wave/src/pages/admin/withdrawal-action-policy.ts");
    const page = readProjectFile("prime-wave/src/pages/admin/WithdrawalsPage.tsx");
    const queue = readProjectFile("prime-wave/src/pages/admin/WithdrawalQueuePage.tsx");
    const drawer = readProjectFile("prime-wave/src/pages/admin/WithdrawalDrawer.tsx");
    const modals = readProjectFile("prime-wave/src/pages/admin/WithdrawalModals.tsx");

    expect(policy).toContain('candidate.withdrawalId === "PW-WD-000130"');
    expect(policy).toContain('candidate.status === "BROADCAST_UNKNOWN"');
    expect(policy).toContain("!candidate.txHash");
    expect(policy).toContain("!candidate.broadcastAt");
    expect(policy).toContain("Boolean(candidate.signedAt)");
    expect(page).toContain("Correct False-Positive Stage");
    expect(queue).toContain("canCorrectFalsePositiveStage(item)");
    expect(drawer).toContain("canCorrectFalsePositiveStage({");
    expect(modals).toContain("PW-WD-000130 false-positive SIGNED correction");
    expect(modals).toContain("No refund, balance change, ledger entry, transaction signing, or broadcast");
  });
});