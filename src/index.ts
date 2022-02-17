import { ContextImpl } from './contextImpl';
import { ContextHostImpl } from './hostImpl';

export * from './api';

export function Background() {
  return ContextImpl.background(ContextHostImpl.getInstance());
}
