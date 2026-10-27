#!/usr/bin/env node
// scripts/build.mjs: build plugins/proskill/skills/ from sources/ and
// starter-pack.json. No dependencies; Node 22 or later.
//
//   npm run build                     Copy every sources/<slug>/ folder into the
//                                     plugin and stamp its SKILL.md. Each folder
//                                     must match its pinned tree hash. No network.
//
//   npm run build -- --fetch          Refresh sources/ from ProSkill first: call
//                                     install_skill for every pinned slug, download
//                                     the signed .skill bundle, check its size and
//                                     sha256, unpack it into sources/<slug>/, and
//                                     re-pin version and tree hash. A skill with no
//                                     bundle falls back to the served SKILL.md. Each
//                                     call records an install on the token's account.
//                                     Server: PROSKILL_MCP_URL (default
//                                     https://proskill.ai/api/mcp). Token:
//                                     PROSKILL_MCP_TOKEN, or the first line of
//                                     PROSKILL_MCP_TOKEN_FILE (default
//                                     ~/.config/pro-skill/mcp-token). Mint one in
//                                     ProSkill at Settings > Claude Code Access.
//                                     Never paste a token into a chat or commit it.
//
//   npm run build -- --bundles <dir>  Same as --fetch, from bundles already
//                                     downloaded and verified: <dir>/<slug>.skill,
//                                     with the served version in <dir>/<slug>.version
//                                     (one line, e.g. v1.1; the pin is kept when absent).
//
// It removes skill folders the manifest no longer lists and bumps the
// plugin's patch version whenever a skill folder changes.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_MCP_URL,
  MANIFEST_PATH,
  PLUGIN_JSON_PATH,
  SKILLS_DIR,
  buildSkillFiles,
  bumpPatch,
  extractBundle,
  parseManifest,
  sha256Hex,
  sourceDir,
  toolResultText,
  treeHash,
} from "./lib.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const at = (p) => join(ROOT, p);

/** Every file under dir, as { path (relative, forward slashes), bytes }. */
export function readTree(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      if (name === ".DS_Store") continue;
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else out.push({ path: relative(dir, full).split("\\").join("/"), bytes: readFileSync(full) });
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}

function writeTree(dir, files) {
  rmSync(dir, { recursive: true, force: true });
  for (const f of files) {
    const dest = join(dir, f.path);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, f.bytes);
  }
}

function sameTree(a, b) {
  return a.length === b.length && treeHash(a) === treeHash(b);
}

function readToken() {
  const env = process.env.PROSKILL_MCP_TOKEN?.trim();
  if (env) return env;
  const file = process.env.PROSKILL_MCP_TOKEN_FILE ?? join(homedir(), ".config/pro-skill/mcp-token");
  if (existsSync(file)) {
    const line = readFileSync(file, "utf8").split("\n")[0]?.trim();
    if (line) return line;
  }
  throw new Error(`--fetch needs a ProSkill MCP token: set PROSKILL_MCP_TOKEN, or put it on the first line of ${file}`);
}

/** The served files and live version of one skill. */
async function fetchSkill(url, token, slug) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "install_skill", arguments: { slug } } }),
  });
  if (!res.ok) throw new Error(`${slug}: install_skill answered HTTP ${res.status}`);
  const result = JSON.parse(toolResultText(await res.text()));
  const version = result.skill?.version ?? result.version ?? result.skill?.currentVersion;
  if (!version) throw new Error(`${slug}: install_skill returned no version`);

  const file = result.files?.find((f) => f.fileName.endsWith(".skill") && f.downloadUrl);
  if (!file) {
    const skillMd = result.skill?.skillMd ?? result.skillMd;
    if (!skillMd) throw new Error(`${slug}: install_skill returned neither a .skill bundle nor a SKILL.md`);
    return { version, files: [{ path: "SKILL.md", bytes: Buffer.from(skillMd, "utf8") }] };
  }
  const dl = await fetch(file.downloadUrl);
  if (!dl.ok) throw new Error(`${slug}: bundle download answered HTTP ${dl.status}`);
  const bytes = Buffer.from(await dl.arrayBuffer());
  if (bytes.length !== file.sizeBytes) throw new Error(`${slug}: got ${bytes.length} bytes, server said ${file.sizeBytes}`);
  if (file.sha256 && sha256Hex(bytes) !== file.sha256) throw new Error(`${slug}: bundle sha256 does not match what the server said`);
  const files = extractBundle(bytes);
  if (!files) throw new Error(`${slug}: the download is not a .skill bundle`);
  return { version, files };
}

