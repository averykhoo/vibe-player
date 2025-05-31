// Import the utility functions directly using require
const {
  formatTime,
  hannWindow,
  viridisColor,
  yieldToMainThread,
  debounce
} = require('../utils');

// --- Tests for formatTime ---
describe('formatTime', () => {
  beforeEach(() => {
    jest.useRealTimers(); // Ensure real timers for these tests
  });
  test('should format 0 seconds correctly', () => {
    expect(formatTime(0)).toBe('0:00');
  });

  test('should format positive seconds correctly', () => {
    expect(formatTime(5)).toBe('0:05');
    expect(formatTime(60)).toBe('1:00');
    expect(formatTime(95)).toBe('1:35');
    expect(formatTime(3600)).toBe('60:00'); // 1 hour
  });

  test('should pad seconds less than 10 with a leading zero', () => {
    expect(formatTime(1)).toBe('0:01');
    expect(formatTime(61)).toBe('1:01');
  });

  test('should handle NaN and negative inputs by treating them as 0', () => {
    expect(formatTime(NaN)).toBe('0:00');
    expect(formatTime(-10)).toBe('0:00');
  });
});

// --- Tests for hannWindow ---
describe('hannWindow', () => {
  beforeEach(() => {
    jest.useRealTimers(); // Ensure real timers for these tests
  });
  test('should return null for length 0 or less', () => {
    expect(hannWindow(0)).toBeNull();
    expect(hannWindow(-1)).toBeNull();
  });

  test('should return [1] for length 1', () => {
    expect(hannWindow(1)).toEqual([1]);
  });

  test('should return correct Hann window for length 4', () => {
    const window = hannWindow(4);
    expect(window).not.toBeNull();
    expect(window.length).toBe(4);
    expect(window[0]).toBeCloseTo(0);
    expect(window[1]).toBeCloseTo(0.75);
    expect(window[2]).toBeCloseTo(0.75);
    expect(window[3]).toBeCloseTo(0);
  });

  test('should have peak at 1 in the middle for odd length', () => {
    const window5 = hannWindow(5);
    expect(window5).not.toBeNull();
    expect(window5.length).toBe(5);
    expect(window5[0]).toBeCloseTo(0);
    expect(window5[1]).toBeCloseTo(0.5);
    expect(window5[2]).toBeCloseTo(1);
    expect(window5[3]).toBeCloseTo(0.5);
    expect(window5[4]).toBeCloseTo(0);
  });
});

// --- Tests for viridisColor ---
describe('viridisColor', () => {
  beforeEach(() => {
    jest.useRealTimers(); // Ensure real timers for these tests
  });
  test('should return the first color for t = 0', () => {
    expect(viridisColor(0)).toEqual([68, 1, 84]);
  });

  test('should return the last color for t = 1', () => {
    expect(viridisColor(1)).toEqual([253, 231, 37]);
  });

  test('should return a known intermediate color (e.g., t = 0.5)', () => {
    expect(viridisColor(0.5)).toEqual([31, 155, 137]);
  });

  test('should clamp input t to [0, 1]', () => {
    expect(viridisColor(-0.5)).toEqual(viridisColor(0));
    expect(viridisColor(1.5)).toEqual(viridisColor(1));
  });

  test('should interpolate correctly between two color points', () => {
    expect(viridisColor(0.05)).toEqual([70, 21, 102]);
  });
});

// --- Tests for yieldToMainThread ---
describe('yieldToMainThread', () => {
  beforeEach(() => {
    jest.useRealTimers(); // Ensure real timers for these tests
  });
  test('should resolve', async () => {
    await expect(yieldToMainThread()).resolves.toBeUndefined();
  });

  test('should allow event loop to proceed', (done) => {
    let flag = false;
    yieldToMainThread().then(() => {
      expect(flag).toBe(true);
      done();
    });
    flag = true;
  });
});


// --- Tests for debounce ---
describe('debounce', () => {
  beforeEach(() => {
    jest.useFakeTimers(); // Use fake timers specifically for debounce tests
  });

  afterEach(() => {
    jest.clearAllTimers(); // Clear any timers
    jest.useRealTimers(); // Reset to real timers after debounce tests
  });

  let mockFunc;
  beforeEach(() => { // This beforeEach is nested and will also run after the outer one
    mockFunc = jest.fn();
  });

  test('should call the function after the wait time', () => {
    const debouncedFunc = debounce(mockFunc, 100);
    debouncedFunc();
    expect(mockFunc).not.toHaveBeenCalled();
    jest.advanceTimersByTime(50);
    expect(mockFunc).not.toHaveBeenCalled();
    jest.advanceTimersByTime(50);
    expect(mockFunc).toHaveBeenCalledTimes(1);
  });

  test('should not call the function if called again within wait time', () => {
    const debouncedFunc = debounce(mockFunc, 100);
    debouncedFunc();
    jest.advanceTimersByTime(50);
    debouncedFunc();
    jest.advanceTimersByTime(50);
    expect(mockFunc).not.toHaveBeenCalled();
    jest.advanceTimersByTime(50);
    expect(mockFunc).toHaveBeenCalledTimes(1);
  });

  test('should call the function immediately if immediate is true', () => {
    const debouncedFunc = debounce(mockFunc, 100, true);
    debouncedFunc();
    expect(mockFunc).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(100);
    expect(mockFunc).toHaveBeenCalledTimes(1);
  });

  test('should not call the function again if called immediately and then again within wait time', () => {
    const debouncedFunc = debounce(mockFunc, 100, true);
    debouncedFunc();
    expect(mockFunc).toHaveBeenCalledTimes(1);
    debouncedFunc();
    expect(mockFunc).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(100);
    expect(mockFunc).toHaveBeenCalledTimes(1);
  });

  test('after immediate call, subsequent calls should be debounced until wait time passes without calls', () => {
    const debouncedFunc = debounce(mockFunc, 100, true);

    debouncedFunc();
    expect(mockFunc).toHaveBeenCalledTimes(1);

    debouncedFunc();
    jest.advanceTimersByTime(50);
    expect(mockFunc).toHaveBeenCalledTimes(1);

    debouncedFunc();
    jest.advanceTimersByTime(50);
    expect(mockFunc).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(50);
    expect(mockFunc).toHaveBeenCalledTimes(1);

    debouncedFunc();
    expect(mockFunc).toHaveBeenCalledTimes(2);
  });

  test('should pass arguments to the debounced function', () => {
    const debouncedFunc = debounce(mockFunc, 100);
    const arg1 = 'testArg1';
    const arg2 = { b: 2 };
    debouncedFunc(arg1, arg2);
    jest.advanceTimersByTime(100);
    expect(mockFunc).toHaveBeenCalledWith(arg1, arg2);
  });

  test('should maintain `this` context for the debounced function', () => {
    const context = { value: 42 };
    const mockFuncInContext = jest.fn(function() {
      expect(this.value).toBe(42);
    });
    const debouncedFunc = debounce(mockFuncInContext, 100);

    debouncedFunc.call(context);
    jest.advanceTimersByTime(100);
    expect(mockFuncInContext).toHaveBeenCalledTimes(1);
  });
});
