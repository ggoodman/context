///<reference types="node" />

import { ContextImpl } from '../contextImpl';
import { ContextHostNode } from './host';

export * from '../api';

export function background() {
  return ContextImpl.background(ContextHostNode.getInstance());
}
