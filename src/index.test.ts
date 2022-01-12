///<reference types="node" />

import { suite, Test } from 'uvu';
import * as assert from 'uvu/assert';
import {
  AggregateError,
  CancellationReason,
  CancelledError,
  Context,
  DeadlineExceededError,
} from '.';
import { isCancelledError, isContextError, isDeadlineExceededError } from './errors';
import type { ContextHost, Disposable } from './host';
import { ContextImpl } from './impl';

describe('background', (it) => {
  it('.error() is undefined', () => {
    const root = Context.background();

    assert.equal(root.error(), undefined);
  });
});

describe('Context', (it) => {
  it('will report the reason when it is cancelled', () => {
    const root = Context.background();
    const { ctx, cancel } = Context.withCancel(root);

    assert.equal(ctx.error(), undefined);

    cancel();

    assert.instance(ctx.error(), CancelledError);
    assert.ok(isCancelledError(ctx.error()));
    assert.ok(isContextError(ctx.error()));
  });

  it('will report the same reason reference when cancelled', () => {
    const root = Context.background();
    const { ctx, cancel } = Context.withCancel(root);

    cancel();

    assert.is(ctx.error(), ctx.error());
  });

  it('will ignore multiple calls to cancel', () => {
    const root = Context.background();
    const { ctx, cancel } = Context.withCancel(root);

    cancel();
    cancel();
    cancel();

    assert.is(ctx.error(), ctx.error());
  });

  it('children will report the same reason reference when cancelled', () => {
    const root = Context.background();
    const { ctx, cancel } = Context.withCancel(root);

    cancel();

    const { ctx: child } = Context.withCancel(ctx);

    assert.is(ctx.error(), child.error());
  });
});

describe('Cancellation listeners', (it) => {
  it('will only ever fire once', () => {
    const host = new TestContextHost();
    const root = ContextImpl.background(host);
    const { ctx, cancel } = Context.withCancel(root);

    let firedCount = 0;

    ctx.onDidCancel(() => {
      firedCount++;
    });

    cancel();

    assert.equal(firedCount, 0);
    host.flushMicrotaskQueue();
    assert.equal(firedCount, 1);

    cancel();

    host.flushMicrotaskQueue();
    assert.equal(firedCount, 1);
  });

  it('will not fire if they have been disposed before the Context is cancelled', () => {
    const host = new TestContextHost();
    const root = ContextImpl.background(host);
    const { ctx, cancel } = Context.withCancel(root);

    let firedCount = 0;

    const { dispose } = ctx.onDidCancel(() => {
      firedCount++;
    });

    dispose();
    cancel();

    assert.equal(firedCount, 0);
    host.flushMicrotaskQueue();
    assert.equal(firedCount, 0);
  });

  it('will not fire if they have been disposed after the Context is cancelled but before the next microtick', () => {
    const host = new TestContextHost();
    const root = ContextImpl.background(host);
    const { ctx, cancel } = Context.withCancel(root);

    let firedCount = 0;

    const { dispose } = ctx.onDidCancel(() => {
      firedCount++;
    });

    cancel();
    dispose();

    assert.equal(firedCount, 0);
    host.flushMicrotaskQueue();
    assert.equal(firedCount, 0);
  });

  it('will fire with the same reason reference when cancelled after registering the handler', () => {
    const host = new TestContextHost();
    const root = ContextImpl.background(host);
    const { ctx, cancel } = Context.withCancel(root);

    let reason: CancellationReason | undefined = undefined;

    ctx.onDidCancel((e) => {
      reason = e;
    });

    cancel();

    assert.instance(ctx.error(), CancelledError);

    // Handlers fire later in the event-loop so we expect this to be undefined
    assert.equal(reason, undefined);

    // Simulate advancing the event loop
    host.flushMicrotaskQueue();

    assert.is(ctx.error(), reason);
  });

  it('will fire with the same reason reference when cancelled before registering the handler', () => {
    const host = new TestContextHost();
    const root = ContextImpl.background(host);
    const { ctx, cancel } = Context.withCancel(root);

    cancel();

    let reason: CancellationReason | undefined = undefined;

    ctx.onDidCancel((e) => {
      reason = e;
    });

    assert.instance(ctx.error(), CancelledError);
    assert.ok(isContextError(ctx.error()));

    // Handlers fire later in the event-loop so we expect this to be undefined
    assert.equal(reason, undefined);

    // Simulate advancing the event loop
    host.flushMicrotaskQueue();

    assert.is(ctx.error(), reason);
  });

  it("will invoke the host's onUncaughtException handler with a reference to the error when a single handler throws", () => {
    const host = new TestContextHost();
    const root = ContextImpl.background(host);
    const { ctx, cancel } = Context.withCancel(root);

    cancel();

    const err = new Error('oops');
    ctx.onDidCancel(() => {
      throw err;
    });

    host.flushMicrotaskQueue();

    assert.equal(host.uncaughtExceptions, [err]);
  });

  it("will invoke the host's onUncaughtException handler with an AggregateError when multiple handlers throw", () => {
    const host = new TestContextHost();
    const root = ContextImpl.background(host);
    const { ctx, cancel } = Context.withCancel(root);

    cancel();

    const err = new Error('oops');
    ctx.onDidCancel(() => {
      throw err;
    });
    ctx.onDidCancel(() => {
      throw err;
    });

    host.flushMicrotaskQueue();

    // We want to make sure that the above handlers get batched into the same flush
    // and produce an AggregateError and nothing else.
    assert.equal(host.uncaughtExceptions.length, 1);
    assert.instance(host.uncaughtExceptions[0], AggregateError);
  });
});

