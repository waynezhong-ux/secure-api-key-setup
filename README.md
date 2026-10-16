# secure-api-key-setup

English | [简体中文](README.zh-CN.md)

A reusable Codex Skill for collecting a third-party API key through a temporary loopback-only browser page and saving it with the target tool's official credential store.

The first adapter supports Hypit. The server never receives a key from a URL or command argument, never writes it to disk, and never implements its own secret store.

## What it does

For a Hypit endpoint, the Skill:

1. locates the current Hypit installation and checks its version;
2. resolves the selected Runtime Profile and the endpoint's declared credential reference;
3. runs `hypit auth status` without reading or showing the credential value;
4. starts an HTTP server bound to `127.0.0.1` on a random port;
5. opens a browser page with a password input and **Save securely** button;
6. accepts the key only as a bounded `POST` body;
7. pipes the in-memory value to the official `hypit auth login` command;
8. verifies only `configured` or `missing` with `hypit auth status`; and
9. closes the local server after successful verification.

## Requirements

- Node.js 20 or newer.
- Codex with Skill support.
- For the Hypit adapter, an installed Hypit distribution with a selected Runtime Profile and a writable official Credential Store.
- The endpoint must already be declared. This Skill stores a credential; it does not create Providers, Endpoints, bindings, accounts, or usage authorization.

## Install

Copy the complete `secure-api-key-setup` directory into one of these locations:

- `$CODEX_HOME/skills/secure-api-key-setup`
- `~/.codex/skills/secure-api-key-setup` when `CODEX_HOME` is unset

Restart or refresh Codex if the new Skill is not discovered immediately. Keep the directory intact because `SKILL.md` calls the scripts and documentation by relative path.

For development, clone this repository anywhere, run `npm test`, validate `SKILL.md`, and then copy the directory to the Skill location above.

## Usage examples

```text
$secure-api-key-setup 为 Hypit endpoint video.lingke 配置 API Key
```

```text
$secure-api-key-setup Replace the API key for Hypit endpoint images.personal in this project.
```

```text
Use $secure-api-key-setup in D:\work\video-project to securely configure the credential for Hypit endpoint speech.vendor.
```

Codex runs the equivalent local command from the intended workspace:

```bash
node <skill-directory>/scripts/secure-key-server.js --adapter hypit --endpoint video.lingke --workspace <project-directory>
```

There is intentionally no command-line option, environment variable, file import, or JSON field for the secret.

## Security model

The web page is a short-lived intake channel, not a secret store. It uses an unpredictable path and CSRF token, same-origin checks, strict response headers, an `application/octet-stream` POST body, bounded request size, and no request logging. The key exists transiently in browser and process memory and then travels through a private stdin pipe to the target tool's official credential flow.

See [docs/security.md](docs/security.md) for the complete invariants and threat boundaries. Security changes must preserve every hard constraint in `SKILL.md`.

## Adapter architecture

Adapters implement `prepare`, `save`, and `verify`:

- `prepare` resolves non-secret metadata and confirms a writable official backend;
- `save` receives secret bytes in memory and delegates to the official credential implementation;
- `verify` returns only `configured` or `missing`.

See [docs/adding-adapters.md](docs/adding-adapters.md) before adding OpenClaw, Windows Credential Manager, macOS Keychain, Linux Secret Service, or another AI provider. Prefer a tool's own credential command or SDK. A direct OS-store adapter is appropriate only when that OS store is itself the requested official backend.

Use [docs/release-checklist.md](docs/release-checklist.md) before making a GitHub repository public or publishing a release archive.

## Development and tests

```bash
npm test
```

Tests use only `fake-test-key-do-not-use` and fake adapters/runners. They must never invoke a live credential store or use a real key.

Recommended local checks before publishing:

```bash
npm test
npm run scan:secrets
```

Also run a maintained repository secret scanner in CI, such as Gitleaks or GitHub secret scanning. Treat scanner suppressions as security-sensitive review items.

## Repository layout

```text
secure-api-key-setup/
├── .github/workflows/ci.yml
├── agents/openai.yaml
├── adapters/
│   ├── adapter-contract.js
│   └── hypit.js
├── docs/
│   ├── adding-adapters.md
│   ├── release-checklist.md
│   └── security.md
├── scripts/
│   ├── secret-scan.js
│   └── secure-key-server.js
├── tests/
│   ├── hypit-adapter.test.js
│   └── secure-key-server.test.js
├── .gitignore
├── LICENSE
├── package.json
├── README.md
├── README.zh-CN.md
└── SKILL.md
```

## License

MIT. See [LICENSE](LICENSE).
