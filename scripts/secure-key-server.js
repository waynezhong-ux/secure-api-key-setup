#!/usr/bin/env node

import { randomBytes, timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { assertAdapter } from "../adapters/adapter-contract.js";
import { createHypitAdapter } from "../adapters/hypit.js";

const LOOPBACK_HOST = "127.0.0.1";
const MAX_SECRET_BYTES = 16 * 1024;
const DEFAULT_LIFETIME_MS = 10 * 60 * 1000;
const SUCCESS_SHUTDOWN_GRACE_MS = 750;
const ENDPOINT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function constantTimeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

function securityHeaders(nonce) {
  return {
    "Cache-Control": "no-store, max-age=0",
    "Content-Security-Policy": [
      "default-src 'none'",
      `script-src 'nonce-${nonce}'`,
      `style-src 'nonce-${nonce}'`,
      "connect-src 'self'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ].join("; "),
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Pragma": "no-cache",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };
}

function renderPage({ prepared, submitPath, csrfToken, nonce, expiresAt }) {
  const endpoint = escapeHtml(prepared.endpoint);
  const credentialKey = escapeHtml(prepared.credentialKey);
  const initialStatus = escapeHtml(prepared.status);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Secure API Key Setup</title>
  <style nonce="${nonce}">
    :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0b1220; color: #e5edf8; }
    main { width: min(92vw, 34rem); padding: 2rem; border: 1px solid #31415f; border-radius: 1rem; background: #121c2f; box-shadow: 0 1.2rem 4rem #0008; }
    h1 { margin-top: 0; font-size: 1.55rem; }
    dl { display: grid; grid-template-columns: max-content 1fr; gap: .45rem 1rem; font-size: .92rem; }
    dt { color: #9db0cb; } dd { margin: 0; overflow-wrap: anywhere; }
    label { display: block; margin: 1.4rem 0 .45rem; font-weight: 650; }
    input { box-sizing: border-box; width: 100%; padding: .8rem; border: 1px solid #52698e; border-radius: .55rem; background: #08101d; color: #fff; font: inherit; }
    button { margin-top: 1rem; width: 100%; padding: .8rem; border: 0; border-radius: .55rem; background: #61a5fa; color: #07111f; font: inherit; font-weight: 750; cursor: pointer; }
    button:disabled { opacity: .55; cursor: default; }
    button.secondary { background: #dce9f8; }
    [hidden] { display: none !important; }
    #message { min-height: 1.5rem; margin: 1rem 0 0; color: #b9c8dc; }
    #message.success { color: #86efac; font-weight: 700; }
    #message.error { color: #fca5a5; font-weight: 700; }
    .note { color: #9db0cb; font-size: .86rem; line-height: 1.45; }
  </style>
</head>
<body>
  <main>
    <h1>Secure API Key Setup</h1>
    <dl>
      <dt>Endpoint</dt><dd>${endpoint}</dd>
      <dt>Credential</dt><dd>${credentialKey}</dd>
      <dt>Status</dt><dd id="credential-status">${initialStatus}</dd>
      <dt>Session</dt><dd id="expiry-status">active</dd>
    </dl>
    <div id="entry">
      <label for="secret">API Key</label>
      <input id="secret" name="secret" type="password" autocomplete="new-password" autocapitalize="off" spellcheck="false" required autofocus>
      <button id="save" type="button">Save securely</button>
    </div>
    <button id="close" class="secondary" type="button" hidden>Close page</button>
    <p id="message" role="status" aria-live="polite"></p>
    <p class="note">This temporary page is available only on this computer. The value is sent once in a POST body and is not displayed or stored by this page.</p>
  </main>
  <script nonce="${nonce}">
    const submitPath = ${JSON.stringify(submitPath)};
    const csrfToken = ${JSON.stringify(csrfToken)};
    const expiresAt = ${JSON.stringify(expiresAt)};
    const input = document.getElementById("secret");
    const button = document.getElementById("save");
    const entry = document.getElementById("entry");
    const closeButton = document.getElementById("close");
    const message = document.getElementById("message");
    const status = document.getElementById("credential-status");
    const expiryStatus = document.getElementById("expiry-status");
    let completed = false;
    const showExpired = () => {
      if (completed) return;
      entry.hidden = true;
      closeButton.hidden = false;
      expiryStatus.textContent = "expired";
      message.className = "error";
      message.textContent = "Session expired. Close this page and ask Codex to open a new secure link.";
      document.title = "Session expired";
      closeButton.focus();
    };
    const updateExpiry = () => {
      const remaining = Math.max(0, expiresAt - Date.now());
      if (remaining === 0) { showExpired(); return; }
      const totalSeconds = Math.ceil(remaining / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = String(totalSeconds % 60).padStart(2, "0");
      expiryStatus.textContent = "expires in " + minutes + ":" + seconds;
    };
    const expiryTimer = setInterval(updateExpiry, 1000);
    updateExpiry();
    closeButton.addEventListener("click", () => {
      window.close();
      setTimeout(() => {
        if (!window.closed) window.location.replace("about:blank");
      }, 100);
    });
    button.addEventListener("click", async () => {
      if (Date.now() >= expiresAt) { showExpired(); return; }
      if (!input.value) { message.textContent = "Enter a value first."; input.focus(); return; }
      button.disabled = true;
      button.textContent = "Saving securely…";
      input.disabled = true;
      message.textContent = "Saving securely…";
      const bytes = new TextEncoder().encode(input.value);
      input.value = "";
      try {
        const response = await fetch(submitPath, {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream", "X-CSRF-Token": csrfToken },
          body: bytes,
          cache: "no-store",
          credentials: "same-origin",
          redirect: "error"
        });
        if (!response.ok) throw new Error("save failed");
        completed = true;
        clearInterval(expiryTimer);
        status.textContent = "configured";
        expiryStatus.textContent = "closed after save";
        entry.hidden = true;
        closeButton.hidden = false;
        message.className = "success";
        message.textContent = "Saved securely.";
        document.title = "Saved securely";
        closeButton.focus();
      } catch {
        if (Date.now() >= expiresAt) { showExpired(); return; }
        message.textContent = "Save failed. The value was not displayed or retained by this page. Try again or return to Codex.";
        button.disabled = false;
        button.textContent = "Save securely";
        input.disabled = false;
        input.focus();
      } finally {
        bytes.fill(0);
      }
    });
  </script>
</body>
</html>`;
}

function send(res, statusCode, body, headers = {}, onFinished) {
  const payload = Buffer.from(body, "utf8");
  res.writeHead(statusCode, {
    "Connection": "close",
    "Content-Length": String(payload.length),
    ...headers,
  });
  res.end(payload, onFinished);
}

async function readBoundedBody(req) {
  const declaredLength = req.headers["content-length"];
  if (declaredLength !== undefined) {
    const value = Number(declaredLength);
    if (!Number.isSafeInteger(value) || value < 1 || value > MAX_SECRET_BYTES) {
      throw Object.assign(new Error("Invalid credential body size"), { statusCode: 413 });
    }
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const bytes = Buffer.from(chunk);
    total += bytes.length;
    if (total > MAX_SECRET_BYTES) {
      throw Object.assign(new Error("Credential body is too large"), { statusCode: 413 });
    }
    chunks.push(bytes);
  }
  if (total === 0) throw Object.assign(new Error("Credential body is empty"), { statusCode: 400 });
  const body = Buffer.concat(chunks);
  if (body.includes(0) || body.includes(10) || body.includes(13)) {
    body.fill(0);
    throw Object.assign(new Error("Credential body contains unsupported control bytes"), { statusCode: 400 });
  }
  return body;
}

async function openBrowser(url) {
  const command = process.platform === "win32"
    ? { file: "rundll32.exe", args: ["url.dll,FileProtocolHandler", url] }
    : process.platform === "darwin"
      ? { file: "/usr/bin/open", args: [url] }
      : { file: "xdg-open", args: [url] };
  await new Promise((resolve, reject) => {
    const child = spawn(command.file, command.args, {
      detached: true,
      shell: false,
      stdio: "ignore",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

function loadAdapter(name) {
  if (name === "hypit") return createHypitAdapter();
  throw new Error(`Unsupported adapter: ${name}`);
}

export async function startSecureKeyServer(options) {
  const endpoint = options.endpoint;
  if (!ENDPOINT_PATTERN.test(endpoint)) throw new Error("Endpoint name is invalid");
  const workspace = path.resolve(options.workspace);
  const adapter = assertAdapter(options.adapter);
  const prepared = await adapter.prepare({ endpoint, workspace });
  const routeToken = randomBytes(24).toString("base64url");
  const csrfToken = randomBytes(32).toString("base64url");
  const nonce = randomBytes(18).toString("base64url");
  const pagePath = `/setup/${routeToken}`;
  const submitPath = `/submit/${routeToken}`;
  let saving = false;
  let stopped = false;
  let lifetimeTimer;
  let expiresAt = 0;
  let resolveCompletion;
  const completion = new Promise((resolve) => { resolveCompletion = resolve; });

  const server = http.createServer(async (req, res) => {
    const address = server.address();
    if (address === null || typeof address === "string") {
      send(res, 503, "Unavailable");
      return;
    }
    const origin = `http://${LOOPBACK_HOST}:${address.port}`;
    const host = req.headers.host;
    const requestUrl = new URL(req.url ?? "/", origin);
    if (host !== `${LOOPBACK_HOST}:${address.port}` || requestUrl.origin !== origin || requestUrl.search !== "") {
      send(res, 400, "Bad request", { "Cache-Control": "no-store" });
      return;
    }
    if (req.method === "GET" && requestUrl.pathname === pagePath) {
      send(res, 200, renderPage({ prepared, submitPath, csrfToken, nonce, expiresAt }), {
        ...securityHeaders(nonce),
        "Content-Type": "text/html; charset=utf-8",
      });
      return;
    }
    if (req.method !== "POST" || requestUrl.pathname !== submitPath) {
      send(res, 404, "Not found", { "Cache-Control": "no-store" });
      return;
    }
    if (req.headers.origin !== origin
      || !constantTimeEqual(req.headers["x-csrf-token"] ?? "", csrfToken)
      || req.headers["content-type"] !== "application/octet-stream"
      || req.headers["content-encoding"] !== undefined) {
      send(res, 403, "Forbidden", { "Cache-Control": "no-store" });
      return;
    }
    if (saving) {
      send(res, 409, "Save already in progress", { "Cache-Control": "no-store" });
      return;
    }
    saving = true;
    let secret;
    try {
      secret = await readBoundedBody(req);
      await adapter.save(prepared, secret);
      const status = await adapter.verify(prepared);
      if (status !== "configured") throw new Error("Credential verification returned missing");
      send(res, 200, "Saved securely", {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
      }, () => {
        const shutdownTimer = setTimeout(() => stop("configured"), SUCCESS_SHUTDOWN_GRACE_MS);
        shutdownTimer.unref?.();
      });
    } catch (error) {
      const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
      send(res, statusCode, statusCode === 500 ? "Save failed" : "Invalid request", {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
      });
      options.onError?.(error);
      saving = false;
    } finally {
      secret?.fill(0);
    }
  });

  server.on("clientError", (_error, socket) => {
    socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
  });

  function stop(reason = "closed") {
    if (stopped) return;
    stopped = true;
    if (lifetimeTimer !== undefined) clearTimeout(lifetimeTimer);
    server.close(() => resolveCompletion(reason));
  }

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: LOOPBACK_HOST, port: 0, exclusive: true }, resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    stop("closed");
    throw new Error("Loopback server did not expose a TCP port");
  }
  const url = `http://${LOOPBACK_HOST}:${address.port}${pagePath}`;
  const lifetimeMs = options.lifetimeMs ?? DEFAULT_LIFETIME_MS;
  expiresAt = Date.now() + lifetimeMs;
  lifetimeTimer = setTimeout(() => stop("expired"), lifetimeMs);
  lifetimeTimer.unref?.();

  if (options.openBrowser !== false) {
    try {
      await (options.browserOpener ?? openBrowser)(url);
    } catch (error) {
      options.onBrowserError?.(error);
    }
  }

  return Object.freeze({
    url,
    host: LOOPBACK_HOST,
    port: address.port,
    prepared,
    completion,
    close: () => stop("closed"),
  });
}

function parseArguments(argv) {
  const values = { adapter: "hypit", workspace: process.cwd(), openBrowser: true };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--no-open") {
      values.openBrowser = false;
      continue;
    }
    if (!["--adapter", "--endpoint", "--workspace"].includes(item)) {
      throw new Error(`Unknown option: ${item}`);
    }
    const value = argv[index + 1];
    if (value === undefined) throw new Error(`Missing value for ${item}`);
    index += 1;
    if (item === "--adapter") values.adapter = value;
    if (item === "--endpoint") values.endpoint = value;
    if (item === "--workspace") values.workspace = value;
  }
  if (values.endpoint === undefined) throw new Error("--endpoint is required");
  return values;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArguments(argv);
  const session = await startSecureKeyServer({
    ...args,
    adapter: loadAdapter(args.adapter),
    onError: () => process.stderr.write("Credential save failed. The submitted value was not displayed.\n"),
    onBrowserError: () => process.stderr.write("The browser could not be opened automatically; open the local URL shown below.\n"),
  });
  process.stdout.write([
    "Secure credential page ready.",
    `Endpoint: ${session.prepared.endpoint}`,
    `Credential: ${session.prepared.credentialKey}`,
    `Hypit: ${session.prepared.toolVersion}`,
    `Local URL: ${session.url}`,
    "",
  ].join("\n"));
  const result = await session.completion;
  if (result !== "configured") throw new Error(result === "expired"
    ? "Secure credential page expired before configuration completed"
    : "Secure credential setup was closed before configuration completed");
  process.stdout.write([
    "Saved securely.",
    `Endpoint: ${session.prepared.endpoint}`,
    `Credential: ${session.prepared.credentialKey}`,
    "Status: configured",
    "",
  ].join("\n"));
}

const isEntryPoint = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isEntryPoint) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Secure credential setup failed"}\n`);
    process.exitCode = 1;
  });
}

export const internals = Object.freeze({
  LOOPBACK_HOST,
  MAX_SECRET_BYTES,
  SUCCESS_SHUTDOWN_GRACE_MS,
  constantTimeEqual,
  parseArguments,
  readBoundedBody,
  renderPage,
  securityHeaders,
});
