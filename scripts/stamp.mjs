// scripts/stamp.mjs: the identity ProSkill writes into every SKILL.md it serves.
//
// A port of src/lib/skills/skill-md-stamp.ts in weareprocreator/pro-skill
// (identical on main and release/ga as of 2026-10-18, UPDATE_CHECK_REVISION
// "2"). The server stamps every SKILL.md it serves; this repo stamps its plugin
// copies the same way so they behave exactly like an installed copy: call
// check_skill_version first, follow rollbacks, stop on an archive. When the
// server's block text changes, change it here in the same words and bump
// UPDATE_CHECK_REVISION; `npm test` then fails until the plugin is rebuilt.
//
// Two things are written, and nothing else in the author's text changes:
//   1. Frontmatter `metadata.proskill-slug` and `metadata.proskill-version`.
//   2. The "ProSkill update check" block right after the frontmatter.
// Stamping is idempotent: an already stamped file has its block and keys
// replaced, never doubled.

export const UPDATE_CHECK_START = "<!-- proskill:update-check:start -->";
export const UPDATE_CHECK_END = "<!-- proskill:update-check:end -->";
export const UPDATE_CHECK_REVISION = "2";

const SLUG_KEY = "proskill-slug";
const VERSION_KEY = "proskill-version";

/** The update-check block for one skill version, without trailing newline. */
export function updateCheckBlock({ slug, version }, eol = "\n") {
  return [
    UPDATE_CHECK_START,
    "> **ProSkill update check (do this before anything else in this skill).**",
    `> This skill came from ProSkill: slug \`${slug}\`, version \`${version}\`.`,
    `> 1. Call the ProSkill MCP tool \`check_skill_version\` with \`{ "slug": "${slug}", "installedVersion": "${version}" }\`.`,
    "> 2. `up_to_date`: continue below.",
    "> 3. `update_available`: tell the user the installed and live versions and what changed, then ask whether to update now. Ask every run, even if they said no before. On no, continue below with this version. On yes, apply the returned version, then follow its instructions instead of the ones below.",
    "> 4. `rolled_back`: do not ask. Apply the returned live version, tell the user this version was rolled back and which version they are now on, then follow the new instructions instead of the ones below. `archived`: the skill was archived on ProSkill; do not run it, and tell the user why (`message`).",
    "> 5. To apply: where you can write to this skill's folder, replace it with the verified bundle from the result; otherwise use the returned `instructions` for this run and give the user the `.skill` file to re-add. Details: the `ps-update` skill.",
    "> 6. If ProSkill cannot be reached, the check fails, or it answers `unknown_skill`, continue below and tell the user the update check could not run.",
    UPDATE_CHECK_END,
  ].join(eol);
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
