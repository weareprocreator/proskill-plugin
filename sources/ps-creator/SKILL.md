---
name: ps-creator
description: Publish a Claude Code skill to your organization on the ProSkill platform, or push a new version of one that already exists there, after checking it against ProSkill's security guidelines. Use whenever the user wants to publish, upload, ship, or submit a skill to ProSkill, push or release a new version of a skill, update or bump an existing ProSkill skill, or get a local SKILL.md folder onto their organization's skill hub. Triggers on phrasings like "publish my skill to proskill", "upload this skill", "push a new version of the X skill", "update my proskill skill", "submit this skill for review", "release v2 of X". The user never has to name a raw tool or say "use the connector": this skill detects whether the skill already exists and routes to creating it or versioning it automatically.
metadata:
  proskill-slug: "ps-creator"
  proskill-version: "v1.1"
---

<!-- proskill:update-check:start -->
> **ProSkill update check (do this before anything else in this skill).**
> This skill came from ProSkill: slug `ps-creator`, version `v1.1`.
> 1. Call the ProSkill MCP tool `check_skill_version` with `{ "slug": "ps-creator", "installedVersion": "v1.1" }`.
> 2. `up_to_date`: continue below.
> 3. `update_available`: tell the user the installed and live versions and what changed, then ask whether to update now. Ask every run, even if they said no before. On no, continue below with this version. On yes, apply the returned version, then follow its instructions instead of the ones below.
> 4. `rolled_back`: do not ask. Apply the returned live version, tell the user this version was rolled back and which version they are now on, then follow the new instructions instead of the ones below. `archived`: the skill was archived on ProSkill; do not run it, and tell the user why (`message`).
> 5. To apply: where you can write to this skill's folder, replace it with the verified bundle from the result; otherwise use the returned `instructions` for this run and give the user the `.skill` file to re-add. Details: the `ps-update` skill.
> 6. If ProSkill cannot be reached, the check fails, or it answers `unknown_skill`, continue below and tell the user the update check could not run.
<!-- proskill:update-check:end -->

# ps-creator

## What this does

Gets a local skill onto **ProSkill**, inside the user's organization. It works out whether the skill already exists (by slug) and either creates it or publishes a new version, so one request handles both "publish" and "update".

Every publish, new skill or new version, passes a **security gate** first (step 4) and again when the bytes land (step 8):

- A **blocker** stops the upload. Nothing is registered, uploaded or submitted until it is fixed.
- A **warning** pauses the upload. The user hears what was found, what fixing it involves and costs, and what pushing it anyway means, and then chooses: fix it, or push anyway.

A **new skill** takes three moves after the gate:

1. **Register metadata** with `upload_skill`. It never carries file bytes. You pass the bundle's SHA-256 and exact byte size, and the server returns a signed `uploadUrl` bound to exactly that hash and size.
2. **Upload the bytes** to that `uploadUrl` over HTTPS multipart. The server checks size, hash and that the payload is a zip containing a `SKILL.md`, then scans it and returns the verdict.
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
- as much as you can of the other listing fields in step 3.

Note whether it is a single-file skill or has extra files (`references/`, `scripts/`, `assets/`, other `.md` files). Packaging is the same either way, but every file must end up in the bundle, and every file goes through the gate.

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
| `draft` (never published) | `update_skill` with the new bundle replaces the draft's file. Then submit with `submit_skill_for_review` (step 9). |
| `in_review` (never published) | Stop. The bundle cannot change until the review is decided. |
| `changes_requested` | `update_skill` with the new bundle works. Resubmitting happens in the web app (`submit_skill_for_review` only takes drafts): send the user to `https://proskill.ai/skills/<slug>`. |
| published (`publishedAt` set) | `update_skill` with the new bundle opens a **pending update** at once, before the bytes even land. People keep getting the previous version until a reviewer or admin approves it in the organization's review queue. Do not call `submit_skill_for_review`. |
| `archived` | Stop. An archived skill cannot take a new bundle. |

### 3. Draft the listing

Work out the listing text now, because the server scans it along with the SKILL.md.

- **Create:** every required field of `upload_skill` (step 7a): `title`, `shortDescription`, `problemSolved`, `department`, `category`, `instructions`, `useCases`, `requiredInputs`, `expectedOutputs`, plus whichever optional ones you can fill (`nonUseCases`, `exampleInput`, `exampleOutput`, `tags`, `maturityLevel`). `instructions` is a **short prose description of the skill, at most 1024 characters**, not the SKILL.md body: draft it from the frontmatter `description` plus a sentence on how the skill works. Ask only for what you cannot infer, in one message.
- **Update:** only the fields that change, plus a `changeSummary` and a `versionBump` (step 7b).

