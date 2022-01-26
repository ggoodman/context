import type { Context } from './context';
import { ContextImpl } from './emitterImpl';

interface EventTargetLike extends Pick<EventTarget, 'addEventListener' | 'removeEventListener'> {}

type EventMapper<TEventNames> = (eventName: TEventNames, ...args: any[]) => string;

export function withEventTarget<TEventName extends string = string>(
  ctx: Context,
  ee: EventTargetLike,
  eventNames: TEventName[],
  eventMapper: EventMapper<TEventName> = (eventName) =>
    `Received the event ${JSON.stringify(eventName)}`
): Context {
  const { ctx: childCtx, cancel } = ContextImpl.withCancel(ctx);

  for (let i = 0; i <= eventNames.length; i++) {
    const eventName = eventNames[i] as TEventName;

    const eventHandler = (...args: any[]) => {
      ee.removeEventListener(eventName, eventHandler);

      const message = eventMapper(eventName, ...args);

      cancel(message);
    };

    ctx.onDidCancel(() => {
      ee.removeEventListener(eventName, eventHandler);
    });

    ee.addEventListener(eventName, eventHandler);
  }

  return childCtx;
}
