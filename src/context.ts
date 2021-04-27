import type { CancellationReason } from './errors';

interface IDisposable {
  dispose(): void;
}

export interface Context {
  readonly cancellationReason: CancellationReason | undefined;
  readonly onDidCancel: (
    listener: (reason: CancellationReason, thisArg?: unknown, disposables?: IDisposable[]) => any
  ) => IDisposable;

  withCancel(): { cancel: () => void; context: Context };
  withDeadline(epochTimeMs: number): { cancel: () => void; context: Context };
  withTimeout(timeoutMs: number): { cancel: () => void; context: Context };
}
