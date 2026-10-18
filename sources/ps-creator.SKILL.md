---
name: ps-creator
description: Publish a Claude Code skill to your organization on the ProSkill platform, or push a new version of one that already exists there. Use whenever the user wants to publish, upload, ship, or submit a skill to ProSkill, push or release a new version of a skill, update or bump an existing ProSkill skill, or get a local SKILL.md folder onto their organization's skill hub. Triggers on phrasings like "publish my skill to proskill", "upload this skill", "push a new version of the X skill", "update my proskill skill", "submit this skill for review", "release v2 of X". The user never has to name a raw tool or say "use the connector": this skill detects whether the skill already exists and routes to creating it or versioning it automatically.
---

# ps-creator

## What this does

Gets a local skill onto **ProSkill**, inside the user's organization. It works out whether the skill already exists (by slug) and either creates it or publishes a new version, so one request handles both "publish" and "update".

A **new skill** takes three moves:

1. **Register metadata** with `upload_skill`. It never carries file bytes. You pass the bundle's SHA-256 and exact byte size, and the server returns a signed `uploadUrl` bound to exactly that hash and size.
2. **Upload the bytes** to that `uploadUrl` over HTTPS multipart. The server checks size, hash and that the payload is a zip containing a `SKILL.md`, then scans the SKILL.md and returns the verdict.
3. **Submit for review** with `submit_skill_for_review`, naming at least one reviewer. `upload_skill` never submits on its own, even with `submitForReview: true`.

A **new version** uses `update_skill` instead of `upload_skill` (same hash, size and `uploadUrl` pattern), and what happens after the upload depends on the skill's status (step 2).

Call the tools on the **ProSkill** connector by their bare names: `search_skills`, `get_skill`, `get_my_draft`, `upload_skill`, `update_skill`, `submit_skill_for_review`. Never hardcode a session-specific tool-name prefix.

## One organization at a time

The connector is signed in to exactly one organization, and everything this skill does happens there:

- The skill is created in that organization and is visible only inside it.
- Collaborators and reviewers must be **active members of that organization**. The server rejects anyone else, and so must you: never name, suggest or retry with a person from another organization.
- A slug that is not found means "not in your organization, or not shared with you". Never treat it as a hint that the skill lives somewhere else, and never suggest switching organization to get around an error.

## When to use

Use when the user points at a local skill folder (a `SKILL.md` plus any supporting files) and wants it on ProSkill, or wants to ship changes to a skill they already published there. If they are still writing or improving the SKILL.md itself, that is `skill-creator`'s job; come back here once it is ready.

## Steps

### 1. Locate and read the skill

Find the folder the user means (ask only if ambiguous). Read its `SKILL.md` and list the rest of the folder. From the frontmatter and body, infer:

- **title**: from `name:` or the folder name.
- **shortDescription**: one line, from the `description:` frontmatter.
- as much as you can of the other fields in step 6a.

Note whether it is a single-file skill or has extra files (`references/`, `scripts/`, `assets/`, other `.md` files). Packaging is the same either way, but every file must end up in the bundle.

### 2. Decide create or update

Compute the slug the way the platform does: lowercase the title and replace each run of non-alphanumeric characters with a hyphen.

1. Call `get_my_draft({ slug })`. It returns a skill only when the user is its author or a collaborator, in any status. If it returns one, this is an **update**: note `status`, `currentVersion`, `publishedAt` and `awaitingBundle`.
2. If not, call `get_skill({ slug })` (published skills only) and `search_skills` with the title.
   - Found with `isCommon: true`: it is a common skill, owned by the ProSkill platform and read-only for every organization. The user cannot version it. Suggest a different title for their own skill.
   - Found otherwise: it belongs to someone else in the organization, so the user cannot version it. Offer a different title, or suggest they ask the author to add them as a collaborator in the web app.
   - Not found: this is a **create**.

State the decision in one line before acting ("This skill isn't on ProSkill yet, I'll publish it" or "Found `slug` at v1.2, I'll push a new version").

For an **update**, the status decides the path:

