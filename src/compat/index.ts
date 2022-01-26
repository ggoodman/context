///<reference types="node" />

import { ContextImpl } from '../emitterImpl';
import { ContextHostNode } from './host';

export * from '../api';

export function background() {
  return ContextImpl.background(ContextHostNode.getInstance());
}
