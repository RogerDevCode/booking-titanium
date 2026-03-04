/**
 * @file watchdog.ts
 * @description Watchdog utility - kills process if stuck > N seconds
 * @usage
 *   import { Watchdog, withWatchdog, WATCHDOG_TIMEOUT } from './watchdog';
 *   
 *   // Option 1: Manual watchdog
 *   const watchdog = new Watchdog(WATCHDOG_TIMEOUT);
 *   watchdog.start();
 *   // ... your code ...
 *   watchdog.cancel();
 *   
 *   // Option 2: Automatic watchdog
 *   await withWatchdog(async () => {
 *     // ... your code ...
 *   });
 */

/**
 * Default watchdog timeout: 3 minutes (180 seconds)
 * This is the maximum time any script can run before being killed
 */
export const WATCHDOG_TIMEOUT = 180; // 3 minutes

export class Watchdog {
  private timer: NodeJS.Timeout | null = null;
  private startTime: number = Date.now();

  constructor(private seconds: number = WATCHDOG_TIMEOUT) {
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

    this.startTime = Date.now();
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    const remaining = this.seconds - elapsed;
    
    console.warn(`⏱️  Watchdog armed: ${this.seconds}s timeout — process will die if stuck longer`);
    
    this.timer = setTimeout(() => {
      const actualElapsed = Math.floor((Date.now() - this.startTime) / 1000);
      console.error(`\n❌ WATCHDOG FIRED after ${actualElapsed}s — process was stuck, killing.`);
      console.error(`   Timeout: ${this.seconds}s (3 minutes max)`);
      console.error(`   Exit code: 3`);
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
      const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
      console.warn(`✓ Watchdog cancelled after ${elapsed}s`);
    }
  }

  /**
   * Reset the watchdog timer (extend the timeout)
   */
  reset(): void {
    this.cancel();
    this.start();
  }

  /**
   * Get elapsed time since watchdog started
   */
  getElapsed(): number {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  /**
   * Get remaining time before timeout
   */
  getRemaining(): number {
    const elapsed = this.getElapsed();
    return Math.max(0, this.seconds - elapsed);
  }
}

/**
 * Execute a function with watchdog protection
 * @param fn - Function to execute (can be async)
 * @param timeoutSeconds - Timeout in seconds (default: WATCHDOG_TIMEOUT)
 * @returns Promise resolving to function result
 */
export async function withWatchdog<T>(
  fn: () => Promise<T> | T,
  timeoutSeconds: number = WATCHDOG_TIMEOUT
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

/**
 * Create a watchdog-protected main function wrapper
 * @param mainFn - Main function to execute
 * @param timeoutSeconds - Timeout in seconds (default: WATCHDOG_TIMEOUT)
 */
export function watchdogMain<T>(
  mainFn: () => Promise<T> | T,
  timeoutSeconds: number = WATCHDOG_TIMEOUT
): void {
  withWatchdog(mainFn, timeoutSeconds)
    .then((result) => {
      if (result !== undefined) {
        console.log('Result:', result);
      }
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Error:', error.message);
      process.exit(1);
    });
}
