///<reference lib="dom" />

import type { CancellationReason } from './errors';
import type { Disposable } from './host';
import { ContextHostNative } from './host';
import { ContextImpl } from './impl';

export type CancelFunc = (message?: string | Error) => void;
type AbortSignal = AbortController['signal'];
export type CancellationListener = (err: CancellationReason) => any;

export interface Context extends PromiseLike<never> {
  /**
   * Get the `AbortSignal` corresponding to the Context.
   */
  readonly signal: AbortSignal;

  /**
   * Produce a `Promise` that will *resolve* to the Context's cancellation
   * reason.
   *
   * Note that this is unlike awaiting the actual Context. In that case,
   * the underlying Promise will settle as rejected with the cancellation
   * reason.
   */
  done(): Promise<CancellationReason>;

  /**
   * Return the cancellation reason if the Context is cancelled.
   */
  error(): CancellationReason | undefined;

  /**
   * Return the value associated with the supplied `key` for this Context.
   *
   * @param key The key whose value is to be retrieved.
   */
  getValue(key: unknown): unknown;

  /**
   * Return a new Context with a bit of contextual data attached.
   *
   * @param key The key with which to associate data.
   * @param value The value of the data.
   */
  withValue(key: unknown, value: unknown): Context;

  /**
   * Attach a callback function that will be called with the Context is
   * cancelled. The return value of this function is a `Disposable` whose
   * `dispose()` method will remove the callback.
   *
   * @param listener The handler to be called when the Context is cancelled.
   */
  onDidCancel(listener: CancellationListener): Disposable;
}

export namespace Context {
  export function background() {
    return ContextImpl.background(ContextHostNative.getInstance());
  }

  export function isContext(obj: unknown): obj is Context {
    return ContextImpl.isContext(obj);
  }

  export function withCancel(ctx: Context): { ctx: Context; cancel: CancelFunc } {
    return ContextImpl.withCancel(ctx);
  }

  export function withDeadline(
    ctx: Context,
    epochTimeMs: number
  ): { ctx: Context; cancel: CancelFunc } {
    return ContextImpl.withDeadline(ctx, epochTimeMs);
  }

  export function withTimeout(
    ctx: Context,
    timeoutMs: number
  ): { ctx: Context; cancel: CancelFunc } {
    return ContextImpl.withTimeout(ctx, timeoutMs);
  }
}
