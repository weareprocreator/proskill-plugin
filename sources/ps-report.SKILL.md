---
name: ps-report
description: Report a problem with the ProSkill product from inside a Claude session, with an optional screenshot, or flag a local skill that is not on ProSkill. Use whenever the user wants to "report an issue", "report a bug", "file a bug on ProSkill", "something is broken in ProSkill", "the ProSkill page won't load", "the install failed", "the MCP tool errored", "raise a problem with the skill hub", or otherwise describes a defect, glitch, error or usability problem they hit while using ProSkill (the website, a page, an MCP tool, an install, sign-in, search). Also use when they say "I have a skill that isn't on ProSkill", "this local skill isn't listed", "report an unlisted skill", or the update check answered unknown_skill. Triggers even when the user does not say "skill" but is clearly reporting a ProSkill problem. Not for feedback or ratings on a specific skill's content (use ps-feedback), and not for filing issues in other trackers or repositories.
---

# ps-report: report a ProSkill problem

Turn "something in ProSkill is broken" into a filed report without the user leaving their Claude session. Two tools on the connected "ProSkill" MCP connector, for two different situations:

| Situation | Tool |
|---|---|
| A problem with the ProSkill product itself: a page, the website, an MCP tool, installing, signing in, search | `report_issue` |
| A skill installed on this machine that is not on ProSkill (no ProSkill stamp in its SKILL.md, or `check_skill_version` answered `unknown_skill`) | `report_unlisted_skill` |
| A problem with what a specific published skill does or says | not this skill: use ps-feedback (`submit_feedback`) |

## One organization at a time

Your ProSkill connection belongs to one organization. A report is stored in that organization; `report_issue` reports are routed to the team that runs ProSkill, and `report_unlisted_skill` notifies your organization's admins. There is no organization argument.

## Prerequisite: the ProSkill connector

Both tools live on the ProSkill remote MCP server (`https://proskill.ai/api/mcp`). If `report_issue` is not available, stop and tell the user to connect ProSkill as an MCP connector first (in ProSkill's settings, or by adding the connector in their Claude app). Do not file the report any other way.

## A. Reporting a product problem: `report_issue`

### Arguments

| Arg | Required | Notes |
|---|---|---|
| `title` | yes | Short, specific one-liner. |
| `category` | yes | Free text, e.g. `bug`, `usability`, `data`, `performance`, `auth`. |
| `description` | yes | What happened, what was expected, and repro steps if known. |
| `severity` | yes | Exactly one of `low`, `medium`, `high`. |
| `screenshotSha256` | no | SHA-256 of the screenshot file, 64 lowercase hex characters. Requires the next two. |
| `screenshotSizeBytes` | with a screenshot | Exact byte length of the file. 5 MB maximum. |
| `screenshotMime` | with a screenshot | One of `image/png`, `image/jpeg`, `image/gif`, `image/webp`. SVG is not allowed. |
| `screenshotName` | no | Original file name; defaults to `screenshot`. |

The tool never takes the image itself. Never base64-encode a screenshot or put its bytes in the call.

On success it returns `{ reported: true, issueId, url, severity, screenshotAttached, asUser }`, plus `uploadUrl`, `awaitingScreenshot` and `nextStep` when you declared a screenshot. `screenshotAttached` is `false` until the bytes are uploaded.

### 1. Draft the report

From what the user already said, draft the four required fields yourself; do not interrogate them field by field.

- **title**: a crisp summary of the problem.
- **category**: the closest of `bug`, `usability`, `data`, `performance`, `auth`, or another short word.
- **severity**: `high` = broken, blocked or data affected; `medium` = degraded but workable; `low` = minor or cosmetic. When unsure between two, pick the lower and say so.
- **description**: what happened, what they expected, and any repro steps or error text they gave.

Show the draft in a compact block and let them correct it. Ask a question only if a required field truly cannot be derived.

### 2. Screenshot (optional)

A screenshot needs to be an image **file on disk** that you can read with your tools.

- If the user gave you a file path (or you can see the file), check its type is PNG, JPEG, GIF or WebP and that it is 5 MB or smaller. Compute its SHA-256 and byte size locally, for example `shasum -a 256 <file>` (or `sha256sum <file>`) and `wc -c < <file>`.
- If the image was only pasted into the chat and there is no file you can read, ask once for the file path, or offer to file without it.
- If no screenshot was mentioned, offer once: "Want to attach a screenshot? Give me the file path, or say skip." Never block the report waiting for one.
- If the file is SVG, another unsupported type, or over 5 MB, say it cannot be attached and file without it.

### 3. Submit

Call `report_issue` with the confirmed fields, and the three screenshot fields (plus `screenshotName`) only if you have a valid file.

### 4. Upload the screenshot, if declared

If the result has an `uploadUrl`, POST the raw file to it as multipart form data in the field `file`, for example:

```
curl -F file=@<file> "<uploadUrl>"
```

The URL is short-lived and bound to the hash and size you declared, so upload the same file right away. If the upload fails, tell the user the report was filed without the screenshot.

### 5. Report back

Confirm in one line with the severity and the returned `url`, e.g. "Filed as a `medium` issue: <url>." Mention that the link opens for the people who manage issues in their organization, so they may not be able to open it themselves. If they meant to include a screenshot and it was not uploaded, say so.

### Errors

Relay errors plainly and fix the obvious ones:

- "`severity` must be one of: low, medium, high.": pick a valid severity.
- "`screenshotSizeBytes` exceeds the 5MB limit.": file without the screenshot, or ask for a smaller image.
- "`screenshotMime` must be one of: ...": PNG, JPEG, GIF or WebP only.
- "`screenshotSha256` must be a 64-character lowercase hex SHA-256 digest.": recompute the hash.
- "You do not have permission to report issues.": their account cannot file reports; say so and stop.

## B. Reporting a local skill that is not on ProSkill: `report_unlisted_skill`

Use this when the user has a skill installed on their machine that is not on ProSkill. Send only names and the one-line description, **never the skill's contents**, and do not delete or change the skill.

Arguments:

- `skillName` (required): `name` from the skill's SKILL.md frontmatter, else the folder name.
- `folderName` (required): the folder the skill is installed in.
- `description` (optional): the one-line `description` from its frontmatter.
- `platform` (optional): where it was found, e.g. "Claude Code", "Cursor", "Codex".

Results:

- `{ onProSkill: true, slug, title, message }`: a matching skill exists on ProSkill and the user can install it. Tell them `message` (reinstall it from ProSkill). Nobody is flagged.
- `{ onProSkill: false, reported: true, firstReport, tellUser, message }`: it was recorded and the organization's admins were notified. Show `message` only when `tellUser` is true. Suggest the user upload the skill to ProSkill if it should be shared.

## Guardrails

- **The right tool for the problem.** Product problems go to `report_issue`; unlisted local skills go to `report_unlisted_skill`; feedback on a skill's content goes to ps-feedback. Never substitute email, chat messages or another tracker.
- **Screenshots are optional.** A missing, unsupported or oversized image never blocks a text-only report.
- **Don't over-ask.** Draft from context and confirm.
- **One report per problem.** If the user describes several distinct problems, confirm whether to file them separately, then make one call each.
- **Faithful reporting.** Put what the user actually said in `description`; do not invent repro steps or a severity they did not imply.
