# ProSkill

[ProSkill](https://proskill.ai) is a private skills library for teams. Your organization keeps its Claude and ChatGPT skills in one place, reviews them before anyone runs them, and shares them only inside the organization. This plugin connects Claude Code or ChatGPT to your ProSkill account and adds twelve skills for working with the library.

You need a ProSkill account in an organization. Sign up at [proskill.ai](https://proskill.ai), then install the plugin. The first time a ProSkill tool runs, ProSkill's sign-in page opens in your browser. There is no API key or token to paste.

## What you can do

- **Find skills:** search your organization's library in plain English, read a skill, see its version history (`ps-search`).
- **Install a skill:** download a published skill by name as a verified `.skill` bundle (`ps-install`).
- **Keep skills current:** check installed skills against ProSkill and apply newer versions (`ps-update`).
- **Publish:** check a skill against ProSkill's security rules on your machine, then publish it or a new version (`ps-creator`).
- **Review:** see the review queue and approve or send back a skill (`ps-pending-reviews`, `ps-review`, for reviewers and admins).
- **Give feedback and ideas:** rate a skill, pitch an idea, search the idea board (`ps-feedback`, `ps-submit-idea`, `ps-search-idea`).
- **Share, report, archive:** open the share dialog for a skill, report a problem, retire a skill (`ps-share`, `ps-report`, `ps-archive`).

## What the plugin runs, sends and fetches

Everything below happens only when you ask for the matching task.

**Network.** The plugin talks to one service: the ProSkill MCP server at `https://proskill.ai/api/mcp`, over HTTPS with OAuth 2.0 (dynamic client registration, scope `mcp`). Every request carries your ProSkill sign-in and acts only inside your organization. Besides that server, the skills use short-lived signed links that the ProSkill server hands out for its own file storage:

- `ps-install` and `ps-update` download a skill bundle (`.skill`, a zip) from a signed link and check its size and SHA-256 against what the server reported before using it.
- `ps-creator` and `ps-update` upload a bundle you chose to publish to a signed upload link, after sending its SHA-256 and size to the server.
- `ps-report` uploads one screenshot you pick, if you attach one to a problem report.

The plugin sends nothing anywhere else, collects no analytics, and reads no credentials from your environment. In Claude Code, the server address can be changed with the `PROSKILL_MCP_URL` environment variable (for a staging or self-run ProSkill server); it is the only environment value the plugin reads.

**What it sends to ProSkill.** Search text, the names and slugs of skills you work with, the content of skills you publish, feedback, ratings, ideas, review decisions and problem reports you write, and, for update checks, the slug and version of installed ProSkill skills. ProSkill's handling of this data is described in its [privacy policy](https://proskill.ai/privacy).

**Files on your machine (Claude Code).**

- `ps-install` saves bundles to your Downloads folder. When a skill has no bundle, it writes the skill to `~/.claude/skills/<slug>/`.
- `ps-update` reads `~/.claude/skills/` to find ProSkill skills and, when you approve an update, replaces that skill's folder after moving the old one to `~/.claude/skills-backup/`.
- `ps-creator` packages the skill folder you name into a temporary zip and runs `scripts/preflight.py` (Python standard library only, no network) to check it against ProSkill's security rules before upload.

**Commands.** Some skills tell Claude to run `curl` for the downloads and uploads above, `zip`/`unzip` and `shasum` for bundles, and `python3` for the preflight check. Claude Code asks before running them unless you allowed them.

The plugin has no hooks and runs nothing at install or start-up.

## Privacy, terms and support

- Privacy policy: https://proskill.ai/privacy
- Terms of service: https://proskill.ai/terms
- Support: https://proskill.ai/contact
- Source: https://github.com/weareprocreator/proskill-plugin (MIT)

Built by ProCreator.
