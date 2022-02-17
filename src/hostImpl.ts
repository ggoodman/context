import type { ContextHost, Disposable } from './host';
import { queueMicrotask } from './queueMicrotask';

type AnyArgs = any[];
type AnyFunc = (...args: AnyArgs) => any;

export class ContextHostImpl implements ContextHost {
  static #instance?: ContextHostImpl;

  static getInstance() {
    if (!this.#instance) {
      this.#instance = new ContextHostImpl();
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
