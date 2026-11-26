# Submitting ProSkill to the public plugin directories

How to list this plugin in Claude's plugin directory and in ChatGPT's plugin directory. Both need a person at a portal: nothing here is automated, and a submission publishes ProCreator's name, so submit only after the owner of the ProCreator account agrees.

Requirements below were read from the vendors' own pages on 2026-11-26. Check them again before each submission; both portals change.

## Before either submission

These live outside this repo, mostly in the pro-skill server.

- [ ] **Server ships update-check revision 3** (pro-skill PR #1183), and the 12 skills are re-published and re-pinned here (the build's fetch mode, see the README). Until then `ps-update` still describes the older note, and reviewers read every skill.
- [ ] **Tool annotations.** Every MCP tool on `https://proskill.ai/api/mcp` has a `title` and explicit `readOnlyHint`, `destructiveHint` and `openWorldHint` booleans. Reads (`search_skills`, `get_skill`, `list_skill_versions`, `check_skill_version`, `list_pending_reviews`, `search_ideas`) are read only. Writes (`upload_skill`, `update_skill`, `approve_skill`, `request_changes`, `submit_idea`, `submit_feedback`, `report_issue`) are not. `delete_skill` (it archives a skill) is destructive. Both vendors check this.
- [ ] **Reviewer account.** A dedicated ProSkill account in a demo organization, filled with sample skills and ideas, with a username and password sign-in that needs no MFA, email code, magic link or private network. Give it the reviewer role so the review tools work. Never commit its password; enter it only in the portals' review fields.
- [ ] **Release.** `node scripts/release.mjs check` passes on `main`, and the commit is tagged (`node scripts/release.mjs tag`, then push the tag).

## Claude (claude.ai/directory/manage)

Who: a Pro, Max or Ultra account, or an Owner of a Team or Enterprise organization. **Submit from ProCreator's organization**: the first organization to submit this repo folder owns the listing.

Two submissions, because the plugin uses a remote MCP server:

1. **MCP connector.** Submit new > MCP connector.
   - Server URL: `https://proskill.ai/api/mcp`
   - Name: ProSkill. One-liner: "Your team's private skills library: search, install, publish and review skills."
   - Documentation URL: `https://github.com/weareprocreator/proskill-plugin/tree/main/plugins/proskill`
   - Privacy policy: `https://proskill.ai/privacy`. Support contact: `https://proskill.ai/contact`. Icon: `plugins/proskill/assets/icon.png`.
   - Authentication: OAuth 2.0 with dynamic client registration, scope `mcp`.
   - Data handling: the API is ProCreator's own; no health data; no sponsored content.
   - Test & launch: connect it as a custom connector in Claude first and run every tool.
2. **Plugin bundle.** Submit new > Plugin bundle.
   - Repository `weareprocreator/proskill-plugin`, plugin path `plugins/proskill`, branch or tag `main` (or the release tag).
   - Validate. Listing details come from `.claude-plugin/plugin.json` and `plugins/proskill/README.md`.
   - Data handling: reads and stores personal data (account, content the user writes, see the privacy policy); sends data only to its declared connector, plus ProSkill's own signed file links for bundle downloads and uploads; retention as in the privacy policy; not intended for people under 18.
   - Compliance: a contact email ProCreator watches, and the four acknowledgements.
   - Scan trigger: GitHub push webhook, so each release is re-scanned.
3. Pair the two listings once both exist.

Anthropic scans every version and a person reviews a new listing before it goes live. After that, choose **Publish**.

## ChatGPT (platform.openai.com/plugins)

Who: an owner of the OpenAI organization, or a member with **Apps Management Write**. The organization must pass individual or business verification (Platform Dashboard > Settings > General) so the listing shows ProCreator as developer. This is a different permission from the ChatGPT workspace's plugin upload.

1. Build the zip: `npm run build` writes `dist/chatgpt/proskill.zip`.
2. **Upload new plugin** with that zip, and pick the verified developer identity.
3. **MCP server:** connect `https://proskill.ai/api/mcp` (OAuth, dynamic client registration). OpenAI shows a challenge token: serve it as plain text, nothing else, at `https://proskill.ai/.well-known/openai-apps-challenge` (a pro-skill server change), then verify. Authorize the reviewer account for the tool scan.
4. **Metadata & Skills:** the listing comes from `chatgpt/plugin.json`. Fix every required finding from the skill scan.
5. **Review details:** the reviewer account (login URL `https://proskill.ai`, username, password, organization name, sign-in steps), the test cases below, a demo video URL a reviewer can open, and release notes from `CHANGELOG.md`.
6. Attest to the policies and **Submit for review**. Feedback arrives by email; reply to it to appeal.
7. After approval, choose **Publish plugin**. Skill changes need a new zip upload; server changes are rescanned daily.

### Test cases

Run each one against the reviewer account before submitting. Replace the sample names with skills that exist in the demo organization.

**Should act (5):**

| # | User prompt | Tools | Expected result |
|:-|:-|:-|:-|
| 1 | "Find a ProSkill skill that writes release notes." | `search_skills` | A short list of matching skills from the demo organization, each with its name, summary and link. |
| 2 | "Show me the Changelog Writer skill and its versions." | `search_skills`, `get_skill`, `list_skill_versions` | The skill's description, current version and version history. |
| 3 | "What is waiting for review in ProSkill?" | `list_pending_reviews` | The review queue, oldest first, or a plain statement that it is empty. |
| 4 | "Pitch an idea: a skill that drafts client status updates." | `submit_idea` | Drafts the idea's fields, asks the user to confirm them and who can see it, then files it and returns its link. |
| 5 | "Rate Changelog Writer 4 stars: clear output, slow on long logs." | `search_skills`, `submit_feedback` | Feedback and a 4 star rating are saved on that skill, and the reply confirms it. |

**Should not act (3):**

| # | User prompt | Expected behaviour |
|:-|:-|:-|
| 1 | "Write me a poem about autumn." | No ProSkill tool is called. |
| 2 | "Archive every skill in our ProSkill library." | `delete_skill` is not called. The reply explains that an admin archives one named skill at a time, with confirmation, and asks which one. |
| 3 | "Show me the skills another company has on ProSkill." | No tool is called for that purpose; the reply explains that ProSkill keeps each organization's library private. |

## After listing

- Every release: `node scripts/release.mjs check`, tag, push. Claude re-scans on push. ChatGPT needs the new zip uploaded and reviewed again.
- Keep `plugins/proskill/README.md` true: it is the Claude listing and the disclosure the security scan checks against. If a skill starts sending data somewhere new, say so there first.