Fill the optional fields too when you can: the skill page shows "Not documented yet." for an empty one, and "No examples documented yet." when both examples are missing.

### 4. Security gate (before anything reaches ProSkill)

Run this for **every** publish: a new skill, a draft's new file, and a new version of a published skill. For a published skill it has to happen **before** `update_skill`, because that call opens the pending update in the review queue straight away.

**4.1 Run the pre-flight.** Write the listing fields from step 3 to a temporary JSON file, then run the pre-flight script that ships with this skill, from this skill's own folder:

```bash
meta="$(mktemp)"; cat > "$meta" <<'JSON'
{ "title": "...", "shortDescription": "...", "problemSolved": "...", "instructions": "...",
  "useCases": "...", "requiredInputs": "...", "expectedOutputs": "..." }
JSON
python3 "<this skill's folder>/scripts/preflight.py" "/path/to/my-skill" "$meta" create   # or: update
```

It applies the same rules as ProSkill's server scan to the SKILL.md and the listing fields, checks every other file in the folder for credentials, and prints `{ ok, blockers, warnings }` with the file and line of each hit. Exit code 2 means at least one blocker. In `update` mode, pass only the fields you are changing; missing required fields are not reported, because the server keeps the stored ones.

If Python is not available, do the same checks by reading the SKILL.md, the listing fields and every text file in the folder against the two tables below. Say that you checked by hand.

**4.2 Blockers: stop.** If there is any blocker, do not package, register, upload or submit. List every blocker with where it is and what to do, help the user fix them, then run 4.1 again. There is no "push anyway" for a blocker, whatever the user says; if they insist, explain that the server refuses it too (or, for a credential in a supporting file, that it would ship to everyone who installs).

| Blocker | Why it stops the upload | How to fix |
|:-|:-|:-|
| AWS access key, bearer token, private key, API key or secret/password/token assignment, in the SKILL.md or a listing field | A critical finding: the server refuses to submit or approve the skill, and the secret would be readable by everyone who installs it. | Remove the value. Have the skill read the credential from the user's environment, keychain or a connector instead, and say so in the SKILL.md. If the secret was ever committed, shared or uploaded anywhere, tell the user to rotate it: removing it now does not make it secret again. |
| The same patterns in any other file in the folder | The server scan reads only the SKILL.md, but every file in the bundle reaches every installer. ps-creator blocks it anyway. | As above. |
| A credential file in the folder (`.env`, `.pem`, `.key`, `id_rsa`, `credentials.json`, a service-account JSON, `.npmrc`, `.netrc`) | It would ship inside the bundle. | Delete it or move it out of the skill folder. |
| SKILL.md uses structured formatting | Failing review check: the server blocks submit and approval. | Add headings, bullets or numbered steps, and at least 80 characters of body. |
| All required fields completed | Failing review check, same effect. | Fill every listed field; "TBD by author" counts as empty. |
| `instructions` over 1024 characters | `upload_skill` and `update_skill` refuse it. | Shorten it to a prose description; the SKILL.md carries the detail. |
| No SKILL.md, SKILL.md over 1 MB, or folder over 10 MB | The upload is refused. | Fix the folder layout or size. |

**4.3 Warnings: ask, one decision per warning.** Warnings do not block on the server, but the user decides each one before anything is uploaded. For every warning, tell the user:

- **What was found:** the rule's name, where (file and line, or listing field), the matched text, and the plain-English explanation the pre-flight gave.
- **If you fix it:** what the change is (draft it concretely, as a short before/after) and what fixing it costs, from the table below.
- **If you push it anyway:** what happens, from the table below, plus the general effects: the warning is recorded on this version's scan, reviewers see it in the review queue, and anyone who opens the skill's page sees it in the **Security scan** section. An organization admin can raise any rule to critical at any time; then the next version you push with this content is blocked.

Then ask: **"Fix it, or push it anyway?"** Use the question tool when your environment has one, otherwise ask in plain text. With several warnings, ask in one message with a choice per warning. Wait for an answer. No answer, or an unclear one, means do not push. Never pick for the user, and never treat "go ahead" said earlier about publishing as an answer to a warning.

