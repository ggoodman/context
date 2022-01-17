import AbortController from 'abort-controller';
import { signalFactory } from './impl';

export const toAbortSignal = signalFactory(AbortController);
