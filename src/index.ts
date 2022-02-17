import { ContextImpl } from './contextImpl';
import { ContextHostWeb } from './hostImpl';

export * from './api';

export function background() {
  return ContextImpl.background(ContextHostWeb.getInstance());
}
