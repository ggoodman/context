import type { AbortController, AbortSignal } from './abortController';
import type { CancelFunc, CancellationListener, Context } from './context';
import {
  AggregateError,
  CancellationReason,
  CancelledError,
  DeadlineExceededError,
} from './errors';
import type { ContextHost, Disposable } from './host';
import { invariant } from './invariant';

const kDeadlineAt = Symbol('kDeadlineAt');
const kParent = Symbol('kParent');
const kKey = Symbol('kKey');
const kValue = Symbol('kValue');
const kCancellationReason = Symbol('kCancellationReason');
const kBrand = Symbol.for('@ggoodman/context@2');
const kHost = Symbol('kHost');
const kListeners = Symbol('kListeners');
const kRoots = Symbol('kRoots');
const kAbortController = Symbol('kAbortController');

const noopDisposable: Disposable = {
  dispose() {},
};

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
  static [kRoots]: WeakMap<ContextHost, ContextImpl> = new WeakMap();

  static background(host: ContextHost) {
    let root = ContextImpl[kRoots].get(host);
    if (!root) {
      root = new ContextImpl(host, {});
      ContextImpl[kRoots].set(host, root);
    }

    return root;
  }

  static host(obj: unknown): ContextHost {
    invariant(
      ContextImpl.isContext(obj),
      'Attempting to extract the host of a non-Context reference'
    );

    return obj[kHost];
  }

  static isContext(obj: unknown): obj is ContextImpl {
    return obj != null && typeof obj === 'object' && (obj as ContextImpl)[kBrand] === true;
  }

  static withCancel(ctx: Context): { ctx: ContextImpl; cancel: CancelFunc } {
    if (!ContextImpl.isContext(ctx)) {
      throw new TypeError('Argument must be a valid Context');
    }

    const childCtx = new ContextImpl(ctx[kHost], {
      cancellationReason: ctx.error(),
      deadlineAt: ctx[kDeadlineAt],
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

    const parentDeadlineAt = ctx[kDeadlineAt];
    const deadlineAt = parentDeadlineAt ? Math.min(parentDeadlineAt, epochTimeMs) : epochTimeMs;
    const childCtx = new ContextImpl(ctx[kHost], {
      cancellationReason: ctx.error(),
      deadlineAt: deadlineAt,
      parent: ctx,
    });
    const cancel = () => ContextImpl.cancel(childCtx, new CancelledError());

    // If the parent has a deadline and it will fire sooner, let's rely on that. Otherwise, set up
    // a new timer to trigger cancellation.
    if (!parentDeadlineAt || parentDeadlineAt > deadlineAt) {
      now ??= ctx[kHost].getTime();

      const { dispose } = ctx[kHost].scheduleWithTimeout(deadlineAt - now, () => {
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

    const now = ctx[kHost].getTime();
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
    ctx[kCancellationReason] = reason ?? new CancelledError();

    return void ContextImpl.notify(ctx);
  }

  private static notify(ctx: ContextImpl): void {
    const errors: unknown[] = [];
    const reason = ctx[kCancellationReason];

    invariant(
      reason,
      'Attempting to notify listeners of a Context that has no cancellation reason'
    );

    const listeners = ctx[kListeners];

    while (listeners.length) {
      const listenerRef = listeners.shift()!;

      try {
        listenerRef.fn(reason);
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
      ContextImpl.notifyUncaughtException(ctx, err);
    }
  }

  private static notifyUncaughtException(ctx: ContextImpl, err: unknown): void {
    const onUncaughtException = ctx[kHost].onUncaughtException;

    if (!onUncaughtException) {
      throw err;
    }

    // We're intentionally not wrapping this in a try / catch. If an error handler
    // is supplied and *THAT* throws then we're just going to have to give up.
    onUncaughtException.call(ctx[kHost], err);
  }

  private readonly [kBrand] = true;
  private readonly [kHost]: ContextHost;
  private readonly [kListeners]: WrappedCancellationListener[] = [];

  private [kCancellationReason]?: CancellationReason;
  private [kDeadlineAt]?: number;
  private [kParent]?: ContextImpl;
  private [kAbortController]?: AbortController;
  private [kKey]?: any;
  private [kValue]?: any;

  constructor(host: ContextHost, options: ContextImplOptions) {
    this[kCancellationReason] = options.cancellationReason;
    this[kDeadlineAt] = options.deadlineAt;
    this[kHost] = host;
    this[kKey] = options.key;
    this[kValue] = options.value;
    this[kParent] = options.parent;

    if (options.parent) {
      const disposable = options.parent.onDidCancel((reason) => {
        ContextImpl.cancel(this, reason);
      });

      // Make sure we unlink this from the parent's notification queue.
      this.onDidCancel(() => {
        disposable.dispose();
      });
    }
  }

  get signal(): AbortSignal {
    let ctl = this[kAbortController];
    if (!ctl) {
      ctl = this[kHost].createAbortController();
      this[kAbortController] = ctl;

      if (this[kCancellationReason]) {
        ctl.abort(this[kCancellationReason]);
      } else {
        this.onDidCancel(createCancelFunc(ctl));
      }
    }

    return ctl.signal;
  }

  error(): CancellationReason | undefined {
    if (this[kCancellationReason]) {
      return this[kCancellationReason];
    }

    const parentReason = this[kParent]?.error();
    const deadlineAt = this[kDeadlineAt];

    if (parentReason) {
      this[kCancellationReason] = parentReason;

      // Immediately notify listeners.
      ContextImpl.notify(this);
    } else if (typeof deadlineAt === 'number') {
      const now = this[kHost].getTime();

      if (now >= deadlineAt) {
        // The async timer didn't fire but the context has exceeded its lifetime.
        this[kCancellationReason] = new DeadlineExceededError();

        // Immediately notify listeners.
        ContextImpl.notify(this);
      }
    }

    return this[kCancellationReason];
  }

  getValue(key: unknown): unknown {
    if (this[kKey] === key) {
      return this[kValue];
    }

    // Delegate to parent, if available
    return this[kParent]?.getValue(key);
  }

  hasValue(key: unknown): boolean {
    return this[kKey] === key || (this[kParent]?.hasValue(key) ?? false);
  }

  onDidCancel(listener: CancellationListener): Disposable {
    const err = this[kCancellationReason];

    if (err) {
      // The context is already cancelled so what we're going to short-cut the whole
      // eventing system.
      try {
        listener(err);
      } catch (err) {
        ContextImpl.notifyUncaughtException(this, err);
      }

      // By-pass registering a listener.
      return noopDisposable;
    }

    // We need to wrap listeners in a wrapper so that two of the
    // same function registered as listeners don't have the same
    // referential identity.
    const ref: WrappedCancellationListener = {
      fn: listener,
    };

    let disposable: Disposable | undefined = undefined;

    this[kListeners].push(ref);

    return {
      dispose: () => {
        disposable?.dispose();

        const idx = this[kListeners].indexOf(ref);

        if (idx >= 0) {
          this[kListeners].splice(idx, 1);
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
    return new ContextImpl(this[kHost], {
      cancellationReason: this[kCancellationReason],
      deadlineAt: this[kDeadlineAt],
      key,
      value,
      parent: this,
    });
  }
}

function createCancelFunc(ctl: AbortController): () => void {
  return ctl.abort.bind(ctl);
}
