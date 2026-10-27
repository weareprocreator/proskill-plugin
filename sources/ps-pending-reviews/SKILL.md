---
name: ps-pending-reviews
description: Show your organization's ProSkill review queue (the skills awaiting review, oldest-waiting first) by calling the connected ProSkill MCP connector. Use this whenever a teammate wants to see what is pending review on ProSkill, asks "show the review queue", "what skills are pending review", "what do I need to review on proskill", "anything waiting on my review", "what's assigned to me for review", "what's in the review backlog", "any skills awaiting approval", or otherwise wants to know which submitted skills still need a reviewer's attention. Reviewer/admin only. The teammate never has to mention the connector or name a raw tool; infer this skill from the intent.
metadata:
  proskill-slug: "ps-pending-reviews"
  proskill-version: "v1.0"
---

<!-- proskill:update-check:start -->
> **ProSkill update check (do this before anything else in this skill).**
> This skill came from ProSkill: slug `ps-pending-reviews`, version `v1.0`.
> 1. Call the ProSkill MCP tool `check_skill_version` with `{ "slug": "ps-pending-reviews", "installedVersion": "v1.0" }`.
> 2. `up_to_date`: continue below.
> 3. `update_available`: tell the user the installed and live versions and what changed, then ask whether to update now. Ask every run, even if they said no before. On no, continue below with this version. On yes, apply the returned version, then follow its instructions instead of the ones below.
> 4. `rolled_back`: do not ask. Apply the returned live version, tell the user this version was rolled back and which version they are now on, then follow the new instructions instead of the ones below. `archived`: the skill was archived on ProSkill; do not run it, and tell the user why (`message`).
> 5. To apply: where you can write to this skill's folder, replace it with the verified bundle from the result; otherwise use the returned `instructions` for this run and give the user the `.skill` file to re-add. Details: the `ps-update` skill.
> 6. If ProSkill cannot be reached, the check fails, or it answers `unknown_skill`, continue below and tell the user the update check could not run.
<!-- proskill:update-check:end -->

# ProSkill pending reviews

## What this does

Lists the skills awaiting review in your organization on ProSkill, longest-waiting first, so a reviewer knows what to look at next. The queue holds skills in review and published skills with a pending update.

## One organization at a time

Your ProSkill connection belongs to one organization, and the queue is that organization's queue only. There is no organization argument and no way to see another organization's queue from here. Common skills (published by the ProSkill platform and read-only in every organization) never appear in the queue.

## When to use

Use when someone wants to see the review backlog: "show the review queue", "what's pending review", "what do I need to review", "anything waiting on me to approve". This is a read-only view. To approve or send a skill back, use the review skill.

## How to do it

1. **Pick the scope.** `list_pending_reviews` takes one optional argument, `assignedToMe` (boolean). By default (`false`) it returns the whole organization queue. If the teammate asks what is waiting on *them* ("my reviews", "assigned to me", "what do I need to review"), pass `assignedToMe: true`. Do not ask for anything else.
2. **Call the connector.** Call `list_pending_reviews` on the connected "ProSkill" MCP connector.
3. **Report in plain English.** The tool returns `count` and a `skills` array. Each entry has `slug`, `url`, `title`, `shortDescription`, `department`, `category`, `currentVersion`, `authorName` and `submittedAt`. Lead with the count, e.g. "3 skills are waiting for review." List them in the order returned (longest-waiting first) and always include the `slug` (so the reviewer can act on it next) and the `url` (to open it in the browser). If `count` is 0, say the queue is empty.
4. **Say who can decide.** An admin can decide on any skill in the queue. A reviewer can decide only on skills they are assigned to; if you showed the whole queue to a reviewer, mention that `assignedToMe: true` narrows it to the ones they can act on.

## Not authorized

`list_pending_reviews` is reviewer/admin only. If the call returns "You do not have permission to perform review actions. Only reviewers and admins can review skills.", do not retry. Tell the teammate the review queue is limited to reviewers and admins of their organization.

## Example

**Teammate:** "what do I need to review on proskill?"

**You:** Call `list_pending_reviews` on the ProSkill connector with `{ assignedToMe: true }`. It returns `count: 2`. Reply:

> 2 skills are waiting for your review, longest-waiting first:
>
> 1. **PDF Splitter** (`pdf-splitter`): v1.2, Engineering / Utilities. Submitted by Jane Doe on 2026-06-10. "Split a PDF into one file per page." <url>
> 2. **Invoice Parser** (`invoice-parser`): v0.3, Finance / Data. Submitted by Sam Lee on 2026-06-14. "Extract line items from supplier invoices." <url>
>
> Want me to open one and walk you through it before you approve or send it back?
