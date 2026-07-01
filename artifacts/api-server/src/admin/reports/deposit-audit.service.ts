/**
 * Sprint 27F — Deposit Double-Credit Audit Service
 *
 * Scans all completed DepositVerifications and counts wallet transactions
 * per deposit.  Any count > 1 is a double-credit anomaly.
 *
 * Report is read-only: it never modifies any data.
 */

import { prisma } from "../../config/prisma";

export interface DepositAuditRow {
  depositId:            string;
  verificationId:       string | null;
  username:             string;
  email:                string;
  depositAmount:        string;
  depositStatus:        string;
  verificationStatus:   string | null;
  txCount:              number;
  totalCredited:        string;
  walletTxIds:          string[];
  walletTxAmounts:      string[];
  walletTxTimestamps:   string[];
  timeDiffSeconds:      number;
  duplicateAmount:      string;
}

export interface DepositAuditReport {
  scannedAt:       string;
  anomalyCount:    number;
  anomalies:       DepositAuditRow[];
  summary:         string;
}

export async function runDepositAudit(): Promise<DepositAuditReport> {
  // Find all deposits that have more than one wallet transaction linked via
  // sourceDepositId (the new idempotency column) OR via metadata->>'depositId'
  // (the legacy path for pre-Sprint-27F transactions).
  const rows = await prisma.$queryRaw<Array<{
    depositId:          string;
    verificationId:     string | null;
    username:           string;
    email:              string;
    depositAmount:      string;
    depositStatus:      string;
    verificationStatus: string | null;
    txCount:            number;
    totalCredited:      string;
    walletTxIds:        string[];
    walletTxAmounts:    string[];
    walletTxTimestamps: string[];
    timeDiffSeconds:    number;
  }>>`
    SELECT
      dr.id                                                               AS "depositId",
      dv.id                                                               AS "verificationId",
      u.username,
      u.email,
      dr.amount::text                                                     AS "depositAmount",
      dr.status::text                                                     AS "depositStatus",
      dv."verificationStatus"::text                                       AS "verificationStatus",
      COUNT(wt.id)::int                                                   AS "txCount",
      COALESCE(SUM(wt.amount),0)::text                                    AS "totalCredited",
      ARRAY_AGG(wt.id         ORDER BY wt."createdAt")                    AS "walletTxIds",
      ARRAY_AGG(wt.amount::text ORDER BY wt."createdAt")                  AS "walletTxAmounts",
      ARRAY_AGG(wt."createdAt"::text ORDER BY wt."createdAt")             AS "walletTxTimestamps",
      EXTRACT(EPOCH FROM (MAX(wt."createdAt") - MIN(wt."createdAt")))::int AS "timeDiffSeconds"
    FROM deposit_requests dr
    JOIN users u ON u.id = dr."userId"
    LEFT JOIN deposit_verifications dv ON dv."depositId" = dr.id
    JOIN wallet_transactions wt
      ON (
            wt."source_deposit_id" = dr.id
         OR (wt."source_deposit_id" IS NULL AND (wt.metadata->>'depositId') = dr.id)
         )
     AND wt.type = 'DEPOSIT'
    WHERE dr.status = 'APPROVED'
    GROUP BY dr.id, dv.id, u.username, u.email, dr.amount, dr.status, dv."verificationStatus"
    HAVING COUNT(wt.id) > 1
    ORDER BY COUNT(wt.id) DESC, dr."createdAt" DESC
  `;

  const anomalies: DepositAuditRow[] = rows.map(r => ({
    ...r,
    txCount:         Number(r.txCount),
    timeDiffSeconds: Number(r.timeDiffSeconds),
    duplicateAmount: (
      parseFloat(r.totalCredited) - parseFloat(r.depositAmount)
    ).toFixed(8),
  }));

  return {
    scannedAt:    new Date().toISOString(),
    anomalyCount: anomalies.length,
    anomalies,
    summary: anomalies.length === 0
      ? "No double-credit anomalies found. Every deposit has exactly one wallet transaction."
      : `⚠️  ${anomalies.length} deposit(s) have been credited more than once. Manual review required. Data has NOT been modified.`,
  };
}
