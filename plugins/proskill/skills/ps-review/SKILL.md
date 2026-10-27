---
name: ps-review
description: Approve or reject a skill in your organization's ProSkill review queue. Approving publishes it; rejecting sends it back to the author with a required reason. Use this whenever a reviewer wants to act on a pending skill review, with phrasings like "approve the onboarding skill", "reject the changelog skill", "publish the pdf-export skill", "send the deploy skill back to the author", "request changes on the X skill", "sign off on X", "review X", or "decline X and tell them why". Reviewer/admin only. Fires on any approve/reject/publish/send-back intent against a named skill, even when the user never mentions the connector or a tool name.
metadata:
  proskill-slug: "ps-review"
  proskill-version: "v1.0"
---

<!-- proskill:update-check:start -->
> **ProSkill update check (do this before anything else in this skill).**
> This skill came from ProSkill: slug `ps-review`, version `v1.0`.
> 1. Call the ProSkill MCP tool `check_skill_version` with `{ "slug": "ps-review", "installedVersion": "v1.0" }`.
> 2. `up_to_date`: continue below.
> 3. `update_available`: tell the user the installed and live versions and what changed, then ask whether to update now. Ask every run, even if they said no before. On no, continue below with this version. On yes, apply the returned version, then follow its instructions instead of the ones below.
> 4. `rolled_back`: do not ask. Apply the returned live version, tell the user this version was rolled back and which version they are now on, then follow the new instructions instead of the ones below. `archived`: the skill was archived on ProSkill; do not run it, and tell the user why (`message`).
> 5. To apply: where you can write to this skill's folder, replace it with the verified bundle from the result; otherwise use the returned `instructions` for this run and give the user the `.skill` file to re-add. Details: the `ps-update` skill.
> 6. If ProSkill cannot be reached, the check fails, or it answers `unknown_skill`, continue below and tell the user the update check could not run.
<!-- proskill:update-check:end -->

# ps-review

## What this does

Acts on a skill awaiting review in your organization on ProSkill: **approve** it (which publishes it) or **reject** it (which sends it back to the author with a required reason). Before approving, it reads exactly what the approval would publish and shows it to the reviewer. Every call goes to the connected **ProSkill** MCP connector.

## One organization at a time

Your ProSkill connection belongs to one organization, and every review tool acts on that organization's queue only. There is no organization argument.

- You can only review skills of your own organization. A skill from another organization answers exactly like a skill that is not in the queue.
- Common skills (published by the ProSkill platform and read-only in every organization) never appear in the queue and cannot be reviewed.
- Who can decide: an **admin** can approve or reject any skill in the queue. A **reviewer** can decide only on skills they are assigned to review (the author names the reviewers when submitting).

## When to use

Use when a reviewer or admin wants to clear an item from the review queue: approving and publishing a submitted skill (or a pending update to a published one), or rejecting it and returning it to the author for fixes. To just see what is waiting, use the pending-reviews skill instead.

## The tools

All on the ProSkill connector, all reviewer/admin only:

