---
name: ps-install
description: Install a published ProSkill skill onto this machine by name. It resolves the name to its slug, fetches the skill from the ProSkill MCP connector as a packaged .skill bundle, downloads that bundle to the user's Downloads folder, verifies it, and hands the user a link to open it and add it to their library. Use whenever a teammate wants to pull a skill down locally, with phrasings like "install the X skill from proskill", "grab the X skill", "add X skill locally", "download a named skill from our skill hub", "set up a named skill on my machine", or "get me a skill by name", even when they never mention the connector or a raw tool name. This is the standard way to install one named ProSkill skill locally.
metadata:
  proskill-slug: "ps-install"
  proskill-version: "v2.1"
---

<!-- proskill:update-check:start -->
> **ProSkill update check (do this before anything else in this skill).**
> This skill came from ProSkill: slug `ps-install`, version `v2.1`.
> 1. Call the ProSkill MCP tool `check_skill_version` with `{ "slug": "ps-install", "installedVersion": "v2.1" }`.
> 2. `up_to_date`: continue below.
> 3. `update_available`: tell the user the installed and live versions and what changed, then ask whether to update now. Ask every run, even if they said no before. On no, continue below with this version. On yes, apply the returned version, then follow its instructions instead of the ones below.
> 4. `rolled_back`: do not ask. Apply the returned live version, tell the user this version was rolled back and which version they are now on, then follow the new instructions instead of the ones below. `archived`: the skill was archived on ProSkill; do not run it, and tell the user why (`message`).
> 5. To apply: where you can write to this skill's folder, replace it with the verified bundle from the result; otherwise use the returned `instructions` for this run and give the user the `.skill` file to re-add. Details: the `ps-update` skill.
> 6. If ProSkill cannot be reached, the check fails, or it answers `unknown_skill`, continue below and tell the user the update check could not run.
<!-- proskill:update-check:end -->

# ps-install

## What this does

Installs one published ProSkill skill locally by name. It figures out the skill's slug, calls the ProSkill MCP connector to get the skill, downloads its packaged `.skill` bundle into the user's Downloads folder (verifying it arrived intact), and hands the user a clickable link. The user opens the file and chooses **"Add to library"** to finish installing. The bundle bytes never travel inline through the chat: they always come over a signed download link, which keeps the zip from getting corrupted in transit.

## One organization at a time

The ProSkill connector is signed in to exactly one organization. A user can install their organization's skills that they have access to (as author, collaborator, reviewer, or because the skill was shared with them) plus the common ProSkill skills every organization can see. Another published skill in their organization becomes installable only once it is shared with them. Never suggest another organization or switching organizations to get a skill.

Someone using the ProSkill Claude Code plugin already has the PS Starter Pack, so there is no need to install those skills again.

## When to use

Use when someone wants a single named skill pulled down to their machine ("install the changelog-writer skill from proskill", "grab the pr-reviewer skill locally"). To install the organization's default packs in one go, use `install_default_skills` instead (see below). It works the same way under the hood: one saved `.skill` file plus a link per skill.

## Connector

All tool calls go to the connected **ProSkill** MCP connector. Refer to tools by their bare names (`search_skills`, `install_skill`, `install_default_skills`, `confirm_skill_install`). Do not prefix them with any `mcp__…__` id; the session resolves the connector automatically.

## Steps

1. **Gather the name.** The only thing you need from the user is which skill to install. Take the skill name straight from their request (for example, "the pr-reviewer skill"). Don't ask for a slug or anything else. If they ask for a specific version, note it.

2. **Resolve the name to a slug.** `install_skill` takes a `slug`, not a display name, so first call `search_skills` with the user's name as the `query`.
   - One clear match: use its `slug`.
   - Several plausible matches: list the top candidates (title, a short description, and whether it is a common ProSkill skill) and ask the user which one.
   - No match: tell the user no skill by that name is available to them in this organization (it may not exist, or it may not be shared with them). Offer to search again with a looser term, or suggest asking the skill's owner or an organization admin to share it.

3. **Install it.** Call `install_skill` with the resolved `slug`. Pass `version` (for example `"v1.2"`) only when the user asked for a specific version; otherwise the tool serves the **live** version. It returns `{ skill, files }`:
   - `skill` carries `slug`, `title`, `url`, `instructions` and the rest of the metadata, `isCommon: true` for a common ProSkill skill, plus `version` (the version these files are), `liveVersion`, `latestVersion`, and `skillMd` (the full SKILL.md text as served).
   - Each entry in `files[]` is one of two shapes:
     - **Packaged bundle:** `{ fileName, mimeType, sizeBytes, sha256, downloadUrl }`. This is the `.skill` itself. `downloadUrl` is a short-lived (about 10 minutes) signed HTTPS link that works only for this user. `sha256` can be null for an older bundle.
     - **Inline text file:** `{ fileName, mimeType, sizeBytes, encoding: "utf-8", content }`. Used for small text files. A skill that has no `.skill` bundle at all comes back as a single inline entry named `SKILL.md`.

