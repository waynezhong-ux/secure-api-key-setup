import { spawn } from "node:child_process";
import { access, readFile, realpath } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";

const MINIMUM_SUPPORTED_VERSION = "0.1.10";
const MAX_OUTPUT_BYTES = 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;

function safeErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function parseVersion(value) {
  const match = String(value).trim().match(/^(?:@hypit\/hypit\s+)?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/u);
  if (match === null) throw new Error("Hypit returned an unrecognized version");
  return match.slice(1, 4).map(Number);
}

function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} returned invalid JSON`);
  }
}

function isCredentialRef(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && typeof value.store === "string" && value.store.trim().length > 0
    && typeof value.key === "string" && value.key.trim().length > 0;
}

function collectCredentialRefs(value, output = []) {
  if (isCredentialRef(value)) {
    output.push(value);
    return output;
  }
  if (value === null || typeof value !== "object") return output;
  for (const child of Object.values(value)) collectCredentialRefs(child, output);
  return output;
}

function credentialRefForSlot(profile, endpoint, slot) {
  const endpointEntry = profile?.endpoints?.[endpoint];
  if (endpointEntry === undefined) {
    throw new Error(`Hypit endpoint ${endpoint} is not declared in the selected Runtime Profile`);
  }
  const direct = endpointEntry?.config?.[slot];
  if (isCredentialRef(direct)) return direct;
  const refs = collectCredentialRefs(endpointEntry.config);
  if (refs.length === 1) return refs[0];
  throw new Error(`Cannot map Hypit credential slot ${slot} to one CredentialRef`);
}

function statusCredential(machine, endpoint, slot) {
  if (machine?.format !== "hypit.cli-auth-status@1" || !Array.isArray(machine.credentials)) {
    throw new Error("Hypit auth status returned an unsupported response");
  }
  const matches = machine.credentials.filter((item) => item?.endpoint === endpoint
    && (slot === undefined || item?.slot === slot));
  if (matches.length !== 1) {
    throw new Error(slot === undefined
      ? `Hypit endpoint ${endpoint} must expose exactly one credential slot`
      : `Hypit endpoint ${endpoint} has no unique credential slot ${slot}`);
  }
  return matches[0];
}

async function existingFile(candidate) {
  try {
    await access(candidate, fsConstants.R_OK);
    return candidate;
  } catch {
    return undefined;
  }
}

async function findProjectLauncher(workspace) {
  let current = path.resolve(workspace);
  while (true) {
    const candidate = await existingFile(path.join(
      current, "node_modules", "@hypit", "hypit", "bin", "hypit.mjs",
    ));
    if (candidate !== undefined) return { command: process.execPath, prefix: [candidate] };
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

async function findInstalledLaunchers() {
  const scriptCandidates = [];
  if (process.env.HYPIT_CLI_LAUNCHER) scriptCandidates.push(process.env.HYPIT_CLI_LAUNCHER);
  if (process.env.npm_config_prefix) {
    scriptCandidates.push(
      path.join(process.env.npm_config_prefix, "node_modules", "@hypit", "hypit", "bin", "hypit.mjs"),
      path.join(process.env.npm_config_prefix, "lib", "node_modules", "@hypit", "hypit", "bin", "hypit.mjs"),
    );
  }
  if (process.platform === "win32" && process.env.APPDATA) {
    scriptCandidates.push(path.join(
      process.env.APPDATA, "npm", "node_modules", "@hypit", "hypit", "bin", "hypit.mjs",
    ));
  }
  for (const directory of (process.env.PATH ?? "").split(path.delimiter).filter(Boolean)) {
    scriptCandidates.push(
      path.join(directory, "node_modules", "@hypit", "hypit", "bin", "hypit.mjs"),
      path.resolve(directory, "..", "lib", "node_modules", "@hypit", "hypit", "bin", "hypit.mjs"),
    );
    if (process.platform !== "win32") {
      const executable = await existingFile(path.join(directory, "hypit"));
      if (executable !== undefined) scriptCandidates.push(await realpath(executable).catch(() => executable));
    }
  }
  const unique = [...new Set(scriptCandidates.map((item) => path.resolve(item)))];
  const launchers = [];
  for (const candidate of unique) {
    if (await existingFile(candidate) !== undefined) {
      launchers.push({ command: process.execPath, prefix: [candidate] });
    }
  }
  return launchers;
}

function appendBounded(chunks, chunk, state, retain) {
  const bytes = Buffer.from(chunk);
  state.total += bytes.length;
  if (state.total > MAX_OUTPUT_BYTES) throw new Error("Hypit output exceeded the safety limit");
  if (retain) chunks.push(bytes);
}

export class HypitCliRunner {
  #launcher;

  async discover(workspace) {
    if (this.#launcher !== undefined) return this.#launcher;
    const projectLauncher = await findProjectLauncher(workspace);
    const candidates = [
      ...(projectLauncher === undefined ? [] : [projectLauncher]),
      ...await findInstalledLaunchers(),
    ];
    for (const candidate of candidates) {
      if (candidate.prefix.length > 0 && await existingFile(candidate.prefix[0]) === undefined) continue;
      try {
        const result = await this.#run(candidate, ["--version"], { cwd: workspace });
        parseVersion(result.stdout);
        this.#launcher = candidate;
        return candidate;
      } catch {
        // Continue to the next non-secret launcher candidate.
      }
    }
    throw new Error("Hypit is not available; install it in the project or in the current user's npm global prefix");
  }

  async run(args, options) {
    const launcher = await this.discover(options.cwd);
    return await this.#run(launcher, args, options);
  }

  async #run(launcher, args, options) {
    return await new Promise((resolve, reject) => {
      const child = spawn(launcher.command, [...launcher.prefix, ...args], {
        cwd: options.cwd,
        shell: false,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      });
      const stdout = [];
      const stderr = [];
      const stdoutState = { total: 0 };
      const stderrState = { total: 0 };
      let settled = false;
      let timer;
      const sensitive = options.input !== undefined;
      const fail = (error) => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) clearTimeout(timer);
        child.kill();
        reject(error);
      };
      timer = setTimeout(() => fail(new Error("Hypit credential operation timed out")),
        options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      timer.unref?.();
      child.on("error", (error) => fail(new Error(`Unable to start Hypit: ${safeErrorMessage(error)}`)));
      child.stdout.on("data", (chunk) => {
        try { appendBounded(stdout, chunk, stdoutState, !sensitive); } catch (error) { fail(error); }
      });
      child.stderr.on("data", (chunk) => {
        try { appendBounded(stderr, chunk, stderrState, !sensitive); } catch (error) { fail(error); }
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        const out = Buffer.concat(stdout).toString("utf8");
        const err = Buffer.concat(stderr).toString("utf8");
        if (code === 0) {
          resolve({ stdout: out, stderr: err });
          return;
        }
        reject(new Error(sensitive
          ? `Hypit credential operation failed with exit code ${code ?? "unknown"}`
          : `Hypit command failed with exit code ${code ?? "unknown"}${err.trim() ? `: ${err.trim()}` : ""}`));
      });
      if (options.input === undefined) child.stdin.end();
      else child.stdin.end(options.input);
    });
  }
}

export function createHypitAdapter(options = {}) {
  const runner = options.runner ?? new HypitCliRunner();

  async function runJson(args, workspace) {
    const result = await runner.run([...args, "--json"], { cwd: workspace });
    return parseJson(result.stdout, `hypit ${args.join(" ")}`);
  }

  async function readStatus(endpoint, workspace, slot) {
    const machine = await runJson([
      "auth", "status", endpoint, "--workspace", workspace,
      ...(slot === undefined ? [] : ["--slot", slot]),
    ], workspace);
    const credential = statusCredential(machine, endpoint, slot);
    return {
      slot: credential.slot,
      configured: credential.configured === true,
      writable: credential.writable === true,
    };
  }

  return {
    async prepare({ endpoint, workspace }) {
      const versionResult = await runner.run(["--version"], { cwd: workspace });
      const toolVersion = versionResult.stdout.trim();
      if (compareVersions(toolVersion, MINIMUM_SUPPORTED_VERSION) < 0) {
        throw new Error(`Hypit ${toolVersion} is unsupported; use ${MINIMUM_SUPPORTED_VERSION} or newer`);
      }
      const paths = await runJson(["paths", "--workspace", workspace], workspace);
      if (typeof paths?.profile !== "string" || paths.profile.length === 0) {
        throw new Error("Hypit has no selected Runtime Profile for this workspace");
      }
      const profile = parseJson(await readFile(paths.profile, "utf8"), "Hypit Runtime Profile");
      const status = await readStatus(endpoint, workspace);
      const ref = credentialRefForSlot(profile, endpoint, status.slot);
      if (!status.writable) {
        throw new Error(`Hypit Credential Store ${ref.store} is read-only for ${ref.key}`);
      }
      return Object.freeze({
        adapter: "hypit",
        endpoint,
        credentialKey: ref.key,
        credentialStore: ref.store,
        slot: status.slot,
        toolVersion,
        status: status.configured ? "configured" : "missing",
        writable: true,
        workspace,
      });
    },

    async save(prepared, secret) {
      if (!(secret instanceof Uint8Array) || secret.byteLength === 0) {
        throw new TypeError("Credential body is empty");
      }
      await runner.run([
        "auth", "login", prepared.endpoint,
        "--workspace", prepared.workspace,
        "--slot", prepared.slot,
        "--json",
      ], {
        cwd: prepared.workspace,
        input: secret,
      });
    },

    async verify(prepared) {
      const status = await readStatus(prepared.endpoint, prepared.workspace, prepared.slot);
      return status.configured ? "configured" : "missing";
    },
  };
}

export const internals = Object.freeze({
  collectCredentialRefs,
  compareVersions,
  credentialRefForSlot,
  parseVersion,
  statusCredential,
});