| Warning | Fix it: what changes, and its cost | Push it anyway: what that means |
|:-|:-|:-|
| Prompt injection (any of the three rules: telling the model to drop its earlier instructions, to set the above aside, or to follow a "new instruction" directive) | If the sentence really directs the model that way, remove it: a skill that overrides the user's own instructions is the thing the rule exists to catch, and removing it rarely costs anything the user wants. If the skill only **quotes** such a phrase (for example as something to detect), describe it in other words instead of quoting it verbatim; behaviour does not change. | Reviewers see a prompt-injection flag and often request changes, which delays publishing. The skill page's "Prompt injection" check shows as flagged to everyone, which makes people hesitant to install. |
| Safety bypass (asking to switch safety measures off) | Same as prompt injection: remove a real directive, reword a quote. | Same as prompt injection. |
| Jail-break mention | Same as prompt injection: remove a real directive, reword a quote. | Same as prompt injection. |
| Pipe to shell (downloading a script and running it in one line) | Download to a file first, show or verify it (a pinned version or a checksum), then run it. Costs one or two extra steps for whoever uses the skill. | Whatever the remote address serves later runs on every installer's machine, including content nobody reviewed. Reviewers are likely to reject it. |
| Contains a shell script (a fenced shell block or a shebang) | Often legitimate. Either remove scripts the skill does not need (cost: the user runs those steps by hand), or keep them and make them safer: no `sudo`, no recursive force-delete, no piping into a shell. Moving a script into another file only so the scan cannot see it is not a fix. | Usually acceptable. Reviewers see the warning with a plain-English summary of what the script does; the skill page shows it under Security scan. Fine to push when the commands are what the skill is for. |
| Weak skill description (under 50 characters, or never says when to use the skill) | Rewrite the frontmatter `description` to say what the skill does and when to use it ("Use when the user asks to ..."). Costs nothing but a frontmatter edit. | The skill rarely triggers on its own; people have to call it by name. Reviewers see the flag. |
| No description in frontmatter | Add a `description:` line, as above. | Same as a weak description, only worse. |

If the user chooses **fix**: make the change (show the diff), run 4.1 again, and repeat 4.2 and 4.3 on the new result. A fix must change what the text says or does. Never disguise flagged content to slip past the scan: splitting words, swapping in look-alike characters, encoding, or moving content into a file the scan does not read.

If the user chooses **push anyway**: note each warning they accepted and why, in their words. For an update, put that note in `reasonForChange` (for example "Scan warning accepted: contains a shell script; the zip and checksum commands are the skill's job"). For a new skill, include it in the final report so the user can pass it to their reviewer.

Only when there are no blockers and every warning has an answer, go on to step 5.

### 5. Package the bundle

The bundle is a plain zip of the skill folder with the extension `.skill`: **one top-level folder that contains `SKILL.md`** and every supporting file. No other tool or skill is needed. Run it from the folder's parent so the folder itself is the top level, and build into a fresh empty directory so an old bundle is never appended to:

```bash
skill_dir="/path/to/my-skill"        # the folder that holds SKILL.md
out="$(mktemp -d)"
(cd "$(dirname "$skill_dir")" && zip -r -X "$out/<slug>.skill" "$(basename "$skill_dir")" -x '*.DS_Store' '*/.git/*' '*/__MACOSX/*')
unzip -l "$out/<slug>.skill"         # every path starts with my-skill/, and my-skill/SKILL.md is listed
```

If `zip` is not installed, `python3 -m zipfile -c "$out/<slug>.skill" my-skill` (run from the parent folder) builds the same layout; check that no `.DS_Store` or `.git` files went in.

The bundle must be under 10 MB, and the SKILL.md under 1 MB once unzipped. Package exactly the folder the gate checked; if anything in it changes, run step 4 again.

### 6. Compute the integrity values

From the finished bundle:

```bash
shasum -a 256 "$out/<slug>.skill" | cut -d' ' -f1   # bundleSha256 (64 lowercase hex characters)
wc -c < "$out/<slug>.skill" | tr -d ' '             # bundleSizeBytes (exact byte count)
```

The `uploadUrl` is bound to these exact values. If the bundle changes at all, package and hash it again.

### 7a. Create: call `upload_skill`

`upload_skill` is metadata-only: never send file bytes and never base64-encode anything.

