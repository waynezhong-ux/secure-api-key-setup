import assert from "node:assert/strict";
import test from "node:test";

import { startSecureKeyServer } from "../scripts/secure-key-server.js";

const FAKE_KEY = "fake-test-key-do-not-use";

function extract(page, name) {
  const match = page.match(new RegExp(`const ${name} = "([^"]+)";`, "u"));
  assert.ok(match, `${name} must be present in the page`);
  return match[1];
}

function fakeAdapter() {
  let saved = false;
  return {
    async prepare({ endpoint }) {
      return {
        adapter: "fake",
        endpoint,
        credentialKey: `${endpoint}.api-key`,
        credentialStore: "fake-memory",
        slot: "apiKey",
        toolVersion: "0.0.0-test",
        status: "missing",
        writable: true,
      };
    },
    async save(_prepared, secret) {
      assert.ok(secret instanceof Uint8Array);
      assert.equal(Buffer.from(secret).toString("utf8"), FAKE_KEY);
      saved = true;
    },
    async verify() {
      return saved ? "configured" : "missing";
    },
  };
}

test("serves only on loopback and closes after a secure POST", async (t) => {
  const errors = [];
  const session = await startSecureKeyServer({
    adapter: fakeAdapter(),
    endpoint: "video.example",
    workspace: process.cwd(),
    openBrowser: false,
    lifetimeMs: 5_000,
    onError: (error) => errors.push(error),
  });
  t.after(() => session.close());

  assert.equal(session.host, "127.0.0.1");
  assert.ok(session.port > 0);
  assert.ok(!session.url.includes(FAKE_KEY));
  assert.equal(new URL(session.url).search, "");

  const pageResponse = await fetch(session.url);
  assert.equal(pageResponse.status, 200);
  assert.match(pageResponse.headers.get("content-security-policy"), /default-src 'none'/u);
  assert.equal(pageResponse.headers.get("cache-control"), "no-store, max-age=0");
  const page = await pageResponse.text();
  assert.match(page, /type="password"/u);
  assert.match(page, />Save securely</u);
  assert.match(page, /id="close" class="secondary" type="button" hidden>Close page</u);
  assert.match(page, /message\.textContent = "Saved securely\."/u);
  assert.match(page, /id="expiry-status">active</u);
  assert.match(page, /Session expired\. Close this page/u);
  assert.match(page, /window\.location\.replace\("about:blank"\)/u);
  assert.doesNotMatch(page, /button:disabled \{[^}]*cursor: wait/u);
  assert.ok(!page.includes(FAKE_KEY));

  const submitPath = extract(page, "submitPath");
  const csrfToken = extract(page, "csrfToken");
  const origin = new URL(session.url).origin;
  const saveResponse = await fetch(`${origin}${submitPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-CSRF-Token": csrfToken,
      "Origin": origin,
    },
    body: Buffer.from(FAKE_KEY),
  });
  assert.equal(saveResponse.status, 200);
  const saveText = await saveResponse.text();
  assert.equal(saveText, "Saved securely");
  assert.ok(!saveText.includes(FAKE_KEY));
  assert.equal(await session.completion, "configured");
  assert.deepEqual(errors, []);
});

test("rejects query strings and cross-origin submission", async (t) => {
  let saves = 0;
  const adapter = fakeAdapter();
  const originalSave = adapter.save;
  adapter.save = async (...args) => { saves += 1; return await originalSave(...args); };
  const session = await startSecureKeyServer({
    adapter,
    endpoint: "video.example",
    workspace: process.cwd(),
    openBrowser: false,
    lifetimeMs: 5_000,
  });
  t.after(() => session.close());

  const queryResponse = await fetch(`${session.url}?probe=1`);
  assert.equal(queryResponse.status, 400);
  const page = await (await fetch(session.url)).text();
  const submitPath = extract(page, "submitPath");
  const csrfToken = extract(page, "csrfToken");
  const origin = new URL(session.url).origin;
  const rejected = await fetch(`${origin}${submitPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-CSRF-Token": csrfToken,
      "Origin": "http://example.invalid",
    },
    body: Buffer.from(FAKE_KEY),
  });
  assert.equal(rejected.status, 403);
  assert.equal(saves, 0);
});

test("expires an unused session without invoking the adapter", async () => {
  let saves = 0;
  const adapter = fakeAdapter();
  const originalSave = adapter.save;
  adapter.save = async (...args) => { saves += 1; return await originalSave(...args); };
  const session = await startSecureKeyServer({
    adapter,
    endpoint: "video.example",
    workspace: process.cwd(),
    openBrowser: false,
    lifetimeMs: 25,
  });
  assert.equal(await session.completion, "expired");
  assert.equal(saves, 0);
});