- `get_pending_revision` with `{ slug }`: returns what approving would publish: `slug`, `url`, `kind` (`first_publication` or `replacement`), `versionNumber`, `digest` and `content` (the skill's content fields such as `title`, `problemSolved`, `department`, `category`, `instructions`, `useCases`, `nonUseCases`, `requiredInputs`, `expectedOutputs`, `exampleInput`, `exampleOutput`, `maturityLevel`, `capabilities`).
- `approve_skill` with `{ slug, expectedDigest, note? }`: publishes the skill. `expectedDigest` is **required**: it is the `digest` that `get_pending_revision` returned for the content the reviewer looked at. If the content changed since, the approval is refused.
- `request_changes` with `{ slug, note }`: returns the skill to its author. `note` is required: it is what the author must change. There is no separate "reject" tool. For a published skill with a pending update, only the update is sent back and the published version stays live.
- `list_pending_reviews` with `{ assignedToMe? }`: the queue, if you need to find a slug.

## Steps

1. **Determine the action.** Approve/publish, or reject/send back. If it is genuinely ambiguous, ask which one.
2. **Get the slug.** If the user gave a title or a fuzzy name instead of a slug, call `list_pending_reviews` and match it against the `title` and `slug` fields. If several match, show them and ask. Do not guess.
3. **Read the pending revision.** Call `get_pending_revision` with `{ slug }`. Keep the returned `digest`.
4. **Show the reviewer what they are deciding on.** Summarize the `content` in plain English: what the skill does (`problemSolved`), when to use it and when not to, the key steps in `instructions`, inputs and outputs, and the `versionNumber`.
   - If `kind` is `first_publication`, this is a new skill: present it as a whole.
   - If `kind` is `replacement`, this is an update to a skill that is already published. Call `get_skill` with `{ slug }` to read the live version and point out what changed between the live content and the pending `content`. If `get_skill` cannot read it, present the pending content on its own and say you could not compare it.
   - Offer the `url` so they can open the skill page in the browser.
5. **Get the decision and the note.**
   - For **reject**, the reason is required. If the user has not given one, ask: "What should the author change?" Do not call `request_changes` without it.
   - For **approve**, confirm the reviewer is happy with what you showed them. A note is optional; include it only if the user gave one.
6. **Call the tool.**
   - Approve: `approve_skill` with `{ slug, expectedDigest: <digest from step 3>, note? }`.
   - Reject: `request_changes` with `{ slug, note }`.
7. **Report the result in plain English.** Approve returns `{ approved, slug, url, message }`: "Approved and published **<slug>**." Reject returns `{ changesRequested, slug, url, message }`: "Sent **<slug>** back to the author with your note." Approval does not share the skill with anyone; people still get access through the skill page's Share dialog.

## Errors

Relay errors plainly and do not retry blindly.

- **"You do not have permission to perform review actions. Only reviewers and admins can review skills."**: the user is not a reviewer or admin in this organization. No change was made.
- **"You are not assigned to review this skill. Assign yourself first, or ask an admin to decide."**: the user is a reviewer but not one of this skill's assigned reviewers. No MCP tool assigns reviewers, so suggest asking an admin of the organization to decide.
- **"No skill awaiting review was found with slug "<slug>"."**: the skill is not in this organization's queue (already decided, wrong slug, a common skill, or not in this organization). Offer to list pending reviews. Do not suggest looking in another organization.
- **"The content of this skill changed since you read it. ..."**: the author changed the skill after you read it. Call `get_pending_revision` again, show the reviewer the new content, and approve with the new `digest` only if they still agree.
- **"`expectedDigest` is required: ..."**: you skipped step 3. Read the pending revision first.
- **"This skill cannot be approved yet. ..."**: the automated review checks are failing (for example, no skill file is attached). Tell the reviewer approval is blocked until the author fixes it; requesting changes is the usual next step.

## Example

User: "Approve the pdf-export skill."

1. Action = approve. Slug = `pdf-export`.
2. Call `get_pending_revision` with `{ slug: "pdf-export" }`. It returns `kind: "replacement"`, `versionNumber: "1.3"`, a `digest` and the content.
3. Call `get_skill` with `{ slug: "pdf-export" }` and compare: "Version 1.3 adds a section on password-protected PDFs and a new example. Nothing else changed. Approve?"
4. User: "Yes, note: thanks for the examples."
5. Call `approve_skill` with `{ slug: "pdf-export", expectedDigest: "<digest>", note: "Thanks for the examples." }`.
6. Report: "Approved and published **pdf-export** 1.3."

User: "Reject the changelog skill, the install steps are missing."

1. Call `get_pending_revision` with `{ slug: "changelog" }` and confirm it is the skill they mean.
2. Call `request_changes` with `{ slug: "changelog", note: "Install steps are missing." }`.
3. Report: "Sent **changelog** back to the author with your note: install steps are missing."
