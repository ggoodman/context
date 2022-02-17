export class AggregateError extends Error {
  readonly name = 'AggregateError';

  constructor(readonly errors: unknown[], message?: string) {
    super(message);
  }
}
export class CancelledError extends Error {
  readonly name = 'CancelledError';

  constructor(message: string = 'Cancelled', readonly cause?: Error) {
    super(message);
  }
}
export class DeadlineExceededError extends Error {
  readonly name = 'DeadlineExceededError';
}

export type CancellationReason = CancelledError | DeadlineExceededError;

export function isCancelledError(obj: unknown): obj is CancelledError {
  return obj instanceof CancelledError;
}

export function isContextError(obj: unknown): obj is CancellationReason {
  return isCancelledError(obj) || isDeadlineExceededError(obj);
}

export function isDeadlineExceededError(obj: unknown): obj is DeadlineExceededError {
  return obj instanceof DeadlineExceededError;
}