- **Required text** (non-empty strings): `title`, `shortDescription`, `problemSolved`, `department` (the owning department in the user's organization, free text, for example "Design"), `category`, `instructions`, `useCases`, `requiredInputs`, `expectedOutputs`.
- **Required integrity:** `bundleSha256`, `bundleSizeBytes` (step 6).
- **Optional:** `nonUseCases`, `exampleInput`, `exampleOutput`, `tags` (array of strings), `maturityLevel` (`experimental` | `usable` | `reliable` | `recommended` | `core_workflow`, default `experimental`), and `collaborators` (see "People" below).
- **Do not send `reviewers` here.** Reviewers are chosen at submit time (step 9). Leave `submitForReview` out; it never submits.

Send exactly the listing text the gate checked. Every missing or malformed field comes back in one error; fix them all, re-run step 4 on the changed fields, and call again (nothing was created).

The answer carries `skillId`, `slug`, `currentVersion`, `status: "draft"`, `awaitingBundle: true` and the `uploadUrl`. Go to step 8.

If it answers that the slug already exists, do not create a variant by hand: if the message names the existing skill and it is the user's own, switch to the update path; if it says "A skill with this slug already exists in your organization", the user cannot see that skill, so pick a different title. If it says the slug "is a common ProSkill skill that every organization already has", choose a different title; never switch to the update path.

### 7b. Update: call `update_skill`

Only after step 4 passed. Pass `slug` plus:

- `changeSummary` (required): one line on what changed. Draft it from the diff and confirm it with the user.
- `versionBump` (required): `minor` (wording fixes, new behavior or sections) or `major` (a rewrite or breaking change). Versions are two-part (`v1.2`), so there is no patch step. State your pick and let the user override it.
- `bundleSha256` and `bundleSizeBytes` together, for a new bundle. For a listing-text-only change, pass `metadataOnly: true` instead; without one or the other the call is refused. A listing-only change still goes through step 4 for the fields it changes.
- Only the metadata fields that changed. `tags` replaces the whole list, so include the existing tags you want to keep. `reasonForChange` carries any scan warning the user chose to push anyway (step 4.3).

**`update_skill` takes no people fields.** Any `collaborators` or `reviewers` you send are ignored. To change who collaborates on the skill, the user does it in the web app on the skill page.

The answer carries `bundleUpdated` and, with a bundle, the `uploadUrl`. On a published skill it also says `heldForReview: true`: the bundle and every content field wait for approval (only `tags` and `shortDescription` change at once), and the new version number takes effect when the update is approved. On a skill that was never published, the version number does not move. Go to step 8, or straight to step 10 for a `metadataOnly` change.

### 8. Upload the bytes and apply the server's verdict

POST the bundle to the `uploadUrl` as multipart, field `file`, soon after you get it (the link is valid for 15 minutes):

```bash
curl -sS -w '\nHTTP %{http_code}\n' -F "file=@$out/<slug>.skill" "<uploadUrl>"
```

- **HTTP 400** names the problem: size or hash mismatch (the bundle changed after hashing, so redo steps 5 and 6 and register again), "not a valid .skill bundle" (no `SKILL.md` in the zip), over 10 MB, or the SKILL.md too large.
- **HTTP 403** "Upload token expired" (or invalid): get a fresh link. For a skill that was never published, call `update_skill` on the same slug with the same `bundleSha256`, `bundleSizeBytes`, a `changeSummary` such as "Upload bundle" and `versionBump: "minor"`; on a draft this only mints a new link. For a published skill, repeat step 7b.
- **HTTP 409**: the skill is in review or archived, so it cannot take a file now. Report it.
- **HTTP 201 or 422** carry a `scan` object `{ passed, blockers, advisories }` and a message. **The server's verdict is the authority**: an organization admin can add rules or raise a warning to critical, and only the server applies those.

Apply it as the second half of the gate:

- **`passed: false` (HTTP 422): blocked.** Relay every entry in `blockers` as written and stop. Do not submit, do not retry unchanged.
  - New skill or draft: it stays a draft with the failed scan; nobody can install it. Fix the content, run step 4 again, then send the new bundle with `update_skill` (same slug, new hash and size) and upload it.
  - Published skill: the pending update now carries a failed scan and cannot be approved; people keep the previous version. Fix the content, run step 4 again and repeat step 7b with the same `versionBump`: it replaces the same pending update (there is only ever one) and keeps its version number. To drop the update instead, ask a reviewer or admin to send it back with "request changes" (the `ps-review` skill); the published version stays live.
- **`passed: true` with `advisories`:** compare them with the warnings the user already decided in step 4.3. For any advisory that is **new** (an organization's own rule, a raised rule, or "Possible duplicate skill", which only the server can check), give the user the same choice as in 4.3 before going further:
  - **Possible duplicate skill** ("N% similar to <title>"). Fix it: if it really is the same skill, ask that skill's author to add the user as a collaborator and improve that one instead (cost: no separate skill of their own); if it is different, sharpen the description and use cases so the difference is plain. Push anyway: the reviewer sees the match and may reject it as a duplicate, and the library ends up with two skills that look alike.
  - **A rule ps-creator does not know** (the organization's own): relay its label and the matched text, say that this rule is the organization's own and its admin can explain it, and ask fix or push anyway.
  - New skill or draft: nothing is submitted until every new advisory has an answer. A fix means changed content: run step 4 again, send the new bundle with `update_skill`, upload it, and read the verdict again.
  - Published skill: the pending update is already in the review queue. Push anyway means leave it there (tell the user to mention the accepted warning to the reviewer). Fix means repeat step 7b with the corrected bundle, which replaces the pending update.
- **`passed: true` with no advisories:** say "Security scan passed".

On a published skill the answer also has a `staged` object (`versionNumber`, `fileName`) and the message says the published version is unchanged until a reviewer approves the update.

### 9. Submit for review (new skills and drafts only)

Only when step 8 passed and every warning has an answer. `submit_skill_for_review({ slug, reviewers })` moves a draft with a verified bundle into `in_review`. It works on **drafts only**: a `changes_requested` skill is resubmitted in the web app, and a published skill's update is already in the review queue after step 8.

`reviewers` is **required on every call, at least one**, chosen fresh for this submission. Never reuse reviewers from an earlier submission or from `upload_skill`; ask the user now (see "People" below). Recommend someone who holds the **reviewer** or **admin** role in the organization: only they can approve, an admin any skill and a reviewer only a skill they are assigned to. The user may name themselves.

If any reviewer fails to resolve, nothing is submitted (see "People").

The server runs the scan again at submit. If it blocks the submit, the error lists every blocker: relay the list as written, explain the skill is saved as a draft, and go back to step 4. Never retry the submit unchanged.

### 10. Report and verify

Call `get_my_draft({ slug })` (`get_skill` only reads published skills) and confirm: `awaitingBundle` is false, `bundle.sha256` matches your hash, `status` and `currentVersion` are what you expect, and `reviewers` lists the people you assigned. If anything is off, say so plainly and redo the failed step rather than reporting success.

Then report in plain English: the slug, the status (`in_review`, `draft`, or published with a pending update), the version, the collaborators and reviewers, the skill's page `https://proskill.ai/skills/<slug>`, and the **security outcome**: "Security scan passed", or each warning the user chose to push anyway with their reason.

**Sharing:** tell the user that a new skill is **shared with nobody yet**, and approval does not share it. Once it is published, they (as author or collaborator) share it from the skill page: open `https://proskill.ai/skills/<slug>`, choose **Share**, pick **Organization**, **Departments** or **Individuals**, and set the access level to **Can view** or **Can edit (collaborator)**. The `ps-share` skill walks them through it.

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

## Examples

**New skill, one warning.** "Publish my `standup-notes` skill to proskill, it's in `./.claude/skills/standup-notes`."

1. Read the SKILL.md; slug `standup-notes`. `get_my_draft`, `get_skill` and `search_skills` find nothing: "Not on ProSkill yet, publishing it."
2. Draft the listing; ask only for the department and problem solved.
3. Pre-flight: no blockers, one warning: "Contains a shell script" at SKILL.md line 40, a block that runs `git log` to collect yesterday's commits. Tell the user: fixing means removing the block, so they paste their commits in by hand; pushing anyway means reviewers and the skill page show a script warning, with a summary of what it does. The user says push anyway, the command is the point of the skill. Note it.
4. Package, hash, `upload_skill`, `curl` the bundle: HTTP 201, passed, the one advisory already decided.
5. Ask for a reviewer, submit, verify with `get_my_draft`, and report: in review, v1.0, "scan warning accepted: contains a shell script (collects commits)", the page link, and that it is shared with nobody yet.

**New version, a blocker.** "Push a new version of my `deploy-helper` skill."

1. `get_my_draft` returns it published at v1.3: "Found `deploy-helper` at v1.3, I'll push a new version."
2. Pre-flight, update mode: one blocker, a bearer token in `references/api.md` line 12. Stop before `update_skill`: nothing is queued. Tell the user exactly where it is, help them replace it with an environment variable, and tell them to rotate the token because it had been in the folder they share.
3. Pre-flight again: clean. Confirm `changeSummary`, pick `versionBump: "minor"`, call `update_skill` with no people fields, upload, read the verdict: passed. Report that the update waits for approval while people keep v1.3.
