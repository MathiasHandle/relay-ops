type CalculateBackoffOptions = {
  initialDelayMs: number
  multiplier: number
  maxDelayMs: number
  retryIndex: number
}

/**
 * Calculates an exponential retry delay capped at the configured maximum.
 *
 * @param options.initialDelayMs - Delay for the first retry, in milliseconds.
 * @param options.multiplier - Factor applied for each subsequent retry.
 * @param options.maxDelayMs - Maximum delay, in milliseconds.
 * @param options.retryIndex - Zero-based retry index; 0 selects the initial delay.
 * @returns The capped delay in milliseconds.
 */
export function calculateBackoff(options: CalculateBackoffOptions): number {
  const { initialDelayMs, multiplier, maxDelayMs, retryIndex } = options

  return Math.min(initialDelayMs * multiplier ** retryIndex, maxDelayMs)
}
