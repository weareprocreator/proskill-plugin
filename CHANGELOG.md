# Changelog

Every release of the ProSkill plugin. Versions follow semver: patch for a skill text change, minor for a new or removed skill or a stamp change, major for an MCP endpoint or auth change. Claude Code and ChatGPT builds of one release always carry the same version and the same skill files.

## 1.1.0 (unreleased)

- **Update-check note, revision 3.** Every SKILL.md now carries one informational line between the update-check markers ("This skill comes from ProSkill (slug, version). With the ProSkill connector, `check_skill_version` reports whether a newer version exists.") instead of the six numbered steps of revision 2. ChatGPT's safety check refuses to save a skill that carries revision 2. Stamping strips any revision 2 block, so sources served before the server change still build clean. The wording matches the server's revision 3 byte for byte (pro-skill PR #1183, not yet merged); it is the text that passed ChatGPT's save check on 2026-11-23.
- **ChatGPT target.** `npm run build` also writes `dist/chatgpt/proskill.zip`: the ProSkill connector at `https://proskill.ai/api/mcp` (streamable HTTP, OAuth with dynamic client registration), the icon, and the same 12 skills at the same version as the Claude Code plugin. A workspace admin uploads it in ChatGPT's Plugin Creator.
- **License.** MIT (`LICENSE`, and `license` in the Claude plugin's `plugin.json`).
- **Release script.** `scripts/release.mjs` with `bump`, `check` (build, `npm test`, `claude plugin validate` in strict mode, CHANGELOG entry) and `tag` (local annotated tag, never pushed).
- **Tests.** Both targets build; the ChatGPT zip is deterministic and its skill list equals `starter-pack.json`; no output carries a revision 2 block; no manifest or config names the retired ProSkill host.
- Known: the served `ps-update` text still has a section for people who used ProSkill's retired host, and its body describes the revision 2 contract. Both change on proskill.ai first, then arrive here with the re-pin.

## 1.0.0 (2026-10-27)

- First release for Claude Code: the ProSkill MCP server over OAuth and the 12 PS Starter Pack skills, pinned in `starter-pack.json` and stamped with the server's update-check block (revision 2).
