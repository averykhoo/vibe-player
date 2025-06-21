import { afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
// Import the new shared mocks
import { getMockContext, mockCanvasContext } from './test-utils/canvas.mock';

// Mock ResizeObserver globally
const MockResizeObserver = vi.fn(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));
vi.stubGlobal('ResizeObserver', MockResizeObserver);

// Configure the global canvas mock to return our singleton
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  configurable: true,
  value: getMockContext,
});

// Mock canvas dimensions
Object.defineProperty(HTMLCanvasElement.prototype, 'offsetWidth', { configurable: true, value: 300 });
Object.defineProperty(HTMLCanvasElement.prototype, 'offsetHeight', { configurable: true, value: 150 });


// --- Global Test Cleanup ---
afterEach(() => {
  vi.clearAllMocks();
  // Reset the history of our singleton mock's methods
  Object.values(mockCanvasContext).forEach((mockFn) => {
    if (typeof mockFn === 'function' && 'mockClear' in mockFn) {
      (mockFn as ReturnType<typeof vi.fn>).mockClear();
    }
  });
});
