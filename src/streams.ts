import { finished } from 'node:stream';
import type { Context } from './context';
import { ContextImpl } from './emitterImpl';

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
