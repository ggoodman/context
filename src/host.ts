import type { AbortController } from './abortController';

type AnyArgs = any[];
type AnyFunc = (...args: AnyArgs) => any;

export interface Disposable {
  dispose(): void;
}

export interface ContextHost {
  createAbortController(): AbortController;
  getTime(): number;
  scheduleWithTimeout(timeout: number, fn: AnyFunc, ...args: AnyArgs): Disposable;

  onUncaughtException?(err: unknown): void;
}