describe('Child contexts', (it) => {
  it('will reflect cancellation of the parent', () => {
    const root = Context.background();
    const { ctx, cancel } = Context.withCancel(root);
    const { ctx: childCtx } = Context.withCancel(ctx);

    assert.not(ctx.error());
    assert.not(childCtx.error());

    cancel();

    assert.ok(ctx.error());
    assert.ok(childCtx.error());
    assert.is(ctx.error(), childCtx.error());
  });

  it('will fire their handlers async when the parent is cancelled', () => {
    const host = new TestContextHost();
    const root = ContextImpl.background(host);
    const { ctx, cancel } = Context.withCancel(root);
    const { ctx: childCtx } = Context.withCancel(ctx);

    let reason: CancellationReason | undefined = undefined;

    childCtx.onDidCancel((e) => {
      reason = e;
    });

    cancel();

    assert.equal(reason, undefined);

    host.flushMicrotaskQueue();

    assert.instance(reason, CancelledError);
    assert.is(childCtx.error(), reason);
  });

  it('will fire their handlers async when created from a cancelled parent', () => {
    const host = new TestContextHost();
    const root = ContextImpl.background(host);
    const { ctx, cancel } = Context.withCancel(root);

    cancel();

    const { ctx: childCtx } = Context.withCancel(ctx);

    let reason: CancellationReason | undefined = undefined;

    childCtx.onDidCancel((e) => {
      reason = e;
    });

    assert.equal(reason, undefined);

    host.flushMicrotaskQueue();

    assert.instance(reason, CancelledError);
    assert.is(childCtx.error(), reason);
  });

  it('will not fire their handlers when they have been disposed before cancellation', () => {
    const host = new TestContextHost();
    const root = ContextImpl.background(host);
    const { ctx, cancel } = Context.withCancel(root);

    const { ctx: childCtx } = Context.withCancel(ctx);

    let reason: CancellationReason | undefined = undefined;

    const { dispose } = childCtx.onDidCancel((e) => {
      reason = e;
    });

    dispose();
    cancel();

    assert.equal(reason, undefined);

    host.flushMicrotaskQueue();

    assert.equal(reason, undefined);
    assert.instance(childCtx.error(), CancelledError);
  });

  it('will not fire their handlers when they have been disposed after cancellation', () => {
    const host = new TestContextHost();
    const root = ContextImpl.background(host);
    const { ctx, cancel } = Context.withCancel(root);

    cancel();

    const { ctx: childCtx } = Context.withCancel(ctx);

    let reason: CancellationReason | undefined = undefined;

    const { dispose } = childCtx.onDidCancel((e) => {
      reason = e;
    });

    dispose();

    assert.equal(reason, undefined);

    host.flushMicrotaskQueue();

    assert.equal(reason, undefined);
    assert.instance(childCtx.error(), CancelledError);
  });
});

