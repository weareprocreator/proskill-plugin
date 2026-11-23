---
name: ps-submit-idea
description: Pitch a new skill idea to your organization's ProSkill idea board. Use whenever the user wants to submit an idea to ProSkill, pitch a skill idea, propose a new skill, add an idea to the board, file a skill idea, or says things like "I have an idea for a skill", "let's put this on the idea board", "submit this to ProSkill", or "suggest a skill for the team", even if they never mention the connector or a tool by name. This skill interviews the user for the three required fields and files the idea via the ProSkill MCP connector.
metadata:
  proskill-slug: "ps-submit-idea"
  proskill-version: "v1.0"
---

<!-- proskill:update-check:start -->
> This skill comes from ProSkill (slug `ps-submit-idea`, version `v1.0`). With the ProSkill connector, `check_skill_version` reports whether a newer version exists.
<!-- proskill:update-check:end -->

# Pro Submit Idea

## What this does

Files a new skill idea on the user's ProSkill idea board by calling the `submit_idea` tool on the connected **ProSkill** MCP connector. Refer to it by that bare name; never hardcode an `mcp__` prefix.

## One organization at a time

The ProSkill connector is signed in to exactly one organization, and the idea is filed on that organization's board only. `submit_idea` takes no organization argument, and nobody outside the organization can ever see the idea. Department names refer to departments in the user's own organization.

## When to use

Use this whenever someone wants to propose a skill idea for their team: pitching an idea, adding it to the idea board, or filing a proposal before anything gets built. They do not need to mention the connector or name any tool; infer the intent from the request. If they are not sure whether the idea already exists, search the board first (the ps-search-idea skill) so they can upvote an existing idea instead of filing a duplicate.

## Required information

`submit_idea` needs three fields. Gather all three before calling the tool:

- **title**: a short name for the idea
- **problemStatement**: the problem this idea would solve
- **department**: the department that owns the idea: one of your organization's departments, or "General" (always accepted). Ask the user rather than guessing; if the name is wrong, the tool refuses it and lists the valid ones.

Optional fields (offer them, but never block on them):
- **expectedImpact**: the expected impact if it gets built
- **currentWorkaround**: how this is handled today
- **exampleInput** and **exampleOutput**
- **priority**: `low`, `medium`, or `high`
- **visibility**: who can see the idea (see below)

## Who can see the idea (`visibility`)

- Omitted, or `"everyone"`: the whole organization can see it. This is the default.
- A department name (for example `"Design"`): only members of that department in this organization can see it, plus the author and organization admins. The idea's department is then set to that name.
- The name must be one of the organization's departments. An unknown one is refused with the list of valid departments, and nothing is created.

If the user wants to limit visibility, confirm the exact department name with them. Department names on existing ideas (from `search_ideas` results) show how the organization spells them. When in doubt, leave visibility at "everyone".

## Steps

1. **Pull what you already know from the conversation.** If the user has already described the idea, draft the three required fields (and `expectedImpact` if they described one) from context rather than asking cold, and propose a concise `title`. Ask for `department` unless they named it.

2. **Ask only for what's genuinely missing.** Present your drafted fields and ask the user to confirm or fill the gaps in one tight round, including the department and who should see the idea. Don't interrogate field by field if you can lay them all out at once. Keep `problemStatement` and `expectedImpact` specific; vague entries make weak ideas.

3. **Confirm before filing.** Show the user the final fields, the visibility, and any optional ones, and get a quick yes. This is a real submission that other people in the organization will see and get notified about, so a moment of confirmation is worth it.

4. **Call `submit_idea` on the ProSkill connector** with the gathered arguments. Pass the optional fields only when you have them.

5. **Report the result in plain English.** On success the tool returns `submitted: true`, `ideaId`, `slug`, `url` (the idea's web page), `path` (like `/ideas/<slug>`), and `asUser` (the account it was filed as). Tell the user the idea is on their organization's board, who can see it, and give them the `url` so they can open it.

## Handling errors

- **"You do not have permission to submit ideas."**: explain plainly that their ProSkill account in this organization is not allowed to file ideas, and that an organization admin can help. Don't retry.
- **Required fields missing** ("`title`, `problemStatement` and `department` are all required.") or **"the submission was rejected as incomplete"**: one of the three required fields was empty. Identify which, ask the user to fill it in, and resubmit.
- **"Idea was not created: `department` (and a department passed as `visibility`) must be one of: ..."**: pick one of the listed names with the user and resubmit.
- **"`priority` must be one of: low, medium, high."**: fix the priority value, or drop it.
- **"`visibility` did not resolve to anyone who could see it"**: ask the user to choose "everyone" or give the exact department name, then resubmit.
- **"Your access token is not bound to an organization..."**: ask the user to re-authorize the ProSkill connector while signed in to their organization, then try again.
- **Connector not connected:** tell the user to connect the ProSkill MCP connector (https://proskill.ai/api/mcp) first, then try again.

## Example

**User:** "I keep manually reformatting client meeting notes into our status-report template. Can we pitch a skill for this?"

You draft the fields, ask which department owns it and who should see it, and the user answers "Design, and everyone can see it". You confirm:
- title: "Auto-format meeting notes into status reports"
- problemStatement: "Designers spend about 20 minutes per client meeting manually reshaping raw notes into the standard status-report template."
- department: "Design"
- expectedImpact: "Saves about 20 minutes per meeting and makes status reports consistent across the team."
- visibility: everyone (the whole organization)
- priority: "medium" (optional)

Then call `submit_idea` on the ProSkill connector with those fields and report back:

> Filed it on your organization's idea board, visible to everyone in the organization. Open it at https://proskill.ai/ideas/3f2a... to upvote it or add detail.
