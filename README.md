# ProSkill plugin for Claude Code and ChatGPT

One install gives Claude Code or ChatGPT everything a [ProSkill](https://proskill.ai) member needs: the ProSkill MCP server and every skill in the PS Starter Pack. One repo builds both, with the same skills at the same version.

## Install in Claude Code

```
/plugin marketplace add weareprocreator/proskill-plugin
/plugin install proskill@proskill
```

The first ProSkill tool call opens ProSkill's sign-in in your browser (or run `/mcp`, pick `proskill`, and sign in ahead of time). There is no token to paste.

## Install in ChatGPT

A ChatGPT workspace admin adds the plugin once for the whole workspace, from this GitHub repo. ChatGPT reads the same marketplace file Claude Code does.

1. Open the Admin Console (admin.openai.com), pick the workspace, then **Plugins > Add > Import marketplace**.
2. **Source:** `https://github.com/weareprocreator/proskill-plugin` (the repo URL only). Leave **Path** empty. **Branch, tag, or commit:** a release tag such as `v1.1.0`, or `main` to follow every release.
3. Select **Import marketplace** and authorize GitHub when asked.
4. In the import results, open **ProSkill** and set who can install it (or install it for the whole workspace).
5. Members install it from Plugins and connect their own ProSkill account the first time; sign-in opens proskill.ai.

ChatGPT checks the repo daily, or at once with **Admin Console > Plugins > Marketplaces > ProSkill > Sync now**, so a new release reaches the workspace without another upload. It reads `plugins/proskill/plugin.json` (the ChatGPT interface block), `plugins/proskill/mcp.json` (streamable HTTP to `https://proskill.ai/api/mcp`, OAuth with dynamic client registration, scope `mcp`), the icon and `skills/`. Claude Code reads `.claude-plugin/plugin.json` and `.mcp.json` in the same folder. Replace any older hand-made ProSkill plugin in the workspace rather than running both, or every tool appears twice.

If GitHub import is not available, `npm run build` also writes `dist/chatgpt/proskill.zip` (the same files and skills) for **Plugins > Add > Upload plugin archive**. Uploading needs the workspace's plugin upload permission.

## One organization at a time

ProSkill keeps every organization separate. The plugin works inside the organization you signed in with, and only that one:

- Search, install, feedback, ideas and reviews all see your organization's skills plus the common skills ProSkill publishes for everyone. A skill from another organization looks exactly like one that does not exist.
- Reviewers and collaborators must be active members of your organization. Anyone else is refused, and nothing is created.
- Sharing happens in the web app's Share dialog, inside your organization (the whole organization, a department, or one person; view or edit). The plugin never sends a skill to anyone.
- To work in another organization, join it, then sign in again (`/mcp`, pick `proskill`, re-authenticate) while you are signed in to that organization on proskill.ai.

## What is in it

**The MCP server** `proskill`, at `https://proskill.ai/api/mcp`, over OAuth. To point it somewhere else (a staging or local server), set `PROSKILL_MCP_URL` before starting Claude Code. If you added ProSkill by hand before (`claude mcp add ... proskill ...`), remove that entry, or every tool appears twice.

**The skills:**

| Skill | What it does |
|:-|:-|
| `ps-search` | Find skills you can use, read one, see its version history |
| `ps-install` | Install one skill by name |
| `ps-update` | Check installed skills for updates and apply them; push a new version of your own skill |
| `ps-creator` | Publish a new skill, or a new version of one |
| `ps-share` | Share a skill with people in your organization (through the web Share dialog) |
| `ps-feedback` | Leave feedback and a rating on a skill |
| `ps-report` | Report a problem with ProSkill, or a local skill that is not on ProSkill |
| `ps-submit-idea` | Pitch a new skill idea to your organization's idea board |
| `ps-search-idea` | Search and browse your organization's idea board |
| `ps-pending-reviews` | Show your organization's review queue (reviewers and admins) |
| `ps-review` | Approve or send back a skill under review (reviewers and admins) |
| `ps-archive` | Archive (retire) one of your organization's skills (admins) |

Each skill carries a short note with its ProSkill slug and version. With the ProSkill connector, `check_skill_version` (or the `ps-update` skill) tells you whether a newer version is out. New skill versions reach plugin users through plugin updates (`/plugin update proskill@proskill` in Claude Code; a new upload of the zip in ChatGPT).

## Maintaining this repo

- `starter-pack.json` pins which skills ship, the live version of each, and a hash of its folder.
- `sources/<slug>/` is each skill's folder (SKILL.md plus any supporting files, such as `ps-creator/scripts/preflight.py`), exactly as ProSkill serves it.
- `plugins/proskill/skills/` is generated from those two. Never edit it by hand.
- `chatgpt/` holds the ChatGPT plugin's `plugin.json`, `mcp.json` and icon. The build adds the version (taken from the Claude Code plugin), writes them into `plugins/proskill/` for ChatGPT's GitHub import, and writes `dist/chatgpt/proskill.zip` with the skills (not committed). Never edit the copies in `plugins/proskill/` by hand.
- `scripts/stamp.mjs` writes the update-check note into every SKILL.md, in the same words as the server (`src/lib/skills/skill-md-stamp.ts` in pro-skill). Stamping replaces any older note, so no output carries the revision 2 block ChatGPT refuses.

```bash
npm run build              # stamp sources/ into the plugin (no network)
npm run build -- --fetch   # refresh sources/ from ProSkill first, then build
npm run build -- --bundles <dir>   # same, from <slug>.skill files already downloaded and verified
npm test                   # node --test: the plugin matches its pins
```

`--fetch` calls `install_skill` for every pinned skill (each call records an install on your account), downloads its signed `.skill` bundle, checks its size and SHA-256, unpacks every file into `sources/<slug>/`, and re-pins its version. It needs a ProSkill MCP token: mint one at **Settings > Claude Code Access** and export it as `PROSKILL_MCP_TOKEN`, or save it as the first line of `~/.config/pro-skill/mcp-token`. Never paste a token into a chat or commit it.

A skill's text changes on ProSkill first (published as a new version), then here through `--fetch`. Every build that changes a skill bumps the plugin's patch version, so installed copies see an update.

### Releasing

```bash
node scripts/release.mjs bump minor   # or major, patch, or an explicit X.Y.Z; rebuilds both targets
node scripts/release.mjs check        # build, npm test, claude plugin validate (strict), CHANGELOG entry
node scripts/release.mjs tag          # check, clean tree, then a local annotated tag vX.Y.Z
```

Add a section for the new version to `CHANGELOG.md` before `check`. Tag only the commit on `main` that ships; the script never pushes, and prints the push command. GitHub Actions cannot run for this org, so this script is the release gate.

Requires Node 22 or later. No dependencies.

## License

MIT, see [LICENSE](LICENSE). It covers the build tooling and the skill texts in this repo.
