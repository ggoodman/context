///<reference types="node" />

import { suite, Test } from 'uvu';
import * as assert from 'uvu/assert';
import {
  AggregateError,
  CancellationReason,
  CancelledError,
  DeadlineExceededError,
  withCancel,
  withDeadline,
  withTimeout,
} from '.';
import { withAbortSignal, type AbortController } from './abortController';
import { ContextImpl } from './contextImpl';
import { isCancelledError, isContextError, isDeadlineExceededError } from './errors';
import type { ContextHost, Disposable } from './host';

declare var AbortController: {
  prototype: AbortController;
  new (): AbortController;
};

describe('background', (it) => {
  it('.error() is undefined', () => {
    const host = new TestContextHost();
    const root = ContextImpl.background(host);

    assert.equal(root.error(), undefined);
  });
});

describe('Context', (it) => {
  it('will report the reason when it is cancelled', () => {
    const host = new TestContextHost();
    const root = ContextImpl.background(host);
    const { ctx, cancel } = withCancel(root);

    assert.equal(ctx.error(), undefined);

    cancel();

    assert.instance(ctx.error(), CancelledError);
    assert.ok(isCancelledError(ctx.error()));
    assert.ok(isContextError(ctx.error()));
  });

  it('will report the same reason reference when cancelled', () => {
    const host = new TestContextHost();
    const root = ContextImpl.background(host);
    const { ctx, cancel } = withCancel(root);

    cancel();

    assert.is(ctx.error(), ctx.error());
  });

  it('will ignore multiple calls to cancel', () => {
    const host = new TestContextHost();
    const root = ContextImpl.background(host);
    const { ctx, cancel } = withCancel(root);

    cancel();
    cancel();
    cancel();

    assert.is(ctx.error(), ctx.error());
  });

  it('children will report the same reason reference when cancelled', () => {
    const host = new TestContextHost();
    const root = ContextImpl.background(host);
    const { ctx, cancel } = withCancel(root);

    cancel();

    const { ctx: child } = withCancel(ctx);

    assert.is(ctx.error(), child.error());
  });
});

describe('Cancellation listeners', (it) => {
  it('will only ever fire once', () => {
    const host = new TestContextHost();
    const root = ContextImpl.background(host);
    const { ctx, cancel } = withCancel(root);

    let firedCount = 0;

    ctx.onDidCancel(() => {
      firedCount++;
    });

    cancel();

    assert.equal(firedCount, 1);

    cancel();

    assert.equal(firedCount, 1);
  });

  it('will not fire if they have been disposed before the Context is cancelled', () => {
    const host = new TestContextHost();
    const root = ContextImpl.background(host);
    const { ctx, cancel } = withCancel(root);

    let firedCount = 0;

    const { dispose } = ctx.onDidCancel(() => {
      firedCount++;
    });

    dispose();
    cancel();

    assert.equal(firedCount, 0);
  });

  it('will fire with the same reason reference when cancelled after registering the handler', () => {
    const host = new TestContextHost();
    const root = ContextImpl.background(host);
    const { ctx, cancel } = withCancel(root);

    let reason: CancellationReason | undefined = undefined;

    ctx.onDidCancel((e) => {
      reason = e;
    });

    cancel();

    assert.instance(ctx.error(), CancelledError);
    assert.is(ctx.error(), reason);
  });

  it('will fire with the same reason reference when cancelled before registering the handler', () => {
    const host = new TestContextHost();
    const root = ContextImpl.background(host);
    const { ctx, cancel } = withCancel(root);

    cancel();

    let reason: CancellationReason | undefined = undefined;

    ctx.onDidCancel((e) => {
      reason = e;
    });

    assert.instance(ctx.error(), CancelledError);
    assert.ok(isContextError(ctx.error()));

    assert.is(ctx.error(), reason);
  });

  it("will invoke the host's onUncaughtException handler with a reference to the error when a single handler throws", () => {
    const host = new TestContextHost();
    const root = ContextImpl.background(host);
    const { ctx, cancel } = withCancel(root);

    const err = new Error('oops');
    ctx.onDidCancel(() => {
      throw err;
    });

    cancel();

    assert.equal(host.uncaughtExceptions, [err]);
  });

  it("will invoke the host's onUncaughtException handler with an AggregateError when multiple handlers throw", () => {
    const host = new TestContextHost();
    const root = ContextImpl.background(host);
    const { ctx, cancel } = withCancel(root);

    const err = new Error('oops');
    ctx.onDidCancel(() => {
      throw err;
    });
    ctx.onDidCancel(() => {
      throw err;
    });

    cancel();

    // We want to make sure that the above handlers get batched into the same flush
    // and produce an AggregateError and nothing else.
    assert.equal(host.uncaughtExceptions.length, 1);
    assert.instance(host.uncaughtExceptions[0], AggregateError);
  });
});

