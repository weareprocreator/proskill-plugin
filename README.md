# ProSkill plugin for Claude Code

One install gives Claude Code everything a [ProSkill](https://proskill.ai) member needs: the ProSkill MCP server and every skill in the PS Starter Pack.

```
/plugin marketplace add weareprocreator/proskill-plugin
/plugin install proskill@proskill
```

The first ProSkill tool call opens ProSkill's sign-in in your browser (or run `/mcp`, pick `proskill`, and sign in ahead of time). There is no token to paste.

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

Each skill checks with ProSkill before it runs (`check_skill_version`), so it tells you when a newer version is out, follows a rollback, and stops if the skill was retired. New skill versions reach plugin users through plugin updates (`/plugin update proskill@proskill`).

## Maintaining this repo

- `starter-pack.json` pins which skills ship, the live version of each, and a hash of its folder.
- `sources/<slug>/` is each skill's folder (SKILL.md plus any supporting files, such as `ps-creator/scripts/preflight.py`), exactly as ProSkill serves it.
- `plugins/proskill/skills/` is generated from those two. Never edit it by hand.

```bash
npm run build              # stamp sources/ into the plugin (no network)
npm run build -- --fetch   # refresh sources/ from ProSkill first, then build
npm run build -- --bundles <dir>   # same, from <slug>.skill files already downloaded and verified
npm test                   # node --test: the plugin matches its pins
```

`--fetch` calls `install_skill` for every pinned skill (each call records an install on your account), downloads its signed `.skill` bundle, checks its size and SHA-256, unpacks every file into `sources/<slug>/`, and re-pins its version. It needs a ProSkill MCP token: mint one at **Settings > Claude Code Access** and export it as `PROSKILL_MCP_TOKEN`, or save it as the first line of `~/.config/pro-skill/mcp-token`. Never paste a token into a chat or commit it.

A skill's text changes on ProSkill first (published as a new version), then here through `--fetch`. Every build that changes a skill bumps the plugin's patch version, so installed copies see an update.

Requires Node 22 or later. No dependencies.
