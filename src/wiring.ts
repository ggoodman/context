import type { CancellationToken } from 'ts-primitives';
import type { Context } from './context';
import { CancelledError } from './errors';
import { isContext } from './factory';

interface EventEmitterLike {
  once(eventName: string, handler: (...args: any[]) => void): this;
  removeListener(eventName: string, handler: (...args: any[]) => void): this;
}

export function wireCancellationToken(ctx: Context, token: CancellationToken) {
  if (!isContext(ctx)) {
    throw new TypeError(`The ctx argument must be a Context instance`);
  }

  const { cancel, context } = ctx.withCancel();

  if (token.isCancellationRequested) {
    cancel();
  } else {
    token.onCancellationRequested(cancel);
  }

  return context;
}

export function wireEventEmitter(
  ctx: Context,
  emitter: EventEmitterLike,
  eventNames: string | string[],
  reasonFactory: (eventName: string, ...args: any[]) => string = (eventName: string) =>
    `Received the event ${JSON.stringify(eventName)}`
): Context {
  if (!isContext(ctx)) {
    throw new TypeError(`The ctx argument must be a Context instance`);
  }

  const { cancel, context } = ctx.withCancel();

  eventNames = Array.isArray(eventNames) ? eventNames : [eventNames];

  for (const eventName of eventNames) {
    const eventHandler = (...args: any[]) => {
      emitter.removeListener(eventName, eventHandler);
      (cancel as any)(new CancelledError(reasonFactory(eventName, ...args)));
    };

    context.onDidCancel(() => {
      emitter.removeListener(eventName, eventHandler);
    });

    emitter.once(eventName, eventHandler);
  }

  return context;
}
