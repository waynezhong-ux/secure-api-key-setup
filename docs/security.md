# Security model

This document explains the invariants enforced by `secure-api-key-setup`. The hard constraints in `SKILL.md` are normative. A convenience feature, platform workaround, or new adapter must not weaken them.

## Protected value and boundaries

The protected value is the submitted API key or secret. Non-secret metadata includes the adapter name, endpoint instance, credential-reference key, credential store name, installed tool version, and the binary state `configured` or `missing`.

The key may exist transiently in:

- the browser password input and JavaScript memory;
- the loopback HTTP POST body and server process memory; and
- a private pipe into the official credential command or API.

The target's official Credential Store is the only persistent destination. JavaScript runtimes and operating systems may copy memory internally, so the implementation minimizes copies and overwrites owned buffers after use but does not claim guaranteed memory erasure.

## Required invariants

1. The server binds exactly to IPv4 `127.0.0.1` with port `0`, letting the operating system choose an available port.
2. Each process creates an unpredictable page path, submission path, CSRF token, and CSP nonce.
3. The page and POST require the exact loopback `Host`; the POST also requires the exact same `Origin`, CSRF header, route, method, and content type.
4. Query strings are rejected on every route. The key is accepted only as a bounded `application/octet-stream` POST body.
5. Request bodies containing NUL, carriage return, or line feed are rejected. The maximum body size is 16 KiB.
6. No request logger, analytics script, remote asset, service worker, browser storage, cookie, or telemetry is used.
7. Responses are non-cacheable and include restrictive CSP, frame, referrer, opener, resource, MIME, and permissions headers.
8. The server handles one save at a time, verifies only credential presence, flushes the fixed success response, and closes after a configured result or its lifetime expires. The page receives the in-memory session deadline, shows a local countdown, and becomes an explicit expired state without contacting another service. The already-loaded success or expired page remains usable after server shutdown.
9. The server never returns the key. Success and error responses contain fixed non-secret text.
10. Adapters receive bytes in memory. They must not place those bytes in process arguments, environment variables, files, configuration, logs, or exceptions.
11. A target adapter must call the target's official credential/auth implementation. It must fail closed when the official backend is missing, ambiguous, unsupported, or read-only.
12. Tests use only fake credentials and fake stores/runners. Live store mutation is not part of automated testing.

## Threats addressed

- Accidental exposure through shell history, process listings, Git, project files, logs, URL history, referrers, screenshots of console output, and copied configuration.
- Cross-site form submissions and ordinary cross-origin browser requests against the local server.
- DNS rebinding and forged Host headers that do not match the bound loopback origin.
- Oversized bodies, concurrent double submissions, embedding, caching, and accidental remote resource loading.
- Replacement of the official secret backend with an undocumented plaintext fallback.

## Limits

This workflow does not protect a machine already controlled by malicious local software, a compromised browser, a compromised target CLI, kernel-level inspection, process-memory scraping, or an official credential backend that violates its own contract. Loopback HTTP is not encrypted, but it is never exposed beyond the local TCP stack. Do not port-forward or proxy the server.

The Hypit adapter verifies that a credential is present. It does not validate the remote account, quota, scope, expiry, endpoint reachability, model availability, or billing status.

## Incident handling

If a real key appears in chat, a URL, a command argument, a repository, a log, a JSON/SVML configuration, `.env`, or a plaintext file, treat it as exposed. Do not reproduce it in an issue or commit. Revoke or rotate it at the issuing provider, remove it from current files and history using an appropriate incident process, and configure the replacement through this Skill.

## Review checklist for security changes

- Confirm the listening address from a live test is `127.0.0.1` and the port is operating-system assigned.
- Confirm no secret-bearing option, environment variable, file path, diagnostic field, or callback was introduced.
- Confirm error paths cannot concatenate request bodies or child-process stdin into messages.
- Confirm browser developer-console logging and server request logging remain absent.
- Confirm all verification results reduce to `configured` or `missing`.
- Confirm automated tests use only the documented fake value and cannot reach a live credential store.
- Run `npm test`, `npm run scan:secrets`, and a maintained repository secret scanner.
