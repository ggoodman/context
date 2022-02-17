import { ContextImpl } from './contextImpl';
import { ContextHostImpl } from './hostImpl';

export * from './api';

export function background() {
  return ContextImpl.background(ContextHostImpl.getInstance());
}
