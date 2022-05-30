import type { AbortController } from './abortController';
import type { ContextHost, Disposable } from './host';

declare var AbortController: {
  prototype: AbortController;
  new (): AbortController;
};

type AnyArgs = any[];
type AnyFunc = (...args: AnyArgs) => any;

const kInstance = Symbol('kInstance');

export class ContextHostImpl implements ContextHost {
  private static [kInstance]?: ContextHostImpl;

  static getInstance() {
    let instance = this[kInstance];
    if (!instance) {
      instance = new ContextHostImpl();
      this[kInstance] = instance;
    }

    return instance;
  }

  readonly scheduleWithTimeout = nativeScheduleWithTimeout;

  createAbortController(): AbortController {
    return new AbortController();
  }

  getTime() {
    return Date.now();
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
