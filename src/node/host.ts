import { AbortController as AbortControllerPolyfill } from 'abort-controller';
import type { ContextHost, Disposable } from '../host';
import { queueMicrotask } from '../queueMicrotask';

type AnyArgs = any[];
type AnyFunc = (...args: AnyArgs) => any;

export class ContextHostNode implements ContextHost {
  static #instance?: ContextHostNode;

  static getInstance() {
    if (!this.#instance) {
      this.#instance = new ContextHostNode();
    }

    return this.#instance;
  }

  #AbortControllerCons =
    typeof AbortController === 'function' ? AbortController : AbortControllerPolyfill;

  readonly scheduleWithTimeout = nativeScheduleWithTimeout;

  createAbortController(): AbortController {
    return new this.#AbortControllerCons();
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
