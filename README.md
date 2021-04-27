# @ggoodman/context

![npm (scoped)](https://img.shields.io/npm/v/@ggoodman/context?style=flat-square)
![NPM](https://img.shields.io/npm/l/@ggoodman/context?style=flat-square)

> A take on ergonomic cancellation and timeout propagation in JavaScript inspired by the Go context package.

In long-lived services and processes, it is difficult to express and manage the different lifetimes of different operations. Typically, at the root there is the process itself. The overall process may be designed to run to completion or indefinitely. In either case, such processes typically can be interrupted by things like OS signals (ie: `SIGINT` / `SIGTERM`) and may want to trigger graceful shutdown in such cases.

These long-lived processes are often responding to events like http requests or changes on the file system. In the former case, it is nice to be able to enforce deadlines on the handling of a request. In the latter case, subsequent events may invalidate any outstanding operations. The [`Context`](#Context) API is designed to help in these situations by making it easy to represent a hierarchy of nested operations with their own lifetimes.

At a high level, the lifetime of a child [`Context`](#Context) will never exceed that of its parent. That means if an ancestor [`Context`](#Context) is cancelled--either explicitly via a `cancel` function or implicitly by timing out--all of its descendents will themselves be cancelled.

Someone designing a long-lived process that responds to events may want to represent the lifecycle of the overall process as a parent Context that gets cancelled upon certain signals. The operations triggered by the events this process observes might be associated with child [`Context`](#Context). In some cases, these child contexts might be created with internal dealines or timeouts. In others, new events may invalidate prior operations in which case explicit cancellation might be useful.

For more insight on the Go package that inspires this module, please see their [introductory blog post](https://blog.golang.org/context).

## Installation

```sh
npm install --save @ggoodman/context
```

## Example

```js
import { Background, isDeadlineExceededError, wireEventEmitter } from '@ggoodman/context';
import Express from 'express';

const app = Express();

// Wire up some signal handlers for some process-level events that would indicate a need to
// shut down the service.
const appContext = wireEventEmitter(Background, process, [
  'SIGINT',
  'SIGTERM',
  'uncaughtException',
  'unhandledRejection',
]);

// Trigger graceful shutdown at the earliest cancellation signal
appContext.onDidCancel(() => app.close());

// Let's create a middleware to make a child context for each request.
// When either the app context or the request is closed, this context and any
// child contexts thereof will close. This let's us stop any expensive operations
// associated with aborted or failed requests.
app.use((req, res, next) => {
  // Create the child context and attach it to the request. The child context will
  // become cancelled if the request is aborted or the connection is closed. It will
  // also become cancelled if the overall app context is cancelled.
  const ctx = wireEventEmitter(appContext, req, ['abort', 'close']);
  // Assign a 5 second timeout on requests.
  const { context } = ctx.withTimeout(5000);

  context.onDidCancel((reason) => {
    if (isDeadlineExceededError(reason) && !res.headersSent) {
      // If the request-specific timeout gets triggered and we have yet to serve
      // this request, we'll serve a 504 error.
      res.writeHead(504);
      res.end();
    }
  });

  req.ctx = context;

  return next();
});

app.get('/', (req, res, next) => {
  // We're going to perform some expensive operation and pass this request's context
  // to that call. That way, the expensive call can be aborted if the context is
  // cancelled.
  return performExpensiveOperation(req.ctx).then((result) => res.end(result), next);
});

app.listen(0);
```

## API

### Exports

- `Background`: A top-level [`Context`](#Context) instance that can never be cancelled but from which all application- and library-level `Context`s should be derived.
- `isContext(obj)`: Returns a `boolean` value based on whether the supplied `obj` is an instance of [`Context`](#Context). Also acts as a TypeScript type guard.
- `isCancelledError(err)`: Returns a `boolean` value based on whether the supplied `err` is an instance of `CancelledError`. Also acts as a TypeScript type guard.
- `isDeadlineExceededError(err)`: Returns a `boolean` value based on whether the supplied `err` is an instance of `DeadlineExceededError`. Also acts as a TypeScript type guard.
- `wireEventEmitter(ctx, ee, eventNames, reasonFactory)`: Create a child [`Context`](#Context) that will be cancelled when the event emitter emits any of the supplied events where:
  - `ctx` is a parent [`Context`](#Context) instance.
  - `ee` is a Node.js [`EventEmitter`](https://nodejs.org/api/events.html#events_class_eventemitter) instance.
  - `eventNames` is a single `string` event name or an array of `string` event names. The firing of the first event among those supplied will cause the returned [`Context`](#Context) instance to be cancelled.
  - `reasonFactory` is an optional function that accepts the the `eventName` and any other arguments passed to the emitter's handler. It should return a `string` reason explaining the cancellation.

### `Context`

`Context` is an interface representing a node in the context hierarchy that may or may not be cancelled. A child context created from a parent context that is already cancelled will itself be created in the cancelled state. Listners registered using `onDidCancel` on a cancelled context will be fired asynchronously.

- `cancellationReason`: The reason for the cancellation, if the context is cancelled.
- `onDidCancel(handler)`: Register an event handler for when the context is cancelled, returning an object with a `dispose()` method, where:
  - `handler` is a function that will be invoked with the cancellation reason if and when the Context is cancelled.
- `withCancel()`: A function that will return a child [`Context`](#Context) and a method to cancel that context where the returned object has the shape:
  - `cancel(reason)` is a function that will cancel the child context where:
    - `reason` is an optional value that will be propagated to `onDidCancel` handlers and will become the child Context's `cancellationReason`.
  - `context` is the child `Context` object.
- `withDeadline(epochTimeMs)`: A function that will return a child [`Context`](#Context) that will automatically be cancelled at the supplied epoch time and a method to cancel that context where:

  - `epochTimeMs` is a unix timestamp in millisecond resolution at which point the returned Context should be cancelled.

  Returns an object having a `cancel` method and `context` instance, similar to `withCancel()`.

  A context that gets cancelled due to it passing its deadline will have a `cancellationReason` that is an instance of `DeadlineExceededError`.

- `withTimeout(timeoutMs)`: A function that will return a child [`Context`](#Context) that will automatically be cancelled after the supplied timeout and a method to cancel that context where:

  - `timeoutMs` is an interval in milliseconds after which point the returned [`Context`](#Context) should be cancelled.

  Returns an object having a `cancel` method and `context` instance, similar to `withCancel()`.

  A context that gets cancelled due to it timing out will have a `cancellationReason` that is an instance of `DeadlineExceededError`.

## Future work

- Provide `toAbortSignal` and `wireAbortSignal` helpers to provide interoperability with `AbortController` and `AbortSignal` primitives.
- Provide a utility function to easily run `async` logic 