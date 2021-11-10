///<reference types="node" />

import { suite, Test } from 'uvu';
import * as assert from 'uvu/assert';
import { isCancelledError, isDeadlineExceededError } from './errors';
import { ContextHost, createContextImplementation } from './factory';

describe('createContextImplementation', (it) => {
  it('will expose a Background context that is not cancelled and can be asserted as a Context', () => {
    const { context: Background, isContext } = createContextImplementation({
      clearTimeout,
      currentTime: () => Date.now(),
      setTimeout,
    });

    assert.not(Background.cancellationReason);
    assert.ok(isContext(Background));
  });

  it('will allow a child Context to be cancelled without affecting a parent', () => {
    const { context: Background } = createContextImplementation({
      clearTimeout,
      currentTime: () => Date.now(),
      setTimeout,
    });

    const { cancel, context } = Background.withCancel();

    assert.not(Background.cancellationReason);
    assert.not(context.cancellationReason);

    cancel();

    assert.not(Background.cancellationReason);
    assert.ok(isCancelledError(context.cancellationReason));
  });

  it('will cancel child contexts when their parent contexts are cancelled', () => {
    const { context: Background } = createContextImplementation({
      clearTimeout,
      currentTime: () => Date.now(),
      setTimeout,
    });

    const { cancel, context } = Background.withCancel();
    const { context: childContext } = context.withCancel();

    assert.not(Background.cancellationReason);
    assert.not(context.cancellationReason);
    assert.not(childContext.cancellationReason);

    cancel();

    assert.not(Background.cancellationReason);
    assert.ok(isCancelledError(context.cancellationReason));
    assert.ok(isCancelledError(childContext.cancellationReason));
  });

  it('will trigger Context onDidCancel callbacks when cancelled', () => {
    let didFireCallback = false;

    const { context: Background } = createContextImplementation({
      clearTimeout,
      currentTime: () => Date.now(),
      setTimeout,
    });

    const { cancel, context } = Background.withCancel();

    context.onDidCancel(() => {
      didFireCallback = true;
    });

    assert.not(didFireCallback);
    cancel();
    assert.ok(didFireCallback);
  });

  it('will trigger Context onDidCancel callbacks asynchronously when registered on a cancelled context', () => {
    let cancellationReason = null;

    const host = new TestContextHost();
    const { context: Background } = createContextImplementation(host);

    const { cancel, context } = Background.withCancel();

    cancel();
    context.onDidCancel((e) => {
      cancellationReason = e;
    });
    assert.not(cancellationReason);
    host.advance(1);
    assert.ok(isCancelledError(cancellationReason));
    assert.ok(isCancelledError(context.cancellationReason));
  });

  it('will trigger Context onDidCancel callbacks when a timeout deadline is exceeded', () => {
    let didFireCallback = false;

    const host = new TestContextHost();
    const { context: Background } = createContextImplementation(host);

    const { context } = Background.withTimeout(1);

    context.onDidCancel(() => {
      didFireCallback = true;
    });
    assert.not(didFireCallback);
    host.advance(1);
    assert.ok(didFireCallback);
    assert.ok(isDeadlineExceededError(context.cancellationReason));
  });

  it('will trigger Context onDidCancel callbacks when a absolute deadline is exceeded', () => {
    let didFireCallback = false;

    const host = new TestContextHost();
    const { context: Background } = createContextImplementation(host);

    const { context } = Background.withDeadline(1);

    context.onDidCancel(() => {
      didFireCallback = true;
    });
    assert.not(didFireCallback);
    host.advance(1);
    assert.ok(didFireCallback);
    assert.ok(isDeadlineExceededError(context.cancellationReason));
  });

  it('will inherit a shorter parent deadline', () => {
    let didFireCallback = false;

    const host = new TestContextHost();
    const { context: Background } = createContextImplementation(host);

    const { context } = Background.withTimeout(1);
    const { context: childContext } = context.withTimeout(2);

    childContext.onDidCancel(() => {
      didFireCallback = true;
    });
    assert.not(didFireCallback);
    host.advance(1);
    assert.ok(didFireCallback);
    assert.ok(isDeadlineExceededError(context.cancellationReason));
  });

  it('will trigger cancellation if the deadline is exceeded during synchronous execution', () => {
    let didFireCallback = false;

    const host = new TestContextHost();
    const { context: Background } = createContextImplementation(host);
    const { context } = Background.withTimeout(1);

    context.onDidCancel(() => {
      didFireCallback = true;
    });
    assert.not(didFireCallback);
    assert.not(context.cancellationReason);
    host.advance(2, { skipFireEvents: true });
    assert.not(didFireCallback);
    assert.ok(isDeadlineExceededError(context.cancellationReason));
    assert.ok(didFireCallback);
  });

  it('will act as a Thenable', async () => {
    const host = new TestContextHost();
    const { context: Background } = createContextImplementation(host);
    const { cancel, context } = Background.withCancel();

    const gotSequence: string[] = [];

    (async () => {
      try {
        await context;
      } catch {
        gotSequence.push('await thrown');
      }
    })();

    context.onDidCancel(() => {
      gotSequence.push('onDidCancel');
    });

    Promise.resolve(context).catch(() => {
      gotSequence.push('promise chain');
    });

    const want = 'OK';
    const got = await Promise.race([Promise.resolve('OK'), context]);
    assert.equal(
      got,
      want,
      `Racing a Promise against an live Context will return the resolved value of the Promise.`
    );

    cancel();

    // Queue three microtasks so that existing promises with pending settles will settle.
    // Why is it three? A careful analysis of created Promises and the resulting entries pushed
    // to the microtask queue. Instead, a quick effort of trial-and-error shows that exactly
    // three is enough.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const wantSequence: string[] = ['onDidCancel', 'await thrown', 'promise chain'];

    assert.equal(
      gotSequence,
      wantSequence,
      'The sequence of events matches the expected order when using a Context as a Thenable.'
    );
  });
});

interface HandlerChainNode {
  args: any[];
  timeoutAt: number;
  handler: (...args: any[]) => any;
  next?: HandlerChainNode;
}

class TestContextHost implements ContextHost<HandlerChainNode> {
  private head: HandlerChainNode | undefined = undefined;
  private currentTimeMs = 0;
  readonly clearTimeout: ContextHost<HandlerChainNode>['clearTimeout'];
  readonly setTimeout: ContextHost<HandlerChainNode>['setTimeout'];

  constructor() {
    this.clearTimeout = (handle) => {
      let node: HandlerChainNode | undefined = this.head;

      while (node) {
        if (node.next === handle) {
          node.next = handle.next;
          return;
        }

        node = node.next;
      }
    };

    this.setTimeout = (handler, timeout = 0, ...args) => {
      const timeoutAt = this.currentTimeMs + timeout;
      const handle: HandlerChainNode = {
        args,
        handler,
        timeoutAt,
      };

      let node = this.head;
      if (node) {
        while (node.next && node.next.timeoutAt < timeoutAt) {
          node = node.next;
        }

        handle.next = node.next;
        node.next = handle;
      } else {
        this.head = handle;
      }

      return handle;
    };
  }

  advance(durationMs: number, options: { skipFireEvents?: boolean } = {}) {
    this.currentTimeMs += durationMs;

    if (!options.skipFireEvents) {
      let node = this.head;

      while (node && node.timeoutAt <= this.currentTimeMs) {
        node.handler(...node.args);

        node = node.next;
      }
    }
  }

  currentTime() {
    return this.currentTimeMs;
  }
}

function describe(title: string, def: (it: Test) => void) {
  const it = suite(title);

  def(it);

  it.run();
}
