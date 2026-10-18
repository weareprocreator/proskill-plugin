---
name: ps-deprecate
description: Deprecate (retire) a skill in your organization on ProSkill by archiving it, so it leaves the library and every installed copy stops running. Admin only. Use this whenever someone wants to deprecate, retire, sunset, archive, recall, phase out or remove a skill on ProSkill, with phrasings like "deprecate the changelog-writer skill", "retire X skill from proskill", "sunset the old onboarding skill", "recall that skill, it's broken", "stop people using that skill", or "take the pdf-extractor skill out of the library". Trigger even when the user names only the skill and never mentions the connector or a raw tool.
metadata:
  proskill-slug: "ps-deprecate"
  proskill-version: "v1.1"
---

<!-- proskill:update-check:start -->
> **ProSkill update check (do this before anything else in this skill).**
> This skill came from ProSkill: slug `ps-deprecate`, version `v1.1`.
> 1. Call the ProSkill MCP tool `check_skill_version` with `{ "slug": "ps-deprecate", "installedVersion": "v1.1" }`.
> 2. `up_to_date`: continue below.
> 3. `update_available`: tell the user the installed and live versions and what changed, then ask whether to update now. Ask every run, even if they said no before. On no, continue below with this version. On yes, apply the returned version, then follow its instructions instead of the ones below.
> 4. `rolled_back`: do not ask. Apply the returned live version, tell the user this version was rolled back and which version they are now on, then follow the new instructions instead of the ones below. `archived`: the skill was archived on ProSkill; do not run it, and tell the user why (`message`).
> 5. To apply: where you can write to this skill's folder, replace it with the verified bundle from the result; otherwise use the returned `instructions` for this run and give the user the `.skill` file to re-add. Details: the `ps-update` skill.
> 6. If ProSkill cannot be reached, the check fails, or it answers `unknown_skill`, continue below and tell the user the update check could not run.
<!-- proskill:update-check:end -->

# ps-deprecate

## What this does

Retires a skill of your organization on ProSkill by archiving it with the `delete_skill` tool on the connected "ProSkill" MCP connector. Archiving is not a hard delete: the skill's content, version history and audit trail are kept. But it is a big step:

- The skill leaves the library and stops being installable.
- Every installed copy is told to stop: when a copy runs, its update check (`check_skill_version`) now answers `archived`, and the copy does not run.
- The author, collaborators, the people it was shared with and everyone who installed it are notified, with your reason if you give one.

There is no separate "deprecate" tool. Retiring a skill on ProSkill means archiving it.

## One organization at a time

Your ProSkill connection belongs to one organization, and `delete_skill` only finds skills owned by that organization. There is no organization argument.

- **Admins only.** Only an admin of your organization can retire a skill.
- **Common skills cannot be retired.** Skills published by the ProSkill platform are read-only in every organization; an organization cannot archive them. If a common skill is the problem, leave feedback on it or report it instead.
- A skill from another organization answers exactly like a missing one. Do not suggest looking elsewhere.

## The tool

`delete_skill` takes:

- `slug` (required): the skill's slug.
- `reason` (optional): why it is being retired. It goes into the notification to the author and every past installer, and installed copies show it when they stop. Always offer to include one.

On success it returns `{ removed: true, slug, message }`.

## Steps

1. **Identify the skill.** You need its `slug`. If the user gave a display name or partial title, call `search_skills` with that text and read the slug from the results. If several plausibly match, show the candidates (title and slug) and ask which one. Do not guess.
2. **Ask for a reason.** "Want to include a reason? It is sent to everyone who installed it." Use their words; skip it if they decline.
3. **Confirm before calling.** This stops every installed copy, so always confirm first, even if the user sounded certain:
   > "Retiring **<title>** (`<slug>`) archives it: it leaves the library, every installed copy stops running, and the author and everyone who installed it are notified. Go ahead?"
   Call the tool only on a clear yes.
4. **Call the tool.** `delete_skill` with `{ slug, reason? }`. Send no other arguments.
5. **Report the result in plain English.** Name the skill, say it was archived, that installed copies will stop and people have been notified, and include the returned `message`.

## Errors

Relay errors plainly and do not retry blindly.

- **"You do not have permission to remove skills. Only admins can."**: only an admin of the organization can retire a skill. Suggest asking one.
- **"Skill not found: <slug>"**: the slug is wrong, the skill is a common skill, or it is not in your organization. Re-check the slug with `search_skills` and confirm with the user. If it is a common skill, explain that organizations cannot retire it.
- **"This is a common skill managed by ProSkill. It is read-only in every organization."**: as above, common skills cannot be retired.
- **"This action is not available for "<title>" right now. ..."**: the skill is most likely already archived.

## Example

**User:** "Can you retire the old pdf-extractor skill? People keep installing it by mistake."

1. Call `search_skills` with `{ query: "pdf-extractor" }`: one match, slug `pdf-extractor`.
2. Ask for a reason. User: "Replaced by pdf-export."
3. Confirm: "Retiring **PDF Extractor** (`pdf-extractor`) archives it: it leaves the library, every installed copy stops running, and everyone who installed it is notified. Go ahead?" User: "Yes."
4. Call `delete_skill` with `{ "slug": "pdf-extractor", "reason": "Replaced by pdf-export." }`.
5. Tool returns `{ "removed": true, "slug": "pdf-extractor", "message": "Skill \"pdf-extractor\" was archived (removed from the library)." }`.
6. Reply: "Done. `pdf-extractor` is archived: it is out of the library, installed copies will stop running and show your reason, and everyone who installed it has been notified."
