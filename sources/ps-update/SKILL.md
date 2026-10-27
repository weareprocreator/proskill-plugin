---
name: ps-update
description: This skill should be used to update ProSkill skills, in two modes. INSTALLED mode (anyone): check the skills in ~/.claude/skills against ProSkill and apply newer or rolled back versions, including old installs from skills.procreator.design, and move a ProSkill connector to proskill.ai. Use for "update my installed skills", "check my skills for updates", "are my skills up to date", "update all my skills", "get the latest version of X", "a skill says an update is available", "move my ProSkill connector to proskill.ai". PUBLISH mode (authors): push the user's own local edits to a skill already on ProSkill as a new version. Use for "push a new version of X", "publish my changes to X on ProSkill", "release v1.1 of X", "bump the version of my skill X", "sync my local edits to the published skill". Not for a first install (ps-install), a first publish (ps-creator), or writing SKILL.md content (skill-creator).
metadata:
  proskill-slug: "ps-update"
  proskill-version: "v1.1"
---

<!-- proskill:update-check:start -->
> **ProSkill update check (do this before anything else in this skill).**
> This skill came from ProSkill: slug `ps-update`, version `v1.1`.
> 1. Call the ProSkill MCP tool `check_skill_version` with `{ "slug": "ps-update", "installedVersion": "v1.1" }`.
> 2. `up_to_date`: continue below.
> 3. `update_available`: tell the user the installed and live versions and what changed, then ask whether to update now. Ask every run, even if they said no before. On no, continue below with this version. On yes, apply the returned version, then follow its instructions instead of the ones below.
> 4. `rolled_back`: do not ask. Apply the returned live version, tell the user this version was rolled back and which version they are now on, then follow the new instructions instead of the ones below. `archived`: the skill was archived on ProSkill; do not run it, and tell the user why (`message`).
> 5. To apply: where you can write to this skill's folder, replace it with the verified bundle from the result; otherwise use the returned `instructions` for this run and give the user the `.skill` file to re-add. Details: the `ps-update` skill.
> 6. If ProSkill cannot be reached, the check fails, or it answers `unknown_skill`, continue below and tell the user the update check could not run.
<!-- proskill:update-check:end -->

# ps-update

Two jobs, both through the connected **ProSkill** connector. Call its tools by their bare names
(`search_skills`, `get_skill`, `get_my_draft`, `update_skill`, `list_skill_versions`,
`check_skill_version`, `confirm_skill_install`, `report_unlisted_skill`). Never hardcode a
session-specific tool-name prefix.

## One organization at a time

The connector is signed in to one organization. Every check, version and slug below is
answered for that organization only: its own skills, plus the common skills ProSkill provides
to everyone. A slug that is not found means "not available in this organization, or not
shared with you". Never treat it as a sign the skill lives somewhere else, and never suggest
another organization, another account or another token to reach it.

## Pick the mode first

| The request | Mode |
|:-|:-|
| Bring the skills installed on this machine up to date ("update my installed skills", "check my skills for updates", "get the latest X") | **B. Update installed skills** |
| Another skill's update check answered `update_available` or `rolled_back` and pointed here | **B, single skill** (go straight to B4 with that answer) |
| Publish the user's own local edits to a skill that is live on ProSkill ("push a new version of X", "release v1.1 of X") | **A. Publish a new version** |

A bare "update X" is decided like this: local edits or "publish" mentioned, mode A; the user
does not own X on ProSkill, mode B; the user owns X and gave no other signal, ask one short
question ("Publish your edits to X, or update your installed copy of X?").

Not this skill: a first install (`ps-install`), a first publish (`ps-creator`), writing or
improving SKILL.md content (`skill-creator`).

## Mode A: publish a new version of a published skill

Pushes a new version of a skill that is **already published on ProSkill** in the user's
organization (a listing edit, a new bundle, or both). It never creates a skill; if the target
does not exist, it says so and points at `ps-creator` instead of falling through to a create.

### A1. Locate and read the local skill

Find the skill folder the user means (ask only if ambiguous). Read its `SKILL.md` and note
every supporting file: the whole folder is what gets bundled. From the frontmatter and body,
note the **title** (`name:` or folder name) and what changed since the last push.

If the folder is an installed copy (frontmatter `metadata.proskill-slug`, or a
`<!-- proskill:update-check:start -->` block after the frontmatter), leave both alone. The
server replaces that stamp when it serves the new version; never edit or add it by hand.

### A2. Confirm it exists and the user can edit it

