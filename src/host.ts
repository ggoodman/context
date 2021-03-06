type AnyArgs = any[];
type AnyFunc = (...args: AnyArgs) => any;

export interface Disposable {
  dispose(): void;
}

export interface ContextHost {
  getTime(): number;
  scheduleMicrotask(fn: AnyFunc, ...args: AnyArgs): Disposable;
  scheduleWithTimeout(timeout: number, fn: AnyFunc, ...args: AnyArgs): Disposable;

  onUncaughtException?(err: unknown): void;
}
