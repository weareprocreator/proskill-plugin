---
name: ps-share
description: >-
  Help a user share a published ProSkill skill with people in their own
  organization, through the Share dialog on the skill's page in the ProSkill web
  app. Use whenever someone wants to share, distribute, send, push, give access
  to, or roll out a skill to other people, with phrasings like "share the
  changelog-writer skill with Jane", "send the pr-reviewer skill to the design
  department", "roll this skill out to the whole org", "give the QA team access
  to skill X", "distribute my skill to engineering", or "make sure everyone has
  the onboarding skill". Also use when the user names people or teams right
  after publishing a skill and wants them to have it. Not for installing a skill
  on THIS machine (that is ps-install) and not for publishing or versioning a
  skill (that is ps-creator).
metadata:
  proskill-slug: "ps-share"
  proskill-version: "v1.0"
---

<!-- proskill:update-check:start -->
> **ProSkill update check (do this before anything else in this skill).**
> This skill came from ProSkill: slug `ps-share`, version `v1.0`.
> 1. Call the ProSkill MCP tool `check_skill_version` with `{ "slug": "ps-share", "installedVersion": "v1.0" }`.
> 2. `up_to_date`: continue below.
> 3. `update_available`: tell the user the installed and live versions and what changed, then ask whether to update now. Ask every run, even if they said no before. On no, continue below with this version. On yes, apply the returned version, then follow its instructions instead of the ones below.
> 4. `rolled_back`: do not ask. Apply the returned live version, tell the user this version was rolled back and which version they are now on, then follow the new instructions instead of the ones below. `archived`: the skill was archived on ProSkill; do not run it, and tell the user why (`message`).
> 5. To apply: where you can write to this skill's folder, replace it with the verified bundle from the result; otherwise use the returned `instructions` for this run and give the user the `.skill` file to re-add. Details: the `ps-update` skill.
> 6. If ProSkill cannot be reached, the check fails, or it answers `unknown_skill`, continue below and tell the user the update check could not run.
<!-- proskill:update-check:end -->

# ps-share

**Changed in this version:** this skill no longer sends skill files or messages to anyone; sharing now happens in the ProSkill web app's Share dialog, and this skill guides the user through it.

## What this does

Sharing a skill on ProSkill means granting people in the user's organization access to it, and the only place to do that is the **Share** dialog on the skill's page in the web app. There is no sharing tool on the connector. This skill:

1. confirms which skill the user means and that it can be shared,
2. explains who can share it and what the choices in the dialog mean,
3. gives the user the link and the exact clicks, and
4. optionally drafts a short note with the link that the **user** sends to colleagues themselves.

It never sends anything on the user's behalf: no files, no chat or email messages, no announcements.

Call the tools on the **ProSkill** connector by their bare names (`search_skills`, `get_skill`, `get_my_draft`). Never hardcode a session-specific tool-name prefix.

## One organization at a time

The connector is signed in to one organization, and a skill can only be shared inside the organization that owns it. Every person, department and "whole organization" in the Share dialog belongs to that organization. There is no way to share a skill with another organization, and this skill never suggests one or suggests switching organization. If the user names someone outside their organization, say that person cannot be given access from here.

## Steps

### 1. Confirm the skill

For each skill the user names (never ask for a slug; resolve it):

1. `search_skills` with the name as the query. One clear match: take its `slug`. Several: list title and short description and ask which. None: go to 2 with the slugified name.
2. `get_skill({ slug })` for the details: `title`, `url`, `currentVersion`, `isCommon`.
3. If neither finds it, try `get_my_draft({ slug })`: it returns skills the user authored or collaborates on in any status.
   - Status `draft`, `in_review` or `changes_requested`: it is not published yet. People can only use it once it is approved, so suggest sharing after approval (ps-creator covers publishing).
   - Nothing at all: the skill is not available in this organization, or has not been shared with the user. Say exactly that. Do not suggest it might exist elsewhere.

`search_skills` only shows what the user can already see, so it is not the whole organization's library.

### 2. Check whether sharing is needed or possible

- **Common skill** (`isCommon: true`): it comes with ProSkill and every member of every organization already sees it. Nobody can share it, and nobody needs to. Tell the user their colleagues can find it by searching ProSkill or ask Claude to install it by name.
- **Who can share:** the skill's author, its collaborators, anyone who was given **Can edit** access to it, and the organization's admins. If the user is none of these, the Share button will not be offered to them: suggest they ask the author (or an admin) to share it.
- **New skills start shared with nobody.** Approval publishes a skill but does not share it, so a freshly approved skill is invisible to colleagues until someone shares it.

### 3. Walk the user through the Share dialog

Give the link and the steps:

1. Open `https://proskill.ai/skills/<slug>` (the site opens the user's current workspace).
2. Choose **Share** on the skill page.
3. Under **Share with**, pick one scope:
   - **Organization**: every member of the organization.
   - **Departments**: one or more departments of the organization. Members of a selected department are included automatically.
   - **Individuals**: specific people, picked from the organization's members.
4. Under **Access level**, pick:
   - **Can view**: they can see and install the skill.
   - **Can edit (collaborator)**: they can also edit it, push new versions and share it further.
5. Confirm. Existing grants are listed in the same dialog, where they can also be removed.

Map the user's words onto these choices for them ("the whole org" is Organization; "the design team" is Departments, Design; "Jane" is Individuals). Recommend **Can view** unless the user says those people should help maintain the skill.

### 4. Optionally draft a note the user sends

If the user wants to tell colleagues, offer a short message **for them to send themselves**, in whatever chat or email they use. For example:

```
I've shared the <Title> skill on ProSkill with you: https://proskill.ai/skills/<slug>
<one-line description>
To install it, open the link and use Copy install prompt or Download, or ask Claude: "install the <title> skill from proskill".
```

Do not send it, post it, or look anyone up to address it.

### 5. Wrap up

Summarize per skill: the link, the scope and access level the user chose (or still needs to choose), and anything that blocked sharing (not published yet, a common skill, the user cannot share it, not found in this organization).

## Example

User: "share the changelog-writer skill with Jane and the whole design team"

1. `search_skills` "changelog-writer" finds slug `changelog-writer`; `get_skill` shows it is published and not common.
2. The user is its author, so they can share it.
3. "Open https://proskill.ai/skills/changelog-writer, choose Share. For Jane: Individuals, pick Jane Doe, Can view. For the design team: Departments, pick Design, Can view. If Jane is in Design, the department grant already covers her."
4. The user asks for a note; draft the three-line message above for them to send.
5. Report: one skill, two grants to make (or one), nothing blocked.
