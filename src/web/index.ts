///<reference types="node" />

import { ContextImpl } from '../impl';
import { ContextHostWeb } from './host';

export * from '../';

export function background() {
  return ContextImpl.background(ContextHostWeb.getInstance());
}
