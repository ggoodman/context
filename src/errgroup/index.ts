import { withCancel } from '..';
import type { CancelFunc, Context } from '../context';
import { ContextImpl } from '../emitterImpl';
import { invariant } from '../invariant';

export class ErrGroup {
  static withContext(ctx: Context): { ctx: Context; group: ErrGroup } {
    invariant(
      ContextImpl.isContext(ctx),
      'Attempting to extract the host of a non-Context reference'
    );

    const { ctx: childCtx, cancel } = withCancel(ctx);
    const group = new ErrGroup();

    group.#cancel = cancel;

    return { ctx: childCtx, group };
  }

  #cancel?: CancelFunc;
  #pending: Array<PromiseLike<unknown> | unknown> = [];
  #errored = false;

  #onError = (err: unknown) => {
    if (this.#errored) {
      // Ignore later errors
      return;
    }
    this.#errored = true;

    if (this.#cancel) {
      this.#cancel(err as any);
    }
  };

  run(fn: () => unknown): void {
    try {
      const pending = fn();

      if (isPromiseLike(pending)) {
        pending.then(noop, this.#onError);
      }

      this.#pending.push(pending);
    } catch (err) {
      this.#onError(err);

      const pending = Promise.reject(err);

      // Suppress unhandledRejections
      pending.catch(noop);

      this.#pending.push(pending);
    }
  }

  async wait(): Promise<void> {
    if (!this.#pending.length) {
      // Nothing to wait for
      return;
    }

    await Promise.all(this.#pending);
  }
}

function isPromiseLike(obj: unknown): obj is PromiseLike<unknown> {
  return !!obj && typeof (obj as any).then === 'function';
}

function noop() {}
