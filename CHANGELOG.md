# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-11-05

### Added

- Initial release of `dsh-auto-review-zh`.
- Intercept DSH Auto review requests on the `llm/stream` waterfall.
- Insert a Simplified-Chinese "wait-what" explanation rule (background → reason → choice) before the strict JSON format paragraph.
- Keep the original risk policy, allow/deny semantics, and JSON shape unchanged.
- Add `enabled` and `diagnostics` configuration.
- Add `state/loaded.json` and `state/last-enhancement.json` diagnostics.
- Add 12 unit tests for prompt insertion, recursion protection, pass-through, disablement, and fallback.
- Add GitHub Actions CI for Node 22 and 24.
- Add MIT license, security policy, and this changelog.