describe('Child contexts', (it) => {
  it('will reflect cancellation of the parent', () => {
    const host = new TestContextHost();
    const root = ContextImpl.background(host);
    const { ctx, cancel } = withCancel(root);
    const { ctx: childCtx } = withCancel(ctx);

    assert.not(ctx.error());
    assert.not(childCtx.error());

    cancel();

    assert.ok(ctx.error());
    assert.ok(childCtx.error());
    assert.is(ctx.error(), childCtx.error());
  });

  it('will fire their handlers synchronously when the parent is cancelled', () => {
    const host = new TestContextHost();
    const root = ContextImpl.background(host);
    const { ctx, cancel } = withCancel(root);
    const { ctx: childCtx } = withCancel(ctx);

    let reason: CancellationReason | undefined = undefined;

    childCtx.onDidCancel((e) => {
      reason = e;
    });

    cancel();

    assert.instance(reason, CancelledError);
    assert.is(childCtx.error(), reason);
  });

  it('will fire their handlers synchronously when created from a cancelled parent', () => {
    const host = new TestContextHost();
    const root = ContextImpl.background(host);
    const { ctx, cancel } = withCancel(root);

    // Cancel the parent Context
    cancel();

    const { ctx: childCtx } = withCancel(ctx);

    let reason: CancellationReason | undefined = undefined;

    childCtx.onDidCancel((e) => {
      reason = e;
    });

    assert.instance(reason, CancelledError);
    assert.is(childCtx.error(), reason);
  });

  it('will not fire their handlers when they have been disposed before cancellation', () => {
    const host = new TestContextHost();
    const root = ContextImpl.background(host);
    const { ctx, cancel } = withCancel(root);

    const { ctx: childCtx } = withCancel(ctx);

    let reason: CancellationReason | undefined = undefined;

    const { dispose } = childCtx.onDidCancel((e) => {
      reason = e;
    });

    dispose();
    cancel();

    assert.equal(reason, undefined);
    assert.instance(childCtx.error(), CancelledError);
  });
});

describe('withValue', (it) => {
  it('will allow children to read the value but not parents', () => {
    const host = new TestContextHost();
    const root = ContextImpl.background(host);
    const key = 'hello';
    const value = ['world'];
    const { ctx } = withCancel(root);
    const childCtx = ctx.withValue(key, value);

    assert.is(ctx.getValue(key), undefined);
    assert.is(childCtx.getValue(key), value);
  });

  it('will allow grand children to read the value', () => {
    const host = new TestContextHost();
    const root = ContextImpl.background(host);
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
    const { ctx } = withDeadline(root, 1);

    assert.is(ctx.error(), undefined);

    host.advance(1);

    assert.instance(ctx.error(), DeadlineExceededError);
    assert.ok(isDeadlineExceededError(ctx.error()));
    assert.ok(isContextError(ctx.error()));
  });

  it("will mark a child context as cancelled with the lesser of the parent's and its own deadlines", () => {
    const host = new TestContextHost();
    const root = ContextImpl.background(host);
    const { ctx } = withDeadline(root, 1);
    const { ctx: childCtx } = withDeadline(ctx, 3);

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
    const { ctx } = withTimeout(root, 1);

    assert.is(ctx.error(), undefined);

    host.advance(1);

    assert.instance(ctx.error(), DeadlineExceededError);
    assert.ok(isDeadlineExceededError(ctx.error()));
    assert.ok(isContextError(ctx.error()));
  });

  it('will mark a context as cancelled with a DeadlineExceededError after a timeout interval even if the internal timer has yet to fire', () => {
    const host = new TestContextHost();
    const root = ContextImpl.background(host);
    const { ctx } = withTimeout(root, 1);

    assert.is(ctx.error(), undefined);

    host.advance(1, { skipFireEvents: true });

    assert.instance(ctx.error(), DeadlineExceededError);
    assert.ok(isDeadlineExceededError(ctx.error()));
    assert.ok(isContextError(ctx.error()));
  });

  it("will mark a child context as cancelled when it's parent's deadline is already exceeded", () => {
    const host = new TestContextHost();
    const root = ContextImpl.background(host);
    const { ctx } = withTimeout(root, 1);

    host.advance(1);

    assert.instance(ctx.error(), DeadlineExceededError);

    const { ctx: childCtx } = withTimeout(ctx, 1);

    assert.is(ctx.error(), childCtx.error());
    assert.ok(isDeadlineExceededError(ctx.error()));
    assert.ok(isContextError(ctx.error()));
  });
});

