#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ignored = new Set([".git", "node_modules", "coverage", "dist"]);
const riskyNames = /(^|[.])(env|pem|p12|pfx|key|secret)([.]|$)|^(credentials|secrets)[.]json$/iu;
const suspiciousContent = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  /\b(?:sk|api)[-_][A-Za-z0-9]{24,}\b/u,
  /\bAKIA[0-9A-Z]{16}\b/u,
];

async function walk(directory, output = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(fullPath, output);
    else output.push(fullPath);
  }
  return output;
}

const findings = [];
for (const file of await walk(root)) {
  const relative = path.relative(root, file);
  if (riskyNames.test(path.basename(file)) && path.basename(file) !== ".gitignore") {
    findings.push(`${relative}: risky filename`);
    continue;
  }
  const text = await readFile(file, "utf8").catch(() => undefined);
  if (text === undefined) continue;
  for (const pattern of suspiciousContent) {
    if (pattern.test(text)) findings.push(`${relative}: suspicious secret pattern`);
  }
}

if (findings.length > 0) {
  process.stderr.write(`${findings.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("No obvious secret material found. Use a maintained secret scanner in CI as well.\n");
}
