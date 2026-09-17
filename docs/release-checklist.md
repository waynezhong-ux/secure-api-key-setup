# GitHub release checklist

Complete every item before making the repository public. A checked list is review evidence, not a substitute for inspecting the actual commit and archive.

## Repository content

- [ ] `SKILL.md` passes the Skill Creator validator and contains no unfinished scaffold text.
- [ ] `README.md`, MIT `LICENSE`, `.gitignore`, `agents/openai.yaml`, tests, and security documentation are present.
- [ ] At least three invocation examples remain accurate.
- [ ] Source code contains no personal paths, names, private service URLs, private endpoints, real credentials, or provider-specific constants that belong in runtime configuration.
- [ ] Generated archives, dependencies, coverage, logs, `.env` files, key files, credential exports, and local runtime profiles are untracked.
- [ ] Adapter registration uses fixed names rather than user-controlled import paths.

## Security behavior

- [ ] The server binds exactly to `127.0.0.1` with port `0` and is never forwarded or proxied.
- [ ] A secret can enter only through the protected POST body and can leave only through the adapter's private in-memory channel.
- [ ] No secret-bearing CLI option, environment variable, URL, query string, file import, debug mode, telemetry, request log, or plaintext fallback exists.
- [ ] Success, error, and verification paths never echo, mask, fingerprint, hash, compare, or retrieve a submitted value.
- [ ] Each adapter delegates persistence to the target's official writable Credential Store and fails closed otherwise.
- [ ] Browser security headers, exact Host/Origin checks, CSRF validation, body limits, one-at-a-time save behavior, expiry, and automatic shutdown are intact.

## Automated and manual checks

- [ ] `npm test` passes using only documented fake credentials and cannot reach a live credential store.
- [ ] `npm run scan:secrets` passes.
- [ ] A maintained scanner such as Gitleaks scans the complete Git history, not only the working tree.
- [ ] GitHub secret scanning and push protection are enabled when available.
- [ ] Dependency and CodeQL alerts are enabled where appropriate.
- [ ] A manual review confirms the fake value is absent from URLs, command arguments, output, and errors.
- [ ] The release archive is listed and inspected; its contents match the reviewed source and exclude local/generated material.

## Publication

- [ ] Initialize Git only after the content review if this directory is not already a repository.
- [ ] Review `git status`, the staged diff, author identity, repository visibility, and remote URL before the first commit or push.
- [ ] Use a tagged release matching `package.json`; record the archive SHA-256 in the release notes.
- [ ] Document supported Node and Hypit versions and any known platform limitations.
- [ ] Do not publish, rotate, revoke, or test a real credential as part of the release process.
