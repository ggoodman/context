# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

## [Unreleased]

## [1.1.0] - 2021-06-08
### Added
- Added support for treating a `Context` as a `PromiseLike<never>`.
  
  This is useful, for example, when you want to use a `Context` with a timeout to 'race' another `Promise`-returning operation, like an http request.
  
  ```js
  (async () => {
    const { context } = Background.withTimeout(2000);
    const resPromise = fetch('https://foo.bar').then(res => res.json());
  
    // This will throw an Error that will either be true for isCancellationError or isDeadlineExceededError.
    const res = await Promise.race([ context, resPromise ]);
  })();
  ```
- Add support for converting a `Context` to an `AbortSignal` in environments that support these using `asAbortSignal`.
  
  This feature allows easy interoperability with APIs that support `AbortSignal`s as a mechanism to propagate cancellation.
  
  For example, with `fetch`, adding a timeout could be as easy as:
  
  ```js
  (async () => {
    const { context } = Background.withTimeout(2000);
    const signal = asAbortSignal(context);
  
    const res = await fetch('https://foo.bar', { signal });
    const data = await res.json();
  })();
  ```

## [1.0.0] - 2021-04-27
### Added
- Added a copy of the MIT license
- Added keywords to package.json and future work to README.md
- Added automated test runs using GitHub Actions

## 0.0.1 - 2021-04-27
### Added
- Initial release.

[Unreleased]: https://github.com/ggoodman/context/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/ggoodman/context/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/ggoodman/context/compare/v0.0.1...v1.0.0
