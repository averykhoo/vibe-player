// vibe-player-v2-react/src/utils/async.ts
// vibe-player-v2/src/lib/utils/async.ts

/**
 * Pauses execution for a macrotask, allowing the main thread to process other events.
 * Useful for preventing long-running tasks from freezing the UI.
 * @returns {Promise<void>} A promise that resolves after yielding.
 */
export async function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Debounces a function, delaying its execution until after a specified wait time
 * has elapsed since the last time it was invoked.
 * @template T - The type of the function to debounce.
 * @param {T} func - The function to debounce.
 * @param {number} wait - The number of milliseconds to delay.
 * @param {boolean} [immediate=false] - If true, trigger the function on the leading edge instead of the trailing.
 * @returns {(...args: Parameters<T>) => void} A new debounced function.
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  immediate: boolean = false,
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null;
  return function executedFunction(this: any, ...args: Parameters<T>) {
    const context = this;
    const later = () => {
      timeout = null;
      if (!immediate) {
        func.apply(context, args);
      }
    };
    const callNow = immediate && !timeout;
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) {
      func.apply(context, args);
    }
  };
}