| Status | What happens |
|:-|:-|
| `draft` (never published) | `update_skill` with the new bundle replaces the draft's file. Then submit with `submit_skill_for_review` (step 8). |
| `in_review` (never published) | Stop. The bundle cannot change until the review is decided. |
| `changes_requested` | `update_skill` with the new bundle works. Resubmitting happens in the web app (`submit_skill_for_review` only takes drafts): send the user to `https://proskill.ai/skills/<slug>`. |
| published (`publishedAt` set) | `update_skill` with the new bundle holds the new bytes with a pending update. People keep getting the previous version until a reviewer or admin approves the update in the organization's review queue. Do not call `submit_skill_for_review`. |
| `archived` | Stop. An archived skill cannot take a new bundle. |

### 3. Pre-flight the SKILL.md

The platform scans the SKILL.md inside the bundle when it lands and again at submit. Blockers keep the skill in drafts, so check locally first:

- **Structure:** the body needs real markdown structure (a heading, a bullet or a numbered step) and at least 80 characters. A bare paragraph fails.
- **Secrets:** search the whole folder for anything that looks like a credential: cloud access keys, bearer tokens, private-key headers, `api_key = "..."` or `password = "..."` assignments, `.env` files. A secret is a critical finding that blocks submission. Tell the user exactly what and where, and have them remove it before packaging.
- **Advisories:** prompt-injection phrasing ("ignore previous instructions", "bypass safety") and piping a download straight into a shell do not block, but mention them so the reviewer's flags are not a surprise.

Fix anything critical with the user before step 4. Never disguise flagged content to get past the scan.

### 4. Package the bundle

The bundle is a plain zip of the skill folder with the extension `.skill`: **one top-level folder that contains `SKILL.md`** and every supporting file. No other tool or skill is needed. Run it from the folder's parent so the folder itself is the top level, and build into a fresh empty directory so an old bundle is never appended to:

```bash
skill_dir="/path/to/my-skill"        # the folder that holds SKILL.md
out="$(mktemp -d)"
(cd "$(dirname "$skill_dir")" && zip -r -X "$out/<slug>.skill" "$(basename "$skill_dir")" -x '*.DS_Store' '*/.git/*' '*/__MACOSX/*')
unzip -l "$out/<slug>.skill"         # every path starts with my-skill/, and my-skill/SKILL.md is listed
```

If `zip` is not installed, `python3 -m zipfile -c "$out/<slug>.skill" my-skill` (run from the parent folder) builds the same layout; check that no `.DS_Store` or `.git` files went in.

The bundle must be under 10 MB, and the SKILL.md under 1 MB once unzipped.

### 5. Compute the integrity values

From the finished bundle:

```bash
shasum -a 256 "$out/<slug>.skill" | cut -d' ' -f1   # bundleSha256 (64 lowercase hex characters)
wc -c < "$out/<slug>.skill" | tr -d ' '             # bundleSizeBytes (exact byte count)
```

The `uploadUrl` is bound to these exact values. If the bundle changes at all, package and hash it again.

### 6a. Create: call `upload_skill`

`upload_skill` is metadata-only: never send file bytes and never base64-encode anything.