describe('withValue', (it) => {
  it('will allow children to read the value but not parents', () => {
    const root = Context.background();
    const key = 'hello';
    const value = ['world'];
    const { ctx } = Context.withCancel(root);
    const childCtx = ctx.withValue(key, value);

    assert.is(ctx.getValue(key), undefined);
    assert.is(childCtx.getValue(key), value);
  });

  it('will allow grand children to read the value', () => {
    const root = Context.background();
    const key = 'hello';
    const value = ['world'];
    const childCtx = root.withValue(key, value);
    const grandChildCtx = childCtx.withValue('other', 'value');

    assert.is(childCtx.getValue(key), value);
    assert.is(childCtx.getValue('other'), undefined);

    assert.is(grandChildCtx.getValue(key), value);
    assert.is(grandChildCtx.getValue('other'), 'value');
  });
});

describe('withDeadline', (it) => {
  it('will mark a context as cancelled with a DeadlineExceededError after the deadline', () => {
    const host = new TestContextHost();
    const root = ContextImpl.background(host);
    const { ctx } = Context.withDeadline(root, 1);

    assert.is(ctx.error(), undefined);

    host.advance(1);

    assert.instance(ctx.error(), DeadlineExceededError);
    assert.ok(isDeadlineExceededError(ctx.error()));
    assert.ok(isContextError(ctx.error()));
  });

  it("will mark a child context as cancelled with the lesser of the parent's and its own deadlines", () => {
    const host = new TestContextHost();
    const root = ContextImpl.background(host);
    const { ctx } = Context.withDeadline(root, 1);
    const { ctx: childCtx } = Context.withDeadline(ctx, 3);

    assert.is(ctx.error(), undefined);

    host.advance(1);

    assert.instance(ctx.error(), DeadlineExceededError);
    assert.instance(childCtx.error(), DeadlineExceededError);
    assert.is(ctx.error(), childCtx.error());
    assert.ok(isDeadlineExceededError(ctx.error()));
    assert.ok(isContextError(ctx.error()));
  });
});

describe('withTimeout', (it) => {
  it('will mark a context as cancelled with a DeadlineExceededError after a timeout interval', () => {
    const host = new TestContextHost();
    const root = ContextImpl.background(host);
    const { ctx } = Context.withTimeout(root, 1);

    assert.is(ctx.error(), undefined);

    host.advance(1);

    assert.instance(ctx.error(), DeadlineExceededError);
    assert.ok(isDeadlineExceededError(ctx.error()));
    assert.ok(isContextError(ctx.error()));
  });

  it('will mark a context as cancelled with a DeadlineExceededError after a timeout interval even if the internal timer has yet to fire', () => {
    const host = new TestContextHost();
    const root = ContextImpl.background(host);
    const { ctx } = Context.withTimeout(root, 1);

    assert.is(ctx.error(), undefined);

    host.advance(1, { skipFireEvents: true });

    assert.instance(ctx.error(), DeadlineExceededError);
    assert.ok(isDeadlineExceededError(ctx.error()));
    assert.ok(isContextError(ctx.error()));
  });

  it("will mark a child context as cancelled when it's parent's deadline is already exceeded", () => {
    const host = new TestContextHost();
    const root = ContextImpl.background(host);
    const { ctx } = Context.withTimeout(root, 1);

    host.advance(1);

    assert.instance(ctx.error(), DeadlineExceededError);

    const { ctx: childCtx } = Context.withTimeout(ctx, 1);

    assert.is(ctx.error(), childCtx.error());
    assert.ok(isDeadlineExceededError(ctx.error()));
    assert.ok(isContextError(ctx.error()));
  });
});

