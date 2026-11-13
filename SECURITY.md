# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 0.1.x | Yes |

## Reporting a vulnerability

Please do **not** open a public issue for a security problem.

- If the repository is public, use GitHub's **private vulnerability reporting** /
  **Security Advisories** for this repository.
- If the repository is private, contact the maintainer through GitHub.

Please include:

- the affected version and DSH version;
- a minimal reproduction or the exact approval-card text (redact secrets and
  personal data);
- the impact you believe is possible.

## Scope

`dsh-auto-review-zh` only augments the Auto review reviewer's system prompt so
the user-facing denial reason is written in plain Chinese. It does **not**:

- change low/medium/high risk classification;
- change allow/deny decisions or approval semantics;
- modify `app.asar` or the shipped `@deepseek-ai/dsh-experimental-auto-review`;
- add an external translation provider or make its own network requests;
- persist prompt content, tool arguments, or user data.

The diagnostics files under `state/` contain only timestamps, process IDs, and
prompt lengths; the drift file additionally stores a truncated SHA-256 of the
fixed upstream review policy so a wording change can be recognised without
keeping the text.

## Security model

This plugin is not a security boundary. It makes review reasons easier to
understand; it does not make an unsafe action safe. The original Auto review
decision remains authoritative.

## Token cost

Every review request becomes slightly larger (roughly 400–500 extra tokens).
Denials also add a short Chinese reason. This is expected behavior, not a
vulnerability.
