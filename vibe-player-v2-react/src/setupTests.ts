// src/setupTests.ts
import { vi } from 'vitest';

// Mock Vite's import.meta.env for all tests
// This tells services/components that they are running in a non-SSR (i.e., browser-like) context
// during the test suite execution.
Object.defineProperty(globalThis, 'import.meta.env', {
  value: {
    ...((globalThis as any).importMetaEnv || {}), // Preserve other potential env vars if any test sets them
    SSR: false, // Explicitly set SSR to false for client-side logic testing
  },
  writable: true, // Allow tests to override if necessary, though generally not recommended
});


// Global mock for ResizeObserver
const MockResizeObserver = vi.fn(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));
vi.stubGlobal('ResizeObserver', MockResizeObserver);

// Global mock for HTMLCanvasElement for visualizer tests
if (typeof globalThis.HTMLCanvasElement === 'undefined') {
  // @ts-ignore
  globalThis.HTMLCanvasElement = class HTMLCanvasElementMock {
    getContext(contextId: string) {
      if (contextId === '2d') {
        // Return a basic 2D context mock. Tests can override prototype.getContext for specific needs.
        return {
          fillRect: vi.fn(),
          clearRect: vi.fn(),
          fillText: vi.fn(),
          beginPath: vi.fn(),
          moveTo: vi.fn(),
          lineTo: vi.fn(),
          stroke: vi.fn(),
          // Default properties that might be accessed
          fillStyle: '',
          strokeStyle: '',
          lineWidth: 0,
          textAlign: '',
          font: '',
        };
      }
      return null;
    }
    // Mock properties often accessed by visualizers
    get offsetWidth() { return 300; }
    get offsetHeight() { return 150; }
    // Add other necessary properties or methods if tests require them
    // e.g., toDataURL, addEventListener, etc., if needed.
  };
}


// If you were using jest-dom matchers, you'd import them here:
// import '@testing-library/jest-dom';
