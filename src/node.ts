///<reference types="node" />

import { ContextImpl } from './impl';
import type { Context } from './context';
import type { ContextHost, Disposable } from './host';
import { finished } from 'node:stream';

interface EventEmitterLike {
  once(eventName: string, handler: AnyFunc): void;
  removeListener(eventName: string, handler?: AnyFunc): void;
}

type AnyArgs = any[];
type AnyFunc = (...args: AnyArgs) => any;

export class ContextHostNode {
  static #instance: ContextHostNode;

  static getInstance(): ContextHost {
    if (!this.#instance) {
      this.#instance = new ContextHostNode();
    }

    return this.#instance;
  }

  // #refCount: number = 0;
  // #referencedContexts:WeakMap<Context, number> = new WeakMap();

  readonly scheduleWithTimeout = nativeScheduleWithTimeout;

  createAbortController(): AbortController {
    return new AbortController();
  }

  getTime() {
    return Date.now();
  }

  // ref(ctx: Context): Disposable {
  //   let count = this.#referencedContexts.get(ctx);

  //   this.#referencedContexts.set(ctx, (count ?? 0 ) + 1);
  //   this.#refCount++;

  //   return {
  //     dispose: () =>  {
  //       this.#unref(ctx);
  //     }
  //   }
  // }

  // #unref(ctx: Context) {
  //   let count = this.#referencedContexts.get(ctx);

  //   if (typeof count === 'undefined') {
  //     return;
  //   }

  //   count--;

  //   if (count <= 0) {
  //     this.#referencedContexts.delete(ctx)
  //   } else {
  //     this.#referencedContexts.set(ctx, count);
  //   }

  //   if (this.#referencedContexts.)
  // }

  scheduleMicrotask(fn: AnyFunc, ...args: AnyArgs): Disposable {
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      fn(...args);
    });

    return {
      dispose() {
        cancelled = true;
      },
    };
  }
}

function nativeScheduleWithTimeout(timeout: number, fn: AnyFunc, ...args: AnyArgs): Disposable {
  const handle = setTimeout(fn, timeout, ...args);

  return {
    dispose() {
      clearTimeout(handle);
    },
  };
}

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

export function withStreamCompletion(
  ctx: Context,
  stream: NodeJS.ReadableStream | NodeJS.WritableStream
): Context {
  const { ctx: childCtx, cancel } = ContextImpl.withCancel(ctx);

  const cleanup = finished(stream, (err) => {
    disposable.dispose();

    cancel(err || undefined);
  });
  const disposable = ctx.onDidCancel(() => {
    cleanup();
  });

  return childCtx;
}
