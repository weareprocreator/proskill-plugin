// test/plugin.test.mjs: the committed plugin against the rules
// scripts/build.mjs applies. Run with `npm test` (node --test, no dependencies).
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { crc32, deflateRawSync } from "node:zlib";
import {
  DEFAULT_MCP_URL,
  MANIFEST_PATH,
  PLUGIN_DIR,
  PLUGIN_JSON_PATH,
  SKILLS_DIR,
  buildSkillMd,
  bumpPatch,
  extractSkillMd,
  parseManifest,
  sha256Hex,
  sourcePath,
  stampProblem,
  toolResultText,
} from "../scripts/lib.mjs";
import { stampSkillMd } from "../scripts/stamp.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const manifest = parseManifest(read(MANIFEST_PATH));

/** A one-entry zip; method 0 (stored) or 8 (deflate). */
function zip(name, body, method = 0) {
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
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length + n.length, 12);
  eocd.writeUInt32LE(local.length + n.length + data.length, 16);
  return Buffer.concat([local, n, data, central, n, eocd]);
}

describe("the committed plugin", () => {
  it("ships exactly the pinned skills, one SKILL.md each", () => {
    const dirs = readdirSync(join(ROOT, SKILLS_DIR)).sort();
    assert.deepEqual(dirs, manifest.skills.map((s) => s.slug).sort());
    for (const dir of dirs) assert.deepEqual(readdirSync(join(ROOT, SKILLS_DIR, dir)), ["SKILL.md"]);
  });

  it("keeps one source per pinned skill and nothing else", () => {
    const files = readdirSync(join(ROOT, "sources")).sort();
    assert.deepEqual(files, manifest.skills.map((s) => `${s.slug}.SKILL.md`).sort());
  });

  for (const pin of manifest.skills) {
    it(`${pin.slug} is its pinned source, stamped`, () => {
      const built = buildSkillMd(readFileSync(join(ROOT, sourcePath(pin.slug))), pin);
      const committed = read(join(SKILLS_DIR, pin.slug, "SKILL.md"));
      assert.equal(stampProblem(committed, pin), null);
      assert.equal(committed, built, "run npm run build");
      assert.match(committed, /^---\nname: \S+\ndescription: /);
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

  it("publishes no email address other than placeholders", () => {
    for (const pin of manifest.skills) {
      const emails = read(join(SKILLS_DIR, pin.slug, "SKILL.md")).match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g) ?? [];
      const real = emails.filter((e) => !/@example\.(com|org|net)$/.test(e));
      assert.deepEqual(real, [], `${pin.slug} names a real-looking address`);
    }
  });
});

describe("buildSkillMd", () => {
  const md = "---\nname: demo\ndescription: A demo.\n---\n\n# demo\n";
  const pinFor = (text, version = "v1.2") => ({ slug: "demo", version, sourceSha256: sha256Hex(Buffer.from(text)) });

  it("stamps idempotently", () => {
    const out = buildSkillMd(Buffer.from(md), pinFor(md));
    assert.equal(stampSkillMd(out, { slug: "demo", version: "v1.2" }), out);
    assert.match(out, /proskill-version: "v1\.2"/);
    assert.equal(stampProblem(out, pinFor(md)), null);
    assert.match(stampProblem(out, pinFor(md, "v2")), /stamped demo v1\.2, pinned demo v2/);
  });

  it("refuses a source that is not the pinned one, or has no frontmatter", () => {
    assert.throws(() => buildSkillMd(Buffer.from(`${md}x`), pinFor(md)), /is not the pinned/);
    assert.throws(() => buildSkillMd(Buffer.from("# no frontmatter\n"), pinFor("# no frontmatter\n")), /no frontmatter/);
  });
});

describe("extractSkillMd", () => {
  it("reads stored and deflated SKILL.md entries, nested or not", () => {
    assert.equal(extractSkillMd(zip("demo/SKILL.md", "hello")), "hello");
    assert.equal(extractSkillMd(zip("SKILL.md", "hello deflated", 8)), "hello deflated");
  });
  it("returns null for a zip without SKILL.md and for non-zip bytes", () => {
    assert.equal(extractSkillMd(zip("demo/README.md", "x")), null);
    assert.equal(extractSkillMd(Buffer.from("not a zip at all, just text")), null);
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
