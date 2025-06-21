// src/setupTests.ts
import { afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest'; // Extends expect with DOM matchers

// Mock ResizeObserver globally
const MockResizeObserver = vi.fn(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

vi.stubGlobal('ResizeObserver', MockResizeObserver);

// Mock HTMLCanvasElement.prototype.getContext globally
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  configurable: true,
  value: vi.fn((): Partial<CanvasRenderingContext2D> => ({ // Return a well-typed partial mock
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    fillText: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    // Mock other context properties as needed by components
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    textAlign: 'start',
    font: '10px sans-serif',
  })),
});

// Mock canvas dimensions
Object.defineProperty(HTMLCanvasElement.prototype, 'offsetWidth', { configurable: true, value: 300 });
Object.defineProperty(HTMLCanvasElement.prototype, 'offsetHeight', { configurable: true, value: 150 });


// --- Global Test Cleanup ---
// Runs after each test to ensure mocks are cleared
afterEach(() => {
  vi.clearAllMocks();
});
