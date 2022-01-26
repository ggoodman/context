///<reference types="node" />

import type { Context } from './context';
import { ContextImpl } from './emitterImpl';

interface EventEmitterLike {
  once(eventName: string, handler: AnyFunc): void;
  removeListener(eventName: string, handler?: AnyFunc): void;
}

type AnyArgs = any[];
type AnyFunc = (...args: AnyArgs) => any;
type EventMapper<TEventNames> = (eventName: TEventNames, ...args: any[]) => string;

export function withEventEmitter<TEventName extends string = string>(
  ctx: Context,
  ee: EventEmitterLike,
  eventNames: TEventName[],
  eventMapper: EventMapper<TEventName> = (eventName) =>
    `Received the event ${JSON.stringify(eventName)}`
): Context {
  const { ctx: childCtx, cancel } = ContextImpl.withCancel(ctx);

  for (let i = 0; i <= eventNames.length; i++) {
    const eventName = eventNames[i] as TEventName;

    const eventHandler = (...args: any[]) => {
      ee.removeListener(eventName, eventHandler);
      disposable.dispose();

      const message = eventMapper(eventName, ...args);

      cancel(message);
    };

    const disposable = ctx.onDidCancel(() => {
      ee.removeListener(eventName, eventHandler);
    });

    ee.once(eventName, eventHandler);
  }

  return childCtx;
}
