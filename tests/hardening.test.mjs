// Hardening of the live test site: the three username doors, XML-RPC, login answers, and the two file editors.
// Run:  node --test --test-concurrency=1 tests/hardening.test.mjs   (or npm run test:wp)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { installFresh, readCreds, root, siteDir, startServer } from "../harness/wp.mjs";
import { KEY_NAMES, makeLines, randomValue } from "../hardening/make-keys.mjs";
import { client, wpCheck } from "./lib/client.mjs";
import { registerDoors } from "./lib/doors.mjs";

const PORT = 8080;
let server;
let c;
before(async () => {
  installFresh(); // an empty database every run
  server = await startServer({ port: PORT });
  c = client(`http://localhost:${PORT}`, readCreds());
});
after(() => server?.kill());

registerDoors("live site", () => c);

describe("the two file editors", () => {
  it("wp-config lines: DISALLOW_FILE_EDIT is on; DISALLOW_FILE_MODS and FORCE_SSL_ADMIN are not", () => {
    const r = wpCheck(siteDir, "caps");
    assert.equal(r.constants.DISALLOW_FILE_EDIT, true);
    assert.notEqual(r.constants.DISALLOW_FILE_MODS, true, "FILE_MODS would hide the Plugins menu");
    assert.notEqual(r.constants.FORCE_SSL_ADMIN, true, "left off on purpose: needs a working https host");
  });
  it("an administrator may not edit themes, plugins or files", () => {
    const r = wpCheck(siteDir, "caps");
    assert.deepEqual([r.withPlugin.edit_themes, r.withPlugin.edit_plugins, r.withPlugin.edit_files], [false, false, false]);
  });
  it("...but may still install and activate plugins (the Plugins menu is not hidden)", () => {
    const r = wpCheck(siteDir, "caps");
    assert.equal(r.withPlugin.install_plugins, true);
    assert.equal(r.withPlugin.activate_plugins, true);
  });
  it("the wp-config.php line alone is enough (the plugin's own lock taken away)", () => {
    const r = wpCheck(siteDir, "caps");
    assert.deepEqual([r.withoutPluginFilter.edit_themes, r.withoutPluginFilter.edit_plugins, r.withoutPluginFilter.edit_files], [false, false, false]);
  });
  it("the plugin's lock alone is enough (the wp-config.php line left out)", () => {
    const r = wpCheck(siteDir, "caps", { SSS_NO_CONFIG_LINES: "1" });
    assert.equal(r.constants.DISALLOW_FILE_EDIT, null, "the line really is absent in this run");
    assert.deepEqual([r.withPlugin.edit_themes, r.withPlugin.edit_plugins, r.withPlugin.edit_files], [false, false, false]);
  });
  it("(author links) a Visitor is never handed an author address", () => {
    assert.ok(!/author/.test(wpCheck(siteDir, "authorlink").visitor));
  });
  it("in the dashboard, both editor pages say 'not allowed' and the menu does not link to them", async () => {
    const cookie = await c.signIn("admin");
    for (const p of ["/wp-admin/theme-editor.php", "/wp-admin/plugin-editor.php"]) {
      const r = await c.web(p, { cookie });
      assert.equal(r.status, 403, p);
      assert.match(r.html, /not allowed/i);
    }
    const dash = await c.web("/wp-admin/", { cookie });
    assert.equal(dash.status, 200);
    assert.ok(!dash.html.includes("theme-editor.php") && !dash.html.includes("plugin-editor.php"));
    assert.ok(dash.html.includes("plugins.php"), "the Plugins menu is still there");
  });
});

describe("the notes and files that come with the site", () => {
  const read = (f) => readFileSync(path.join(root, "hardening", f), "utf8");
  it("the config lines file has the editor switch and keeps HTTPS as a comment", () => {
    const t = read("wp-config-lines.php");
    assert.match(t, /^\s*define\( 'DISALLOW_FILE_EDIT', true \);/m);
    assert.match(t, /^\/\/ define\( 'FORCE_SSL_ADMIN', true \);/m);
    assert.ok(!/^\s*define\( 'DISALLOW_FILE_MODS'/m.test(t));
    assert.ok(!/^\s*define\( 'FORCE_SSL_ADMIN'/m.test(t), "HTTPS must stay a comment until the host supports it");
  });
  it("the Apache file uses Apache 2.4 words, wraps Header in IfModule and has no <Directory>", () => {
    const t = read("htaccess.txt").split("\n").filter((l) => !l.trim().startsWith("#")).join("\n"); // the rules only, not the explanations
    assert.match(t, /Require all denied/);
    assert.ok(!/Order\s+deny|Deny from/i.test(t));
    assert.ok(!/<Directory/i.test(t));
    const headerLines = t.split("\n").filter((l) => /^\s*Header /.test(l));
    assert.ok(headerLines.length >= 2);
    assert.match(t, /<IfModule mod_headers\.c>[\s\S]*Header[\s\S]*<\/IfModule>/);
  });
  it("the uploads file stops PHP from running there", () => {
    const t = read("uploads-htaccess.txt").split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
    assert.match(t, /Require all denied/);
    assert.match(t, /php/);
  });
});

describe("secret keys: node hardening/make-keys.mjs", () => {
  it("prints the 8 WordPress key names, each with its own random 64-character value", () => {
    const lines = makeLines().split("\n");
    assert.equal(lines.length, 8);
    const values = lines.map((l, i) => {
      const m = l.match(/^define\( '([A-Z_]+)', '([A-Za-z0-9]{64})' \);$/);
      assert.ok(m, `line ${i + 1} has the right shape: ${l}`);
      assert.equal(m[1], KEY_NAMES[i]);
      return m[2];
    });
    assert.equal(new Set(values).size, 8, "all 8 values are different");
    assert.notEqual(makeLines(), makeLines(), "a second run gives new values");
  });
  it("none of the values is the placeholder text WordPress ships, and each uses many different characters", () => {
    for (let i = 0; i < 50; i++) {
      const v = randomValue();
      assert.ok(!/put your unique phrase here/.test(v));
      assert.ok(new Set(v).size >= 20, v);
    }
  });
  it("the test site's own keys are the fake ones, and the note says so", () => {
    assert.match(readFileSync(path.join(root, "harness", "wp-config.php"), "utf8"), /test-only-key-1/);
    assert.match(readFileSync(path.join(root, "hardening", "CONFIG-NOTE.txt"), "utf8"), /never copy those/);
  });
});
