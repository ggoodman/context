#!/usr/bin/env node
import { Suite } from '@jonahsnider/benchmark';

import { Background, withCancel, withTimeout } from './dist/context.mjs';

const suite = new Suite('simple', {
  warmup: { trials: 1_000_000 },
  run: { trials: 100_000 },
});

suite.addTest('Lifecycle', async () => {
  var { cancel, ctx } = withCancel(Background());
  var ctx = ctx.withValue('hello', 'world');
  var { ctx } = withTimeout(ctx, 1000);
  const value = ctx.getValue('hello');

  cancel();

  // const reason = await ctx.done();
});

const results = await suite.run();

const table = [...results]
  // Convert median execution time to mean ops/sec
  .map(([library, histogram]) => [
    library,
    Math.round(1e9 / histogram.percentile(50)),
    Math.round(1e9 / histogram.percentile(99)),
  ])
  // Sort fastest to slowest
  .sort(([, a], [, b]) => b - a)
  // Convert to object for console.table
  .map(([library, p50OpsPerSec, p99OpsPerSec]) => ({
    library,
    'p50 ops/sec': p50OpsPerSec.toLocaleString(),
    'p99 ops/sec': p99OpsPerSec.toLocaleString(),
  }));

console.table(table);
