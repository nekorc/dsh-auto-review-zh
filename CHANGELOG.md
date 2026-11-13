# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2026-11-06

### Fixed

- Anchor the injected reason rules to the pending call: rule 1 now describes the last `tool-call` message instead of the user's request, and forbids restating history or second-person request narration. This removes the main cause of denial reasons describing a different action than the approval card.
- Remove the denial bias: the block no longer presupposes medium/high risk, and states that it only constrains the `reason` text while low-risk or already-authorized calls must still be allowed.
- Insert rules before the final policy paragraph instead of relying on the allow-format marker; when no safe insertion point exists, leave the English prompt untouched and record `state/last-drift.json` rather than appending after `Stop immediately after the closing brace.` (which could break the reviewer's JSON).
- Tighten the reason budget to 160 Chinese characters, matching observed output.
- Add `state/last-drift.json` (policy length + SHA-256 prefix only, no prompt text).

### Added

- `test/fixtures/review-policy-0.2.2-rc.1.txt` for a real-policy regression test of the insertion point, final line, and block size.
- Middleware tests for the no-insertion-point path and for preserving all non-`system` request fields.

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
