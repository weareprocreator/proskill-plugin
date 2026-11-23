// scripts/stamp.mjs: the identity ProSkill writes into every SKILL.md it serves.
//
// A port of src/lib/skills/skill-md-stamp.ts in weareprocreator/pro-skill.
// The server stamps every SKILL.md it serves; this repo stamps its plugin
// copies the same way, so a plugin copy carries the same note as an installed
// copy. When the server's note text changes, change it here in the same words
// and bump UPDATE_CHECK_REVISION; `npm test` then fails until the plugin is
// rebuilt.
//
// Revision 3 (this file) is a single informational line. Revision 2 was six
// numbered orders to the assistant, and ChatGPT's safety check refuses to save
// a skill that carries it. Stamping replaces whatever sits between the markers,
// so a source that still carries revision 2 (as served before the server ships
// revision 3) comes out with revision 3 only.
//
// PROVISIONAL: the revision 3 wording below is the text from the plan (D1) that
// passed ChatGPT's save check on 2026-11-23. Port the server's revision 3 byte
// for byte once it lands, and keep the text in updateCheckNote().
//
// Two things are written, and nothing else in the author's text changes:
//   1. Frontmatter `metadata.proskill-slug` and `metadata.proskill-version`.
//   2. The update-check note right after the frontmatter, between the markers.
// Stamping is idempotent: an already stamped file has its block and keys
// replaced, never doubled.

export const UPDATE_CHECK_START = "<!-- proskill:update-check:start -->";
export const UPDATE_CHECK_END = "<!-- proskill:update-check:end -->";
export const UPDATE_CHECK_REVISION = "3";

const SLUG_KEY = "proskill-slug";
const VERSION_KEY = "proskill-version";

/** The informational line inside the block (revision 3, provisional). */
export function updateCheckNote({ slug, version }) {
  return `> This skill comes from ProSkill (slug \`${slug}\`, version \`${version}\`). With the ProSkill connector, \`check_skill_version\` reports whether a newer version exists.`;
}

/** The update-check block for one skill version, without trailing newline. */
export function updateCheckBlock(stamp, eol = "\n") {
  return [UPDATE_CHECK_START, updateCheckNote(stamp), UPDATE_CHECK_END].join(eol);
}

/** Remove a previously stamped block exactly as stampSkillMd inserted it. */
export function stripUpdateCheckBlock(text) {
  const start = text.indexOf(UPDATE_CHECK_START);
  if (start === -1) return text;
  const endMarker = text.indexOf(UPDATE_CHECK_END, start);
  if (endMarker === -1) return text;
  let from = start;
  if (text.slice(0, from).endsWith("\r\n\r\n")) from -= 2;
  else if (text.slice(0, from).endsWith("\n\n")) from -= 1;
  let end = endMarker + UPDATE_CHECK_END.length;
  if (text.startsWith("\r\n", end)) end += 2;
  else if (text.startsWith("\n", end)) end += 1;
  return text.slice(0, from) + text.slice(end);
}

/** YAML double-quoted scalar, enough for slugs and version labels. */
function yamlString(value) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Set the two metadata keys in a frontmatter body, keeping any other key. */
function stampFrontmatterLines(lines, stamp) {
  const out = [...lines];
  const metaIdx = out.findIndex((l) => /^metadata:\s*(\{\s*\})?\s*(#.*)?$/.test(l));
  if (metaIdx === -1) {
    // A non-empty flow map `metadata: {...}` is left alone, as on the server.
    if (out.some((l) => /^metadata:\s*\S/.test(l))) return out;
    return [...out, "metadata:", `  ${SLUG_KEY}: ${yamlString(stamp.slug)}`, `  ${VERSION_KEY}: ${yamlString(stamp.version)}`];
  }
  out[metaIdx] = "metadata:";
  let end = metaIdx + 1;
  while (end < out.length && (/^\s+\S/.test(out[end]) || out[end].trim() === "")) end += 1;
  while (end > metaIdx + 1 && out[end - 1].trim() === "") end -= 1;
  const children = out.slice(metaIdx + 1, end);
  const indent = children.find((l) => l.trim() !== "")?.match(/^\s+/)?.[0] ?? "  ";
  const kept = children.filter((l) => {
    const key = l.trim().split(":")[0]?.trim().replace(/^["']|["']$/g, "");
    return key !== SLUG_KEY && key !== VERSION_KEY;
  });
  return [
    ...out.slice(0, metaIdx + 1),
    `${indent}${SLUG_KEY}: ${yamlString(stamp.slug)}`,
    `${indent}${VERSION_KEY}: ${yamlString(stamp.version)}`,
    ...kept,
    ...out.slice(end),
  ];
}

/** Stamp a SKILL.md with its ProSkill identity and the update-check block. */
export function stampSkillMd(text, stamp) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const bom = text.startsWith("﻿") ? "﻿" : "";
  const body = stripUpdateCheckBlock(bom ? text.slice(1) : text);
  const lines = body.split(eol);
  const closing = lines[0]?.trim() === "---" ? lines.findIndex((l, i) => i > 0 && l.trim() === "---") : -1;
  const head = closing > 0
    ? ["---", ...stampFrontmatterLines(lines.slice(1, closing), stamp), "---"]
    : ["---", ...stampFrontmatterLines([], stamp), "---"];
  const rest = (closing > 0 ? lines.slice(closing + 1) : lines).join(eol);
  return bom + head.join(eol) + eol + eol + updateCheckBlock(stamp, eol) + eol + rest;
}

/** The stamp a file carries, read back. */
export function readSkillStamp(text) {
  const slug = text.match(new RegExp(`^\\s+${SLUG_KEY}:\\s*"?([^"\\r\\n]+)"?\\s*$`, "m"))?.[1];
  const version = text.match(new RegExp(`^\\s+${VERSION_KEY}:\\s*"?([^"\\r\\n]+)"?\\s*$`, "m"))?.[1];
  return { ...(slug ? { slug } : {}), ...(version ? { version } : {}) };
}
