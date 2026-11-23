// scripts/lib.mjs: the rules scripts/build.mjs applies, kept free of fs and
// network so test/plugin.test.mjs can hold the committed plugin to them.
//
// Each pinned skill is a folder, sources/<slug>/: SKILL.md plus any supporting
// files (scripts, references), exactly as ProSkill serves them in the skill's
// .skill bundle. The build copies every file into plugins/proskill/skills/<slug>/
// and stamps the SKILL.md (scripts/stamp.mjs).
//
// Two targets come out of the same stamped skill files:
//   Claude Code: plugins/proskill/ (committed; the marketplace serves it).
//   ChatGPT:     dist/chatgpt/proskill.zip (built, not committed), from the
//                templates in chatgpt/ plus every skill, for a workspace admin
//                to upload in ChatGPT's Plugin Creator.
import { createHash } from "node:crypto";
import { crc32, deflateRawSync, inflateRawSync } from "node:zlib";
import { readSkillStamp, stampSkillMd } from "./stamp.mjs";

export const MANIFEST_PATH = "starter-pack.json";
export const SOURCES_DIR = "sources";
export const PLUGIN_DIR = "plugins/proskill";
export const PLUGIN_JSON_PATH = `${PLUGIN_DIR}/.claude-plugin/plugin.json`;
export const SKILLS_DIR = `${PLUGIN_DIR}/skills`;
export const DEFAULT_MCP_URL = "https://proskill.ai/api/mcp";
export const CHATGPT_TEMPLATE_DIR = "chatgpt";
export const CHATGPT_ZIP_PATH = "dist/chatgpt/proskill.zip";
/** The one folder every entry of the ChatGPT zip sits in. */
export const CHATGPT_ZIP_ROOT = "proskill";
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
 * With { stripTop: false } every path is returned exactly as stored.
 */
export function extractBundle(buf, { stripTop = true } = {}) {
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
  const nested = stripTop && tops.size === 1 && entries.every((e) => e.path.includes("/"));
  return entries.map((e) => ({ path: nested ? e.path.slice(e.path.indexOf("/") + 1) : e.path, bytes: e.bytes }));
}

/**
 * A zip of the given files, byte for byte the same for the same input: entries
 * sorted by path, deflated, every timestamp 1980-01-01 00:00, regular files
 * with mode 0644. No directory entries. extractBundle reads it back.
 */
export function zipFiles(files) {
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const f of sorted) {
    if (safeRelativePath(f.path) !== f.path) throw new Error(`zip: unsafe path ${JSON.stringify(f.path)}`);
    const name = Buffer.from(f.path, "utf8");
    const raw = Buffer.from(f.bytes);
    const data = deflateRawSync(raw, { level: 9 });
    const crc = crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(0, 10); // time
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4); // made by Unix
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, data);
    centrals.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(sorted.length, 8);
  eocd.writeUInt16LE(sorted.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

/**
 * The ChatGPT plugin's files, under CHATGPT_ZIP_ROOT/: the templates from
 * chatgpt/ (plugin.json gets the Claude plugin's version, so both targets
 * always carry the same number) and skills/<slug>/ for every pinned skill,
 * from the same stamped files as the Claude target.
 */
export function chatgptPluginFiles({ template, version, skills }) {
  const out = [];
  let sawPlugin = false;
  let sawMcp = false;
  for (const f of template) {
    if (f.path.startsWith("skills/")) throw new Error(`${CHATGPT_TEMPLATE_DIR}/${f.path}: skills come from the build, not the template`);
    let bytes = f.bytes;
    if (f.path === "plugin.json") {
      sawPlugin = true;
      const { $schema, name, version: _drop, ...rest } = JSON.parse(f.bytes.toString("utf8"));
      bytes = Buffer.from(`${JSON.stringify({ ...($schema ? { $schema } : {}), name, version, ...rest }, null, 2)}\n`, "utf8");
    }
    if (f.path === "mcp.json") sawMcp = true;
    out.push({ path: `${CHATGPT_ZIP_ROOT}/${f.path}`, bytes });
  }
  if (!sawPlugin || !sawMcp) throw new Error(`${CHATGPT_TEMPLATE_DIR}/ needs plugin.json and mcp.json`);
  for (const { slug, files } of skills) {
    for (const f of files) out.push({ path: `${CHATGPT_ZIP_ROOT}/skills/${slug}/${f.path}`, bytes: f.bytes });
  }
  return out;
}