describe('Promise interop', (it) => {
  it('will allow pending Contexts to be awaited', async () => {
    const host = new TestContextHost();
    const root = ContextImpl.background(host);
    const { ctx, cancel } = withCancel(root);

    let didCancel = false;
    let cancelErr;

    const promise = Promise.resolve(ctx)
      .catch((err) => {
        cancelErr = err;
      })
      .finally(() => {
        didCancel = true;
      });

    assert.equal(didCancel, false);
    assert.equal(ctx.error(), undefined);

    // Simulate waiting a microtick so that the promise resolution above
    // kicks off.
    await Promise.resolve();

    cancel();

    await promise;

    assert.equal(didCancel, true);
    assert.equal(ctx.error(), cancelErr);
    assert.instance(ctx.error(), CancelledError);
  });

  it('will allow cancelled Contexts to be awaited', async () => {
    const host = new TestContextHost();
    const root = ContextImpl.background(host);
    const { ctx, cancel } = withCancel(root);

    let didCancel = false;
    let cancelErr;

    const promise = (async () => {
      try {
        return await ctx;
      } catch (err) {
        cancelErr = err;
      } finally {
        didCancel = true;
      }
    })();

    assert.equal(didCancel, false);
    assert.equal(ctx.error(), undefined);

    cancel();

    await promise;

    assert.equal(didCancel, true);
    assert.equal(ctx.error(), cancelErr);
    assert.instance(ctx.error(), CancelledError);
  });

  it('will allow pending Contexts to be awaited for completion with .done()', async () => {
    const host = new TestContextHost();
    const root = ContextImpl.background(host);
    const { ctx, cancel } = withCancel(root);

    let didCancel = false;
    let cancelErr;

    const promise = Promise.resolve(ctx.done())
      .catch((err) => {
        cancelErr = err;
      })
      .finally(() => {
        didCancel = true;
      });

    assert.equal(didCancel, false);
    assert.equal(ctx.error(), undefined);

    // Simulate waiting a microtick so that the promise resolution above
    // kicks off.
    await Promise.resolve();

    cancel();

    await promise;

    assert.equal(didCancel, true);
    assert.equal(cancelErr, undefined);
    assert.instance(ctx.error(), CancelledError);
  });

  it('will allow cancelled Contexts to be awaited for completion with .done()', async () => {
    const host = new TestContextHost();
    const root = ContextImpl.background(host);
    const { ctx, cancel } = withCancel(root);

    let didCancel = false;
    let cancelErr;

    const promise = (async () => {
      try {
        return await ctx.done();
      } catch (err) {
        cancelErr = err;
      } finally {
        didCancel = true;
      }
    })();

    assert.equal(didCancel, false);
    assert.equal(ctx.error(), undefined);

    cancel();

    await promise;

    assert.equal(didCancel, true);
    assert.equal(cancelErr, undefined);
    assert.instance(ctx.error(), CancelledError);
  });
});

