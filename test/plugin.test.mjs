// test/plugin.test.mjs: the committed plugin against the rules
// scripts/build.mjs applies. Run with `npm test` (node --test, no dependencies).
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { crc32, deflateRawSync } from "node:zlib";
import { readTree } from "../scripts/build.mjs";
import {
  DEFAULT_MCP_URL,
  MANIFEST_PATH,
  PLUGIN_DIR,
  PLUGIN_JSON_PATH,
  SKILLS_DIR,
  buildSkillFiles,
  bumpPatch,
  extractBundle,
  parseManifest,
  safeRelativePath,
  sourceDir,
  stampProblem,
  toolResultText,
  treeHash,
} from "../scripts/lib.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const manifest = parseManifest(read(MANIFEST_PATH));
const TEXT = /\.(md|txt|py|sh|js|mjs|ts|json|ya?ml)$/;

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
