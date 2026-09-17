import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createHypitAdapter } from "../adapters/hypit.js";

const FAKE_KEY = "fake-test-key-do-not-use";

test("Hypit adapter discovers the reference and sends the secret only through stdin", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "secure-key-test-"));
  const profilePath = path.join(workspace, "hypit.runtime.json");
  await writeFile(profilePath, JSON.stringify({
    format: "hypit.runtime-local@1",
    credentials: { os: { use: "@hypit/credential-store-os" } },
    endpoints: {
      "video.lingke": {
        use: "@example/provider",
        config: { apiKey: { store: "os", key: "video.lingke.api-key" } },
      },
    },
  }), "utf8");

  let configured = false;
  const calls = [];
  const runner = {
    async run(args, options) {
      calls.push({ args: [...args], input: options.input });
      assert.ok(!args.includes(FAKE_KEY));
      if (args[0] === "--version") return { stdout: "0.1.10\n", stderr: "" };
      if (args[0] === "paths") {
        return { stdout: JSON.stringify({ format: "hypit.cli-paths@1", profile: profilePath }), stderr: "" };
      }
      if (args[0] === "auth" && args[1] === "status") {
        return {
          stdout: JSON.stringify({
            format: "hypit.cli-auth-status@1",
            endpoint: "video.lingke",
            credentials: [{
              endpoint: "video.lingke",
              slot: "apiKey",
              label: "Example API key",
              kind: "text",
              configured,
              writable: true,
            }],
          }),
          stderr: "",
        };
      }
      if (args[0] === "auth" && args[1] === "login") {
        assert.ok(options.input instanceof Uint8Array);
        assert.equal(Buffer.from(options.input).toString("utf8"), FAKE_KEY);
        configured = true;
        return {
          stdout: JSON.stringify({
            format: "hypit.cli-auth-change@1",
            endpoint: "video.lingke",
            slot: "apiKey",
            configured: true,
          }),
          stderr: "",
        };
      }
      throw new Error(`Unexpected fake Hypit call: ${args.join(" ")}`);
    },
  };

  const adapter = createHypitAdapter({ runner });
  const prepared = await adapter.prepare({ endpoint: "video.lingke", workspace });
  assert.equal(prepared.credentialKey, "video.lingke.api-key");
  assert.equal(prepared.credentialStore, "os");
  assert.equal(prepared.status, "missing");
  assert.equal(prepared.toolVersion, "0.1.10");

  const secret = Buffer.from(FAKE_KEY);
  await adapter.save(prepared, secret);
  assert.equal(await adapter.verify(prepared), "configured");
  assert.equal(calls.filter((call) => call.input !== undefined).length, 1);
  assert.ok(calls.every((call) => !call.args.join(" ").includes(FAKE_KEY)));
});

test("Hypit adapter fails closed for a read-only store", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "secure-key-test-"));
  const profilePath = path.join(workspace, "hypit.runtime.json");
  await writeFile(profilePath, JSON.stringify({
    endpoints: {
      "video.example": { config: { apiKey: { store: "env", key: "EXAMPLE_API_KEY" } } },
    },
  }), "utf8");
  const runner = {
    async run(args) {
      if (args[0] === "--version") return { stdout: "0.1.10", stderr: "" };
      if (args[0] === "paths") return { stdout: JSON.stringify({ format: "hypit.cli-paths@1", profile: profilePath }), stderr: "" };
      return {
        stdout: JSON.stringify({
          format: "hypit.cli-auth-status@1",
          endpoint: "video.example",
          credentials: [{ endpoint: "video.example", slot: "apiKey", configured: false, writable: false }],
        }),
        stderr: "",
      };
    },
  };
  await assert.rejects(
    createHypitAdapter({ runner }).prepare({ endpoint: "video.example", workspace }),
    /read-only/u,
  );
});
