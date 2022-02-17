import type { CancelFunc, CancellationListener, Context } from './context';
import {
  AggregateError,
  CancellationReason,
  CancelledError,
  DeadlineExceededError,
} from './errors';
import type { ContextHost, Disposable } from './host';
import { invariant } from './invariant';

const kContext = Symbol.for('@ggoodman/context');

interface WrappedCancellationListener {
  fn: CancellationListener;
}

export interface ContextImplOptions {
  cancellationReason?: CancellationReason;
  deadlineAt?: number;
  key?: unknown;
  value?: unknown;
  parent?: ContextImpl;
}

export class ContextImpl implements Context {
  static #roots: WeakMap<ContextHost, ContextImpl> = new WeakMap();

  static background(host: ContextHost) {
    let root = ContextImpl.#roots.get(host);
    if (!root) {
      root = new ContextImpl(host, {});
      ContextImpl.#roots.set(host, root);
    }

    return root;
  }

  static host(obj: unknown): ContextHost {
    invariant(
      ContextImpl.isContext(obj),
      'Attempting to extract the host of a non-Context reference'
    );

    return obj.#host;
  }

  static isContext(obj: unknown): obj is ContextImpl {
    return obj != null && typeof obj === 'object' && (obj as ContextImpl).#brand === kContext;
  }

  static withCancel(ctx: Context): { ctx: ContextImpl; cancel: CancelFunc } {
    if (!ContextImpl.isContext(ctx)) {
      throw new TypeError('Argument must be a valid Context');
    }

    const childCtx = new ContextImpl(ctx.#host, {
      cancellationReason: ctx.error(),
      deadlineAt: ctx.#deadlineAt,
      parent: ctx,
    });
    const cancel = (message?: string | Error) => {
      if (message instanceof Error) {
        ContextImpl.cancel(childCtx, new CancelledError(undefined, message));
      } else {
        ContextImpl.cancel(childCtx, new CancelledError(message));
      }
    };