- **Required text** (non-empty strings): `title`, `shortDescription`, `problemSolved`, `department` (the owning department in the user's organization, free text, for example "Design"), `category`, `instructions`, `useCases`, `requiredInputs`, `expectedOutputs`. `instructions` is a **short prose description of the skill, at most 1024 characters**, not the SKILL.md body: the server reads the full SKILL.md from the bundle. Draft it from the frontmatter `description` plus a sentence on how the skill works.
- **Required integrity:** `bundleSha256`, `bundleSizeBytes` (step 5).
- **Optional:** `nonUseCases`, `exampleInput`, `exampleOutput`, `tags` (array of strings), `maturityLevel` (`experimental` | `usable` | `reliable` | `recommended` | `core_workflow`, default `experimental`), and `collaborators` (see "People" below).
- **Do not send `reviewers` here.** Reviewers are chosen at submit time (step 8). Leave `submitForReview` out; it never submits.

Ask only for what you cannot infer. Every missing or malformed field comes back in one error; fix them all and call again (nothing was created).

The answer carries `skillId`, `slug`, `currentVersion`, `status: "draft"`, `awaitingBundle: true` and the `uploadUrl`. Go to step 7.

If it answers that the slug already exists, do not create a variant by hand: if the message names the existing skill and it is the user's own, switch to the update path; if it says "A skill with this slug already exists in your organization", the user cannot see that skill, so pick a different title.

### 6b. Update: call `update_skill`

Pass `slug` plus:

- `changeSummary` (required): one line on what changed. Draft it from the diff and confirm it with the user.
- `versionBump` (required): `patch` (typos, wording), `minor` (new behavior or sections) or `major` (a rewrite or breaking change). State your pick and let the user override it.
- `bundleSha256` and `bundleSizeBytes` together, for a new bundle. For a listing-text-only change, pass `metadataOnly: true` instead; without one or the other the call is refused.
- Only the metadata fields that changed. `tags` replaces the whole list, so include the existing tags you want to keep. Optional `reasonForChange`.

**`update_skill` takes no people fields.** Any `collaborators` or `reviewers` you send are ignored. To change who collaborates on the skill, the user does it in the web app on the skill page.

The answer carries `bundleUpdated` and, with a bundle, the `uploadUrl`. On a published skill it also says `heldForReview: true`: the bundle and every content field wait for approval (only `tags` and `shortDescription` change at once), and the new version number takes effect when the update is approved. On a skill that was never published, the version number does not move. Go to step 7, or straight to step 9 for a `metadataOnly` change.

### 7. Upload the bytes and read the scan

POST the bundle to the `uploadUrl` as multipart, field `file`, soon after you get it (the link is valid for 15 minutes):

```bash
curl -sS -w '\nHTTP %{http_code}\n' -F "file=@$out/<slug>.skill" "<uploadUrl>"
```

- **HTTP 400** names the problem: size or hash mismatch (the bundle changed after hashing, so redo steps 4 and 5 and register again), "not a valid .skill bundle" (no `SKILL.md` in the zip), over 10 MB, or the SKILL.md too large.
- **HTTP 403** "Upload token expired" (or invalid): get a fresh link. For a skill that was never published, call `update_skill` on the same slug with the same `bundleSha256`, `bundleSizeBytes`, a `changeSummary` such as "Upload bundle" and `versionBump: "patch"`; on a draft this only mints a new link. For a published skill, repeat step 6b.
- **HTTP 409**: the skill is in review or archived, so it cannot take a file now. Report it.
- **HTTP 201 or 422** carry a `scan` object `{ passed, blockers, advisories, message }` (422 means the scan failed; the file is stored, but the skill cannot be submitted or approved until it passes):
  - `passed: true`: say "Security scan passed" and mention any `advisories` in one line.
  - `passed: false`: stop. Relay every entry in `blockers` to the user as written. Help fix them, then redo steps 4 to 7 (new bundle, new hash, new link).
  - On a published skill the answer also has a `staged` object (`versionNumber`, `fileName`) and the message says the published version is unchanged until a reviewer approves the update.

### 8. Submit for review (new skills and drafts only)

`submit_skill_for_review({ slug, reviewers })` moves a draft with a verified bundle into `in_review`. It works on **drafts only**: a `changes_requested` skill is resubmitted in the web app, and a published skill's update is already in the review queue after step 7.

`reviewers` is **required on every call, at least one**, chosen fresh for this submission. Never reuse reviewers from an earlier submission or from `upload_skill`; ask the user now (see "People" below). Recommend someone who holds the **reviewer** or **admin** role in the organization: only they can approve, an admin any skill and a reviewer only a skill they are assigned to. The user may name themselves.

If any reviewer fails to resolve, nothing is submitted (see "People").

If the scan gate blocks the submit, the error lists every blocker. Relay the list as written, explain the skill is saved as a draft, fix the issues together, and redo from step 4 (a changed SKILL.md means a new bundle, hash and link). Never retry the submit unchanged, and never reword content just to dodge a finding.

### 9. Report and verify

Call `get_my_draft({ slug })` (`get_skill` only reads published skills) and confirm: `awaitingBundle` is false, `bundle.sha256` matches your hash, `status` and `currentVersion` are what you expect, and `reviewers` lists the people you assigned. If anything is off, say so plainly and redo the failed step rather than reporting success.

Then report in plain English: the slug, the status (`in_review`, `draft`, or published with a pending update), the version, the collaborators and reviewers, and the skill's page `https://proskill.ai/skills/<slug>`.

**Sharing:** tell the user that a new skill is **shared with nobody yet**, and approval does not share it. Once it is published, they (as author or collaborator) share it from the skill page: open `https://proskill.ai/skills/<slug>`, choose **Share**, pick **Organization**, **Departments** or **Individuals**, and set the access level to **Can view** or **Can edit (collaborator)**. The `ps-share-skill` skill walks them through it.

## People

Only two calls take people, both as `[{ "name": "...", "email": "..." }]`:

- `upload_skill`: `collaborators` (optional). Collaborators can co-edit and push new versions.
- `submit_skill_for_review`: `reviewers` (required, at least one, fresh each time).

There is no directory or member lookup. People come **only from the user**: ask for each person's **name and email exactly as they appear in ProSkill** (their display name on their profile). Never guess an email, build one from a name, or fill one in from memory or another tool. Confirm the final lists in one line before the call ("Collaborators: Jane Doe <jane@example.com>. Reviewer: Sam Lee <sam@example.com>. Go ahead?").

The server matches each email (case-insensitive) against the **active members of the user's organization** and checks the name against that member's display name. When any entry fails, nothing is created or submitted, and the error lists every failing entry. Relay these as written:

- `"<email>" is not an active member of your organization.` The person is not in this organization (no account, a former member, or someone outside it; the server deliberately does not say which). Ask the user for a colleague who is a member here. Never retry with that person, and never speculate about where they might have an account.
- `Name does not match for "<email>": you wrote "<x>", but that member is "<real>".` Show the user the name ProSkill has, and ask them to confirm that "<real>" is the person they meant. Retry with that exact name only after they say yes.

## Errors and permissions

- **"You do not have permission to author skills."** Do not retry. Tell the user an admin of their organization can give them a role that can author.
- **"Skill not found: <slug>"** from `update_skill` or `submit_skill_for_review`: the skill is not in this organization or the user cannot edit it. Re-check step 2; never look for it elsewhere.
- **"You cannot edit this skill."**: the user is not the author or a collaborator. The author can add them as a collaborator in the web app.
- **"Your access token is not bound to an organization..."**: the connector needs to be re-authorized (sign in again), then retry.

## Example

**User:** "Publish my `standup-notes` skill to proskill, it's in `./.claude/skills/standup-notes`."

1. Read `./.claude/skills/standup-notes/SKILL.md`; slug `standup-notes`.
2. `get_my_draft` finds nothing; `get_skill` and `search_skills` find nothing. "Not on ProSkill yet, publishing it."
3. Pre-flight: structured body, no secrets.
4. From `./.claude/skills`, zip `standup-notes/` into `$out/standup-notes.skill`; `unzip -l` shows `standup-notes/SKILL.md`.
5. `shasum -a 256` and `wc -c` give `bundleSha256` and `bundleSizeBytes`.
6. Ask about collaborators. The user gives "Jane Doe, jane@example.com". `upload_skill` with the inferred fields, `department: "Design"`, `collaborators: [{ name: "Jane Doe", email: "jane@example.com" }]`, the hash and size. It returns `slug`, `status: "draft"`, `awaitingBundle: true`, `uploadUrl`.
7. `curl` the bundle: HTTP 201, "Security scan passed".
8. Ask who should review; suggest someone with the reviewer or admin role. The user gives "Sam Lee, sam@example.com". `submit_skill_for_review({ slug: "standup-notes", reviewers: [{ name: "Sam Lee", email: "sam@example.com" }] })`.
9. `get_my_draft` shows `in_review`, bundle present, reviewer Sam Lee. Report it, link `https://proskill.ai/skills/standup-notes`, and say it is shared with nobody yet and how to share it once approved.

Had `get_my_draft` returned the skill as published, you would confirm a `changeSummary`, pick `versionBump: "minor"`, call `update_skill({ slug, changeSummary, versionBump, bundleSha256, bundleSizeBytes })` with no people fields, upload to the returned `uploadUrl`, and report that the update waits for approval while people keep the previous version.
