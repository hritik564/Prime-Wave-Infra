import type { CommonTemporaryPasswordResetOperationType, CommonTemporaryPasswordResetRunStatus } from "@prisma/client";

export interface DedicatedFullReplacementRun {
  adminId: string;
  status: CommonTemporaryPasswordResetRunStatus;
  operationType: CommonTemporaryPasswordResetOperationType;
}

export function isDedicatedFullReplacementRun(
  run: DedicatedFullReplacementRun | null,
  adminId: string,
): boolean {
  return (
    run !== null
    && run.adminId === adminId
    && run.status === "RUNNING"
    && run.operationType === "FULL_REPLACEMENT"
  );
}