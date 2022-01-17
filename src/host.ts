import { queueMicrotask } from './queueMicrotask';

type AnyArgs = any[];
type AnyFunc = (...args: AnyArgs) => any;

export interface Disposable {
  dispose(): void;
}

export interface ContextHost {
  createAbortController(): AbortController;

  getTime(): number;
  scheduleMicrotask(fn: AnyFunc, ...args: AnyArgs): Disposable;
  scheduleWithTimeout(timeout: number, fn: AnyFunc, ...args: AnyArgs): Disposable;

  onUncaughtException?(err: unknown): void;
}

export class ContextHostNative implements ContextHost {
  static #instance?: ContextHostNative;

  static getInstance() {
    if (!this.#instance) {
      this.#instance = new ContextHostNative();
    }

    return this.#instance;
  }

  readonly scheduleWithTimeout = nativeScheduleWithTimeout;

  createAbortController(): AbortController {
    return new AbortController();
  }

  getTime() {
    return Date.now();
  }

  scheduleMicrotask(fn: AnyFunc, ...args: AnyArgs): Disposable {
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      fn(...args);
    });

    return {
      dispose() {
        cancelled = true;
      },
    };
  }
}

function nativeScheduleWithTimeout(timeout: number, fn: AnyFunc, ...args: AnyArgs): Disposable {
  const handle = setTimeout(fn, timeout, ...args);

  return {
    dispose() {
      clearTimeout(handle);
    },
  };
}
