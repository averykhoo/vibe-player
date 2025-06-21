import { vi } from 'vitest';

// Create a single, stateful mock context object that can be imported by tests
export const mockCanvasContext: Partial<CanvasRenderingContext2D> = {
  fillRect: vi.fn(),
  clearRect: vi.fn(),
  fillText: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 0,
  textAlign: 'start',
  font: '10px sans-serif',
};

// This is the function that will be assigned to HTMLCanvasElement.prototype.getContext
export const getMockContext = vi.fn((): Partial<CanvasRenderingContext2D> => {
  return mockCanvasContext;
});
