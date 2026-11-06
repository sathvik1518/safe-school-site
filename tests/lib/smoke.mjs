// The smoke test: five pages, same checks on the live site and on a restored copy.
// "Smoke test" = turn it on and see if smoke comes out. It does not prove the site is right, it proves the site is not broken.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { texts } from "./client.mjs";

export const MENU = ["Home", "About", "Students", "News", "Contact"];
export const STUDENTS = ["Aarav Mehta", "Ananya Iyer", "Arjun Nair", "Diya Kapoor", "Ishaan Verma", "Kavya Reddy", "Meera Joshi", "Neel Shah", "Priya Singh", "Rohan Das", "Sana Khan", "Tara Menon"];
export const NEWS = ["Annual Day is on Friday", "Science fair results", "New library timetable"];

export const PAGES = [
  { path: "/", h1: "Welcome to Greenfield School", current: "Home", extra: (d) => { assert.deepEqual(texts(d, ".wp-block-button__link"), ["About the school", "Read the news"]); assert.equal(d.querySelectorAll(".wp-block-column").length, 3); } },
  { path: "/about/", h1: "About", current: "About", extra: (d) => { assert.equal(d.querySelectorAll(".wp-block-list li").length, 3); } },
  { path: "/students/", h1: "Students", current: "Students", extra: (d) => {
    assert.deepEqual(texts(d, ".wp-block-post-title"), STUDENTS, "12 names, A to Z");
    const form = d.querySelector("form[role=search]");
    assert.ok(form, "a search box");
    assert.equal(form.querySelector("input[name=s]")?.getAttribute("type"), "search");
    assert.equal(form.querySelector("input[name=post_type]")?.getAttribute("value"), "student");
  } },
  { path: "/news/", h1: "News", current: "News", extra: (d, news) => { assert.deepEqual(texts(d, ".card h2"), news, "newest first, only published news"); } },
  { path: "/contact/", h1: "Contact", current: "Contact", extra: (d) => {
    const names = [...d.querySelectorAll(".contact-form [name]")].map((n) => n.getAttribute("name"));
    for (const f of ["sender_name", "sender_email", "sender_message", "sss_contact_nonce"]) assert.ok(names.includes(f), `form field ${f}`);
  } },
];

/** Registers the smoke tests for one running site. `getClient` is a function so the site can start after registration. */
export function registerSmoke(label, getClient, { news = NEWS } = {}) {
  describe(`Smoke test, 5 pages: ${label}`, () => {
    for (const page of PAGES) {
      it(`${page.path} is healthy`, async () => {
        const c = getClient();
        const res = await c.web(page.path);
        assert.equal(res.status, 200, "status");
        const d = res.doc;
        assert.ok(d.title.includes("Greenfield School"), `title: ${d.title}`);
        assert.deepEqual(texts(d, "h1"), [page.h1], "exactly one h1");
        assert.ok(d.querySelector("main"), "a <main> area");
        assert.ok(d.documentElement.getAttribute("lang"), "a lang attribute");
        assert.ok(d.querySelector("meta[name=viewport]"), "a viewport tag (phones)");
        assert.deepEqual(texts(d, ".menu > li > a"), MENU, "the menu: Home, About, Students, News, Contact");
        const current = texts(d, ".menu .current-menu-item > a");
        assert.deepEqual(current, page.current ? [page.current] : [], "the right menu item is marked as current");
        assert.ok(!/(Warning|Notice|Deprecated|Fatal error|Parse error)\s*:/.test(res.html), "no PHP message on the page");
        page.extra(d, news);
      });

      it(`${page.path}: every address on it points at THIS site and works`, async () => {
        const c = getClient();
        const res = await c.web(page.path);
        // any http://localhost:PORT written into the page must be this site's own port (a restore that keeps the old address fails here)
        const ports = new Set([...res.html.matchAll(/https?:\/\/localhost:(\d+)/g)].map((m) => m[1]));
        assert.deepEqual([...ports], [new URL(c.origin).port], "addresses of another site found in the page");
        const hrefs = new Set();
        for (const a of res.doc.querySelectorAll("a[href]")) {
          const h = a.getAttribute("href");
          if (/^(mailto:|tel:|#|javascript:)/.test(h)) continue;
          hrefs.add(new URL(h, c.origin + page.path).href);
        }
        assert.ok(hrefs.size >= 5, "the page has links");
        for (const href of hrefs) {
          const r = await c.web(href, { redirect: "follow" });
          assert.equal(r.status, 200, `link ${href}`);
        }
      });
    }
    it("a page that does not exist answers 404 with a friendly page", async () => {
      const r = await getClient().web("/no-such-page/");
      assert.equal(r.status, 404);
      assert.deepEqual(texts(r.doc, "h1"), ["Page not found"]);
    });
  });
}