function fromLocalBundle(dir, pin) {
  const path = resolve(dir, `${pin.slug}.skill`);
  const files = extractBundle(readFileSync(path));
  if (!files) throw new Error(`${pin.slug}: ${path} is not a .skill bundle`);
  const vfile = resolve(dir, `${pin.slug}.version`);
  const version = existsSync(vfile) ? readFileSync(vfile, "utf8").trim() : pin.version;
  return { version, files };
}

async function main(argv) {
  const manifest = parseManifest(readFileSync(at(MANIFEST_PATH), "utf8"));
  const bundlesIdx = argv.indexOf("--bundles");
  const fetchMode = argv.includes("--fetch");

  if (fetchMode || bundlesIdx >= 0) {
    const url = process.env.PROSKILL_MCP_URL ?? DEFAULT_MCP_URL;
    const token = fetchMode ? readToken() : null;
    for (const pin of manifest.skills) {
      const got = fetchMode ? await fetchSkill(url, token, pin.slug) : fromLocalBundle(argv[bundlesIdx + 1], pin);
      if (!got.files.some((f) => f.path === "SKILL.md")) throw new Error(`${pin.slug}: the bundle holds no SKILL.md at its top`);
      writeTree(at(sourceDir(pin.slug)), got.files);
      pin.version = got.version;
      pin.sourceSha256 = treeHash(got.files);
      console.log(`source ${pin.slug} ${got.version} (${got.files.length} file${got.files.length === 1 ? "" : "s"})`);
    }
    writeFileSync(at(MANIFEST_PATH), `${JSON.stringify(manifest, null, 2)}\n`);
  }

  let changed = 0;
  for (const pin of manifest.skills) {
    const out = buildSkillFiles(readTree(at(sourceDir(pin.slug))), pin);
    const dest = at(join(SKILLS_DIR, pin.slug));
    if (!sameTree(readTree(dest), out)) {
      writeTree(dest, out);
      changed += 1;
      console.log(`wrote ${pin.slug} ${pin.version}`);
    }
  }

  const pinned = new Set(manifest.skills.map((s) => s.slug));
  for (const dir of existsSync(at(SKILLS_DIR)) ? readdirSync(at(SKILLS_DIR)) : []) {
    if (!pinned.has(dir)) {
      rmSync(at(join(SKILLS_DIR, dir)), { recursive: true });
      changed += 1;
      console.log(`removed ${dir} (no longer in the pack)`);
    }
  }
  for (const entry of existsSync(at("sources")) ? readdirSync(at("sources")) : []) {
    if (!pinned.has(entry)) {
      rmSync(at(join("sources", entry)), { recursive: true, force: true });
      console.log(`removed sources/${entry} (no longer in the pack)`);
    }
  }

  if (changed > 0) {
    const plugin = JSON.parse(readFileSync(at(PLUGIN_JSON_PATH), "utf8"));
    plugin.version = bumpPatch(plugin.version);
    writeFileSync(at(PLUGIN_JSON_PATH), `${JSON.stringify(plugin, null, 2)}\n`);
    console.log(`${changed} skill folder(s) changed; plugin version is now ${plugin.version}`);
  } else {
    console.log("every skill already matches its pin; nothing written");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(`build: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
