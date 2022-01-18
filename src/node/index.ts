///<reference types="node" />

import { ContextImpl } from '../impl';
import { ContextHostNode } from './host';

export * from '../';
export * from './events';

export function background() {
  return ContextImpl.background(ContextHostNode.getInstance());
}
