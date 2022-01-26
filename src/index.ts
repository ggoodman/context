import { ContextImpl } from './emitterImpl';
import { ContextHostWeb } from './hostImpl';

export * from './api';

export function background() {
  return ContextImpl.background(ContextHostWeb.getInstance());
}
