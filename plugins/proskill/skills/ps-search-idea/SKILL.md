---
name: ps-search-idea
description: Search and browse the ProSkill idea board by free text, status, sort, and scope, using the connected "ProSkill" MCP connector. Use this whenever a teammate wants to search the idea board, asks "what ideas exist for X", "has someone already suggested X", "browse proskill ideas", "show me open ideas", "what's been proposed for the design team", "any planned ideas about onboarding", or otherwise wants to find, check, or look through skill ideas before submitting a new one. Trigger even when the user does not mention the connector or name a tool, as long as they are clearly trying to find or browse ideas on the ProSkill idea board.
metadata:
  proskill-slug: "ps-search-idea"
  proskill-version: "v1.1"
---

<!-- proskill:update-check:start -->
> **ProSkill update check (do this before anything else in this skill).**
> This skill came from ProSkill: slug `ps-search-idea`, version `v1.1`.
> 1. Call the ProSkill MCP tool `check_skill_version` with `{ "slug": "ps-search-idea", "installedVersion": "v1.1" }`.
> 2. `up_to_date`: continue below.
> 3. `update_available`: tell the user the installed and live versions and what changed, then ask whether to update now. Ask every run, even if they said no before. On no, continue below with this version. On yes, apply the returned version, then follow its instructions instead of the ones below.
> 4. `rolled_back`: do not ask. Apply the returned live version, tell the user this version was rolled back and which version they are now on, then follow the new instructions instead of the ones below. `archived`: the skill was archived on ProSkill; do not run it, and tell the user why (`message`).
> 5. To apply: where you can write to this skill's folder, replace it with the verified bundle from the result; otherwise use the returned `instructions` for this run and give the user the `.skill` file to re-add. Details: the `ps-update` skill.
> 6. If ProSkill cannot be reached, the check fails, or it answers `unknown_skill`, continue below and tell the user the update check could not run.
<!-- proskill:update-check:end -->

# ps-search-idea

## What this does

Searches and browses the ProSkill idea board by free-text query, status, sort order, and scope, then reports the matching ideas in plain English. Wraps the read-only `search_ideas` tool on the connected **ProSkill** MCP connector. Refer to it by that bare name; never hardcode an `mcp__` prefix.

## One organization at a time

The idea board belongs to the user's organization only. The ProSkill connector is signed in to one organization, `search_ideas` takes no organization argument, and it never returns ideas from any other organization. Within the organization, the user sees ideas shared with everyone, their own ideas, ideas limited to their own department, and ideas shared with them personally (organization admins see every submitted idea). Never suggest looking in another organization.

## When to use

Use this when a teammate wants to find or browse skill ideas: checking whether something has already been proposed, exploring what exists for a topic or department, or scanning ideas by status. It is the natural first step before submitting a new idea, so reach for it whenever someone is looking through the idea board rather than authoring something.

## How to do it

`search_ideas` only needs whatever filters the user implied. Every argument is optional, so do not interrogate the user. Infer filters from their phrasing and call the tool right away.

1. **Map the request to arguments.** All optional:
   - `query`: free text searched over the idea title and problem statement. Pull the topic from what they said (for example, "ideas for onboarding" becomes `query: "onboarding"`). Omit it to browse everything.
   - `status`: one of `submitted`, `under_discussion`, `accepted`, `converted`, `rejected`, `parked`. Map the user's words: "open" or "new" to `submitted`, "being discussed" to `under_discussion`, "planned" or "approved" to `accepted`, "built" or "shipped" to `converted`, "declined" to `rejected`, "on hold" to `parked`. Any other value is ignored and returns every status, so use only these six.
   - `sort`: `top` (default, most upvoted), `newest`, or `discussed`. Use `newest` for "latest" or "recent", `discussed` for "most talked about".
   - `scope`: `department`, `mine`, or both as `"department,mine"`. Omit it (or pass `all`) for the whole board. `department` means the user's own department in this organization: use it for "my team's ideas" or "ideas for my department". `mine` means ideas the user submitted. If the user has no department set, `department` narrows nothing. To look at a department other than the user's own, use `query` instead and filter the results by their `department` field.
   - `page`: 1-based, 20 ideas per page. Default to page 1; only set it if the user asks for more or the next page.

2. **Call `search_ideas` on the ProSkill connector** with the arguments you inferred.

3. **Report the results in plain English.** The tool returns `count`, `page`, and an `ideas` array. Each idea carries `id`, `title`, `problemStatement`, `department`, `status`, `priority`, `upvoteCount`, `commentCount`, `author`, `createdAt`, and `path` (`/ideas/<id>`). For each idea, surface the title, status, upvotes, comments, author, and department, plus a link to open it (`https://proskill.ai` followed by its `path`). If `count` is 0, say nothing matched on their organization's board and suggest loosening the filters or submitting a new idea. If the page is full (20 ideas), mention that more may exist on the next page.

4. **Handle errors gracefully.**
   - "You do not have permission to view ideas.": tell the user plainly that their ProSkill account in this organization cannot view the idea board, and that an organization admin can help. Do not retry or invent results.
   - "Your access token is not bound to an organization...": ask the user to re-authorize the ProSkill connector while signed in to their organization, then try again.

## Example

User: "has anyone already suggested a skill for cleaning up stale chat channels? mostly want recent ones"

- Infer `query: "channel"` and `sort: "newest"`; leave status, scope and page at their defaults.
- Call `search_ideas` on the ProSkill connector.
- Report: "I found 2 matching ideas on your organization's board, newest first: (1) 'Archive stale chat channels', status submitted, 7 upvotes, 3 comments, by Jane Doe (Operations), https://proskill.ai/ideas/3f2a... (2) 'Channel cleanup bot', status accepted, 4 upvotes, by Sam Lee (Design), https://proskill.ai/ideas/9b1c... Want me to open one, upvote it, or submit a new idea?"
