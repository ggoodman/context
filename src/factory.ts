import { Emitter, Event } from 'ts-primitives';
import type { Context } from './context';
import { CancellationReason, CancelledError, DeadlineExceededError } from './errors';

const kCancellationReason = Symbol('cancellationReason');
const kDeadlineAt = Symbol('deadlineAt');
const kHost = Symbol('host');
const kOnWillCancel = Symbol('onWillCancel');

export interface ContextHost<TTimerHandle = number> {
  currentTime(): number;
  clearTimeout(handle: TTimerHandle): void;
  setTimeout(handler: (...args: any[]) => void, timeout?: number, ...args: any[]): TTimerHandle;
}

export function createContextImplementation<TContextHost extends ContextHost<any>>(
  host: TContextHost
): {
  context: Context;
  isContext(obj: unknown): obj is Context;
} {
  const context = new ContextImpl(host);

  return {
    context,
    isContext,
  };
}

export function isContext(obj: unknown): obj is Context {
  return obj instanceof ContextImpl;
}

interface ContextImplHost extends ContextHost {}

interface ContextImplOptions {
  cancellationReason?: CancellationReason;
  deadlineAt?: number;
}

class ContextImpl implements Context {
  private static cancel(context: ContextImpl, reason?: CancellationReason) {
    if (!context[kCancellationReason]) {
      context[kCancellationReason] = reason ?? new CancelledError();

      if (context[kOnWillCancel]) {
        context[kOnWillCancel]!.fire(context[kCancellationReason]!);
        context[kOnWillCancel]!.dispose();
        context[kOnWillCancel] = undefined;
      }
    }
  }

  [kCancellationReason]?: CancellationReason;
  readonly [kDeadlineAt]?: number;
  readonly [kHost]: ContextImplHost;
  [kOnWillCancel]?: Emitter<CancellationReason>;

  constructor(host: ContextImplHost, options: ContextImplOptions = {}) {
    this[kCancellationReason] = options.cancellationReason;
    this[kDeadlineAt] = options.deadlineAt;
    this[kHost] = host;
  }

  get cancellationReason() {
    if (this[kCancellationReason]) {
      return this[kCancellationReason]!;
    }

    // Lazy check for deadline exceeded
    if (this[kDeadlineAt] && this[kHost].currentTime() > this[kDeadlineAt]!) {
      ContextImpl.cancel(this, new DeadlineExceededError());
    }

    return this[kCancellationReason];
  }

  get onDidCancel() {
    if (this[kCancellationReason]) {
      const event: Event<CancellationReason> = (callback, thisArg?) => {
        const handle = this[kHost].setTimeout(callback.bind(thisArg), 0);
        return {
          dispose: () => {
            this[kHost].clearTimeout(handle);
          },
        };
      };
      return event;
    }

    if (!this[kOnWillCancel]) {
      this[kOnWillCancel] = new Emitter();
    }

    return this[kOnWillCancel]!.event;
  }

  then<TResult1 = never, TResult2 = never>(
    onfulfilled?: ((value: never) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null
  ): PromiseLike<TResult1 | TResult2> {
    return new Promise<never>((resolve, reject) => {
      if (this[kCancellationReason]) {
        return reject(this[kCancellationReason]);
      }

      this.onDidCancel(reject);
    }).then(onfulfilled, onrejected);
  }

  withCancel() {
    const context = new ContextImpl(this[kHost], { deadlineAt: this[kDeadlineAt] });
    const cancel = (reason?: CancellationReason) =>
      ContextImpl.cancel(context, reason ?? new CancelledError());

    this.onDidCancel(cancel);

    return { cancel, context };
  }

  withDeadline(epochTimeMs: number, options?: { now: number }) {
    const now = options?.now ?? this[kHost].currentTime();
    const deadlineAt = this[kDeadlineAt] ? Math.min(this[kDeadlineAt]!, epochTimeMs) : epochTimeMs;
    const context = new ContextImpl(this[kHost], { deadlineAt });
    const cancel = (reason?: CancellationReason) =>
      ContextImpl.cancel(context, reason ?? new CancelledError());

    this.onDidCancel(cancel);

    // We only want to set a timer if we're *reducing* the deadline. Otherwise, we can let
    // the parent context's timer deal with firing the cancellation.
    if (deadlineAt === epochTimeMs) {
      const timeout = () => cancel(new DeadlineExceededError());
      const timerHandle = this[kHost].setTimeout(timeout, deadlineAt - now);
      const cancelTimeout = () => this[kHost].clearTimeout(timerHandle);

      context.onDidCancel(cancelTimeout);
    }

    return { cancel, context };
  }

  withTimeout(timeoutMs: number) {
    const now = this[kHost].currentTime();
    const epochTimeMs = now + timeoutMs;

    return this.withDeadline(epochTimeMs, { now });
  }
}
