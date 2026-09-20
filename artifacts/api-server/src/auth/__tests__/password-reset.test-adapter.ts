import type { PasswordResetDelivery } from "../password-reset-delivery.service";

/**
 * Test-only delivery adapter. It is intentionally located under __tests__ and
 * is never imported by production code. It captures a reset URL in memory so
 * tests can exercise the real one-time token flow without sending anything.
 */
export function createTestPasswordResetDelivery() {
  const sent: PasswordResetDelivery[] = [];
  return {
    sent,
    deliver: async (payload: PasswordResetDelivery): Promise<void> => {
      sent.push(payload);
    },
  };
}