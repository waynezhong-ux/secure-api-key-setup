# Adding adapters

Adapters extend the intake server to another official credential backend. They do not redefine the browser protocol or create a generic secret database.

## Contract

An adapter object implements three asynchronous methods defined in `adapters/adapter-contract.js`:

```js
{
  async prepare({ endpoint, workspace }) { /* non-secret discovery */ },
  async save(prepared, secretBytes) { /* official store write */ },
  async verify(prepared) { return "configured"; }
}
```

`prepare` must return non-secret metadata:

```js
{
  adapter,
  endpoint,
  credentialKey,
  credentialStore,
  slot,
  toolVersion,
  status: "configured" | "missing",
  writable: true
}
```

It must resolve the target's actual endpoint or account configuration, identify the exact credential reference, and prove that the selected official backend is writable before the browser page opens.

`save` receives a `Uint8Array`. It must pass those bytes to the official credential command or API through a private pipe or equivalent in-memory channel. It must never stringify the secret for logging, include it in an error, place it in an argument or environment variable, or write it to a file. It returns no secret metadata.

`verify` performs a presence-only check and returns exactly `configured` or `missing`. It must not retrieve, compare, hash, mask, fingerprint, or remotely validate the key.

## Backend guidance

- **Hypit:** invoke `hypit auth login` with stdin and verify with `hypit auth status`. Resolve the CredentialRef from the selected Runtime Profile. Do not call OS keychain commands directly because Hypit owns the credential abstraction.
- **OpenClaw:** use its documented credential command or SDK once its stable secret-input channel and status semantics are verified. Do not infer a file format.
- **Windows Credential Manager:** use the official Windows credential API or a maintained library over an in-memory boundary. Avoid PowerShell command arguments and exported credential files.
- **macOS Keychain:** prefer the Security framework or a supported stdin/API path. The `security` CLI commonly requires secret arguments for some operations; document and review any unavoidable platform limitation before enabling it.
- **Linux Secret Service:** use the Secret Service D-Bus API or a maintained library. Do not fall back to `.env`, keyring exports, or plaintext configuration.
- **AI providers:** prefer the provider tool's own credential manager. A provider's API endpoint is not itself a secret backend.

## Registration

Add a fixed-name branch to `loadAdapter` in `scripts/secure-key-server.js`. Do not construct dynamic import paths from user input. Validate adapter-specific endpoint identifiers before they reach any child process or API.

## Required tests

Every adapter needs tests that prove:

- discovery returns the expected non-secret reference and status;
- the fake secret is absent from every command argument and environment field;
- the fake secret is delivered only through the injected in-memory channel;
- save output and errors do not contain the fake secret;
- verification returns only `configured` or `missing`;
- missing, ambiguous, unsupported, and read-only backends fail closed; and
- tests cannot access a live store.

Use an injected fake runner or backend. Never require a developer to enter a real key and never mutate a real credential store in CI.
