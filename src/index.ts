import type { CancelFunc, Context } from './context';
import type { ContextHost } from './host';
import { ContextImpl } from './impl';
import { ContextHostNode } from './node';

export type { Context };
export * from './host';
export * from './errors';

export function background(host: ContextHost = ContextHostNode.getInstance()): Context {
  return ContextImpl.background(host);
}

export function isContext(obj: unknown): obj is Context {
  return ContextImpl.isContext(obj);
}

export function withCancel(ctx: Context): { ctx: Context; cancel: CancelFunc } {
  return ContextImpl.withCancel(ctx);
}

export function withDeadline(
  ctx: Context,
  epochTimeMs: number
): { ctx: Context; cancel: CancelFunc } {
  return ContextImpl.withDeadline(ctx, epochTimeMs);
}

export function withTimeout(ctx: Context, timeoutMs: number): { ctx: Context; cancel: CancelFunc } {
  return ContextImpl.withTimeout(ctx, timeoutMs);
}
