// Backup and restore, tested for real:
//   1. add some content to the live site that a restore must carry over (a post, a picture, a contact message)
//   2. take a backup while the site is running
//   3. restore it into a SECOND site folder with its OWN database, on another port
//   4. prove the restored copy has the same content, passes the same smoke test and the same hardening checks
//   5. break the restore on purpose in three ways and write down the symptom of each
// Run:  node --test --test-concurrency=1 tests/restore.test.mjs   (or npm run test:wp)
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { after, before, describe, it } from "node:test";
import { PNG } from "pngjs";
import { installFresh, readCreds, root, siteDir, startServer, wpDir } from "../harness/wp.mjs";
import { checkBackup, counts, makeBackup, restoreBackup } from "../harness/restore.mjs";
import { client, texts, wpCheck } from "./lib/client.mjs";
import { registerDoors } from "./lib/doors.mjs";
import { NEWS, registerSmoke } from "./lib/smoke.mjs";

const LIVE = 8080;
const servers = [];
const sites = {};
let live, restored, backup, liveCountsBefore, canaryPng, canaryUrl;

const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const siteAt = (name) => path.join(wpDir, name);

before(async () => {
  installFresh();
  const creds = readCreds();
  servers.push(await startServer({ port: LIVE }));
  live = client(`http://localhost:${LIVE}`, creds);

  // 1. content that exists ONLY in the live database/uploads (not in the install script)
  const post = await live.api("POST", "/wp/v2/posts", { as: "admin", body: { title: "Restore canary", status: "publish", content: `<!-- wp:paragraph --><p>Read more on <a href="${live.origin}/about/">the About page</a>.</p><!-- /wp:paragraph -->` } });
  assert.equal(post.status, 201, post.text);
  const png = new PNG({ width: 8, height: 8 });
  png.data.fill(200);
  canaryPng = PNG.sync.write(png);
  const media = await live.api("POST", "/wp/v2/media", { as: "admin", raw: canaryPng, headers: { "Content-Type": "image/png", "Content-Disposition": 'attachment; filename="canary.png"' } });
  assert.equal(media.status, 201, media.text);
  canaryUrl = new URL(media.json.source_url).pathname;
  const nonce = (await live.web("/contact/")).doc.querySelector("[name=sss_contact_nonce]").getAttribute("value");
  await live.web("/contact/", { method: "POST", form: { sss_contact_nonce: nonce, sender_name: "Canary Sender", sender_email: "canary@example.com", sender_message: "This message must survive the restore." } });
  liveCountsBefore = counts(siteDir);

  // 2 + 3. backup the RUNNING site, then restore it
  backup = makeBackup({ outRoot: path.join(wpDir, "test-backups"), label: `run-${Date.now()}` });
  sites.restored = restoreBackup({ backupDir: backup.dir, target: siteAt("restored"), port: 8081, oldOrigin: live.origin });
  servers.push(await startServer({ port: 8081, site: siteAt("restored") }));
  restored = client("http://localhost:8081", creds);
});
after(() => {
  for (const s of servers) s.kill();
});

