/**
 * Prime Wave canonical business timezone.
 *
 * Europe/London is a proper IANA timezone identifier that:
 *   - Follows GMT (UTC+0) in winter.
 *   - Automatically advances to BST (UTC+1) in summer (last Sunday of March).
 *   - Reverts to GMT on the last Sunday of October.
 *
 * Do NOT use a fixed offset such as "GMT+1" — that would stay on BST all year
 * and produce incorrect cycle boundaries in winter.
 */
export const APP_TIMEZONE = "Europe/London" as const;
