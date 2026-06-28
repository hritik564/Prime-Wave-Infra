import { EventEmitter } from "node:events";

// ── Prime Wave domain event bus ───────────────────────────────────────────────
//
// Lightweight in-process event bus for decoupling modules.
// Business-critical flows must NOT depend on event handlers completing —
// handlers are fire-and-forget side effects.
//
// Current events:
//   "DepositVerified"  — emitted after automatic deposit credit succeeds
//
// Future subscribers (add without modifying the emitter):
//   promotions, cashback, analytics, affiliate, loyalty

export interface DepositVerifiedPayload {
  verificationId: string;
  depositId:      string;
  userId:         string;
  amount:         string;
  network:        string;
  txHash:         string;
  creditedAt:     Date;
}

// Extend EventEmitter with typed overloads for every domain event.
class PrimeWaveEventBus extends EventEmitter {
  emitDepositVerified(payload: DepositVerifiedPayload): void {
    this.emit("DepositVerified", payload);
  }

  onDepositVerified(listener: (payload: DepositVerifiedPayload) => void): this {
    return this.on("DepositVerified", listener);
  }
}

export const eventBus = new PrimeWaveEventBus();
