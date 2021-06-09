import { createContextImplementation } from './factory';

// We assume that we're running in an environment where setTimeout and clearTimeout are globally
// available.
declare function setTimeout(
  handler: (...args: any[]) => void,
  timeout?: number,
  ...args: any[]
): number;
declare function clearTimeout(handle: number): void;

export const { context: Background, isContext } = createContextImplementation({
  clearTimeout: (id: any) => clearTimeout(id),
  currentTime: () => Date.now(),
  setTimeout: (...args: Parameters<typeof setTimeout>) => setTimeout(...args),
});

export type { Context } from './context';
export { isCancelledError, isDeadlineExceededError } from './errors';
export type { CancellationReason, CancelledError, DeadlineExceededError } from './errors';
export * from './wiring';
