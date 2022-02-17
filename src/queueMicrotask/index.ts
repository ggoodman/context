/*! queue-microtask. MIT License. Feross Aboukhadijeh <https://feross.org/opensource> */
let promise: Promise<void> | undefined;

const polyfilledQueueMicrotask: typeof queueMicrotask =
  typeof queueMicrotask === 'function'
    ? queueMicrotask.bind(typeof window !== 'undefined' ? window : global)
    : // reuse resolved promise, and allocate it lazily
      (cb) =>
        (promise ?? (promise = Promise.resolve())).then(cb).catch((err) =>
          setTimeout(() => {
            throw err;
          }, 0)
        );

export { polyfilledQueueMicrotask as queueMicrotask };
