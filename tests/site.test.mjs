// The school site itself: pages made of core blocks, the static front page, students and search, news, the contact form.
// Run:  node --test --test-concurrency=1 tests/site.test.mjs   (or npm run test:wp)
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { installFresh, readCreds, siteDir, startServer } from "../harness/wp.mjs";
import { client, texts, wpCheck } from "./lib/client.mjs";
import { NEWS, STUDENTS, registerSmoke } from "./lib/smoke.mjs";

const PORT = 8080;
let server;
let c;
let creds;
before(async () => {
  installFresh();
  creds = readCreds();
  server = await startServer({ port: PORT });
  c = client(`http://localhost:${PORT}`, creds);
});
after(() => server?.kill());

registerSmoke("live site", () => c);

describe("pages are made of core blocks only", () => {
  it("every block on every page has a name starting with core/", () => {
    const pages = wpCheck(siteDir, "blocks");
    assert.deepEqual(Object.keys(pages).sort(), ["about", "contact", "home", "news", "students"]);
    for (const [slug, names] of Object.entries(pages)) {
      assert.ok(names.length > 0 || slug === "news", `${slug} has blocks`);
      for (const n of names) assert.match(n, /^core\//, `${slug}: ${n}`);
    }
  });
  it("the pages use the blocks the brief needs (heading, buttons, columns, search, query loop, shortcode)", () => {
    const pages = wpCheck(siteDir, "blocks");
    assert.ok(["core/paragraph", "core/buttons", "core/button", "core/columns", "core/column"].every((b) => pages.home.includes(b)));
    assert.ok(["core/heading", "core/list", "core/list-item"].every((b) => pages.about.includes(b)));
    assert.ok(["core/search", "core/query", "core/post-template", "core/post-title"].every((b) => pages.students.includes(b)));
    assert.ok(pages.contact.includes("core/shortcode"));
  });
});

describe("static front page, posts page and menu", () => {
  it("settings: the front page is the Home page, News is the posts page", () => {
    const o = wpCheck(siteDir, "options");
    assert.equal(o.show_on_front, "page");
    assert.equal(o.front, "home");
    assert.equal(o.posts_page, "news");
    assert.ok(o.menu_location, "the menu is placed in the theme's menu spot");
  });
  it("/ is the page, not the list of posts; /news/ is the list", async () => {
    const home = await c.web("/");
    assert.ok(home.doc.body.className.split(" ").includes("page"));
    assert.ok(!home.doc.body.className.split(" ").includes("blog"));
    assert.equal(home.doc.querySelectorAll(".card").length, 0);
    const news = await c.web("/news/");
    assert.ok(news.doc.body.className.split(" ").includes("blog"));
  });
  it("the menu has 5 items in order and each goes to the right page", async () => {
    const r = await c.web("/");
    const links = [...r.doc.querySelectorAll(".menu > li > a")].map((a) => [a.textContent.trim(), new URL(a.getAttribute("href"), c.origin).pathname]);
    assert.deepEqual(links, [["Home", "/"], ["About", "/about/"], ["Students", "/students/"], ["News", "/news/"], ["Contact", "/contact/"]]);
  });
});

describe("students and the search box", () => {
  it("search finds only matching names", async () => {
    for (const term of ["an", "Rao", "sh", "TARA"]) {
      const r = await c.web(`/?s=${encodeURIComponent(term)}&post_type=student`);
      const expected = STUDENTS.filter((n) => n.toLowerCase().includes(term.toLowerCase()));
      assert.deepEqual(texts(r.doc, ".student").sort(), expected.sort(), term);
      assert.equal(r.status, 200);
    }
  });
  it("search results are names only: no news post is mixed in, because the box asks for students", async () => {
    const r = await c.web("/?s=a&post_type=student");
    assert.equal(r.doc.querySelectorAll(".card").length, 0);
  });
  it("the site-wide search (no box, no post_type) finds students too, as names only", async () => {
    const r = await c.web("/?s=Aarav");
    assert.deepEqual(texts(r.doc, ".student"), ["Aarav Mehta"]);
  });
  it("no match shows a friendly sentence, not an error", async () => {
    const r = await c.web("/?s=zzzzzz&post_type=student");
    assert.equal(r.status, 200);
    assert.deepEqual(texts(r.doc, ".empty"), ["Nothing found."]);
  });
  it("a draft or private student is never listed or found", async () => {
    const list = (await c.web("/students/")).html;
    assert.ok(!/Hidden Name/.test(list));
    assert.ok(!/Hidden Name/.test((await c.web("/?s=hidden&post_type=student")).html));
    assert.ok(!/Hidden Name/.test((await c.web("/?s=hidden")).html));
  });
  it("what a visitor types is shown as text, never run", async () => {
    const r = await c.web(`/?s=${encodeURIComponent("<script>alert(1)</script>")}&post_type=student`);
    assert.ok(!r.html.includes("<script>alert(1)</script>"));
    assert.ok(r.html.includes("&lt;script&gt;"));
  });
  it("a student has no page of their own: the address goes back to the Students page", async () => {
    for (const p of ["/student/aarav-mehta/", "/?post_type=student&p=9", "/?post_type=student"]) {
      const r = await c.web(p);
      assert.equal(r.status, 301, p);
      assert.match(r.location, /\/students\/$/);
    }
  });
  it("the REST API does not list students", async () => {
    assert.equal((await c.api("GET", "/wp/v2/student")).status, 404);
    assert.equal((await c.api("GET", "/wp/v2/students")).status, 404);
  });
});

describe("news", () => {
  it("shows the 3 published posts, newest first, and none of the 2 hidden ones or any student", async () => {
    const r = await c.web("/news/");
    assert.deepEqual(texts(r.doc, ".card h2"), NEWS);
    assert.ok(!/DRAFT|SCHEDULED|Mehta/.test(r.html));
  });
  it("a draft and a scheduled post answer 404 to a Visitor, even with their number", async () => {
    for (const id of [creds.posts.draft, creds.posts.future]) assert.equal((await c.web(`/?p=${id}`)).status, 404, String(id));
  });
  it("a news page does not print who wrote it", async () => {
    const r = await c.web("/annual-day-is-on-friday/");
    assert.equal(r.status, 200);
    assert.ok(!/Mrs Rao|School Office|admin/.test(texts(r.doc, "main").join(" ")));
  });
});

describe("contact form", () => {
  const nonce = async () => (await c.web("/contact/")).doc.querySelector("[name=sss_contact_nonce]").getAttribute("value");
  const post = async (fields, withNonce = true) => c.web("/contact/", { method: "POST", form: { ...(withNonce ? { sss_contact_nonce: await nonce() } : {}), ...fields } });
  const saved = () => wpCheck(siteDir, "messages");

  it("empty: the page comes back with one sentence per field, and nothing is saved", async () => {
    const r = await post({ sender_name: "", sender_email: "", sender_message: "" });
    assert.equal(r.status, 200);
    assert.deepEqual(texts(r.doc, ".field-error"), ["Please enter your name.", "Please enter your email address.", "Please write a message."]);
    assert.equal(r.doc.querySelector("#sender_name").getAttribute("aria-invalid"), "true");
    assert.equal(saved().length, 0);
  });
  it("a bad email is explained, and what the person typed is kept", async () => {
    const r = await post({ sender_name: "Asha", sender_email: "asha-at-example", sender_message: "Hello" });
    assert.match(texts(r.doc, ".field-error")[0], /doesn't look like an email address/);
    assert.equal(r.doc.querySelector("#sender_name").getAttribute("value"), "Asha");
    assert.equal(saved().length, 0);
  });
  it("a message over 2000 characters is refused", async () => {
    const r = await post({ sender_name: "Asha", sender_email: "asha@example.com", sender_message: "x".repeat(2001) });
    assert.match(texts(r.doc, ".field-error")[0], /too long \(2001 characters\)/);
  });
  it("a good message: redirect with ?sent=1, a thank-you, and the message is saved", async () => {
    const r = await post({ sender_name: "Asha Rao", sender_email: "asha@example.com", sender_message: "Can I visit on Monday?" });
    assert.equal(r.status, 302);
    assert.match(r.location, /\/contact\/\?sent=1$/);
    const after = await c.web(r.location);
    assert.deepEqual(texts(after.doc, ".notice-ok"), ["Thank you! Your message has been sent. We will reply by email."]);
    assert.equal(after.doc.querySelector("form.contact-form"), null, "the form is gone, so a refresh cannot send it twice");
    assert.deepEqual(saved().map((m) => [m.email, m.content]), [["asha@example.com", "Can I visit on Monday?"]]);
  });
  it("a WRONG security code saves nothing", async () => {
    const before = saved().length;
    const r = await post({ sender_name: "Eve", sender_email: "eve@example.com", sender_message: "forged", sss_contact_nonce: "0000000000" });
    assert.equal(r.status, 200);
    assert.match(r.html, /form has expired/);
    assert.equal(saved().length, before);
  });
  it("the spam trap: a robot that fills the hidden field is thanked but nothing is saved", async () => {
    const before = saved().length;
    const r = await post({ sender_name: "Bot", sender_email: "bot@example.com", sender_message: "buy now", website: "http://spam.example" });
    assert.equal(r.status, 302);
    assert.equal(saved().length, before);
  });
  it("without the secret form code nothing is saved", async () => {
    const before = saved().length;
    const r = await post({ sender_name: "Eve", sender_email: "eve@example.com", sender_message: "no code" }, false);
    assert.equal(r.status, 200);
    assert.equal(saved().length, before);
  });
  it("a name with a line break cannot add e-mail headers", async () => {
    const r = await post({ sender_name: "Eve\r\nBcc: victim@example.com", sender_email: "eve@example.com", sender_message: "hi" });
    assert.equal(r.status, 302);
    const last = saved().at(-1);
    assert.ok(!/[\r\n]/.test(last.title));
  });
  it("HTML in a message is stored as plain text", async () => {
    await post({ sender_name: "Tag", sender_email: "tag@example.com", sender_message: "<b>bold</b><script>x()</script>hello" });
    assert.ok(!/<script|<b>/.test(saved().at(-1).content));
  });
  it("messages are private: not in search, not in the REST API, not on any address", async () => {
    assert.ok(!/Can I visit/.test((await c.web("/?s=visit")).html));
    assert.ok(!/Can I visit/.test((await c.web("/?s=visit&post_type=contact_message")).html));
    assert.equal((await c.api("GET", "/wp/v2/contact_message")).status, 404);
    assert.ok(!/Can I visit|Asha/.test((await c.web("/?post_type=contact_message")).html), "an unknown content type is ignored: the home page comes back");
  });
  it("only an administrator can read messages in the dashboard (an Editor cannot)", async () => {
    const admin = await c.signIn("admin");
    const ok = await c.web("/wp-admin/edit.php?post_type=contact_message", { cookie: admin });
    assert.equal(ok.status, 200);
    assert.match(ok.html, /Asha Rao/);
    const editor = await c.signIn("editor1");
    const no = await c.web("/wp-admin/edit.php?post_type=contact_message", { cookie: editor });
    assert.equal(no.status, 403);
    assert.ok(!/Asha Rao/.test(no.html));
  });
});