describe('Context-local storage', (it) => {
  it('allows creating child contexts with associated data', () => {
    const host = new TestContextHost();
    const root = ContextImpl.background(host);
    const key = 'key';
    const ctx = root.withValue(key, 'value');
    const { ctx: childCtx } = withCancel(ctx);
    const maskedValueCtx = childCtx.withValue(key, 'VALUE');

    assert.equal(root.getValue(key), undefined);
    assert.equal(root.hasValue(key), false);
    assert.equal(ctx.getValue(key), 'value');
    assert.equal(childCtx.getValue(key), 'value');
    assert.equal(childCtx.hasValue(key), true);
    assert.equal(maskedValueCtx.getValue(key), 'VALUE');
  });

  it('allows creating child contexts with associated complex data', () => {
    const host = new TestContextHost();
    const root = ContextImpl.background(host);
    const key = Symbol('key');
    const ctx = root.withValue(key, 'value');
    const { ctx: childCtx } = withCancel(ctx);
    const maskedValueCtx = childCtx.withValue(key, 'VALUE');

    assert.equal(root.getValue(key), undefined);
    assert.equal(root.hasValue(key), false);
    assert.equal(ctx.getValue(key), 'value');
    assert.equal(ctx.getValue('other'), undefined);
    assert.equal(ctx.hasValue('other'), false);
    assert.equal(childCtx.getValue(key), 'value');
    assert.equal(childCtx.hasValue(key), true);
    assert.equal(maskedValueCtx.getValue(key), 'VALUE');
  });

  it('allows storing undefined values whose presence is tracked', () => {
    const host = new TestContextHost();
    const root = ContextImpl.background(host);
    const key = Symbol('key');
    const ctx = root.withValue(key, undefined);
    const { ctx: childCtx } = withCancel(ctx);
    const maskedValueCtx = childCtx.withValue(key, 'VALUE');

    assert.equal(root.getValue(key), undefined);
    assert.equal(root.hasValue(key), false);
    assert.equal(ctx.getValue(key), undefined);
    assert.equal(ctx.hasValue(key), true);
    assert.equal(childCtx.getValue(key), undefined);
    assert.equal(childCtx.hasValue(key), true);
    assert.equal(maskedValueCtx.getValue(key), 'VALUE');
  });
});

describe('AbortController interop', (it) => {
  it('will mark an AbortSignal as aborted when the Context is cancelled', () => {
    const host = new TestContextHost();
    const root = ContextImpl.background(host);
    const { ctx, cancel } = withCancel(root);

    assert.not(ctx.signal.aborted);

    let abortReason: CancellationReason | null = null;

    ctx.signal.addEventListener('abort', () => {
      abortReason = ctx.signal.reason;
    });

    assert.not(abortReason);
    assert.not(ctx.signal.aborted);

    cancel('you shall not pass');

    assert.ok(ctx.signal.aborted);
    // Pending support for AbortReason
    // assert.equal(ctx.signal.reason, 'you shall not pass');
    // assert.equal(abortReason, 'you shall not pass');
  });

  it('will interface with an unaborted AbortSignal', () => {
    const host = new TestContextHost();
    const root = ContextImpl.background(host);
    const ctl = host.createAbortController();

    const ctx = withAbortSignal(root, ctl.signal);

    let firedCancellationReason: CancellationReason | null = null;

    ctx.onDidCancel((reason) => {
      firedCancellationReason = reason;
    });

    assert.not(ctx.signal.aborted);
    assert.not(ctx.error());
    assert.not(firedCancellationReason);

    ctl.abort();

    assert.ok(ctx.signal.aborted);
    assert.ok(firedCancellationReason);
    assert.is(ctx.error(), firedCancellationReason);

    // Pending support for AbortReason
    // assert.equal(ctx.signal.reason, 'you shall not pass');
    // assert.equal(abortReason, 'you shall not pass');
  });

  it('will interface with an aborted AbortSignal', () => {
    const host = new TestContextHost();
    const root = ContextImpl.background(host);
    const ctl = host.createAbortController();

    ctl.abort();

    const ctx = withAbortSignal(root, ctl.signal);

    let firedCancellationReason: CancellationReason | null = null;

    ctx.onDidCancel((reason) => {
      firedCancellationReason = reason;
    });

    assert.ok(ctx.signal.aborted);
    assert.ok(firedCancellationReason);
    assert.is(ctx.error(), firedCancellationReason);

    // Pending support for AbortReason
    // assert.equal(ctx.signal.reason, 'you shall not pass');
    // assert.equal(abortReason, 'you shall not pass');
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
  private currentTimeMs = 0;

  public readonly uncaughtExceptions: unknown[] = [];

  createAbortController(): AbortController {
    return new AbortController();
  }

  getTime(): number {
    return this.currentTimeMs;
  }

  onUncaughtException(e: unknown) {
    this.uncaughtExceptions.push(e);
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

    if (!options.skipFireEvents) {
      while (this.timerQueue && this.timerQueue.timeoutAt <= this.currentTimeMs) {
        const head = this.timerQueue;
        this.timerQueue = head.next;

        head.handler(...head.args);
      }
    }
  }

  currentTime() {
    return this.currentTimeMs;
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
