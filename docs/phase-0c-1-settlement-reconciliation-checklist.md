# PrimeWave V1 Phase 0C.1 — External settlement reconciliation

**Preparation only. No Production record was changed and no settlement evidence has been verified.**

The owner confirms that the withdrawals and transfers listed in the earlier read-only snapshot were settled externally. That attestation is not a substitute for item-level evidence. Production’s stored historical statuses/remaining amounts must not be rewritten to imply an in-database settlement.

## 1. Preserve the original database evidence

Before approving any reset:

- Obtain the owner-reported encrypted full Production backup, its storage location, creation time, size, SHA-256, access-control record, and `pg_restore --list` result.
- Verify the isolated restore test and record its target, time, and outcome. It must not target Production.
- Preserve the original withdrawal, transfer, wallet, ledger, user, audit, and migration-history rows in that immutable backup.
- Store the settlement manifest and evidence bundle in restricted encrypted storage. Record hashes and access history; do not put credentials, full wallet addresses, account numbers, or unnecessary personal data in the manifest.

The prior report could not independently verify the backup artifact or restoration evidence.

## 2. Take a separately approved final read-only preflight

After every writer is stopped, request separate approval for a read-only preflight against the actual Production primary. Do not use a Development database or treat a read-only replica as proof of primary connectivity.

For only the open obligations, capture the minimum needed to match evidence:

- stable database record ID;
- historical withdrawal status, gross amount, fee, net amount, currency, request time, and any existing transaction reference;
- transfer ID, historical remaining amount, total/released amounts, and release references;
- a masked or hashed recipient identifier where needed for matching.

Do not export password hashes or unrelated member profiles. Keep the preflight output private. Refresh the reset candidate’s expected counts only from this separately approved final preflight.

## 3. Reconcile each withdrawal without changing its database status

For each withdrawal that is nonterminal in the final preflight:

1. Match the exact request ID to the external payment evidence.
2. For a blockchain payment, verify network, token, recipient, transaction hash, successful receipt, final block/confirmation threshold, settlement time, and the amount received against the recorded net amount and currency.
3. For an off-chain payment, use the provider’s settlement receipt/reference and an independent ledger or statement. Match the beneficiary, currency, amount, and settlement time. Keep account numbers out of the manifest.
4. For a `MANUAL_REVIEW` record, require a named independent reviewer and a written resolution. Do not infer that it was paid from an administrator note or the owner’s general statement.
5. If the proof indicates a cancellation, reversal, refund, partial payment, wrong destination, duplicate payment, or amount mismatch, stop. Record the discrepancy and obtain an explicit, separately authorized disposition. Do not call that record “settled” in the manifest.

The historical `PENDING`, `MANUAL_REVIEW`, or other database status remains as-is until the approved reset transaction removes the historical row. No intermediate `UPDATE ... status='COMPLETED'` is part of this procedure.

## 4. Reconcile each transfer with a positive remainder

For each transfer whose final-preflight `remainingAmount` is positive:

1. Match its stable transfer ID to the external settlement evidence.
2. Reconcile the remaining amount against one or more external payments or ledger entries. When payment is split, the evidence bundle must show each component and the aggregate.
3. Confirm the total external amount equals the recorded remainder, and confirm currency/asset, recipient, settlement time, and provider/transaction references.
4. Have a second reviewer check the arithmetic and evidence. Any unexplained difference blocks reset approval.

The transfer’s database amount is not reduced or otherwise changed during reconciliation.

Settlement evidence does not authorize deleting the append-only withdrawal timeline or income-transfer release events. The reset candidate retains these records and will stop if their parent rows cannot safely be removed. External settlement and audit-retention approval are separate gates.

## 5. Create and independently verify the manifest

Prepare exactly one manifest row for every nonterminal withdrawal and every positive transfer remainder found in the approved final preflight. The draft SQL requires:

- record type and exact database record ID;
- the historical database status (`REMAINING_AMOUNT` is the label for a transfer remainder, which has no status column);
- original database amount/fee/net/currency fields as applicable;
- external settlement status `SETTLED_EXTERNALLY`, external amount/currency, settlement time, and provider/transaction reference;
- SHA-256 of the evidence bundle;
- preparer and a different independent reviewer.

The SQL checks a one-to-one ID match, the historical fields, amount/currency equality for withdrawals, amount equality for transfer remainders, nonempty references, evidence-hash shape, and independent reviewers. It does **not** prove that an external document is genuine; reviewers must validate the evidence outside the database. Keep the evidence bundle and signed manifest together in restricted storage.

No manifest rows or evidence were added to the candidate in this preparation. Its default approval gate remains `NO`, its final statement remains `ROLLBACK`, and its settlement guards remain in place.

## Approval gate

Reset approval requires all of the following: a verified backup/restore, a separately approved final preflight, complete matching evidence for every open obligation, independent review, no unexplained discrepancies, and an explicit separate Production reset approval. The owner’s attestation alone does not satisfy these checks.
