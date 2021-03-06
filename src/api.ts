import type { CancelFunc, Context } from './context';
import { ContextImpl } from './contextImpl';

export type { Context } from './context';
export * from './emitters';
export * from './errors';

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
