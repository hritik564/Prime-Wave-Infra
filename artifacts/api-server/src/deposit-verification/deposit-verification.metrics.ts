// ── Deposit Verification Worker Metrics ──────────────────────────────────────
//
// Lightweight in-process metrics collector for operational observability.
// Metrics are stored in memory and reset on server restart.
// Designed for future admin dashboard consumption via getMetricsSnapshot().

export interface TickStats {
  total:     number;
  completed: number;
  failed:    number;
  expired:   number;
  skipped:   number;
  active:    number;
  durationMs: number;
}

export interface MetricsSnapshot {
  totalProcessed:  number;
  totalCompleted:  number;
  totalFailed:     number;
  totalExpired:    number;
  totalSkipped:    number;
  successRate:     number;
  avgDurationMs:   number;
  maxDurationMs:   number;
  tickCount:       number;
  lastTickAt:      Date | null;
  uptimeSince:     Date;
}

const DURATION_WINDOW = 100;

class VerificationMetrics {
  private readonly startedAt    = new Date();
  private totals = { processed: 0, completed: 0, failed: 0, expired: 0, skipped: 0 };
  private tickCount  = 0;
  private maxDuration = 0;
  private lastTickAt: Date | null = null;
  private readonly durations: number[] = [];

  recordTick(stats: TickStats): void {
    this.tickCount++;
    this.totals.processed += stats.total;
    this.totals.completed += stats.completed;
    this.totals.failed    += stats.failed;
    this.totals.expired   += stats.expired;
    this.totals.skipped   += stats.skipped;
    if (stats.durationMs > this.maxDuration) this.maxDuration = stats.durationMs;
    this.durations.push(stats.durationMs);
    if (this.durations.length > DURATION_WINDOW) this.durations.shift();
    this.lastTickAt = new Date();
  }

  getSnapshot(): MetricsSnapshot {
    const avg = this.durations.length > 0
      ? this.durations.reduce((a, b) => a + b, 0) / this.durations.length
      : 0;
    const successRate = this.totals.processed > 0
      ? this.totals.completed / this.totals.processed
      : 0;
    return {
      totalProcessed:  this.totals.processed,
      totalCompleted:  this.totals.completed,
      totalFailed:     this.totals.failed,
      totalExpired:    this.totals.expired,
      totalSkipped:    this.totals.skipped,
      successRate:     Math.round(successRate * 10_000) / 10_000,
      avgDurationMs:   Math.round(avg),
      maxDurationMs:   this.maxDuration,
      tickCount:       this.tickCount,
      lastTickAt:      this.lastTickAt,
      uptimeSince:     this.startedAt,
    };
  }
}

export const verificationMetrics = new VerificationMetrics();
