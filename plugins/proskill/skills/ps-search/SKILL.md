---
name: ps-search
description: Search the ProSkill library in plain English, look up a skill's metadata, and pull its full content plus version history. Use this whenever the user wants to find a skill on ProSkill, asks "is there a proskill skill for X", "search proskill", "find a skill that does Y", "show me the skill called Z", "what does the {slug} skill do", "pull up the full content of that skill", or "what versions does {skill} have" / "show the version history". Trigger on any intent to discover, inspect, or read a published skill from your organization's ProSkill library, even when the user never mentions the connector or a tool name. It wraps the ProSkill MCP connector's discovery tools (search_skills, get_skill, list_skill_versions) so a teammate can just describe what they're looking for.
metadata:
  proskill-slug: "ps-search"
  proskill-version: "v1.1"
---

<!-- proskill:update-check:start -->
> **ProSkill update check (do this before anything else in this skill).**
> This skill came from ProSkill: slug `ps-search`, version `v1.1`.
> 1. Call the ProSkill MCP tool `check_skill_version` with `{ "slug": "ps-search", "installedVersion": "v1.1" }`.
> 2. `up_to_date`: continue below.
> 3. `update_available`: tell the user the installed and live versions and what changed, then ask whether to update now. Ask every run, even if they said no before. On no, continue below with this version. On yes, apply the returned version, then follow its instructions instead of the ones below.
> 4. `rolled_back`: do not ask. Apply the returned live version, tell the user this version was rolled back and which version they are now on, then follow the new instructions instead of the ones below. `archived`: the skill was archived on ProSkill; do not run it, and tell the user why (`message`).
> 5. To apply: where you can write to this skill's folder, replace it with the verified bundle from the result; otherwise use the returned `instructions` for this run and give the user the `.skill` file to re-add. Details: the `ps-update` skill.
> 6. If ProSkill cannot be reached, the check fails, or it answers `unknown_skill`, continue below and tell the user the update check could not run.
<!-- proskill:update-check:end -->

# ps-search

## What this does

Finds and reads published skills in the user's ProSkill library by calling the read-only discovery tools on the connected **ProSkill** MCP connector: `search_skills` (find skills), `get_skill` (full content of one skill), and `list_skill_versions` (its version history). Refer to these tools by their bare names. The connector exposes them with a session-specific prefix, so never hardcode any `mcp__<id>__` prefix: just call the tool that ends in that bare name on the ProSkill connector.

## One organization at a time

The ProSkill connector is signed in to exactly one organization, and every result comes from that organization. No tool takes an organization argument. What the user can see is:

- **Their organization's skills that they have access to.** Inside the organization, a published skill shows up for someone only if they are its author, a collaborator or a reviewer, or the skill has been shared with them (with the whole organization, their department, or them personally). New skills start shared with nobody, so search results are not the whole organization's library. Another published skill in the same organization appears only once it is shared with the user.
- **Common ProSkill skills.** Skills owned by the ProSkill platform are visible to every organization and read-only for all of them. Results mark these with `isCommon: true`.

Never suggest looking in another organization or switching organizations to find a skill.

## When to use

- The user wants to find a skill: "is there a skill for drafting client updates?", "search proskill for anything about invoices", "find me a Figma skill".
- The user names a skill and wants details or its full instructions: "show me the `weekly-report` skill", "what does that skill actually do?".
- The user asks about a skill's history: "what versions does `weekly-report` have?", "who changed it last?".

## Instructions

Pick the right tool from what the user is asking for. Gather only the arguments that tool needs, and infer the rest from the conversation rather than interrogating the user.

### 1. Finding skills: `search_skills`

All arguments are optional. Map the user's request:
- `query`: free text matched against the skill title and short description. Pull the core topic from their phrasing (for example, "anything about invoices" becomes `query: "invoice"`). Omit it to list everything the user can see.
- `category`: only if the user names an exact category.
- `department`: only if the user names an exact department (for example "Design").
- `tags`: an array, only if the user specifies tags. A result must carry ALL listed tags.
- `limit`: default 50, max 200. Only set it if the user wants more or fewer.

The tool returns `{ skills, count }`, ordered by download count. Each skill carries `slug`, `title`, `shortDescription`, `category`, `department`, `tags`, `currentVersion`, `downloadCount`, `isCommon`, `createdAt`, `updatedAt`, `publishedAt`, and a `url` to the skill's page.

Report the matches in plain English: for each, give the **title**, its **slug** (the user needs this to drill in), the short description, category, current version, download count, and the `url`. Say "(common ProSkill skill)" next to any result with `isCommon: true`. If `count` is 0, say nothing matched among the skills available to them, suggest a broader query, and mention that a skill in their organization they have not been given access to will not show up. If the user then wants details on one of them, continue to step 2.

### 2. Skill details and full content: `get_skill`

Requires `slug`. If you only have a title or a fuzzy name, run `search_skills` first to resolve the slug, then call `get_skill` with it. The tool returns `{ skill }` with `slug`, `url`, `isCommon`, `title`, `instructions`, `useCases`, `nonUseCases`, `requiredInputs`, `expectedOutputs`, `currentVersion`, `capabilities`, `tags`, `category`, `department`, `createdAt`, `updatedAt`, `submittedAt`, and `publishedAt`. It only reads published skills.

Report the content plainly: title, slug, instructions, use cases and non-use cases, required inputs, expected outputs, capabilities, tags, category, department, current version, and the `url`. Note when it is a common ProSkill skill.

### 3. Version history: `list_skill_versions`

Requires `slug` (resolve it with `search_skills` first if needed). The tool returns `slug`, `title`, `currentVersion`, `liveVersion`, and a `versions` array, newest first. Each version carries `versionNumber`, `changeSummary`, `reasonForChange`, `authorName`, `createdAt`, `bundleAvailable`, `rolledBack`, `rolledBackReason`, and `live`.

Report each version newest first: version number, change summary, reason for change, author, and date. Call out the **live** version (the one installs get). If `liveVersion` differs from `currentVersion`, explain that the owner rolled the skill back, so installs get the older live version. Mark any version with `rolledBack: true` as rolled back, with its reason.

### Handling errors

- **"Skill not found: {slug}".** The skill is not available in this organization, or it has not been shared with the user. Say exactly that. Offer to run `search_skills` in case the slug is slightly off, and suggest asking the skill's owner or an organization admin to share it with them. Never suggest another organization or switching organizations.
- **Permission errors** such as "You do not have permission to discover skills." or "You do not have permission to view skills.": do not retry or treat it as a bug. Tell the user plainly that their ProSkill account in this organization does not have access, and that an organization admin can help.
- **"Your access token is not bound to an organization..."**: the connector needs to be reconnected. Ask the user to re-authorize the ProSkill connector while signed in to their organization, then try again.

## Example

**User:** "is there a proskill skill for writing client status updates? if so show me what it does."

1. Call `search_skills` with `query: "client status update"`.
2. The top match comes back as `{ title: "Client Status Update", slug: "client-update", currentVersion: "2.1.0", downloadCount: 47, isCommon: false, url: "https://proskill.ai/skills/client-update", ... }`.
3. Call `get_skill` with `slug: "client-update"`.
4. Report: "Found **Client Status Update** (slug `client-update`, v2.1.0, 47 installs, https://proskill.ai/skills/client-update). It does X, use it when Y, it expects Z as input and produces W." Then offer: "Want the version history too?" If yes, call `list_skill_versions` with `slug: "client-update"`.
