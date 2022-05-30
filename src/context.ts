import type { AbortSignal } from './abortController';
import type { CancellationReason } from './errors';
import type { Disposable } from './host';

export type CancelFunc = (message?: string | Error) => void;
export type CancellationListener = (err: CancellationReason) => any;

export interface Context extends PromiseLike<never> {
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
   * Determine if this context or any of its ancestors contain a value for the requested key.
   *
   * This might be useful in situations where a `null` or `undefined` value might deliberately
   * be set but it must be distinguished from cases where the context has no values assigned to
   * the given key.
   *
   * @param key The key whose presence is to be tested
   */
  hasValue(key: unknown): boolean;

  /**
   * Attach a callback function that will be called with the Context is
   * cancelled. The return value of this function is a `Disposable` whose
   * `dispose()` method will remove the callback.
   *
   * @param listener The handler to be called when the Context is cancelled.
   */
  onDidCancel(listener: CancellationListener): Disposable;

  /**
   * Return a new Context with a bit of contextual data attached.
   *
   * @param key The key with which to associate data.
   * @param value The value of the data.
   */
  withValue(key: unknown, value: unknown): Context;
}