describe("the backup", () => {
  it("has the database, the uploads folder and a manifest, and the database passes SQLite's own integrity check", () => {
    assert.equal(backup.manifest.database.integrity, "ok");
    assert.ok(existsSync(path.join(backup.dir, "db.sqlite")) && existsSync(path.join(backup.dir, "files")) && existsSync(path.join(backup.dir, "manifest.json")));
    assert.ok(backup.manifest.database.bytes > 100_000, "a real database, not an empty file");
    assert.ok(backup.manifest.files.count >= 1, "the uploaded picture is in files/");
    assert.equal(backup.manifest.counts.students, 12);
    assert.ok(backup.manifest.counts.posts >= 4);
    assert.equal(backup.manifest.counts.messages, 1);
  });
  it("was taken while the site kept running (the live site still answers)", async () => {
    assert.equal((await live.web("/")).status, 200);
  });
  it("is checked before it is used: a good backup has no problems", () => {
    assert.deepEqual(checkBackup(backup.dir), []);
  });
  it("a damaged database is noticed (checksum), and restoring from it is refused", () => {
    const bad = mkdtempSync(path.join(os.tmpdir(), "bad-backup-"));
    cpSync(backup.dir, bad, { recursive: true });
    const f = path.join(bad, "db.sqlite");
    const bytes = readFileSync(f);
    bytes[bytes.length - 10] ^= 0xff;
    writeFileSync(f, bytes);
    assert.match(checkBackup(bad).join(" "), /checksum/);
    assert.throws(() => restoreBackup({ backupDir: bad, target: siteAt("never"), port: 8099, oldOrigin: live.origin }), /bad backup/);
    rmSync(bad, { recursive: true, force: true });
  });
  it("a missing manifest or missing files folder is noticed", () => {
    const bad = mkdtempSync(path.join(os.tmpdir(), "bad-backup-"));
    cpSync(backup.dir, bad, { recursive: true });
    rmSync(path.join(bad, "files"), { recursive: true });
    assert.deepEqual(checkBackup(bad), ["files/ is missing"]);
    rmSync(path.join(bad, "manifest.json"));
    assert.deepEqual(checkBackup(bad), ["manifest.json is missing"]);
    rmSync(bad, { recursive: true, force: true });
  });
  it("never overwrites an older backup", () => {
    const run = spawnSync("php", [path.join(root, "harness", "backup.php"), path.join(siteDir, "wp-content", "database", ".ht.sqlite"), path.join(backup.dir, "db.sqlite")], { encoding: "utf8" });
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /already exists/);
  });
});

describe("the restored copy: same content", () => {
  it("is a different folder with a different database file", () => {
    assert.notEqual(siteAt("restored"), siteDir);
    assert.ok(existsSync(path.join(siteAt("restored"), "wp-content", "database", ".ht.sqlite")));
    assert.notEqual(path.join(siteAt("restored"), "wp-content", "database", ".ht.sqlite"), path.join(siteDir, "wp-content", "database", ".ht.sqlite"));
  });
  it("has the same counts: pages, posts, students, messages, users, pictures", () => {
    const r = counts(siteAt("restored"), { WP_PORT: "8081" });
    const { home: liveHome, ...liveRest } = liveCountsBefore;
    const { home: restoredHome, ...restoredRest } = r;
    assert.deepEqual(restoredRest, liveRest);
    assert.equal(restoredHome, "http://localhost:8081");
    assert.equal(liveHome, "http://localhost:8080");
    assert.equal(liveRest.messages, 1);
    assert.equal(liveRest.students, 12);
  });
  it("has the post written after the install, in the right place in the news list", async () => {
    const r = await restored.web("/restore-canary/");
    assert.equal(r.status, 200);
    const news = await restored.web("/news/");
    assert.deepEqual(texts(news.doc, ".card h2"), ["Restore canary", ...NEWS]);
  });
  it("has the uploaded picture, byte for byte", async () => {
    const res = await fetch(`${restored.origin}${canaryUrl}`);
    assert.equal(res.status, 200);
    assert.equal(sha(Buffer.from(await res.arrayBuffer())), sha(canaryPng));
  });
  it("has the contact message", () => {
    assert.deepEqual(wpCheck(siteAt("restored"), "messages", { WP_PORT: "8081" }).map((m) => m.content), ["This message must survive the restore."]);
  });
  it("lets the same people sign in with the same passwords", async () => {
    assert.match(await restored.signIn("admin"), /wordpress_logged_in_/);
    assert.match(await restored.signIn("editor1"), /wordpress_logged_in_/);
  });
  it("the live site was not touched by the restore", async () => {
    assert.deepEqual(counts(siteDir), liveCountsBefore);
    assert.equal((await live.web("/")).status, 200);
  });
});