    return { ctx: childCtx, cancel };
  }

  static withDeadline(
    ctx: Context,
    epochTimeMs: number,
    now?: number
  ): { ctx: ContextImpl; cancel: CancelFunc } {
    if (!ContextImpl.isContext(ctx)) {
      throw new TypeError('Argument must be a valid Context');
    }

    const deadlineAt = ctx.#deadlineAt ? Math.min(ctx.#deadlineAt, epochTimeMs) : epochTimeMs;
    const childCtx = new ContextImpl(ctx.#host, {
      cancellationReason: ctx.error(),
      deadlineAt: deadlineAt,
      parent: ctx,
    });
    const cancel = () => ContextImpl.cancel(childCtx, new CancelledError());

    // If the parent has a deadline and it will fire sooner, let's rely on that. Otherwise, set up
    // a new timer to trigger cancellation.
    if (!ctx.#deadlineAt || ctx.#deadlineAt > deadlineAt) {
      now ??= ctx.#host.getTime();

      const { dispose } = ctx.#host.scheduleWithTimeout(deadlineAt - now, () => {
        ContextImpl.cancel(childCtx, new DeadlineExceededError());
      });

      // Make sure we clean up the timer
      ctx.onDidCancel(dispose);
    }

    return { ctx: childCtx, cancel };
  }

  static withTimeout(ctx: Context, timeoutMs: number): { ctx: ContextImpl; cancel: CancelFunc } {
    if (!ContextImpl.isContext(ctx)) {
      throw new TypeError('Argument must be a valid Context');
    }

    const now = ctx.#host.getTime();
    const epochTimeMs = now + timeoutMs;

    return ContextImpl.withDeadline(ctx, epochTimeMs, now);
  }

  private static cancel(ctx: Context, reason: CancellationReason): void {
    if (!ContextImpl.isContext(ctx)) {
      throw new TypeError('Argument must be a valid Context');
    }

    if (ctx.error()) {
      // Already cancelled. No further work to do
      return;
    }

    // Set up a default reason.
    ctx.#cancellationReason = reason ?? new CancelledError();

    return void ctx.#host.scheduleMicrotask(ContextImpl.notify, ctx);
  }

  private static notify(ctx: ContextImpl): void {
    const errors: unknown[] = [];

    invariant(
      ctx.#cancellationReason,
      'Attempting to notify listeners of a Context that has no cancellation reason'
    );

    while (ctx.#listeners.length) {
      const listenerRef = ctx.#listeners.shift()!;

      try {
        listenerRef.fn(ctx.#cancellationReason);
      } catch (err) {
        errors.push(err);
      }
    }

    const err =
      errors.length === 1
        ? errors[0]
        : errors.length > 1
        ? new AggregateError(errors, 'Errors thrown during context cancellation')
        : undefined;

    if (err) {
      if (!ctx.#host.onUncaughtException) {
        throw err;
      }

      // We're intentionally not wrapping this in a try / catch. If an error handler
      // is supplied and *THAT* throws then we're just going to have to give up.
      ctx.#host.onUncaughtException(err);
    }
  }

  readonly #brand = kContext;
  readonly #host: ContextHost;
  readonly #listeners: WrappedCancellationListener[] = [];

  #cancellationReason?: CancellationReason;
  #deadlineAt?: number;
  #parent?: ContextImpl;
  #key?: any;
  #value?: any;

  constructor(host: ContextHost, options: ContextImplOptions) {
    this.#cancellationReason = options.cancellationReason;
    this.#deadlineAt = options.deadlineAt;
    this.#host = host;
    this.#key = options.key;
    this.#value = options.value;
    this.#parent = options.parent;

    if (this.#parent) {
      const disposable = this.#parent.onDidCancel((reason) => {
        ContextImpl.cancel(this, reason);
      });

      // Make sure we unlink this from the parent's notification queue.
      this.onDidCancel(() => {
        disposable.dispose();
      });
    }
  }

  error(): CancellationReason | undefined {
    if (this.#cancellationReason) {
      return this.#cancellationReason;
    }

    const parentReason = this.#parent?.error();

    if (parentReason) {
      this.#cancellationReason = parentReason;

      // Notify listeners later in the tick.
      this.#host.scheduleMicrotask(ContextImpl.notify, this);
    } else if (typeof this.#deadlineAt === 'number') {
      const now = this.#host.getTime();

      if (now >= this.#deadlineAt) {
        // The async timer didn't fire but the context has exceeded its lifetime.
        this.#cancellationReason = new DeadlineExceededError();

        // Notify listeners later in the tick.
        this.#host.scheduleMicrotask(ContextImpl.notify, this);
      }
    }

    return this.#cancellationReason;
  }

  getValue(key: unknown): unknown {
    if (this.#key === key) {
      return this.#value;
    }

    // Delegate to parent, if available
    return this.#parent?.getValue(key);
  }

  hasValue(key: unknown): boolean {
    return this.#key === key || (!!this.#parent?.hasValue(key) ?? false);
  }

  onDidCancel(listener: CancellationListener): Disposable {
    // We need to wrap listeners in a wrapper so that two of the
    // same function registered as listeners don't have the same
    // referential identity.
    const ref: WrappedCancellationListener = {
      fn: listener,
    };

    let disposable: Disposable | undefined = undefined;

    this.#listeners.push(ref);

    const err = this.error();

    if (err) {
      // The context is already cancelled so what we're going to do
      // is schedule the listener for later in the event loop.
      disposable = this.#host.scheduleMicrotask(ContextImpl.notify, this);
    }

    return {
      dispose: () => {
        disposable?.dispose();

        const idx = this.#listeners.indexOf(ref);

        if (idx >= 0) {
          this.#listeners.splice(idx, 1);
        }
      },
    };
  }

  done(): Promise<CancellationReason> {
    const err = this.error();

    if (err) {
      return Promise.resolve(err);
    }

    return new Promise<CancellationReason>((resolve) => {
      this.onDidCancel((reason) => {
        resolve(reason);
      });
    });
  }

  then<TResult1 = never, TResult2 = never>(
    onfulfilled?: ((value: never) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    const err = this.error();

    if (err) {
      return Promise.reject(err).then(onfulfilled, onrejected);
    }

    const p = new Promise<never>((_, reject) => {
      this.onDidCancel((reason) => {
        reject(reason);
      });
    });

    return p.then(onfulfilled, onrejected);
  }

  withValue(key: unknown, value: unknown): Context {
    return new ContextImpl(this.#host, {
      cancellationReason: this.#cancellationReason,
      deadlineAt: this.#deadlineAt,
      key,
      value,
      parent: this,
    });
  }
}
