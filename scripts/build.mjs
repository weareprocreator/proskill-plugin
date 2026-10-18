#!/usr/bin/env node
// scripts/build.mjs: build plugins/proskill/skills/ from sources/ and
// starter-pack.json. No dependencies; Node 22 or later.
//
//   npm run build            Stamp every sources/<slug>.SKILL.md into the
//                            plugin. Each source must match its pinned sha256.
//                            No network.
//
//   npm run build -- --fetch Refresh sources/ from ProSkill first: call
//                            install_skill for every pinned slug, take the
//                            served SKILL.md (`skillMd`), or the SKILL.md inside
//                            the signed .skill bundle when the server sends
//                            none, and re-pin version and sha256. Each call
//                            records an install on the token's account.
//                            Server: PROSKILL_MCP_URL (default
//                            https://proskill.ai/api/mcp). Token:
//                            PROSKILL_MCP_TOKEN, or the first line of
//                            PROSKILL_MCP_TOKEN_FILE (default
//                            ~/.config/pro-skill/mcp-token). Mint one in
//                            ProSkill at Settings > Claude Code Access. Never
//                            paste a token into a chat or commit it.
//
// It removes skill folders the manifest no longer lists and bumps the
// plugin's patch version whenever a skill folder changes.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_MCP_URL,
  MANIFEST_PATH,
  PLUGIN_JSON_PATH,
  SKILLS_DIR,
  buildSkillMd,
  bumpPatch,
  extractSkillMd,
  parseManifest,
  sha256Hex,
  sourcePath,
  toolResultText,
} from "./lib.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const at = (p) => join(ROOT, p);

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

/** The served SKILL.md text and live version of one skill. */
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
  const version = result.version ?? result.skill?.currentVersion;
  if (!version) throw new Error(`${slug}: install_skill returned no version`);
  if (result.skillMd) return { version, text: result.skillMd };

  const file = result.files?.find((f) => f.fileName.endsWith(".skill") && f.downloadUrl);
  if (!file) throw new Error(`${slug}: install_skill returned neither a SKILL.md nor a .skill bundle`);
  const dl = await fetch(file.downloadUrl);
  if (!dl.ok) throw new Error(`${slug}: bundle download answered HTTP ${dl.status}`);
  const bytes = Buffer.from(await dl.arrayBuffer());
  if (bytes.length !== file.sizeBytes) throw new Error(`${slug}: got ${bytes.length} bytes, server said ${file.sizeBytes}`);
  if (file.sha256 && sha256Hex(bytes) !== file.sha256) throw new Error(`${slug}: bundle sha256 does not match what the server said`);
  const text = extractSkillMd(bytes);
  if (!text) throw new Error(`${slug}: the bundle holds no readable SKILL.md`);
  return { version, text };
}

async function main(argv) {
  const manifest = parseManifest(readFileSync(at(MANIFEST_PATH), "utf8"));

  if (argv.includes("--fetch")) {
    const url = process.env.PROSKILL_MCP_URL ?? DEFAULT_MCP_URL;
    const token = readToken();
    for (const pin of manifest.skills) {
      const { version, text } = await fetchSkill(url, token, pin.slug);
      const bytes = Buffer.from(text, "utf8");
      mkdirSync(at(dirname(sourcePath(pin.slug))), { recursive: true });
      writeFileSync(at(sourcePath(pin.slug)), bytes);
      pin.version = version;
      pin.sourceSha256 = sha256Hex(bytes);
      console.log(`fetched ${pin.slug} ${version}`);
    }
    writeFileSync(at(MANIFEST_PATH), `${JSON.stringify(manifest, null, 2)}\n`);
  }

  let changed = 0;
  for (const pin of manifest.skills) {
    const out = buildSkillMd(readFileSync(at(sourcePath(pin.slug))), pin);
    const dest = at(join(SKILLS_DIR, pin.slug, "SKILL.md"));
    if (!existsSync(dest) || readFileSync(dest, "utf8") !== out) {
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, out);
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

  if (changed > 0) {
    const plugin = JSON.parse(readFileSync(at(PLUGIN_JSON_PATH), "utf8"));
    plugin.version = bumpPatch(plugin.version);
    writeFileSync(at(PLUGIN_JSON_PATH), `${JSON.stringify(plugin, null, 2)}\n`);
    console.log(`${changed} skill folder(s) changed; plugin version is now ${plugin.version}`);
  } else {
    console.log("every skill already matches its pin; nothing written");
  }
}

main(process.argv.slice(2)).catch((err) => {
  console.error(`build: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
