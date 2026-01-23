type RateLimitSnapshot = {
  allowed: boolean;
  retryAfterMs: number;
  remaining: number;
  limit: number;
  resetAt: number;
};

type RateLimitEntry = {
  timestamps: number[];
};

export class RateLimiter {
  private readonly entries = new Map<string, RateLimitEntry>();

  constructor(
    private readonly windowMs: number,
    private readonly limit: number
  ) {}

  check(key: string, now: number = Date.now()): RateLimitSnapshot {
    const entry = this.entries.get(key) ?? { timestamps: [] };
    const windowStart = now - this.windowMs;
    entry.timestamps = entry.timestamps.filter((timestamp) => timestamp > windowStart);
    if (entry.timestamps.length >= this.limit) {
      const oldest = entry.timestamps[0] ?? now;
      const retryAfterMs = Math.max(0, this.windowMs - (now - oldest));
      return {
        allowed: false,
        retryAfterMs,
        remaining: 0,
        limit: this.limit,
        resetAt: oldest + this.windowMs,
      };
    }
    entry.timestamps.push(now);
    this.entries.set(key, entry);
    return {
      allowed: true,
      retryAfterMs: 0,
      remaining: Math.max(0, this.limit - entry.timestamps.length),
      limit: this.limit,
      resetAt: now + this.windowMs,
    };
  }
}
