import type { Context } from './context';

export function runWithContext<TFunc extends () => any>(
  ctx: Context,
  fn: TFunc
): ReturnType<TFunc> extends PromiseLike<infer U> ? Promise<U> : ReturnType<TFunc> {
  const reason = ctx.cancellationReason;
  if (reason) {
    throw reason;
  }

  const result = fn();

  if (result && typeof result['then'] === 'function') {
    let handler: { dispose(): void };

    // Create a Promise that will settle as rejected if the context cancels. We do this to
    // short-circuit the actual method.
    const cancelled = new Promise((_, reject) => {
      handler = ctx.onDidCancel((r) => {
        console.debug('cancelled race fired', r);
        reject(r);
      });
    });

    // Convert to native Promise
    const resultPromise = Promise.resolve(result);

    const promise = Promise.race([
      cancelled,
      resultPromise,
    ]) as ReturnType<TFunc> extends PromiseLike<infer U> ? Promise<U> : ReturnType<TFunc>;

    promise.catch(noop).then(handler!.dispose());

    return promise;
  }

  return result;
}

function noop() {}
