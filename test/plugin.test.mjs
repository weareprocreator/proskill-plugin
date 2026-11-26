// test/plugin.test.mjs: the committed plugin against the rules
// scripts/build.mjs applies. Run with `npm test` (node --test, no dependencies).
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { crc32, deflateRawSync } from "node:zlib";
import { buildChatgptZip, portablePluginFiles, readTree } from "../scripts/build.mjs";
import { changelogHas, nextVersion } from "../scripts/release.mjs";
import {
  CHATGPT_TEMPLATE_DIR,
  CHATGPT_ZIP_PATH,
  CHATGPT_ZIP_ROOT,
  DEFAULT_MCP_URL,
  MANIFEST_PATH,
  PLUGIN_DIR,
  PLUGIN_JSON_PATH,
  SKILLS_DIR,
  buildSkillFiles,
  bumpPatch,
  chatgptPluginFiles,
  extractBundle,
  parseManifest,
  safeRelativePath,
  sourceDir,
  stampProblem,
  toolResultText,
  treeHash,
  zipFiles,
} from "../scripts/lib.mjs";
import { UPDATE_CHECK_END, UPDATE_CHECK_REVISION, UPDATE_CHECK_START, stampSkillMd, updateCheckBlock } from "../scripts/stamp.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const manifest = parseManifest(read(MANIFEST_PATH));
const TEXT = /\.(md|txt|py|sh|js|mjs|ts|json|ya?ml)$/;

// Phrases only the revision 2 update-check block carries (each appears once per
// served source, inside its block). ChatGPT refuses a skill that holds them.
const REVISION_2_PHRASES = ["do this before anything else in this skill", "Call the ProSkill MCP tool"];
// The retired host, spelled in pieces so this file does not name it.
const OLD_HOST = ["skills", "procreator", "design"].join(".");
// ps-update's served text has a section for people who used the old host; the
// plugin cannot edit served texts, so that one file may name it until the
// server text changes (see CHANGELOG, 1.1.0).
const OLD_HOST_ALLOWED = new Set(["sources/ps-update/SKILL.md", `${SKILLS_DIR}/ps-update/SKILL.md`, `${CHATGPT_ZIP_ROOT}/skills/ps-update/SKILL.md`]);

/** Why a stamped SKILL.md does not carry exactly the current note, or null. */
function noteProblem(text, pin) {
  const ends = text.split(UPDATE_CHECK_END).length - 1;
  if (ends !== 1) return `${pin.slug}: ${ends} update-check end markers, want 1`;
  const start = text.indexOf(UPDATE_CHECK_START);
  const block = text.slice(start, text.indexOf(UPDATE_CHECK_END) + UPDATE_CHECK_END.length);
  if (block !== updateCheckBlock(pin)) return `${pin.slug}: the update-check block is not revision ${UPDATE_CHECK_REVISION}`;
  const old = REVISION_2_PHRASES.find((p) => text.includes(p));
  if (old) return `${pin.slug}: still carries revision 2 text (${JSON.stringify(old)})`;
  return null;
}

const zipBytes = buildChatgptZip(ROOT);
const zipEntries = extractBundle(zipBytes, { stripTop: false });
const zipFile = (p) => zipEntries.find((f) => f.path === p);

