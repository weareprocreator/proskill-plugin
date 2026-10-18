---
name: ps-feedback
description: Leave typed feedback and an optional 1-5 star rating on a published ProSkill skill, addressed by name. Use this whenever a teammate wants to leave feedback on a ProSkill skill, rate a skill, report a bug in a skill, suggest an improvement, flag a missing use case or a docs problem, comment on output quality, or request a new version, for example "leave feedback on the chai-poll skill", "rate the deep-research skill 4 stars", "report a bug in the git-setup skill", "the X skill keeps producing bad output, log that", or "suggest an improvement to the standup skill". Fires even when the user never says "use the connector" or names a raw tool. Not for submitting new skill ideas (that is the idea board), for problems with the ProSkill product itself (that is ps-report), or for approving or retiring skills (reviewer and admin tools).
metadata:
  proskill-slug: "ps-feedback"
  proskill-version: "v1.1"
---

<!-- proskill:update-check:start -->
> **ProSkill update check (do this before anything else in this skill).**
> This skill came from ProSkill: slug `ps-feedback`, version `v1.1`.
> 1. Call the ProSkill MCP tool `check_skill_version` with `{ "slug": "ps-feedback", "installedVersion": "v1.1" }`.
> 2. `up_to_date`: continue below.
> 3. `update_available`: tell the user the installed and live versions and what changed, then ask whether to update now. Ask every run, even if they said no before. On no, continue below with this version. On yes, apply the returned version, then follow its instructions instead of the ones below.
> 4. `rolled_back`: do not ask. Apply the returned live version, tell the user this version was rolled back and which version they are now on, then follow the new instructions instead of the ones below. `archived`: the skill was archived on ProSkill; do not run it, and tell the user why (`message`).
> 5. To apply: where you can write to this skill's folder, replace it with the verified bundle from the result; otherwise use the returned `instructions` for this run and give the user the `.skill` file to re-add. Details: the `ps-update` skill.
> 6. If ProSkill cannot be reached, the check fails, or it answers `unknown_skill`, continue below and tell the user the update check could not run.
<!-- proskill:update-check:end -->

# ps-feedback

## What this does

Submits feedback (and an optional rating) on a published skill by calling the `submit_feedback` tool on the connected "ProSkill" MCP connector.

## One organization at a time

Your ProSkill connection belongs to one organization. You can leave feedback on:

- **your organization's skills** that you can see. The skill's author and collaborators are notified.
- **common skills** (published by the ProSkill platform and read-only in every organization). Feedback on a common skill **stays inside your organization**: only your colleagues see it, and the skill's author is **not** notified. Say this to the user when the skill is a common one, so they do not expect a reply from its author.

A skill from another organization answers exactly like a missing one. Do not suggest looking for it elsewhere.

## When to use

A teammate wants to say something about a specific published skill: praise, a bug, an improvement idea, a missing use case, a docs gap, a complaint about output quality, or a request for a new version. They name the skill and describe what they want to say.

## What the tool needs

`submit_feedback` takes:

- `slug` (required, string): the skill's slug.
- `type` (required, string): exactly one of `comment`, `bug`, `improvement`, `missing_use_case`, `docs_problem`, `output_quality`, `version_request`.
- `body` (required, string): the feedback text, in the user's own words, lightly cleaned up.
- `rating` (optional, whole number from 1 to 5): include it only if the user gives one.

## Steps

1. **Identify the skill.** Derive the slug from the name (usually the kebab-case name, e.g. "deep research" becomes `deep-research`). If you are not sure, call `search_skills` with the name and read the exact slug from the results.
2. **Classify the `type`** from intent: a bug report is `bug`; "this could be better, add X" is `improvement`; "doesn't handle Y" is `missing_use_case`; a docs or README issue is `docs_problem`; bad or low-quality results is `output_quality`; "please cut a new version" is `version_request`; general praise or a plain note is `comment`. Ask only if it is genuinely ambiguous.
3. **Gather the `body`.** Use what the user said. If they gave a one-liner, use it; do not pad it.
4. **Capture the `rating`** if they mention stars or a score out of 5. Round to a whole number from 1 to 5. Otherwise omit it.
5. **Call `submit_feedback`** with `slug`, `type`, `body`, and `rating` when given.
6. **Report the result in plain English.** On success it returns `{ submitted, slug, url, skillId, type, rating, asUser }`. Confirm what was logged and share the `url` so they can see the feedback on the skill page. If the skill is a common skill, add that the feedback stays in their organization and the skill's author is not notified.

## Handling errors

- **"You do not have permission to submit feedback."**: their account is not allowed to leave feedback. Say so and stop. Do not try another tool.
- **"Skill not found, or you do not have access to it."**: the slug is wrong, the skill is not published, or it is not available in their organization (or not shared with them). Run `search_skills` to find the right slug and try once more; otherwise tell the user you could not find that skill in their organization.
- **A `type` or `rating` error** (for example "`type` must be one of: ..." or "Rating must be between 0.5 and 5, in half-star steps."): fix the value and retry once.

## Example

**User:** "the deep-research skill gave me a report with three dead source links last night, log that as a bug and rate it 2 stars"

**Action:** call `submit_feedback` on the ProSkill connector with
`slug: "deep-research"`, `type: "bug"`, `rating: 2`,
`body: "Report contained three dead source links."`

**Reply:** "Done. Filed a bug on **deep-research** with a 2-star rating. You can see it here: <url>."
