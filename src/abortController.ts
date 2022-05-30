import type { Context } from './context';
import { ContextImpl } from './contextImpl';

/** A controller object that allows you to abort one or more DOM requests as and when desired. */
export interface AbortController {
  /** Returns the AbortSignal object associated with this object. */
  readonly signal: AbortSignal;

  /** Invoking this method will set this object's AbortSignal's aborted flag and signal to any observers that the associated activity is to be aborted. */
  abort(reason?: any): void;
}

interface AbortSignalEventMap {
  abort: unknown;
}

/** A signal object that allows you to communicate with a DOM request (such as a Fetch) and abort it if required via an AbortController object. */
export interface AbortSignal {
  /** Returns true if this AbortSignal's AbortController has signaled to abort, and false otherwise. */
  readonly aborted: boolean;
  readonly reason?: any;

  addEventListener<K extends keyof AbortSignalEventMap>(
    type: K,
    listener: (this: AbortSignal, ev: AbortSignalEventMap[K]) => any
  ): void;
  removeEventListener<K extends keyof AbortSignalEventMap>(
    type: K,
    listener: (this: AbortSignal, ev: AbortSignalEventMap[K]) => any
  ): void;
}

export function withAbortSignal(ctx: Context, signal: AbortSignal): Context {
  const { ctx: childCtx, cancel } = ContextImpl.withCancel(ctx);

  if (signal.aborted) {
    cancel(signal.reason);
  } else {
    const onAbort = () => cancel();

    signal.addEventListener('abort', onAbort);

    childCtx.onDidCancel(() => signal.removeEventListener('abort', onAbort));
  }

  return childCtx;
}
