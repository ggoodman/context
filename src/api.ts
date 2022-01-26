import type { CancelFunc, Context } from './context';
import { ContextImpl } from './emitterImpl';

export type { Context } from './context';
export * from './errors';
export * from './eventTarget';
export type { ContextHost } from './host';

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
