---
name: secure-api-key-setup
description: Securely collect an API key through a loopback-only browser page and save it with a supported tool's official credential or secret store. Use when configuring or replacing third-party API credentials without putting the secret in chat, commands, project files, or logs; the first adapter supports Hypit endpoints.
---

# Secure API Key Setup

Collect secrets only through the bundled loopback server and delegate persistence to the target tool's official credential implementation. Never ask the user to paste an API key into chat or a terminal command.

## Hard security constraints

These are requirements, not recommendations:

- Never place a secret in a URL, query string, command argument, console output, log, environment variable, Git content, JSON configuration, SVML, `.env`, clipboard automation, or temporary plaintext file.
- Never echo, mask, fingerprint, measure, compare, or display any part of a submitted secret.
- Bind the intake server only to `127.0.0.1` on an operating-system-assigned port. Do not change it to `0.0.0.0`, `::`, a LAN address, or a remotely forwarded address.
- Accept a secret only in the body of an authenticated same-origin `POST`. Keep request logging disabled.
- Pass the secret to the target adapter only in memory. The adapter must use the target tool's official credential/auth flow and a private process pipe or equivalent secret channel.
- Do not implement a new credential database or plaintext fallback. Stop if the selected official store is unavailable or read-only.
- Run tests only with unmistakably fake values. Never test with a real credential.
- Treat a secret previously pasted into chat or committed to a file as exposed: do not repeat it, recommend revocation/rotation, and collect the replacement through this workflow.

Read [docs/security.md](docs/security.md) before changing the server, browser flow, secret transport, or adapter contract. Read [docs/adding-adapters.md](docs/adding-adapters.md) when adding or reviewing an adapter.

## Configure a credential

1. Identify the requested adapter, endpoint, and workspace from the user's request. For Hypit, use the endpoint instance name exactly as declared in the selected Runtime Profile. Do not infer or request the secret itself.
2. From the workspace, run:

   ```bash
   node <skill-directory>/scripts/secure-key-server.js --adapter hypit --endpoint <endpoint> --workspace <workspace>
   ```

   Do not add a `--key`, secret-bearing environment variable, redirection, or wrapper command. The script checks the installed Hypit version, resolves the selected Runtime Profile, discovers the endpoint's credential reference, and runs `hypit auth status` before opening the page.
3. Let the script open the local browser page. If automatic opening is unavailable, give the user only the loopback URL printed by the script; it contains a random setup path but no secret.
4. Wait for the user to press **Save securely**. The server sends the in-memory body to `hypit auth login` over stdin, then runs `hypit auth status` again and closes itself after a configured result.
5. Report only the endpoint, credential-reference key, installed tool version, and `configured` or `missing`. Never inspect or reveal the stored value.

For `video.lingke`, the current Profile is expected to resolve the `apiKey` slot to `video.lingke.api-key`. Treat a different discovered reference as the Profile's actual configuration; do not hardcode a provider-specific service URL or secret.

## Failure handling

- If the endpoint, Runtime Profile, credential slot, or official writable store cannot be resolved, stop before opening the page and explain the non-secret configuration issue.
- If saving fails, keep the page available for a retry until its timeout, but show only a generic failure message in the browser. Diagnose from bounded non-secret tool errors.
- If verification reports `missing`, report `missing`; do not probe the remote provider or retrieve the stored value.
- Do not weaken host, origin, CSRF, content-type, body-size, timeout, or response-header checks to work around a browser or environment problem.

## Maintenance

Run `npm test` from the Skill directory after any code change, then validate the Skill with the Skill Creator validator. Package only source, documentation, tests, and metadata; exclude dependencies, coverage, logs, local configuration, and generated archives.
