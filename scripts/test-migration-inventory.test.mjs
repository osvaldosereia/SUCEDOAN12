import assert from "node:assert/strict";
import test from "node:test";
import { compareHistory, digestSql } from "./migration-inventory.mjs";

const a = "20261128190000";
const b = "20261128190100";
const c = "20261128190200";
const row = (version, name, sql) => ({ version, name, digest: sql == null ? null : digestSql(sql) });

test("normalizes line endings and edge whitespace without hiding differences in SQL", () => {
  assert.equal(digestSql("  select 1;\r\nselect 2;\r\n"), digestSql("select 1;\nselect 2;"));
  assert.notEqual(digestSql("select 1;"), digestSql("select 2;"));
});

test("checks matching versions by content and reports unmatched rows on either side", () => {
  const out = compareHistory([row(a, "one", "select 1"), row(b, "two", "select 2")],
    [row(a, "one", "select 3"), row(c, "three", "select 4")]);
  assert.equal(out.matches[0].via, "version");
  assert.equal(out.matches[0].content, "different");
  assert.deepEqual(out.githubOnly.map(x => x.version), [b]);
  assert.deepEqual(out.supabaseOnly.map(x => x.version), [c]);
});

test("recognizes an earlier timestamp by a unique name or an identical SQL digest", () => {
  const named = compareHistory([row(a, "basket_price", "select 1")], [row(b, a + "_basket_price", "select 2")]);
  assert.equal(named.matches[0].via, "name");
  assert.equal(named.matches[0].content, "different");
  const renamed = compareHistory([row(a, "basket_old", "select 1")], [row(b, "basket_new", "select 1")]);
  assert.equal(renamed.matches[0].via, "content");
  assert.equal(renamed.matches[0].content, "identical");
});

test("matches exact versions first and refuses ambiguous or unavailable content", () => {
  const same = compareHistory([row(a, "one", "select 1"), row(b, "renamed", "select 1")],
    [row(b, "one", "select 1"), row(c, "third", null)]);
  assert.deepEqual(same.matches.map(x => [x.github.version, x.via]), [[b, "version"]]);
  const ambiguous = compareHistory([row(a, "one", "select 1")], [row(b, "one", "select 1"), row(c, "one", "select 1")]);
  assert.equal(ambiguous.ambiguous.length, 1);
  assert.equal(ambiguous.matches.length, 0);
  const unknown = compareHistory([row(a, "one", "select 1")], [row(a, "one", null)]);
  assert.equal(unknown.matches[0].content, "unknown");
});
