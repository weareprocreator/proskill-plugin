// scripts/lib.mjs: the rules scripts/build.mjs applies, kept free of fs and
// network so test/plugin.test.mjs can hold the committed plugin to them.
//
// Each pinned skill is a folder, sources/<slug>/: SKILL.md plus any supporting
// files (scripts, references), exactly as ProSkill serves them in the skill's
// .skill bundle. The build copies every file into plugins/proskill/skills/<slug>/
// and stamps the SKILL.md (scripts/stamp.mjs).
import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { readSkillStamp, stampSkillMd } from "./stamp.mjs";

export const MANIFEST_PATH = "starter-pack.json";
export const SOURCES_DIR = "sources";
export const PLUGIN_DIR = "plugins/proskill";
export const PLUGIN_JSON_PATH = `${PLUGIN_DIR}/.claude-plugin/plugin.json`;
export const SKILLS_DIR = `${PLUGIN_DIR}/skills`;
export const DEFAULT_MCP_URL = "https://proskill.ai/api/mcp";
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_BUNDLE_FILES = 200;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const sourceDir = (slug) => `${SOURCES_DIR}/${slug}`;

export function sha256Hex(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * One hash for a whole skill folder: the sorted relative paths, each with the
 * sha256 of its bytes. Any added, removed, renamed or changed file changes it.
 */
export function treeHash(files) {
  const lines = [...files]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((f) => `${f.path}\t${sha256Hex(f.bytes)}\n`);
  return sha256Hex(Buffer.from(lines.join(""), "utf8"));
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
      throw new Error(`${MANIFEST_PATH}: ${s.slug} needs the 64-hex tree hash of ${sourceDir(s.slug)}/`);
    }
  }
  return raw;
}

/** A relative path that stays inside its folder, with forward slashes. */
export function safeRelativePath(path) {
  const p = path.replace(/\\/g, "/");
  if (!p || p.startsWith("/") || /^[A-Za-z]:/.test(p)) return null;
  const parts = p.split("/");
  if (parts.some((s) => s === "" || s === "." || s === "..")) return null;
  return p;
}

/**
 * The plugin's files for one pin, from its source files. Checks the pinned
 * tree hash and the SKILL.md, then returns the same files with SKILL.md stamped.
 */
export function buildSkillFiles(files, pin) {
  const hash = treeHash(files);
  if (hash !== pin.sourceSha256) {
    throw new Error(`${pin.slug}: ${sourceDir(pin.slug)}/ tree hash ${hash} is not the pinned ${pin.sourceSha256}`);
  }
  const skillMd = files.find((f) => f.path === "SKILL.md");
  if (!skillMd) throw new Error(`${pin.slug}: ${sourceDir(pin.slug)}/ has no SKILL.md`);
  const text = skillMd.bytes.toString("utf8");
  if (!/^﻿?---\r?\n/.test(text)) throw new Error(`${pin.slug}: ${sourceDir(pin.slug)}/SKILL.md has no frontmatter`);
  for (const f of files) {
    if (safeRelativePath(f.path) !== f.path) throw new Error(`${pin.slug}: unsafe path ${JSON.stringify(f.path)}`);
  }
  const stamped = Buffer.from(stampSkillMd(text, { slug: pin.slug, version: pin.version }), "utf8");
  return files.map((f) => (f.path === "SKILL.md" ? { path: f.path, bytes: stamped } : f));
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
 * Every file in a .skill bundle (a zip), relative to the skill folder: one
 * top-level folder is stripped when every entry sits inside it, as ProSkill's
 * packager produces. Stored and deflate entries only, each capped at 1 MB;
 * directory entries, __MACOSX and .DS_Store are skipped; any path that would
 * leave the folder throws. Returns null when the bytes are not a zip.
 */
export function extractBundle(buf) {
  const EOCD = 0x06054b50;
  const CDH = 0x02014b50;
  const LFH = 0x04034b50;
  if (buf.length < 22) return null;
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - (0xffff + 22)); i--) {
    if (buf.readUInt32LE(i) === EOCD) { eocd = i; break; }
  }
  if (eocd === -1) return null;
  const total = buf.readUInt16LE(eocd + 10);
  if (total > MAX_BUNDLE_FILES) throw new Error(`bundle has ${total} entries; the limit is ${MAX_BUNDLE_FILES}`);
  let cd = buf.readUInt32LE(eocd + 16);
  const entries = [];
  for (let n = 0; n < total; n++) {
    if (cd + 46 > buf.length || buf.readUInt32LE(cd) !== CDH) return null;
    const method = buf.readUInt16LE(cd + 10);
    const size = buf.readUInt32LE(cd + 20);
    const unzipped = buf.readUInt32LE(cd + 24);
    const nameLen = buf.readUInt16LE(cd + 28);
    const local = buf.readUInt32LE(cd + 42);
    const name = buf.toString("utf8", cd + 46, cd + 46 + nameLen);
    cd += 46 + nameLen + buf.readUInt16LE(cd + 30) + buf.readUInt16LE(cd + 32);
    if (name.endsWith("/") || name.startsWith("__MACOSX/") || name.split("/").pop() === ".DS_Store") continue;
    if (safeRelativePath(name) === null) throw new Error(`bundle entry ${JSON.stringify(name)} would leave the skill folder`);
    if (unzipped > MAX_FILE_BYTES) throw new Error(`bundle entry ${name} is over 1 MB`);
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== LFH) return null;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    let bytes;
    if (method === 0) bytes = Buffer.from(data);
    else if (method === 8) bytes = inflateRawSync(data, { maxOutputLength: MAX_FILE_BYTES });
    else throw new Error(`bundle entry ${name} uses unsupported compression method ${method}`);
    entries.push({ path: name, bytes });
  }
  if (entries.length === 0) return null;
  const tops = new Set(entries.map((e) => e.path.split("/")[0]));
  const nested = tops.size === 1 && entries.every((e) => e.path.includes("/"));
  return entries.map((e) => ({ path: nested ? e.path.slice(e.path.indexOf("/") + 1) : e.path, bytes: e.bytes }));
}
