#!/usr/bin/env node
// scripts/release.mjs: cut a plugin release locally. No dependencies; Node 22
// or later. Three steps, each its own command, so nothing is tagged by accident:
//
//   node scripts/release.mjs bump <major|minor|patch|X.Y.Z>
//       Set the plugin version (plugins/proskill/.claude-plugin/plugin.json; the
//       ChatGPT zip reads the same number) and rebuild both targets. Then add a
//       "## X.Y.Z" section to CHANGELOG.md and commit.
//
//   node scripts/release.mjs check      (npm run release:check)
//       Build (no network), require that the build changed no committed file,
//       run npm test, run `claude plugin validate` in strict mode on the
//       marketplace and the plugin (skipped with a warning when the claude CLI
//       is not installed), and require a CHANGELOG.md section for the version.
//
//   node scripts/release.mjs tag
//       Everything check does, then a clean work tree, then an annotated local
//       tag vX.Y.Z on HEAD. It never pushes; it prints the push command. Tag
//       only the commit on main that ships (after any re-pin), never a branch.
//
// GitHub Actions cannot run for this org, so this script is the release gate.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CHATGPT_ZIP_PATH, PLUGIN_DIR, PLUGIN_JSON_PATH, sha256Hex } from "./lib.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const at = (p) => join(ROOT, p);
// House style keeps a literal double hyphen out of source text; CLI flags are built.
const longFlag = (name) => `${"-".repeat(2)}${name}`;

function run(cmd, args, { allowMissing = false } = {}) {
  console.log(`$ ${[cmd, ...args].join(" ")}`);
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit" });
  if (r.error?.code === "ENOENT" && allowMissing) return null;
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} exited ${r.status}`);
  return r.status;
}

const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
const readVersion = () => JSON.parse(readFileSync(at(PLUGIN_JSON_PATH), "utf8")).version;

/** "1.4.2" + "minor" -> "1.5.0"; an explicit X.Y.Z is taken as is. */
export function nextVersion(current, how) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
  if (!m) throw new Error(`plugin version ${JSON.stringify(current)} is not MAJOR.MINOR.PATCH`);
  const [maj, min, pat] = m.slice(1).map(Number);
  if (how === "major") return `${maj + 1}.0.0`;
  if (how === "minor") return `${maj}.${min + 1}.0`;
  if (how === "patch") return `${maj}.${min}.${pat + 1}`;
  if (/^\d+\.\d+\.\d+$/.test(how ?? "")) return how;
  throw new Error("bump needs major, minor, patch or an explicit X.Y.Z");
}

/** Whether CHANGELOG.md has a "## X.Y.Z" section. */
export function changelogHas(text, version) {
  const escaped = version.replace(/\./g, "\\.");
  return new RegExp(`^## \\[?${escaped}\\]?(\\s|$)`, "m").test(text);
}

function bump(how) {
  const plugin = JSON.parse(readFileSync(at(PLUGIN_JSON_PATH), "utf8"));
  const from = plugin.version;
  plugin.version = nextVersion(from, how);
  writeFileSync(at(PLUGIN_JSON_PATH), `${JSON.stringify(plugin, null, 2)}\n`);
  console.log(`plugin version ${from} -> ${plugin.version}`);
  run(process.execPath, ["scripts/build.mjs"]);
  console.log(`Next: add "## ${plugin.version}" to CHANGELOG.md, commit, then run: node scripts/release.mjs check`);
}

function check() {
  const before = git("status", longFlag("porcelain"));
  run(process.execPath, ["scripts/build.mjs"]);
  const after = git("status", longFlag("porcelain"));
  if (after !== before) {
    throw new Error("the build changed committed files; commit the rebuilt plugin first\n" + after);
  }
  run("npm", ["test"]);
  for (const target of [".", PLUGIN_DIR]) {
    if (run("claude", ["plugin", "validate", longFlag("strict"), target], { allowMissing: true }) === null) {
      console.warn("warning: the claude CLI is not installed; skipped claude plugin validate");
      break;
    }
  }
  const version = readVersion();
  if (!existsSync(at("CHANGELOG.md")) || !changelogHas(readFileSync(at("CHANGELOG.md"), "utf8"), version)) {
    throw new Error(`CHANGELOG.md has no "## ${version}" section`);
  }
  const zip = readFileSync(at(CHATGPT_ZIP_PATH));
  console.log(`release check passed for ${version}`);
  console.log(`  Claude Code: ${PLUGIN_DIR}/`);
  console.log(`  ChatGPT:     ${CHATGPT_ZIP_PATH} (${zip.length} bytes, sha256 ${sha256Hex(zip)})`);
  return version;
}

function tag() {
  const version = check();
  const dirty = git("status", longFlag("porcelain"));
  if (dirty) throw new Error(`the work tree is not clean:\n${dirty}`);
  const name = `v${version}`;
  if (git("tag", "-l", name)) throw new Error(`tag ${name} already exists`);
  git("tag", "-a", name, "-m", `ProSkill plugin ${version}`);
  console.log(`tagged ${name} on ${git("rev-parse", "HEAD")} (local only)`);
  console.log(`To publish: git push origin ${name}`);
}

const COMMANDS = { bump: () => bump(process.argv[3]), check, tag };

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cmd = COMMANDS[process.argv[2]];
  try {
    if (!cmd) throw new Error("usage: node scripts/release.mjs <bump major|minor|patch|X.Y.Z | check | tag>");
    cmd();
  } catch (err) {
    console.error(`release: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