Use the stamped slug when present. Otherwise compute it the way the platform does: lowercase
the title, replace runs of non-alphanumerics with hyphens. Then call `get_my_draft({ slug })`,
which returns the skill only when the user is its author or a collaborator.

- **Returned, `publishedAt` set:** go to A3. Note `currentVersion`.
- **Returned, never published** (`draft`, `in_review` or `changes_requested`): this is not a
  new version of a published skill. Hand off to `ps-creator`, which handles drafts.
- **Returned, `archived`:** stop. An archived skill cannot take a new version.
- **Not returned:** check `get_skill({ slug })` (and `search_skills` with the title).
  - Found with `isCommon: true`: a common skill provided by ProSkill. No organization can
    version it; offer mode B instead.
  - Found otherwise: someone else in the organization owns it. Ask whether they meant mode B,
    or suggest they ask the author to add them as a collaborator in the web app.
  - Not found: there is nothing to update in this organization. Offer `ps-creator`. Never
    call `update_skill` on a slug that does not exist.

State the slug and current version in one line before acting (for example "Found
`standup-notes` at v1.3, pushing your local changes as a new version").

### A3. Security gate (before `update_skill`)

A new version passes the same security gate as a new skill. Apply **`ps-creator`'s step 4**
exactly: run its `scripts/preflight.py` on the folder in `update` mode, passing the listing
fields you change in A5 (run it again if they change later), and act on the result before A6.
`update_skill` on a published skill opens the pending update in the review queue at once, so
the gate has to come first.

- **Blockers stop the update.** Credentials (in the SKILL.md, a listing field or any file in
  the folder), a credential file such as `.env`, an unstructured SKILL.md (it needs a heading,
  list or numbered step and at least 80 characters), `instructions` over 1024 characters, or a
  folder over 10 MB. Do not package, call `update_skill` or upload. Help the user fix each one
  and run the gate again. There is no "push anyway" for a blocker.
- **Warnings get a decision each.** For every warning (prompt injection, safety bypass, a
  jail-break mention, pipe to shell, a shell script, a weak description), tell the user what
  was found and where, what fixing it changes and costs, and what pushing it anyway means
  (reviewers and everyone who opens the skill's page see it under Security scan; an admin can
  raise the rule to critical later), using `ps-creator`'s warning table. Ask "Fix it, or push
  it anyway?" and wait. No answer means do not push. A fix changes what the text says or does;
  never disguise flagged content to get past the scan.
- If `ps-creator` is not installed, apply the rules above by reading the SKILL.md, the changed
  listing fields and every text file in the folder, and say that you checked by hand.

Also check that every file the SKILL.md body references (scripts, references, assets) is
present.

### A4. Package the `.skill` bundle

Metadata goes in the tool call; file bytes go to a separate signed URL. Never base64 a file
into a tool argument. The bundle is a plain zip with one top-level folder that contains
`SKILL.md`. Build it from the folder's parent, into a fresh empty directory:

```bash
skill_dir="/path/to/my-skill"
out="$(mktemp -d)"
(cd "$(dirname "$skill_dir")" && zip -r -X "$out/<slug>.skill" "$(basename "$skill_dir")" -x '*.DS_Store' '*/.git/*' '*/__MACOSX/*')
unzip -l "$out/<slug>.skill"                          # my-skill/SKILL.md is listed
shasum -a 256 "$out/<slug>.skill" | cut -d' ' -f1     # bundleSha256
wc -c < "$out/<slug>.skill" | tr -d ' '               # bundleSizeBytes
```

Skip this step for a listing-only change (A6 then passes `metadataOnly: true`).

### A5. Decide the version bump and change summary

`update_skill` requires `changeSummary`; `versionBump` defaults to `minor` when omitted, but always pass it explicitly:

- `changeSummary`: what changed, one line, drafted from the diff against `get_my_draft` and
  confirmed with the user.
- `versionBump`: `minor` (wording fixes, new steps or behavior; versions are two-part, so there is no patch step) or `major` (a
  rewrite or a breaking change). State your pick and let the user override it.

Optionally pass `reasonForChange`; when the user chose to push a scan warning anyway in A3,
put it there with their reason (for example "Scan warning accepted: contains a shell script;
the commands are the skill's job"). Pass only the metadata fields that changed. `tags`
**replaces** the whole list, so include the existing tags alongside any new ones.

### A6. Call `update_skill`

```
update_skill({ slug, changeSummary, versionBump, ...changed metadata fields,
               bundleSha256, bundleSizeBytes })   // a new bundle
update_skill({ slug, changeSummary, versionBump, ...changed metadata fields,
               metadataOnly: true })              // listing text only
```

One of the two is required; without either the call is refused. **`update_skill` takes no
people fields**: `collaborators` or `reviewers` are ignored, so never send them. Collaborators
are changed in the web app on the skill page.

On a published skill, a new bundle and any change to a content field (everything except
`tags` and `shortDescription`) are held as a **pending update** for a reviewer or admin in the
organization to approve. People keep getting the previous version until then, and the new
version number appears on approval. Only `tags` and `shortDescription` change at once. With a
new bundle, the answer includes `heldForReview: true` and an `uploadUrl` bound to exactly your
bundle. A `metadataOnly` answer has no `uploadUrl`.

### A7. Upload the bundle bytes (only if A6 returned an `uploadUrl`)

```bash
curl -sS -w '\nHTTP %{http_code}\n' -F "file=@$out/<slug>.skill" "<uploadUrl>"
```

The link is valid for 15 minutes. The server re-verifies size, hash and zip structure, then
scans the SKILL.md and answers with a `scan` object (`passed`, `blockers`, `advisories`,
`message`) and a `staged` object naming the pending version. The server's verdict is the
authority (an organization can add rules or raise one to critical), so apply it as in
`ps-creator`'s step 8:

- HTTP 422 (`passed: false`): blocked. The pending update carries the failed scan and cannot be
  approved; people keep the previous version. Relay every entry in `blockers` as written, fix
  them with the user, run A3 again, and redo A4 to A7 with the same `versionBump`: it replaces
  the same pending update and keeps its version number.
- An advisory the user has not decided yet (an organization's own rule, or "Possible duplicate
  skill", which only the server can check): give the same fix or push-anyway choice as in A3.
  Push anyway leaves the update in the queue; fix means redo A3 to A7 with the corrected
  folder.

A 400
names a mismatch or a bad bundle (usually the bundle changed after hashing, or `SKILL.md` is
missing); a 403 means the link expired (repeat A6). Never report a non-2xx as success.

### A8. Report the result

Report the slug, what changed (listing, bundle, or both), the security outcome ("Security
scan passed", or each warning pushed anyway with the user's reason), and, unless only `tags` or
`shortDescription` changed (those apply immediately), that the update waits in the
organization's review queue while people keep the previous version. `list_skill_versions(slug)`
shows the history once it is approved. If the folder was an installed copy, its stamp still
names the old version, so a later update check offers the new one: that is expected.

### Mode A errors

- **"Skill not found: <slug>"** or **"You cannot edit this skill."**: the skill is not in this
  organization, or the user is not its author or a collaborator. Re-check A2; do not retry.
- **"This skill is archived, so its bundle cannot be replaced."**: stop.
- **"Your access token is not bound to an organization..."**: the connector needs
  re-authorizing (B1 step 4).

## Mode B: update my installed skills

Checks every ProSkill skill in `~/.claude/skills/` against the version ProSkill serves and
updates it per the ProSkill update protocol. It needs a client that can write that folder
(Claude Code, or Claude desktop with file tools). In a client that cannot write files, use
the cannot-write path in B4 instead.

**Skills from the ProSkill Claude Code plugin** do not live in `~/.claude/skills/`. They sit in
the plugin cache (under `~/.claude/plugins/`), and they are updated by **updating the plugin**
(`/plugin update`, or through the plugin marketplace), never by swapping folders. If an update
check for one of them answers `update_available` or `rolled_back`, tell the user to update the
plugin and leave its files alone.

**Downloads and your organization's rules.** Each update downloads a `.skill` file. If the
user's organization requires an approval per download, that rule wins over everything below,
including "apply without asking" for a rollback and a single yes for a batch.

### B1. Check the connector (one time per machine)

ProSkill moved from `skills.procreator.design` to `proskill.ai`; the old host is retired. Look
for a ProSkill MCP entry that still uses the old host:

- Claude Code: `claude mcp list`, then `claude mcp get <name>` for its scope and URL, plus
  any `.mcp.json` in the current project.
- Claude desktop: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)
  or `%APPDATA%\Claude\claude_desktop_config.json` (Windows). The host may sit in `url` or in
  `args` (an `mcp-remote` command).
- Connectors in Claude web or desktop Settings: these cannot be read; ask the user to check
  the ProSkill connector's URL.

If an entry uses `skills.procreator.design`:

1. Say what you found and that it should be `https://proskill.ai/api/mcp`. Ask once before
   changing their config.
2. Re-point it. In Claude Code, keep the entry's name and scope:
   ```bash
   claude mcp remove <name> -s <scope>
   claude mcp add -t http -s <scope> <name> https://proskill.ai/api/mcp
   ```
   In a JSON config, replace the old host wherever it appears in that entry. For a Settings
   connector, the user removes it and adds `https://proskill.ai/api/mcp` as a custom one.
3. Drop any `Authorization: Bearer` header the old entry carried: an old-site token does not
   work on proskill.ai. Never ask the user to paste a token into the chat.
4. Tell them to **re-authorize** (Claude Code: `/mcp`, pick ProSkill, authenticate; a
   connector: Connect, then sign in), restart the session and run this mode again. Stop here:
   this session still talks to the old server.

If nothing points at the old host, say nothing and continue. If the connector has no
`check_skill_version` tool, it is not the current server: treat it as above, and if no old host
is visible, ask the user to re-authorize the connector and retry.

### B2. Inventory `~/.claude/skills/`

List the top-level folders that contain a `SKILL.md`. Skip symlinks and git checkouts (a
folder with `.git`), which are someone's working copy, and never touch plugin cache folders.
For each folder, find its ProSkill identity:

- **Stamped:** frontmatter `metadata.proskill-slug` and `metadata.proskill-version`. If the
  frontmatter has neither, read them from the update-check block's line ``slug `<slug>`,
  version `<version>` ``.
- **Unstamped** (installed from `skills.procreator.design` before stamping existed): try the
  folder name, then the frontmatter `name` slugified as in A2. Confirm with
  `get_skill(candidate)`, falling back to `search_skills` with the name. Count it only when
  the title or description clearly matches the local SKILL.md; use `installedVersion: ""`.
  Two matches or none: list it as "not matched" and leave it alone.
- Anything else (the user's own skills, skills from elsewhere): leave alone, unlisted.

If this run started from ps-update's own update check, reuse that answer for `ps-update`;
otherwise check `ps-update` last.

### B3. Check each skill and show the result

One call per skill:

```
check_skill_version({ "slug": "<slug>", "installedVersion": "<version or empty string>", "client": "<your client name>" })
```

A call that errors or times out means "could not check": leave that skill and report it. An
error saying the token is not bound to an organization means the connector needs
re-authorizing (B1 step 4): stop the run. Then show one table before changing anything:

| Skill | Installed | Live | Status | What changed | Note |
|:-|:-|:-|:-|:-|:-|

`Installed` is "unknown" for an unstamped install. `Note` says "matched by name" for an
unstamped match (the user may veto it) and "you own this" for a skill the user owns on
ProSkill (offer mode A first, so local edits are published rather than overwritten).

| `status` | What to do |
|:-|:-|
| `up_to_date` | Nothing. |
| `update_available` | **Ask** before applying. One question may cover several skills ("Update these 4 now?") and the user may pick a subset. Never record a "no" anywhere (no file, memory or note): the next run asks again. An unstamped install that is still published lands here, because its version is unknown. |
| `rolled_back` | **Apply without asking whether to update**, and tell the user it was rolled back to `liveVersion` and why (`changeSummary`). If a required download approval is declined, leave the folder, tell the user not to run that version, and say the next run applies the rollback. |
| `archived` | **Do not run it.** Tell the user why (`message`) and suggest removing the folder; delete it only on a yes. |
| `unknown_skill` | The skill is not available in this organization, or not shared with the user. Leave the folder, keep running the local copy, and say the check could not confirm its version. Offer to report it with `report_unlisted_skill` (below). Never suggest another organization or token. |

**Reporting an unlisted skill** (only on a yes): call
`report_unlisted_skill({ "skillName": "<name from frontmatter, else folder>", "folderName": "<folder>", "description": "<one-line description>", "platform": "<your client name>" })`.
Send names and the one-line description only, never the skill's contents. If the answer has
`onProSkill: true`, tell the user its `message` (the skill can be installed from ProSkill).
Otherwise the organization's admins are notified; show `message` only when `tellUser` is true.
Never delete or change the skill because of this.

### B4. Apply a version

For each approved `update_available` and every `rolled_back`:

1. **Re-check right before downloading.** The links in B3's answers are signed and expire in
   about ten minutes. Call `check_skill_version` again for this skill and use that answer
   (if its status changed, act on the new status).
2. **Build the new folder in an empty temp folder**, never in the skill folder:
   - With a `bundle`:
     ```bash
     dl="$(mktemp -d)" && curl -fsSL -o "$dl/<slug>.skill" "<bundle.downloadUrl>"
     wc -c < "$dl/<slug>.skill" | tr -d ' '          # must equal bundle.sizeBytes
     shasum -a 256 "$dl/<slug>.skill" | cut -d' ' -f1  # must equal bundle.sha256
     ```
     On a mismatch, re-check once for a fresh link and retry; a second mismatch, skip the
     skill and report it. Unpack into a second empty folder, refusing any entry with `..` or
     an absolute path and ignoring `__MACOSX`. `SKILL.md` must be at the root or inside a
     single top-level folder; in the second case, use that folder's contents. Run nothing
     from the bundle.
   - With no bundle: write every inline entry in `files` at its `fileName` (same path
     checks, `encoding: "utf-8"`, `content` verbatim) into the empty folder.
   - With neither: skip the skill and report "could not apply".
3. **Swap.** Move the installed folder to a backup outside `~/.claude/skills/` (for example
   `~/.claude/skills-backup/<folder>-<timestamp>/`, so it is not loaded as a second copy),
   then move the new folder in under the **same folder name**. Tell the user where the
   backup is; any local edits they made are there. (Never do this for a plugin skill; see
   above.)
4. **Keep the served `SKILL.md` exactly as served.** Its `metadata` and update-check block
   are the stamp later runs read. Never write, edit or "fix" the stamp by hand.
5. **Verify** the new `SKILL.md` names `liveVersion`, from `metadata.proskill-version` or,
   failing that, the update-check block line. If neither does, restore the backup and report
   the skill as failed.
6. **Confirm:** `confirm_skill_install({ "slug": "<slug>", "client": "<your client name>" })`.

**Cannot write files** (Claude web or mobile chat, some IDE chats): follow the returned
`instructions` (the live SKILL.md) for this run instead of the installed copy, and give the
user `bundle.downloadUrl` (or the skill's `url`) so they can install the new version. The
installed copy stays old, so the next run asks again; that is intended.

### B5. Report

One short summary: updated (from, to), rolled back (to, why), archived (and whether removed),
unchanged, not available in this organization (and whether reported), not matched, could not
check, plugin skills that need a plugin update, and where the backups are. Replaced skills
take effect the next time they run; suggest a new session if one is needed right now.

## Examples

**Mode A.** "Push my local changes to `standup-notes` on ProSkill, I added a new step." Read
the folder, `get_my_draft("standup-notes")` (author, published, v1.3), the security gate
(clean), zip and
hash, confirm `changeSummary: "Add a step for handling no-shows"` and `versionBump: minor`,
`update_skill` returns `heldForReview: true` and an `uploadUrl`, the upload returns 201 with a
passing scan. Report: "Pushed `standup-notes`; the update waits for review, and people keep
v1.3 until it is approved."

**Mode B.** "Check my skills for updates." The connector already uses proskill.ai.
`~/.claude/skills/` holds `pdf-summary` (stamped v1.2), `brand-voice` (unstamped, from the
old site) and `my-notes` (stamped, but `unknown_skill`). Checks return `update_available` (to
v1.3), `update_available` (installed unknown, live v2.0, matched by name) and `unknown_skill`.
Show the table, ask once, the user says yes to both updates. Re-check each, download, verify,
swap, keep the served SKILL.md, `confirm_skill_install`. For `my-notes`, say the check could
not confirm its version in this organization and offer `report_unlisted_skill`. Report two
updated, `my-notes` left as is, backups in `~/.claude/skills-backup/`.

## Changelog

- **v1.3:** Mode A runs `ps-creator`'s security gate before `update_skill`: blockers stop the
  update, and each warning gets a fix or push-anyway decision with what each choice means. The
  server's verdict after upload is applied the same way, and accepted warnings go into
  `reasonForChange` and the report.
- **v1.2:** one organization at a time. `unknown_skill` means not available in this
  organization (or not shared with the user) and offers `report_unlisted_skill`. Mode A checks
  ownership with `get_my_draft`, sends no people fields to `update_skill`, passes
  `metadataOnly: true` for listing-only changes, and explains that a published skill's update
  waits for review. Plugin-installed skills are updated through the plugin.
- **v1.1:** adds mode B, updating installed skills per the ProSkill update protocol
  (`check_skill_version`, `confirm_skill_install`, unstamped installs from the old site, the
  one-time move of the connector to `https://proskill.ai/api/mcp`, and the single-skill path
  the update-check block points to). Mode A gains the mode picker, honors an existing stamp,
  offers mode B when the skill is not the user's, and builds each bundle in a fresh folder.
- **v1.0:** publish a new version of a published skill.
