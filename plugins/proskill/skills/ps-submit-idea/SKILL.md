---
name: ps-submit-idea
description: Pitch a new skill idea to your organization's ProSkill idea board. Use whenever the user wants to submit an idea to ProSkill, pitch a skill idea, propose a new skill, add an idea to the board, file a skill idea, or says things like "I have an idea for a skill", "let's put this on the idea board", "submit this to ProSkill", or "suggest a skill for the team", even if they never mention the connector or a tool by name. This skill interviews the user for the five required fields and files the idea via the ProSkill MCP connector.
metadata:
  proskill-slug: "ps-submit-idea"
  proskill-version: "v1.1"
---

<!-- proskill:update-check:start -->
> **ProSkill update check (do this before anything else in this skill).**
> This skill came from ProSkill: slug `ps-submit-idea`, version `v1.1`.
> 1. Call the ProSkill MCP tool `check_skill_version` with `{ "slug": "ps-submit-idea", "installedVersion": "v1.1" }`.
> 2. `up_to_date`: continue below.
> 3. `update_available`: tell the user the installed and live versions and what changed, then ask whether to update now. Ask every run, even if they said no before. On no, continue below with this version. On yes, apply the returned version, then follow its instructions instead of the ones below.
> 4. `rolled_back`: do not ask. Apply the returned live version, tell the user this version was rolled back and which version they are now on, then follow the new instructions instead of the ones below. `archived`: the skill was archived on ProSkill; do not run it, and tell the user why (`message`).
> 5. To apply: where you can write to this skill's folder, replace it with the verified bundle from the result; otherwise use the returned `instructions` for this run and give the user the `.skill` file to re-add. Details: the `ps-update` skill.
> 6. If ProSkill cannot be reached, the check fails, or it answers `unknown_skill`, continue below and tell the user the update check could not run.
<!-- proskill:update-check:end -->

# Pro Submit Idea

## What this does

Files a new skill idea on the user's ProSkill idea board by calling the `submit_idea` tool on the connected **ProSkill** MCP connector. Refer to it by that bare name; never hardcode an `mcp__` prefix.

## One organization at a time

The ProSkill connector is signed in to exactly one organization, and the idea is filed on that organization's board only. `submit_idea` takes no organization argument, and nobody outside the organization can ever see the idea. Department names refer to departments in the user's own organization.

## When to use

Use this whenever someone wants to propose a skill idea for their team: pitching an idea, adding it to the idea board, or filing a proposal before anything gets built. They do not need to mention the connector or name any tool; infer the intent from the request. If they are not sure whether the idea already exists, search the board first (the ps-search-idea skill) so they can upvote an existing idea instead of filing a duplicate.

## Required information

`submit_idea` needs five fields. Gather all five before calling the tool:

- **title**: a short name for the idea
- **problemStatement**: the problem this idea would solve
- **targetUsers**: who would use the resulting skill
- **department**: the department that owns the idea. This is free text naming a department in the user's own organization. There is no fixed list and no tool that lists departments, so ask the user rather than guessing.
- **expectedImpact**: the expected impact if it gets built

Optional fields (offer them, but never block on them):
- **currentWorkaround**: how this is handled today
- **exampleInput** and **exampleOutput**
- **priority**: `low`, `medium`, or `high`
- **visibility**: who can see the idea (see below)

## Who can see the idea (`visibility`)

- Omitted, or `"everyone"`: the whole organization can see it. This is the default.
- A department name (for example `"Design"`): only members of that department in this organization can see it, plus the author and organization admins. The idea's department is then set to that name.
- The name must match the department exactly as it is set up in the organization, including capitalization. A misspelled or unknown department hides the idea from everyone except the author and admins, and the tool will not warn about it.

If the user wants to limit visibility, confirm the exact department name with them. Department names on existing ideas (from `search_ideas` results) show how the organization spells them. When in doubt, leave visibility at "everyone".

## Steps

1. **Pull what you already know from the conversation.** If the user has already described the idea, draft the five required fields from context rather than asking cold, and propose a concise `title`. Draft `targetUsers` from what they said, but ask for `department` unless they named it.

2. **Ask only for what's genuinely missing.** Present your drafted fields and ask the user to confirm or fill the gaps in one tight round, including the department and who should see the idea. Don't interrogate field by field if you can lay them all out at once. Keep `problemStatement` and `expectedImpact` specific; vague entries make weak ideas.

3. **Confirm before filing.** Show the user the final five fields, the visibility, and any optional ones, and get a quick yes. This is a real submission that other people in the organization will see and get notified about, so a moment of confirmation is worth it.

4. **Call `submit_idea` on the ProSkill connector** with the gathered arguments. Pass the optional fields only when you have them.

5. **Report the result in plain English.** On success the tool returns `submitted: true`, `ideaId`, `slug`, `url` (the idea's web page), `path` (like `/ideas/<slug>`), and `asUser` (the account it was filed as). Tell the user the idea is on their organization's board, who can see it, and give them the `url` so they can open it.

## Handling errors

- **"You do not have permission to submit ideas."**: explain plainly that their ProSkill account in this organization is not allowed to file ideas, and that an organization admin can help. Don't retry.
- **Required fields missing** ("`title`, `problemStatement`, `targetUsers`, `department`, and `expectedImpact` are all required.") or **"the submission was rejected as incomplete"**: one of the five required fields was empty. Identify which, ask the user to fill it in, and resubmit.
- **"`priority` must be one of: low, medium, high."**: fix the priority value, or drop it.
- **"`visibility` did not resolve to anyone who could see it"**: ask the user to choose "everyone" or give the exact department name, then resubmit.
- **"Your access token is not bound to an organization..."**: ask the user to re-authorize the ProSkill connector while signed in to their organization, then try again.
- **Connector not connected:** tell the user to connect the ProSkill MCP connector (https://proskill.ai/api/mcp) first, then try again.

## Example

**User:** "I keep manually reformatting client meeting notes into our status-report template. Can we pitch a skill for this?"

You draft the fields, ask which department owns it and who should see it, and the user answers "Design, and everyone can see it". You confirm:
- title: "Auto-format meeting notes into status reports"
- problemStatement: "Designers spend about 20 minutes per client meeting manually reshaping raw notes into the standard status-report template."
- targetUsers: "Design team members who run client meetings"
- department: "Design"
- expectedImpact: "Saves about 20 minutes per meeting and makes status reports consistent across the team."
- visibility: everyone (the whole organization)
- priority: "medium" (optional)

Then call `submit_idea` on the ProSkill connector with those fields and report back:

> Filed it on your organization's idea board, visible to everyone in the organization. Open it at https://proskill.ai/ideas/3f2a... to upvote it or add detail.
