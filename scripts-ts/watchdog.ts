/**
 * @file watchdog.ts
 * @description Watchdog utility - kills process if stuck > N seconds
 * @usage
 *   const watchdog = new Watchdog(90);
 *   watchdog.start();
 *   // ... your code ...
 *   watchdog.cancel();
 */

export class Watchdog {
  private timer: NodeJS.Timeout | null = null;

  constructor(private seconds: number) {
    if (seconds <= 0) {
      console.warn('Watchdog: seconds must be > 0, watchdog disabled');
    }
  }

  /**
   * Start the watchdog timer
   * Process will be killed with exit code 3 if stuck > N seconds
   */
  start(): void {
    if (this.seconds <= 0) {
      return;
    }

    console.warn(`⚠️  Watchdog armed: ${this.seconds}s — process will die if stuck longer`);
    this.timer = setTimeout(() => {
      console.error(`❌ WATCHDOG FIRED after ${this.seconds}s — process was stuck, killing.`);
      process.exit(3);
    }, this.seconds * 1000);
  }

  /**
   * Cancel the watchdog timer (call when done)
   */
  cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * Reset the watchdog timer (extend the timeout)
   */
  reset(): void {
    this.cancel();
    this.start();
  }
}

/**
 * Execute a function with watchdog protection
 * @param fn - Function to execute (can be async)
 * @param timeoutSeconds - Timeout in seconds (default 90)
 * @returns Promise resolving to function result
 */
export async function withWatchdog<T>(
  fn: () => Promise<T> | T,
  timeoutSeconds: number = 90
): Promise<T> {
  const watchdog = new Watchdog(timeoutSeconds);
  watchdog.start();

  try {
    const result = await fn();
    return result;
  } finally {
    watchdog.cancel();
  }
}
