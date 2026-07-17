// ── NonceLock — in-process nonce serializer ────────────────────────────────────
//
// Ensures that concurrent calls to signAndBroadcast() are serialized, so two
// concurrent operations never request and sign with the same nonce.
//
// This is a simple promise-chain mutex. Each caller awaits the previous
// operation before starting its own, then resolves the lock for the next.
//
// Usage:
//   const result = await nonceLock.withLock(async () => {
//     const nonce = await getNonceFromChain();
//     const signed = sign(nonce);
//     await broadcast(signed);
//     return result;
//   });

export class NonceLock {
  private _lock: Promise<void> = Promise.resolve();

  /**
   * Execute fn exclusively — no other fn runs until this one resolves or rejects.
   */
  async withLock<T>(fn: () => Promise<T>): Promise<T> {
    let release!: () => void;

    const next = new Promise<void>((resolve) => {
      release = resolve;
    });

    // Acquire: chain onto the current tail of the lock queue
    const prev = this._lock;
    this._lock  = next;

    // Wait for any previous holder to finish
    await prev;

    try {
      return await fn();
    } finally {
      // Release: allow the next waiter to proceed
      release();
    }
  }
}

// ── Singleton per process ──────────────────────────────────────────────────────
//
// One lock per hot wallet address — prevents nonce reuse across all gateways
// sharing the same signer in this process.

const _locks = new Map<string, NonceLock>();

export function getNonceLock(walletAddress: string): NonceLock {
  const key = walletAddress.toLowerCase();
  let lock = _locks.get(key);
  if (!lock) {
    lock = new NonceLock();
    _locks.set(key, lock);
  }
  return lock;
}