/** A zip of the given entries; method 0 (stored) or 8 (deflate). */
function zip(entries, method = 0) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, body] of entries) {
    const n = Buffer.from(name);
    const raw = Buffer.from(body);
    const data = method === 8 ? deflateRawSync(raw) : raw;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc32(raw), 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(n.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc32(raw), 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(n.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, n, data);
    centrals.push(central, n);
    offset += local.length + n.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

describe("the committed plugin", () => {
  it("ships exactly the pinned skills, and keeps one source folder per pinned skill", () => {
    const slugs = manifest.skills.map((s) => s.slug).sort();
    assert.deepEqual(readdirSync(join(ROOT, SKILLS_DIR)).sort(), slugs);
    const sources = readdirSync(join(ROOT, "sources")).filter((n) => n !== ".DS_Store").sort();
    assert.deepEqual(sources, slugs);
    for (const s of sources) assert.ok(statSync(join(ROOT, "sources", s)).isDirectory(), `sources/${s} is a folder`);
  });

  for (const pin of manifest.skills) {
    it(`${pin.slug} is its pinned source folder, with SKILL.md stamped`, () => {
      const built = buildSkillFiles(readTree(join(ROOT, sourceDir(pin.slug))), pin);
      const committed = readTree(join(ROOT, SKILLS_DIR, pin.slug));
      assert.equal(treeHash(committed), treeHash(built), "run npm run build");
      const skillMd = committed.find((f) => f.path === "SKILL.md").bytes.toString("utf8");
      assert.equal(stampProblem(skillMd, pin), null);
      assert.match(skillMd, /^---\nname: \S+\ndescription: /);
    });
  }

  it("names the plugin and gives it a semver version", () => {
    const plugin = JSON.parse(read(PLUGIN_JSON_PATH));
    assert.equal(plugin.name, "proskill");
    assert.match(plugin.version, /^\d+\.\d+\.\d+$/);
  });

  it("registers one proskill MCP server over OAuth (no auth header)", () => {
    const { mcpServers } = JSON.parse(read(`${PLUGIN_DIR}/.mcp.json`));
    assert.deepEqual(Object.keys(mcpServers), ["proskill"]);
    assert.equal(mcpServers.proskill.type, "http");
    assert.equal(mcpServers.proskill.headers, undefined);
    assert.equal(mcpServers.proskill.url, `\${PROSKILL_MCP_URL:-${DEFAULT_MCP_URL}}`);
  });

  it("is listed by the marketplace at its own folder", () => {
    const market = JSON.parse(read(".claude-plugin/marketplace.json"));
    assert.equal(market.plugins.find((p) => p.name === "proskill")?.source, `./${PLUGIN_DIR}`);
    assert.ok(existsSync(join(ROOT, PLUGIN_JSON_PATH)));
  });

  it("meets the Claude plugin directory's pre-submission rules", () => {
    const plugin = JSON.parse(read(PLUGIN_JSON_PATH));
    assert.match(plugin.name, /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/);
    assert.ok(!["claude", "anthropic", "official", "plugin", "mcp", "test"].includes(plugin.name));
    for (const key of ["description", "version", "license"]) assert.ok(plugin[key], key);
    assert.ok(plugin.author?.name, "author.name");
    // The listing description: a README in the plugin folder, 40 words or more outside code blocks.
    const readme = read(`${PLUGIN_DIR}/README.md`).replace(/```[\s\S]*?```/g, "");
    assert.ok(readme.split(/\s+/).filter(Boolean).length >= 40, "plugin README has at least 40 words");
    // It discloses every destination and every place the skills write to.
    for (const must of [DEFAULT_MCP_URL, "signed", "~/.claude/skills", "Downloads", "preflight.py", "PROSKILL_MCP_URL", "https://proskill.ai/privacy"]) {
      assert.ok(readme.includes(must), `plugin README mentions ${must}`);
    }
    const files = readTree(join(ROOT, PLUGIN_DIR));
    assert.ok(files.length <= 512, "512 files at most");
    for (const f of files) {
      assert.ok(!/(^|\/)(\.DS_Store|Thumbs\.db|desktop\.ini|__MACOSX)(\/|$)/.test(f.path), f.path);
      if (!/\.(png|jpe?g|gif|webp|svg|woff2?|ttf|otf)$/i.test(f.path)) assert.ok(f.bytes.length < 256 * 1024, `${f.path} is under 256 KiB`);
    }
    assert.ok(!existsSync(join(ROOT, PLUGIN_DIR, "hooks")), "no hooks");
  });

  it("publishes no email address other than placeholders, in any text file", () => {
    for (const pin of manifest.skills) {
      for (const f of readTree(join(ROOT, SKILLS_DIR, pin.slug)).filter((x) => TEXT.test(x.path))) {
        const emails = f.bytes.toString("utf8").match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g) ?? [];
        const real = emails.filter((e) => !/@example\.(com|org|net)$/.test(e));
        assert.deepEqual(real, [], `${pin.slug}/${f.path} names a real-looking address`);
      }
    }
  });
});

describe("the stamp (revision 3)", () => {
  it("is one informational line between the markers, with no orders to the assistant", () => {
    const block = updateCheckBlock({ slug: "demo", version: "v1.2" });
    const lines = block.split("\n");
    assert.equal(UPDATE_CHECK_REVISION, "3");
    assert.deepEqual([lines[0], lines.at(-1)], [UPDATE_CHECK_START, UPDATE_CHECK_END]);
    assert.equal(lines.length, 3);
    assert.match(lines[1], /slug `demo`, version `v1\.2`/);
    for (const p of REVISION_2_PHRASES) assert.ok(!block.includes(p), p);
  });

  for (const eol of ["\n", "\r\n"]) {
    it(`replaces a revision 2 block (${eol === "\n" ? "LF" : "CRLF"}) and stays idempotent`, () => {
      const rev2 = [
        "---", "name: demo", "description: A demo.", "metadata:", '  proskill-slug: "demo"', '  proskill-version: "v1"', "---", "",
        UPDATE_CHECK_START,
        "> **ProSkill update check (do this before anything else in this skill).**",
        "> This skill came from ProSkill: slug `demo`, version `v1`.",
        '> 1. Call the ProSkill MCP tool `check_skill_version` with `{ "slug": "demo", "installedVersion": "v1" }`.',
        "> 2. `up_to_date`: continue below.",
        UPDATE_CHECK_END,
        "# demo", "",
      ].join(eol);
      const out = stampSkillMd(rev2, { slug: "demo", version: "v1" });
      assert.equal(noteProblem(out.replaceAll("\r\n", "\n"), { slug: "demo", version: "v1" }), null);
      assert.ok(out.endsWith(`${UPDATE_CHECK_END}${eol}# demo${eol}`));
      assert.equal(out.includes("\r\n"), eol === "\r\n");
      assert.equal(stampSkillMd(out, { slug: "demo", version: "v1" }), out);
    });
  }
});

describe("no revision 2 block in any output", () => {
  it("the check flags every source that still carries the served revision 2 block", () => {
    // Until the server serves revision 3 and the pack is re-pinned, every source
    // carries revision 2 as served; afterwards this loop finds none, which is fine.
    for (const pin of manifest.skills) {
      const text = read(`${sourceDir(pin.slug)}/SKILL.md`);
      if (REVISION_2_PHRASES.some((p) => text.includes(p))) assert.notEqual(noteProblem(text, pin), null, pin.slug);
    }
  });
  for (const pin of manifest.skills) {
    it(`${pin.slug}: Claude and ChatGPT copies carry exactly the revision 3 note`, () => {
      assert.equal(noteProblem(read(`${SKILLS_DIR}/${pin.slug}/SKILL.md`), pin), null);
      assert.equal(noteProblem(zipFile(`${CHATGPT_ZIP_ROOT}/skills/${pin.slug}/SKILL.md`).bytes.toString("utf8"), pin), null);
    });
  }
});

describe("the ChatGPT target", () => {
  const pluginJson = JSON.parse(zipFile(`${CHATGPT_ZIP_ROOT}/plugin.json`).bytes.toString("utf8"));
  const mcpJson = JSON.parse(zipFile(`${CHATGPT_ZIP_ROOT}/mcp.json`).bytes.toString("utf8"));

  it("builds the same bytes every time", () => {
    assert.equal(treeHash([{ path: "z", bytes: buildChatgptZip(ROOT) }]), treeHash([{ path: "z", bytes: zipBytes }]));
  });

  it("holds plugin.json, mcp.json, the icon and exactly the pinned skills, all under one folder", () => {
    assert.ok(zipEntries.every((f) => f.path.startsWith(`${CHATGPT_ZIP_ROOT}/`)));
    const slugs = [...new Set(zipEntries.filter((f) => f.path.startsWith(`${CHATGPT_ZIP_ROOT}/skills/`)).map((f) => f.path.split("/")[2]))].sort();
    assert.deepEqual(slugs, manifest.skills.map((s) => s.slug).sort());
    for (const p of ["plugin.json", "mcp.json", "assets/icon.png"]) assert.ok(zipFile(`${CHATGPT_ZIP_ROOT}/${p}`), p);
  });

  it("ships every skill byte for byte as the Claude plugin does", () => {
    for (const pin of manifest.skills) {
      const claude = readTree(join(ROOT, SKILLS_DIR, pin.slug));
      const chatgpt = zipEntries
        .filter((f) => f.path.startsWith(`${CHATGPT_ZIP_ROOT}/skills/${pin.slug}/`))
        .map((f) => ({ path: f.path.slice(`${CHATGPT_ZIP_ROOT}/skills/${pin.slug}/`.length), bytes: f.bytes }));
      assert.equal(treeHash(chatgpt), treeHash(claude), pin.slug);
    }
  });

  it("carries the Claude plugin's version and points at proskill.ai over OAuth with dynamic client registration", () => {
    assert.equal(pluginJson.name, "proskill");
    assert.equal(pluginJson.version, JSON.parse(read(PLUGIN_JSON_PATH)).version);
    assert.equal(pluginJson.homepage, "https://proskill.ai");
    const ui = pluginJson.extensions["com.openai"].interface;
    assert.equal(ui.displayName, "ProSkill");
    for (const icon of [ui.logo, ui.composerIcon]) assert.ok(zipFile(`${CHATGPT_ZIP_ROOT}/${icon.replace(/^\.\//, "")}`), icon);
    assert.deepEqual(Object.keys(mcpJson.mcpServers), ["proskill"]);
    const server = mcpJson.mcpServers.proskill;
    assert.equal(server.type, "streamable-http");
    assert.equal(server.url, DEFAULT_MCP_URL);
    assert.deepEqual(server.extensions["com.openai"].auth, { type: "oauth", client: { mode: "dcr" }, baseScopes: ["mcp"], defaultScopes: ["mcp"] });
  });

  it("is also committed in the Claude plugin folder, for ChatGPT's GitHub marketplace import", () => {
    const portable = portablePluginFiles(ROOT);
    assert.deepEqual(portable.map((f) => f.path).sort(), ["assets/icon.png", "mcp.json", "plugin.json"]);
    for (const f of portable) {
      assert.ok(readFileSync(join(ROOT, PLUGIN_DIR, f.path)).equals(f.bytes), `${PLUGIN_DIR}/${f.path}: run npm run build`);
      assert.ok(zipFile(`${CHATGPT_ZIP_ROOT}/${f.path}`).bytes.equals(f.bytes), f.path);
    }
    // Claude Code keeps its own manifest and MCP file next to them.
    assert.ok(existsSync(join(ROOT, PLUGIN_JSON_PATH)));
    assert.ok(existsSync(join(ROOT, PLUGIN_DIR, ".mcp.json")));
  });

  it("links the privacy policy and terms on both platforms", () => {
    assert.equal(JSON.parse(read(PLUGIN_JSON_PATH)).privacyPolicyUrl, "https://proskill.ai/privacy");
    const ui = pluginJson.extensions["com.openai"].interface;
    assert.equal(ui.privacyPolicyURL, "https://proskill.ai/privacy");
    assert.equal(ui.termsOfServiceURL, "https://proskill.ai/terms");
  });

  it("meets the ChatGPT plugin directory's listing rules", () => {
    const openai = pluginJson.extensions["com.openai"];
    const ui = openai.interface;
    for (const key of ["websiteURL", "supportURL", "privacyPolicyURL", "termsOfServiceURL"]) {
      assert.match(ui[key] ?? "", /^https:\/\/[^\s@]+$/, key);
      assert.ok(ui[key].length <= 1024, key);
    }
    assert.ok(ui.displayName.length <= 30, "displayName is 30 characters at most");
    assert.ok(ui.shortDescription.length <= 30, "shortDescription is 30 characters at most");
    assert.ok(ui.longDescription.length <= 4000, "longDescription is 4000 characters at most");
    assert.ok(ui.developerName.length <= 80, "developerName is 80 characters at most");
    assert.ok(ui.defaultPrompt.length <= 3 && ui.defaultPrompt.every((p) => p.length <= 128), "defaultPrompt: 3 prompts of 128 characters at most");
    assert.ok(!/\b(mcp|plugin)\b/i.test(ui.displayName), "the display name carries no MCP or Plugin suffix");
    // The onboarding skill is a packaged SKILL.md, relative to the plugin root.
    assert.match(openai.onboardingSkill, /^\.\/skills\/[a-z0-9-]+\/SKILL\.md$/);
    assert.ok(zipFile(`${CHATGPT_ZIP_ROOT}/${openai.onboardingSkill.slice(2)}`), openai.onboardingSkill);
    assert.ok(existsSync(join(ROOT, PLUGIN_DIR, openai.onboardingSkill)), openai.onboardingSkill);
    // Public submission refuses lifecycle hooks, app references and server headers.
    assert.ok(!zipEntries.some((f) => /(^|\/)(hooks\/|\.app\.json$)/.test(f.path)), "no hooks or app references");
    assert.equal(pluginJson.apps, undefined);
    assert.equal(mcpJson.mcpServers.proskill.headers, undefined);
  });

  it("matches dist/chatgpt/proskill.zip when one is built", (t) => {
    if (!existsSync(join(ROOT, CHATGPT_ZIP_PATH))) return t.skip("no dist zip; run npm run build");
    assert.ok(readFileSync(join(ROOT, CHATGPT_ZIP_PATH)).equals(zipBytes), "run npm run build");
  });

  it("refuses templates that ship their own skills or lack a manifest", () => {
    const tpl = readTree(join(ROOT, CHATGPT_TEMPLATE_DIR));
    assert.throws(() => chatgptPluginFiles({ template: [...tpl, { path: "skills/x/SKILL.md", bytes: Buffer.from("x") }], version: "1.0.0", skills: [] }), /come from the build/);
    assert.throws(() => chatgptPluginFiles({ template: tpl.filter((f) => f.path !== "mcp.json"), version: "1.0.0", skills: [] }), /needs plugin\.json and mcp\.json/);
  });
});

describe("no file names the retired host", () => {
  it("in the repo or the ChatGPT zip, except ps-update's legacy section", () => {
    const repo = readTree(ROOT).filter((f) => !/^(\.git|node_modules|dist)(\/|$)/.test(f.path) && TEXT.test(f.path));
    const hits = [...repo, ...zipEntries.filter((f) => TEXT.test(f.path))]
      .filter((f) => f.bytes.toString("utf8").includes(OLD_HOST))
      .map((f) => f.path)
      .filter((p) => !OLD_HOST_ALLOWED.has(p));
    assert.deepEqual(hits, []);
  });
  it("in any manifest or MCP config of either target", () => {
    for (const p of [PLUGIN_JSON_PATH, `${PLUGIN_DIR}/.mcp.json`, `${PLUGIN_DIR}/plugin.json`, `${PLUGIN_DIR}/mcp.json`, ".claude-plugin/marketplace.json", "README.md", "CHANGELOG.md"]) {
      if (existsSync(join(ROOT, p))) assert.ok(!read(p).includes(OLD_HOST), p);
    }
    for (const p of ["plugin.json", "mcp.json"]) assert.ok(!zipFile(`${CHATGPT_ZIP_ROOT}/${p}`).bytes.toString("utf8").includes(OLD_HOST), p);
  });
});

describe("zipFiles", () => {
  it("round-trips through extractBundle, sorted, and refuses unsafe paths", () => {
    const files = [{ path: "p/b.txt", bytes: Buffer.from("b") }, { path: "p/a/c.md", bytes: Buffer.from("c".repeat(5000)) }];
    assert.deepEqual(extractBundle(zipFiles(files)).map((f) => [f.path, f.bytes.toString()]), [["a/c.md", "c".repeat(5000)], ["b.txt", "b"]]);
    assert.ok(zipFiles(files).equals(zipFiles([...files].reverse())));
    assert.throws(() => zipFiles([{ path: "../x", bytes: Buffer.from("x") }]), /unsafe path/);
  });
});

describe("release helpers", () => {
  it("nextVersion bumps each part or takes an explicit version", () => {
    assert.equal(nextVersion("1.0.1", "minor"), "1.1.0");
    assert.equal(nextVersion("1.1.0", "patch"), "1.1.1");
    assert.equal(nextVersion("1.1.0", "major"), "2.0.0");
    assert.equal(nextVersion("1.1.0", "1.2.3"), "1.2.3");
    assert.throws(() => nextVersion("1.1.0", "huge"), /bump needs/);
  });
  it("changelogHas finds a version section, and the committed CHANGELOG has the current version", () => {
    assert.ok(changelogHas("# Changelog\n\n## 1.1.0 (2026-11-23)\n", "1.1.0"));
    assert.ok(!changelogHas("## 1.1.01\n", "1.1.0"));
    assert.ok(changelogHas(read("CHANGELOG.md"), JSON.parse(read(PLUGIN_JSON_PATH)).version));
  });
});

describe("buildSkillFiles", () => {
  const md = "---\nname: demo\ndescription: A demo.\n---\n\n# demo\n";
  const files = [
    { path: "SKILL.md", bytes: Buffer.from(md) },
    { path: "scripts/run.py", bytes: Buffer.from("print('hi')\n") },
  ];
  const pinFor = (f, version = "v1.2") => ({ slug: "demo", version, sourceSha256: treeHash(f) });

  it("stamps SKILL.md, copies the other files as they are, and is idempotent", () => {
    const out = buildSkillFiles(files, pinFor(files));
    const skill = out.find((f) => f.path === "SKILL.md").bytes.toString("utf8");
    assert.match(skill, /proskill-version: "v1\.2"/);
    assert.equal(stampProblem(skill, pinFor(files)), null);
    assert.match(stampProblem(skill, pinFor(files, "v2")), /stamped demo v1\.2, pinned demo v2/);
    assert.deepEqual(out.find((f) => f.path === "scripts/run.py").bytes, files[1].bytes);
    const again = [{ path: "SKILL.md", bytes: Buffer.from(skill) }, files[1]];
    assert.equal(buildSkillFiles(again, pinFor(again)).find((f) => f.path === "SKILL.md").bytes.toString("utf8"), skill);
  });

  it("refuses a folder that is not the pinned one, has no SKILL.md or frontmatter, or an unsafe path", () => {
    const changed = [files[0], { path: "scripts/run.py", bytes: Buffer.from("changed") }];
    assert.throws(() => buildSkillFiles(changed, pinFor(files)), /is not the pinned/);
    const noSkill = [files[1]];
    assert.throws(() => buildSkillFiles(noSkill, pinFor(noSkill)), /has no SKILL\.md/);
    const noFront = [{ path: "SKILL.md", bytes: Buffer.from("# no frontmatter\n") }];
    assert.throws(() => buildSkillFiles(noFront, pinFor(noFront)), /no frontmatter/);
    const unsafe = [files[0], { path: "../evil", bytes: Buffer.from("x") }];
    assert.throws(() => buildSkillFiles(unsafe, pinFor(unsafe)), /unsafe path/);
  });
});

describe("treeHash", () => {
  it("ignores order and changes with any path or byte", () => {
    const a = { path: "SKILL.md", bytes: Buffer.from("a") };
    const b = { path: "x/y.md", bytes: Buffer.from("b") };
    assert.equal(treeHash([a, b]), treeHash([b, a]));
    assert.notEqual(treeHash([a, b]), treeHash([a, { path: "x/z.md", bytes: b.bytes }]));
    assert.notEqual(treeHash([a, b]), treeHash([a, { path: b.path, bytes: Buffer.from("c") }]));
  });
});

describe("extractBundle", () => {
  it("strips the one top-level folder and keeps every file, stored or deflated", () => {
    const out = extractBundle(zip([["demo/", ""], ["demo/SKILL.md", "hello"], ["demo/scripts/run.py", "print(1)"]], 8));
    assert.deepEqual(out.map((f) => [f.path, f.bytes.toString()]), [["SKILL.md", "hello"], ["scripts/run.py", "print(1)"]]);
  });
  it("keeps paths as they are when files sit at the top", () => {
    assert.deepEqual(extractBundle(zip([["SKILL.md", "x"]])).map((f) => f.path), ["SKILL.md"]);
  });
  it("skips macOS clutter, refuses a path that leaves the folder, and returns null for non-zip bytes", () => {
    assert.deepEqual(extractBundle(zip([["d/SKILL.md", "x"], ["__MACOSX/d/._SKILL.md", "y"], ["d/.DS_Store", "z"]])).map((f) => f.path), ["SKILL.md"]);
    assert.throws(() => extractBundle(zip([["d/../../etc/passwd", "x"]])), /would leave the skill folder/);
    assert.equal(extractBundle(Buffer.from("not a zip at all, just text")), null);
  });
  it("safeRelativePath accepts only paths inside the folder", () => {
    assert.equal(safeRelativePath("scripts/run.py"), "scripts/run.py");
    for (const bad of ["/abs", "C:/x", "a/../b", "./a", "a//b", ""]) assert.equal(safeRelativePath(bad), null, bad);
  });
});

describe("parseManifest", () => {
  const ok = { slug: "a", version: "v1", sourceSha256: "0".repeat(64) };
  for (const [name, value, error] of [
    ["no skills", { pack: "P", skills: [] }, /non-empty/],
    ["a duplicate", { pack: "P", skills: [ok, ok] }, /listed twice/],
    ["a short hash", { pack: "P", skills: [{ ...ok, sourceSha256: "abc" }] }, /64-hex/],
    ["a bare version", { pack: "P", skills: [{ ...ok, version: "1.0" }] }, /version like/],
  ]) {
    it(`rejects ${name}`, () => assert.throws(() => parseManifest(JSON.stringify(value)), error));
  }
});

describe("toolResultText", () => {
  const ok = { jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: '{"a":1}' }] } };
  it("reads plain JSON and an SSE frame", () => {
    assert.equal(toolResultText(JSON.stringify(ok)), '{"a":1}');
    assert.equal(toolResultText(`event: message\ndata: ${JSON.stringify(ok)}\n\n`), '{"a":1}');
  });
  it("throws tool and JSON-RPC errors", () => {
    const toolErr = { ...ok, result: { isError: true, content: [{ type: "text", text: "Skill not found" }] } };
    assert.throws(() => toolResultText(JSON.stringify(toolErr)), /Skill not found/);
    assert.throws(() => toolResultText(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { message: "bad" } })), /bad/);
  });
});

describe("bumpPatch", () => {
  it("bumps the patch and refuses anything else", () => {
    assert.equal(bumpPatch("1.4.9"), "1.4.10");
    assert.throws(() => bumpPatch("1.4"), /MAJOR\.MINOR\.PATCH/);
  });
});
