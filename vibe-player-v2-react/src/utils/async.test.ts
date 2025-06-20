// vibe-player-v2-react/src/utils/async.test.ts
// vibe-player-v2/src/lib/utils/async.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { debounce, yieldToMainThread } from "./async"; // Path is already correct

describe("async utilities", () => {
  describe("yieldToMainThread", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.restoreAllMocks(); // Restores original timers
    });

    it("should return a Promise", () => {
      expect(yieldToMainThread()).toBeInstanceOf(Promise);
    });

    it("should resolve after a timeout (macrotask)", async () => {
      const promise = yieldToMainThread();
      // Check it doesn't resolve immediately (microsask)
      let resolved = false;
      promise.then(() => { resolved = true; });
      await Promise.resolve(); // Flush microtask queue
      expect(resolved).toBe(false);

      vi.runAllTimers(); // Or vi.advanceTimersByTime(0) for the setTimeout(..., 0)
      await expect(promise).resolves.toBeUndefined();
      expect(resolved).toBe(true);
    });
  });

  describe("debounce", () => {
    let mockFn: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      vi.useFakeTimers();
      mockFn = vi.fn();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should call the function only once after multiple rapid calls", () => {
      const debouncedFn = debounce(mockFn, 100);
      debouncedFn();
      debouncedFn();
      debouncedFn();

      expect(mockFn).not.toHaveBeenCalled();
      vi.advanceTimersByTime(100);
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it("should call the function after the specified wait time", () => {
      const debouncedFn = debounce(mockFn, 200);
      debouncedFn();

      vi.advanceTimersByTime(199);
      expect(mockFn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it("should call the function immediately if immediate is true", () => {
      const debouncedFn = debounce(mockFn, 100, true);
      debouncedFn();
      expect(mockFn).toHaveBeenCalledTimes(1);

      // Should not call again after timeout
      vi.advanceTimersByTime(100);
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it("should call the function again after wait time if immediate is true and called again after wait", () => {
      const debouncedFn = debounce(mockFn, 100, true);
      debouncedFn(); // 1st immediate call
      expect(mockFn).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(50); // Not enough time passed
      debouncedFn();
      expect(mockFn).toHaveBeenCalledTimes(1); // Still 1

      vi.advanceTimersByTime(50); // Total 100ms passed for the first call's debounce cycle
      // At this point, the timeout from the first call has cleared.
      // Any new call should be immediate.
      debouncedFn(); // 2nd immediate call
      expect(mockFn).toHaveBeenCalledTimes(2);

      vi.advanceTimersByTime(100); // Pass time for the second call's debounce cycle
      debouncedFn(); // 3rd immediate call
      expect(mockFn).toHaveBeenCalledTimes(3);
    });


    it("should pass arguments correctly to the debounced function", () => {
      const debouncedFn = debounce(mockFn, 100);
      const arg1 = "test";
      const arg2 = 123;
      debouncedFn(arg1, arg2);

      vi.advanceTimersByTime(100);
      expect(mockFn).toHaveBeenCalledWith(arg1, arg2);
    });

    it("should maintain `this` context for the debounced function", () => {
      const obj = { method: mockFn, name: "testObject" };
      const debouncedFn = debounce(obj.method, 100);

      debouncedFn.call(obj);

      vi.advanceTimersByTime(100);
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(mockFn.mock.contexts[0]).toBe(obj);
    });

    it('should reset the timer if called again within the wait period', () => {
      const debouncedFn = debounce(mockFn, 100);
      debouncedFn(); // Call 1
      vi.advanceTimersByTime(50); // Advance half way
      expect(mockFn).not.toHaveBeenCalled();
      debouncedFn(); // Call 2, should reset timer

      vi.advanceTimersByTime(50); // Advance another half way (total 100ms from Call 1, 50ms from Call 2)
      expect(mockFn).not.toHaveBeenCalled(); // Should not have been called yet

      vi.advanceTimersByTime(50); // Advance final 50ms for Call 2 (total 100ms from Call 2)
      expect(mockFn).toHaveBeenCalledTimes(1); // Should be called now
    });
  });
});