4. **Download the bundle.** For the packaged `.skill` entry, download it from `downloadUrl` into the user's Downloads folder, keeping the original `fileName` (for example `~/Downloads/<slug>.skill`). **Do not unpack it.** A `.skill` is a zip that the Claude app expands itself; unzipping it here breaks the install.

5. **Verify integrity.** Confirm the downloaded file is exactly right before handing it over:
   - the downloaded byte length equals `sizeBytes`, and
   - the SHA-256 of the downloaded bytes equals `sha256` (when `sha256` is null, check the length only and say so).

   On a mismatch, or if the download fails with a `403` (the signed URL expired), re-call `install_skill` **once** to get a fresh `downloadUrl`, then download and verify again. Do not retry the dead link itself; it will keep failing.

6. **Handle inline files.**
   - Next to a bundle: write each inline entry's `content` to a file with its `fileName` next to the bundle in the Downloads folder.
   - No bundle, only an inline `SKILL.md`: write `content` unchanged to `<slug>/SKILL.md`. In Claude Code, put it at `~/.claude/skills/<slug>/SKILL.md` so it loads as a personal skill. Elsewhere, save it to `~/Downloads/<slug>/SKILL.md` and tell the user how to add it. Keep the text exactly as served, including its frontmatter metadata and the update check block at the top: that is how the installed skill checks for updates.
   - A client that cannot write files can run the skill in context from `skill.skillMd` instead.

7. **Hand over the link.** Give the user a clickable path to the saved bundle (for example `~/Downloads/<slug>.skill`) and tell them to open it and choose **"Add to library"**. Also report the skill title, slug, `version`, and the `url` of its page, so they know exactly what they are adding. If `version` is older than `latestVersion`, explain that the owner made an older version live (or the user asked for that one). This save to Downloads, then "Add to library" flow is the same in chat, Cowork, and Claude Code.

8. **Confirm the install.** After the user says the skill is in their library, call `confirm_skill_install` with the same `slug` and your client name (for example `client: "Claude Code"`). Skip this if the install failed or the user cancelled. Until this call arrives, ProSkill only knows a download link was issued.

## Installing the organization's default packs

When the user wants "the default skills" or "everything my organization recommends", call `install_default_skills` (no arguments). It installs every published skill in the active default packs of the user's organization. It returns `installed` (a count), `skills` (each item is `{ skill, files }`, the same shape as `install_skill`), and `packs` (each with `slug`, `name`, `installed`, and for a withheld pack a `reason` and `message`). Follow steps 4 to 8 for each skill, then tell the user which packs were installed and, for any pack with `installed: false`, relay its `message`. If the result says no default packs are configured, tell the user an organization admin can mark a pack as default.

## Handling errors

- **URL expired (403) or integrity mismatch:** re-call `install_skill` once for a fresh `downloadUrl`, then re-download and re-verify (see step 5). If it still fails, stop and tell the user plainly rather than handing over a file you could not verify.
- **"Skill not found: {slug}":** the skill is not available in this organization, or it has not been shared with the user. Go back to step 2 once in case the slug was wrong. If it still is not found, say so plainly and suggest asking the skill's owner or an organization admin to share it with them. Never suggest another organization or switching organizations.
- **Archived:** "This skill has been archived and can no longer be installed: {slug}" (sometimes with a reason). Relay it, including the reason, and stop.
- **Version problems:** if the requested version does not exist or was rolled back, the error names the live version. Offer to install the live version instead, or call `list_skill_versions` to show what exists.
- **"You do not have permission to install skills.":** do not retry. Tell the user plainly that their ProSkill account in this organization is not allowed to install skills, that this is a permissions limit and not a bug, and that an organization admin can help.
- **"Your access token is not bound to an organization...":** ask the user to re-authorize the ProSkill connector while signed in to their organization, then try again.

## Example

User: "install the changelog-writer skill from proskill"

1. Call `search_skills` with `query: "changelog-writer"`: one match, slug `changelog-writer`.
2. Call `install_skill` with `slug: "changelog-writer"`: returns the skill (with `version: "v3"`) plus a `files[]` holding one packaged bundle (`changelog-writer.skill`, `sizeBytes`, `sha256`, `downloadUrl`).
3. Download `downloadUrl` to `~/Downloads/changelog-writer.skill` without unpacking it.
4. Verify: the byte length matches `sizeBytes` and the SHA-256 matches `sha256`.
5. Report: "Downloaded **Changelog Writer** (slug `changelog-writer`, v3) to `~/Downloads/changelog-writer.skill`. Open that file and choose **Add to library** to install it."
6. Once the user confirms it is in their library, call `confirm_skill_install` with `slug: "changelog-writer"` and `client: "Claude Code"`.
