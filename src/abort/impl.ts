import type { Context } from '../context';
import { ContextImpl } from '../impl';
import { invariant } from '../invariant';

type AbortSignal = AbortController['signal'];

export function signalFactory(
  AC = typeof AbortController === 'function' ? AbortController : undefined
) {
  invariant(AC, 'AbortController not detected in the environment');

  const ctxSignals: WeakMap<Context, AbortSignal> = new WeakMap();

  return function toAbortSignal(ctx: Context): AbortSignal {
    if (!ContextImpl.isContext(ctx)) {
      throw new TypeError('Argument must be a valid Context');
    }

    let signal = ctxSignals.get(ctx);

    if (!signal) {
      const ctl = new AbortController();
      const err = ctx.error();

      signal = ctl.signal;
      ctxSignals.set(ctx, signal);

      if (err) {
        ctl.abort(
          //@ts-ignore AbortControllers will soon have
          // the ability to pass reasons.
          err
        );
      } else {
        // Wire up cancellation events to the AbortController
        ctx.onDidCancel(ctl.abort.bind(ctl));
      }
    }

    return signal;
  };
}