interface HandlerChainNode {
  args: any[];
  handler: (...args: any[]) => any;
  next?: HandlerChainNode;
}

interface HandlerChainNodeWithTimeout extends HandlerChainNode {
  timeoutAt: number;
  next?: HandlerChainNodeWithTimeout;
}

class TestContextHost implements ContextHost {
  private timerQueue: HandlerChainNodeWithTimeout | undefined = undefined;
  private microTaskQueue: HandlerChainNode | undefined = undefined;
  private currentTimeMs = 0;

  public readonly uncaughtExceptions: unknown[] = [];

  constructor(private abortControllerCons = AbortController) {}

  createAbortController(): AbortController {
    return new this.abortControllerCons();
  }

  getTime(): number {
    return this.currentTimeMs;
  }

  onUncaughtException(e: unknown) {
    this.uncaughtExceptions.push(e);
  }

  scheduleMicrotask(fn: (...args: any[]) => any, ...args: any[]): Disposable {
    const handle: HandlerChainNode = {
      args,
      handler: fn,
    };

    let node = this.microTaskQueue;

    if (!node) {
      this.microTaskQueue = handle;
    } else {
      while (node.next) {
        node = node.next;
      }

      node.next = handle;
    }

    return {
      dispose: () => {
        this.clearHandle(handle, this.microTaskQueue);
      },
    };
  }

  scheduleWithTimeout(timeout: number, fn: (...args: any[]) => any, ...args: any[]): Disposable {
    const timeoutAt = this.currentTimeMs + timeout;
    const handle: HandlerChainNodeWithTimeout = {
      args,
      handler: fn,
      timeoutAt,
    };

    let node = this.timerQueue;
    if (node) {
      while (node.next && node.next.timeoutAt <= timeoutAt) {
        node = node.next;
      }

      handle.next = node.next;
      node.next = handle;
    } else {
      this.timerQueue = handle;
    }

    return {
      dispose: () => {
        this.clearHandle(handle, this.timerQueue);
      },
    };
  }

  advance(
    durationMs: number,
    options: { skipFireEvents?: boolean; skipMicrotasks?: boolean } = {}
  ) {
    this.currentTimeMs += durationMs;

    if (!options.skipMicrotasks) {
      this.flushMicrotaskQueue();
    }

    if (!options.skipFireEvents) {
      while (this.timerQueue && this.timerQueue.timeoutAt <= this.currentTimeMs) {
        const head = this.timerQueue;
        this.timerQueue = head.next;

        head.handler(...head.args);

        if (!options.skipMicrotasks) {
          this.flushMicrotaskQueue();
        }
      }
    }

    if (!options.skipMicrotasks) {
      this.flushMicrotaskQueue();
    }
  }

  currentTime() {
    return this.currentTimeMs;
  }

  flushMicrotaskQueue() {
    while (this.microTaskQueue) {
      const head = this.microTaskQueue;
      this.microTaskQueue = head.next;

      head.handler(...head.args);
    }
  }

  private clearHandle(handle: HandlerChainNode, head?: HandlerChainNode) {
    let node: HandlerChainNode | undefined = head;

    while (node) {
      if (node.next === handle) {
        node.next = handle.next;
        return;
      }

      node = node.next;
    }
  }
}

function describe(title: string, def: (it: Test) => void) {
  const it = suite(title);

  def(it);

  it.run();
}