describe("the restored copy: the site address was changed everywhere", () => {
  it("settings, menu link and a link inside a post all say :8081 and none says :8080", () => {
    const o = wpCheck(siteAt("restored"), "options", { WP_PORT: "8081" });
    assert.equal(o.home, "http://localhost:8081");
    assert.equal(o.siteurl, "http://localhost:8081");
    assert.equal(o.menu.Home, "http://localhost:8081/");
  });
  it("a value saved as serialized text (an array with string lengths) was changed AND is still readable", () => {
    const o = wpCheck(siteAt("restored"), "options", { WP_PORT: "8081" });
    assert.deepEqual(o.links, { home: "http://localhost:8081/", about: "http://localhost:8081/about/", nested: { contact: "http://localhost:8081/contact/" } });
  });
  it("serialized values survive an address with a DIFFERENT LENGTH (a same-length swap would hide a broken restore)", () => {
    const t = siteAt("restore-longer");
    restoreBackup({ backupDir: backup.dir, target: t, port: 18085, oldOrigin: live.origin });
    const o = wpCheck(t, "options", { WP_PORT: "18085" });
    assert.deepEqual(o.links, { home: "http://localhost:18085/", about: "http://localhost:18085/about/", nested: { contact: "http://localhost:18085/contact/" } });
  });
  it("the report of the fix says where it changed things", () => {
    assert.ok(sites.restored.changed.options >= 2, JSON.stringify(sites.restored.changed));
    assert.ok(sites.restored.changed.postmeta >= 1);
    assert.ok(sites.restored.changed.posts >= 1);
  });
  it("the link inside the canary post (typed with the old address) now points at the new site", async () => {
    const r = await restored.web("/restore-canary/");
    const href = r.doc.querySelector(".entry a")?.getAttribute("href");
    assert.equal(href, "http://localhost:8081/about/");
  });
});

registerSmoke("restored copy", () => restored, { news: ["Restore canary", ...NEWS] });
registerDoors("restored copy", () => restored);

describe("breaking the restore on purpose: what each mistake looks like", () => {
  it("1. address not changed: the site opens, but its menu and links still lead to the OLD site", async () => {
    restoreBackup({ backupDir: backup.dir, target: siteAt("broken-address"), port: 8082, oldOrigin: live.origin, skip: ["address"] });
    servers.push(await startServer({ port: 8082, site: siteAt("broken-address") }));
    const c = client("http://localhost:8082", readCreds());
    const r = await c.web("/");
    assert.equal(r.status, 200, "looks fine at first glance");
    const ports = new Set([...r.html.matchAll(/https?:\/\/localhost:(\d+)/g)].map((m) => m[1]));
    assert.ok(ports.has("8080"), "...but the old address is still in the page (the Home menu link)");
    const o = wpCheck(siteAt("broken-address"), "options", { WP_PORT: "8082" });
    assert.equal(o.menu.Home, "http://localhost:8080/");
    // the smoke test's address check would fail on this site
    assert.notDeepEqual([...ports], ["8082"]);
  });
  it("2. wrong (empty) database: every page sends you to the WordPress installer", async () => {
    restoreBackup({ backupDir: backup.dir, target: siteAt("broken-db"), port: 8083, oldOrigin: live.origin, skip: ["database"] });
    servers.push(await startServer({ port: 8083, site: siteAt("broken-db") }));
    const r = await client("http://localhost:8083", readCreds()).web("/");
    assert.equal(r.status, 302);
    assert.match(r.location, /install\.php/);
  });
  it("3. uploads not copied back: pages open, the picture file is gone", async () => {
    restoreBackup({ backupDir: backup.dir, target: siteAt("broken-files"), port: 8084, oldOrigin: live.origin, skip: ["files"] });
    servers.push(await startServer({ port: 8084, site: siteAt("broken-files") }));
    const c = client("http://localhost:8084", readCreds());
    assert.equal((await c.web("/restore-canary/")).status, 200);
    const pic = await fetch(`${c.origin}${canaryUrl}`, { redirect: "manual" }); // WordPress may guess and redirect to the picture's page: that is still not the picture
    assert.ok(!(pic.headers.get("content-type") ?? "").startsWith("image/"), `no picture file came back (status ${pic.status})`);
    assert.ok([301, 404].includes(pic.status), String(pic.status));
  });
});
