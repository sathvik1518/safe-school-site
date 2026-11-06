// The hardening checks, written once. hardening.test.mjs runs them on the live site; restore.test.mjs runs the same ones
// on the restored copy, because a restore that quietly loses the hardening is a bad restore.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

// What a visitor must never see anywhere: login names (the real secret).  "admin" is only matched inside quotes or as an author address.
export const LOGIN_LEAK = /editor1|parent1|author\/admin|author-admin|"slug":"admin"|"name":"admin"|>admin<|\?author=\d/;

export function registerDoors(label, getClient) {
  describe(`Username doors, XML-RPC and editors: ${label}`, () => {
    describe("door 1: /?author=1", () => {
      for (const p of ["/?author=1", "/?author=2", "/?author=3", "/?author_name=admin", "/author/admin/", "/author/editor1/"]) {
        it(`a Visitor gets 404 for ${p}, with no redirect`, async () => {
          const r = await getClient().web(p);
          assert.equal(r.status, 404);
          assert.equal(r.location, null, "no redirect (a redirect to /author/<login>/ is the leak)");
          assert.ok(!LOGIN_LEAK.test(r.html));
        });
      }
      it("a name that exists and a name that does not look the same (nothing is confirmed)", async () => {
        const c = getClient();
        const real = await c.web("/?author=1");
        const fake = await c.web("/?author=9999");
        assert.equal(real.status, fake.status);
        assert.equal(real.html, fake.html);
      });
      it("a subscriber (signed in, but may not list users) is treated as a Visitor", async () => {
        const c = getClient();
        const cookie = await c.signIn("parent1");
        assert.equal((await c.web("/?author=1", { cookie })).status, 404);
      });
      it("an administrator can still use author addresses", async () => {
        const c = getClient();
        const cookie = await c.signIn("admin");
        const r = await c.web("/?author=1", { cookie });
        assert.equal(r.status, 301, "WordPress's own redirect still works for an administrator");
        assert.match(r.location, /\/author\/admin\/$/);
        assert.equal((await c.web("/author/admin/", { cookie })).status, 200);
      });
      it("no link on a public page prints an author address", async () => {
        const c = getClient();
        for (const p of ["/", "/news/", "/annual-day-is-on-friday/", "/feed/"]) assert.ok(!/\/author\//.test((await c.web(p, { redirect: "follow" })).html), p);
      });
    });

    describe("door 2: the REST users list", () => {
      for (const route of ["/wp/v2/users", "/wp/v2/users/1", "/wp/v2/users/2", "/wp/v2/users?search=admin", "/wp/v2/users?slug=admin", "/wp/v2/users?per_page=100&context=embed"]) {
        it(`a Visitor gets 404 for ${route}`, async () => {
          const r = await getClient().api("GET", route);
          assert.equal(r.status, 404);
          assert.equal(r.json?.code, "rest_no_route");
          assert.ok(!LOGIN_LEAK.test(r.text));
        });
      }
      it("the same door through the ugly address (?rest_route=) is closed too", async () => {
        const c = getClient();
        const r = await c.web("/?rest_route=/wp/v2/users");
        assert.equal(r.status, 404);
        assert.ok(!LOGIN_LEAK.test(r.html));
      });
      it("the list of REST routes does not even mention the users routes", async () => {
        const r = await getClient().api("GET", "/");
        assert.equal(r.status, 200);
        const keys = Object.keys(r.json.routes);
        assert.ok(!keys.includes("/wp/v2/users") && !keys.some((k) => k.startsWith("/wp/v2/users/(?P<id>")), "list and by-number routes are gone");
      });
      it("an Editor and a Subscriber are refused too, but can still read their own account", async () => {
        const c = getClient();
        for (const who of ["editor1", "parent1"]) {
          assert.equal((await c.api("GET", "/wp/v2/users", { as: who })).status, 404, `${who}: list`);
          const me = await c.api("GET", "/wp/v2/users/me", { as: who });
          assert.equal(me.status, 200, `${who}: /users/me`);
          assert.equal(me.json.slug, who);
        }
      });
      it("an administrator still gets the list", async () => {
        const r = await getClient().api("GET", "/wp/v2/users", { as: "admin" });
        assert.equal(r.status, 200);
        assert.ok(r.json.some((u) => u.slug === "admin"));
      });
      it("a Visitor cannot create or change a user either", async () => {
        const c = getClient();
        assert.equal((await c.api("POST", "/wp/v2/users", { body: { username: "x", email: "x@example.com", password: "Password-12345" } })).status, 404);
        assert.equal((await c.api("POST", "/wp/v2/users/1", { body: { name: "hacked" } })).status, 404);
      });
      it("posts show only a number for the author, and _embed shows no login name", async () => {
        const r = await getClient().api("GET", "/wp/v2/posts?_embed");
        assert.equal(r.status, 200);
        assert.ok(r.json.length >= 3);
        assert.ok(r.json.every((p) => Number.isInteger(p.author)));
        assert.ok(!LOGIN_LEAK.test(r.text));
      });
    });

    describe("door 3: the users sitemap", () => {
      it("/wp-sitemap-users-1.xml answers 404", async () => {
        const r = await getClient().web("/wp-sitemap-users-1.xml");
        assert.equal(r.status, 404);
        assert.ok(!LOGIN_LEAK.test(r.html));
      });
      it("the sitemap index still works, but does not list users or students", async () => {
        const c = getClient();
        const index = await c.web("/wp-sitemap.xml");
        assert.equal(index.status, 200);
        assert.ok(index.html.includes("wp-sitemap-posts-post-1.xml"));
        assert.ok(index.html.includes("wp-sitemap-posts-page-1.xml"));
        assert.ok(!/users/.test(index.html));
        assert.ok(!/student/.test(index.html));
        for (const m of index.html.matchAll(/<loc>([^<]+)<\/loc>/g)) {
          const r = await c.web(m[1]);
          assert.equal(r.status, 200, m[1]);
          assert.ok(!LOGIN_LEAK.test(r.html), m[1]);
        }
      });
    });

    describe("XML-RPC", () => {
      const listMethods = '<?xml version="1.0"?><methodCall><methodName>system.listMethods</methodName><params/></methodCall>';
      it("GET xmlrpc.php answers 403", async () => {
        const r = await getClient().web("/xmlrpc.php");
        assert.equal(r.status, 403);
        assert.match(r.html, /turned off/);
      });
      it("POSTing real XML-RPC (listMethods, and a login attempt) gets 403 and no XML back", async () => {
        const c = getClient();
        for (const body of [listMethods, '<?xml version="1.0"?><methodCall><methodName>wp.getUsersBlogs</methodName><params><param><value>admin</value></param><param><value>admin-pass-123</value></param></params></methodCall>']) {
          const res = await fetch(`${c.origin}/xmlrpc.php`, { method: "POST", headers: { "Content-Type": "text/xml" }, body });
          const text = await res.text();
          assert.equal(res.status, 403);
          assert.ok(!text.includes("methodResponse") && !text.includes("isAdmin") && !text.includes("<string>"), text);
        }
      });
      it("the home page does not advertise it (no RSD link, no X-Pingback header)", async () => {
        const r = await getClient().web("/");
        assert.ok(!/xmlrpc|rsd|wlwmanifest/i.test(r.html));
        assert.equal(r.headers.get("x-pingback"), null);
      });
    });

    describe("login page: the same answer for every wrong try", () => {
      const tryLogin = async (c, log, pwd) => {
        const r = await c.web("/wp-login.php", { method: "POST", form: { log, pwd, "wp-submit": "Log In", testcookie: "1" }, headers: { Cookie: "wordpress_test_cookie=WP%20Cookie%20check" } });
        assert.equal(r.status, 200, "a failed login shows the form again");
        return r.doc.querySelector("#login_error")?.textContent.replace(/\s+/g, " ").trim();
      };
      it("no such user, right user + wrong password, and an unknown email all give one sentence", async () => {
        const c = getClient();
        const a = await tryLogin(c, "nobody-here", "x");
        const b = await tryLogin(c, "admin", "wrong-password");
        const d = await tryLogin(c, "nobody@example.com", "x");
        assert.ok(a, "an error is shown");
        assert.equal(a, b);
        assert.equal(a, d);
        assert.ok(!/nobody|admin/.test(a), "the sentence does not repeat the name that was typed");
      });
      it("'Lost your password?' answers the same for a real and a made-up name", async () => {
        const c = getClient();
        const send = (user_login) => c.web("/wp-login.php?action=lostpassword", { method: "POST", form: { user_login, "wp-submit": "Get New Password" } });
        const real = await send("admin");
        const fake = await send("nobody-here");
        assert.equal(real.status, 302);
        assert.equal(fake.status, 302);
        assert.equal(real.location, fake.location);
        assert.match(real.location, /checkemail=confirm/);
      });
      it("an EMPTY box still gets WordPress's normal 'enter a username' message", async () => {
        const r = await getClient().web("/wp-login.php?action=lostpassword", { method: "POST", form: { user_login: "", "wp-submit": "Get New Password" } });
        assert.equal(r.status, 200);
        assert.ok(r.doc.querySelector("#login_error"));
      });
    });

    describe("other places a login name could leak", () => {
      it("oEmbed: a Visitor gets the post, but no author name or author address", async () => {
        const c = getClient();
        const r = await c.api("GET", `/oembed/1.0/embed?url=${encodeURIComponent(c.origin + "/annual-day-is-on-friday/")}`);
        assert.equal(r.status, 200);
        assert.equal(r.json.title, "Annual Day is on Friday");
        assert.ok(!("author_name" in r.json) && !("author_url" in r.json));
      });
      it("oEmbed: an administrator still gets the author name", async () => {
        const c = getClient();
        const r = await c.api("GET", `/oembed/1.0/embed?url=${encodeURIComponent(c.origin + "/annual-day-is-on-friday/")}`, { as: "admin" });
        assert.equal(r.json.author_name, "School Office");
      });
      it("the news feed names people by display name, never by login", async () => {
        const r = await getClient().web("/feed/");
        const creators = [...r.html.matchAll(/<dc:creator><!\[CDATA\[([^\]]+)\]\]>/g)].map((m) => m[1]);
        assert.ok(creators.length >= 3);
        assert.deepEqual([...new Set(creators)].sort(), ["Mrs Rao", "School Office"]);
      });
      it("no public page, feed, search result or REST answer contains a login name", async () => {
        const c = getClient();
        for (const p of ["/", "/about/", "/students/", "/news/", "/contact/", "/annual-day-is-on-friday/", "/science-fair-results/", "/feed/", "/comments/feed/", "/?s=a", "/wp-json/", "/wp-json/wp/v2/posts", "/wp-json/wp/v2/pages", "/wp-sitemap.xml", "/robots.txt"]) {
          const r = await c.web(p, { redirect: "follow" });
          assert.ok(r.status === 200 || r.status === 404, `${p} ${r.status}`);
          assert.ok(!LOGIN_LEAK.test(r.html), `${p} leaks a login name: ${r.html.match(LOGIN_LEAK)?.[0]}`);
        }
      });
    });
  });
}
