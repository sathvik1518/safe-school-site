// Small helpers shared by the test files: talk to a running site as a Visitor, or as a signed-in person.
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import path from "node:path";
import { parseHTML } from "linkedom";
import { root } from "../../harness/wp.mjs";

export function client(origin, creds) {
  const basic = (who) => "Basic " + Buffer.from(`${creds[who].login}:${creds[who].appPassword}`).toString("base64");

  /** A page of the website. `cookie` = the sign-in cookies of a person (see signIn). Follows redirects unless told not to. */
  async function web(p, { method = "GET", form, cookie, redirect = "manual", headers = {} } = {}) {
    const res = await fetch(p.startsWith("http") ? p : origin + p, {
      method,
      redirect,
      headers: { ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: form ? new URLSearchParams(form).toString() : undefined,
    });
    const html = await res.text();
    return { status: res.status, html, location: res.headers.get("location"), headers: res.headers, doc: parseHTML(html).document };
  }
  /** One REST call. `as` = a login name (uses its Application Password); nothing = Visitor. */
  async function api(method, route, { as, body, raw, headers = {} } = {}) {
    const h = { ...headers };
    if (as) h.Authorization = basic(as);
    if (body !== undefined) h["Content-Type"] = "application/json";
    const res = await fetch(`${origin}/wp-json${route}`, { method, headers: h, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: res.status, json, text, headers: res.headers };
  }
  /** Signs in through the real login form and returns the cookies, like a browser would keep them. */
  async function signIn(who) {
    const first = await fetch(`${origin}/wp-login.php`, { redirect: "manual" });
    const seed = first.headers.getSetCookie().map((c) => c.split(";")[0]);
    const res = await fetch(`${origin}/wp-login.php`, {
      method: "POST",
      redirect: "manual",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: ["wordpress_test_cookie=WP%20Cookie%20check", ...seed].join("; ") },
      body: new URLSearchParams({ log: creds[who].login, pwd: creds[who].password, testcookie: "1", "wp-submit": "Log In", redirect_to: `${origin}/wp-admin/` }).toString(),
    });
    assert.equal(res.status, 302, `${who} could not sign in (status ${res.status})`);
    const cookies = res.headers.getSetCookie().map((c) => c.split(";")[0]).filter((c) => !c.endsWith("=deleted"));
    assert.ok(cookies.some((c) => c.startsWith("wordpress_logged_in_")), "no logged-in cookie came back");
    return cookies.join("; ");
  }
  return { origin, web, api, signIn, basic };
}

/** Runs harness/checks.php (needs WordPress itself, not the web). */
export function wpCheck(site, what, env = {}) {
  const run = spawnSync("php", [path.join(root, "harness", "checks.php"), site, what], { encoding: "utf8", env: { ...process.env, ...env } });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  return JSON.parse(run.stdout);
}

/** The text of a page's visible headings/list items, trimmed. */
export const texts = (doc, selector) => [...doc.querySelectorAll(selector)].map((n) => n.textContent.replace(/\s+/g, " ").trim());
