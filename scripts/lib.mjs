// scripts/lib.mjs: the rules scripts/build.mjs applies, kept free of fs and
// network so test/plugin.test.mjs can hold the committed plugin to them.
//
// Each pinned skill has a source file, sources/<slug>.SKILL.md: the SKILL.md
// text as ProSkill serves it (or as authored here, before it is published).
// The build stamps it (scripts/stamp.mjs) into plugins/proskill/skills/<slug>/.
import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { readSkillStamp, stampSkillMd } from "./stamp.mjs";

export const MANIFEST_PATH = "starter-pack.json";
export const SOURCES_DIR = "sources";
export const PLUGIN_DIR = "plugins/proskill";
export const PLUGIN_JSON_PATH = `${PLUGIN_DIR}/.claude-plugin/plugin.json`;
export const SKILLS_DIR = `${PLUGIN_DIR}/skills`;
export const DEFAULT_MCP_URL = "https://proskill.ai/api/mcp";
const MAX_SKILL_MD_BYTES = 1024 * 1024;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const sourcePath = (slug) => `${SOURCES_DIR}/${slug}.SKILL.md`;

export function sha256Hex(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

/** Parse and check starter-pack.json; throws with the first problem found. */
export function parseManifest(json) {
  const raw = JSON.parse(json);
  if (typeof raw.pack !== "string" || !Array.isArray(raw.skills) || raw.skills.length === 0) {
    throw new Error(`${MANIFEST_PATH}: needs a "pack" name and a non-empty "skills" list`);
  }
  const seen = new Set();
  for (const s of raw.skills) {
    if (!SLUG.test(s.slug ?? "")) throw new Error(`${MANIFEST_PATH}: bad slug ${JSON.stringify(s.slug)}`);
    if (seen.has(s.slug)) throw new Error(`${MANIFEST_PATH}: ${s.slug} is listed twice`);
    seen.add(s.slug);
    if (!/^v\d/.test(s.version ?? "")) throw new Error(`${MANIFEST_PATH}: ${s.slug} has no version like "v1.2"`);
    if (!/^[0-9a-f]{64}$/.test(s.sourceSha256 ?? "")) {
      throw new Error(`${MANIFEST_PATH}: ${s.slug} needs the 64-hex sha256 of ${sourcePath(s.slug)}`);
    }
  }
  return raw;
}

/** The plugin's SKILL.md for one pin, from its source bytes. */
export function buildSkillMd(source, pin) {
  const sha = sha256Hex(source);
  if (sha !== pin.sourceSha256) {
    throw new Error(`${pin.slug}: ${sourcePath(pin.slug)} sha256 ${sha} is not the pinned ${pin.sourceSha256}`);
  }
  const text = source.toString("utf8");
  if (!/^﻿?---\r?\n/.test(text)) throw new Error(`${pin.slug}: ${sourcePath(pin.slug)} has no frontmatter`);
  return stampSkillMd(text, { slug: pin.slug, version: pin.version });
}

/** Why a committed plugin SKILL.md does not match its pin, or null. */
export function stampProblem(text, pin) {
  const stamp = readSkillStamp(text);
  if (stamp.slug !== pin.slug || stamp.version !== pin.version) {
    return `${pin.slug}: stamped ${stamp.slug ?? "(none)"} ${stamp.version ?? "(none)"}, pinned ${pin.slug} ${pin.version}`;
  }
  if (stampSkillMd(text, { slug: pin.slug, version: pin.version }) !== text) {
    return `${pin.slug}: the update-check block is not the current one; run npm run build`;
  }
  return null;
}

/** "1.4.2" -> "1.4.3". */
export function bumpPatch(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!m) throw new Error(`plugin version ${JSON.stringify(version)} is not MAJOR.MINOR.PATCH`);
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
}

/** The text of an MCP tools/call result, from plain JSON or one SSE frame. */
export function toolResultText(body) {
  const json = body.trimStart().startsWith("{")
    ? body
    : body.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5)).join("");
  const msg = JSON.parse(json);
  if (msg.error) throw new Error(`MCP error: ${msg.error.message ?? "unknown"}`);
  const text = msg.result?.content?.find((c) => c.type === "text")?.text;
  if (text === undefined) throw new Error("MCP result carried no text content");
  if (msg.result?.isError) throw new Error(text);
  return text;
}

/**
 * The SKILL.md inside a .skill bundle (a zip), or null. Stored and deflate
 * entries only, never inflated past 1 MB: a port of extractSkillMd in
 * pro-skill's src/lib/files/zip.ts.
 */
export function extractSkillMd(buf) {
  const EOCD = 0x06054b50;
  const CDH = 0x02014b50;
  if (buf.length < 22) return null;
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - (0xffff + 22)); i--) {
    if (buf.readUInt32LE(i) === EOCD) { eocd = i; break; }
  }
  if (eocd === -1) return null;
  let cd = buf.readUInt32LE(eocd + 16);
  for (let n = 0, total = buf.readUInt16LE(eocd + 10); n < total; n++) {
    if (cd + 46 > buf.length || buf.readUInt32LE(cd) !== CDH) return null;
    const method = buf.readUInt16LE(cd + 10);
    const size = buf.readUInt32LE(cd + 20);
    const unzipped = buf.readUInt32LE(cd + 24);
    const nameLen = buf.readUInt16LE(cd + 28);
    const local = buf.readUInt32LE(cd + 42);
    const name = buf.toString("utf8", cd + 46, cd + 46 + nameLen);
    if (name.split("/").pop() === "SKILL.md") {
      if (unzipped > MAX_SKILL_MD_BYTES || local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) return null;
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + size);
      if (method === 0) return data.toString("utf8");
      if (method === 8) {
        try { return inflateRawSync(data, { maxOutputLength: MAX_SKILL_MD_BYTES }).toString("utf8"); } catch { return null; }
      }
      return null;
    }
    cd += 46 + nameLen + buf.readUInt16LE(cd + 30) + buf.readUInt16LE(cd + 32);
  }
  return null;
}
