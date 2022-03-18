# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

## [Unreleased]

## [2.1.0] - 2022-03-18
### Changed
- Adjust use of private fields to use private `Symbol` properties as a performance optimization for targets that don't yet support private fields.

## [2.0.0] - 2022-02-17
### Added
- - Major API redesign for simplicity, portability and tree-shakeability.

## [1.1.2] - 2021-11-10
### Fixed
- Fixed issue where an `.onDidCancel` handler registered on an already-cancelled `Context` was being invoked without the expected cancellation reason. (#3)

## [1.1.1] - 2021-06-09
### Fixed
- Fixed an illegal invocation when using the default implementation of the `setTimeout` and `clearTimeout` functions.
  
  Previously, these functions were being called with the options object as the receiver instead of `globalThis`. This change calls these functions in a way that their receivers will be `globalThis`.

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

[Unreleased]: https://github.com/ggoodman/context/compare/v2.1.0...HEAD
[2.1.0]: https://github.com/ggoodman/context/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/ggoodman/context/compare/v1.1.2...v2.0.0
[1.1.2]: https://github.com/ggoodman/context/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/ggoodman/context/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/ggoodman/context/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/ggoodman/context/compare/v0.0.1...v1.0.0
