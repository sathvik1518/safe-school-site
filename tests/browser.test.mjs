// The site in a real browser (Chromium): smoke test of 5 pages, the search box and contact form by hand,
// the block editor opening every page without a "block problem", and the home page at three screen sizes.
// Run:  node --test --test-concurrency=1 tests/browser.test.mjs   (or npm run test:browser)
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { chromium } from "playwright";
import { installFresh, readCreds, startServer } from "../harness/wp.mjs";
import { compareWithBaseline, comparePngs } from "./lib/visual.mjs";
import { MENU, NEWS, STUDENTS } from "./lib/smoke.mjs";

const SITE = "http://localhost:8080";
let server, browser, creds;
before(async () => {
  installFresh();
  creds = readCreds();
  server = await startServer({ port: 8080 });
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
  server?.kill();
});

/** A fresh page that records everything that goes wrong: script errors, console errors, failed or 4xx/5xx requests. */
async function openPage(context) {
  const page = await context.newPage();
  page.problems = [];
  page.on("pageerror", (e) => page.problems.push(`script error: ${e}`));
  page.on("console", (m) => m.type() === "error" && page.problems.push(`console error: ${m.text()}`));
  page.on("requestfailed", (r) => page.problems.push(`request failed: ${r.url()}`));
  page.on("response", (r) => r.status() >= 400 && page.problems.push(`${r.status()} ${r.url()}`));
  return page;
}

const PAGES = [
  ["/", "Welcome to Greenfield School"],
  ["/about/", "About"],
  ["/students/", "Students"],
  ["/news/", "News"],
  ["/contact/", "Contact"],
];

describe("smoke test in a browser: 5 pages", () => {
  for (const [p, h1] of PAGES) {
    it(`${p}: opens, one h1, menu visible, no errors, no sideways scrolling on a phone`, async () => {
      const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } });
      const page = await openPage(ctx);
      const res = await page.goto(SITE + p);
      assert.equal(res.status(), 200);
      assert.deepEqual(await page.locator("h1").allTextContents(), [h1]);
      assert.deepEqual((await page.locator(".menu > li > a").allTextContents()).map((s) => s.trim()), MENU);
      for (const a of await page.locator(".menu > li > a").all()) assert.ok(await a.isVisible());
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 0, `the page is ${overflow}px wider than the phone screen`);
      assert.deepEqual(page.problems, []);
      await ctx.close();
    });
  }
  it("clicking through the menu reaches every page", async () => {
    const ctx = await browser.newContext();
    const page = await openPage(ctx);
    await page.goto(SITE);
    for (const [label, h1] of [["About", "About"], ["Students", "Students"], ["News", "News"], ["Contact", "Contact"], ["Home", "Welcome to Greenfield School"]]) {
      await Promise.all([page.waitForURL(/.*/), page.getByRole("navigation", { name: "Main menu" }).getByRole("link", { name: label, exact: true }).click()]);
      assert.deepEqual(await page.locator("h1").allTextContents(), [h1], label);
    }
    assert.deepEqual(page.problems, []);
    await ctx.close();
  });
  it("home page buttons go where they say", async () => {
    const ctx = await browser.newContext();
    const page = await openPage(ctx);
    await page.goto(SITE);
    await page.getByRole("link", { name: "Read the news" }).click();
    await page.waitForURL(/\/news\/$/);
    assert.deepEqual(await page.locator(".card h2").allTextContents(), NEWS);
    await ctx.close();
  });
});

describe("by hand: the search box and the contact form", () => {
  it("typing a name in the Students search box shows only that student", async () => {
    const ctx = await browser.newContext();
    const page = await openPage(ctx);
    await page.goto(`${SITE}/students/`);
    assert.equal(await page.locator(".wp-block-post-title").count(), STUDENTS.length);
    await page.getByLabel("Search students").fill("priya");
    await Promise.all([page.waitForURL(/s=priya/), page.getByRole("button", { name: "Search" }).click()]);
    assert.deepEqual(await page.locator(".student").allTextContents(), ["Priya Singh"]);
    assert.deepEqual(page.problems, []);
    await ctx.close();
  });
  it("sending the contact form empty shows the errors; filling it in shows the thank-you", async () => {
    const ctx = await browser.newContext();
    const page = await openPage(ctx);
    await page.goto(`${SITE}/contact/`);
    await Promise.all([page.waitForLoadState("load"), page.getByRole("button", { name: "Send message" }).click()]);
    assert.equal(await page.locator(".field-error").count(), 3);
    assert.ok(await page.locator("#form-errors").isVisible());
    await page.getByLabel("Your name").fill("Browser Visitor");
    await page.getByLabel("Your email").fill("visitor@example.com");
    await page.getByLabel("Your message").fill("Sent from a real browser.");
    await Promise.all([page.waitForURL(/sent=1/), page.getByRole("button", { name: "Send message" }).click()]);
    assert.ok(await page.getByText("Thank you! Your message has been sent.").isVisible());
    assert.equal(await page.locator("form.contact-form").count(), 0);
    await page.reload(); // a refresh must not send it again
    assert.ok(await page.getByText("Thank you!").isVisible());
    await ctx.close();
  });
  it("the hidden spam-trap field is really invisible to a person", async () => {
    const ctx = await browser.newContext();
    const page = await openPage(ctx);
    await page.goto(`${SITE}/contact/`);
    const box = await page.locator("input[name=website]").boundingBox();
    assert.ok(!box || box.x + box.width < 0, "the field sits far off the left edge of the screen");
    await ctx.close();
  });
});

describe("the block editor opens every page with no broken block", () => {
  it("each page: every block is valid, and no block is 'classic' or 'missing'", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await openPage(ctx);
    await page.goto(`${SITE}/wp-login.php`);
    await page.fill("#user_login", creds.admin.login);
    await page.fill("#user_pass", creds.admin.password);
    await Promise.all([page.waitForURL(/wp-admin/), page.click("#wp-submit")]);
    page.problems.length = 0; // the dashboard itself is not what is tested here
    for (const [slug, id] of Object.entries(creds.pages)) {
      await page.goto(`${SITE}/wp-admin/post.php?post=${id}&action=edit`);
      await page.waitForFunction((pid) => window.wp?.data?.select("core/editor")?.getCurrentPostId?.() === pid && window.wp.blocks?.getBlockType("core/query"), id, { timeout: 90_000 });
      await page.waitForTimeout(500);
      const report = await page.evaluate(() => {
        const out = [];
        const walk = (blocks) => blocks.forEach((b) => { out.push({ name: b.name, valid: b.isValid }); walk(b.innerBlocks); });
        walk(window.wp.data.select("core/block-editor").getBlocks());
        return out;
      });
      const bad = report.filter((b) => !b.valid || b.name === "core/freeform" || b.name === "core/missing");
      assert.deepEqual(bad, [], `${slug}: blocks with a problem`);
      if (slug !== "news") assert.ok(report.length > 0, `${slug}: the editor found blocks`);
      assert.ok(report.every((b) => b.name.startsWith("core/")), `${slug}: core blocks only`);
    }
    await ctx.close();
  });
});

describe("visual test of the home page at three screen sizes (no tolerance)", () => {
  const SIZES = [[375, 800], [768, 900], [1280, 900]];
  async function shot(width, height) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto(SITE + "/");
    await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}" });
    await page.evaluate(() => document.fonts.ready);
    const png = await page.screenshot({ fullPage: true, animations: "disabled" });
    return { png, page, ctx };
  }
  for (const [w, h] of SIZES) {
    it(`${w}px wide: every pixel matches the known-good picture`, async () => {
      const { png, ctx } = await shot(w, h);
      await ctx.close();
      const r = compareWithBaseline(`home-${w}`, png);
      if (r.status === "created") {
        // First run on this computer: a baseline was just written. Prove the picture is at least stable by taking it again.
        const again = await shot(w, h);
        await again.ctx.close();
        const self = compareWithBaseline(`home-${w}`, again.png);
        assert.equal(self.status, "same", `the page is not stable between two screenshots (${self.diffPixels} pixels differ)`);
        console.log(`  NEW BASELINE written for ${process.platform} at ${w}px. Look at tests/baselines/${process.platform}/home-${w}.png once, then commit it.`);
      } else {
        assert.equal(r.status, "same", `${r.diffPixels} of ${r.total} pixels differ (see .wp/visual/home-${w}.diff.png)`);
      }
    });
  }
  it("layout (does not depend on fonts): columns stack on a phone and sit side by side on a desktop", async () => {
    const boxes = async (w) => {
      const { page, ctx } = await shot(w, 900);
      const b = await page.locator(".wp-block-column").evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) }; }));
      await ctx.close();
      return b;
    };
    const phone = await boxes(375);
    assert.equal(phone.length, 3);
    assert.ok(phone.every((c) => c.x === phone[0].x) && phone[1].y > phone[0].y && phone[2].y > phone[1].y, "stacked");
    const desktop = await boxes(1280);
    assert.ok(desktop.every((c) => c.y === desktop[0].y) && desktop[1].x > desktop[0].x && desktop[2].x > desktop[1].x, "side by side");
  });
  it("PROOF the test is strict: changing one heading is caught at every size, although it is a tiny part of the picture", async () => {
    const rows = [];
    for (const [w, h] of SIZES) {
      const base = await shot(w, h);
      const baseline = base.png;
      await base.page.evaluate(() => { document.querySelector("h1").textContent = "Welcome to Greenfield Academy"; });
      const changed = await base.page.screenshot({ fullPage: true });
      await base.ctx.close();
      const r = comparePngs(baseline, changed, `changed-heading-${w}`);
      rows.push(`${w}px: ${r.diffPixels} pixels differ = ${(r.ratio * 100).toFixed(2)}% of the picture`);
      assert.ok(r.diffPixels > 0, `${w}px: the changed heading was NOT noticed`);
      assert.equal(r.status, "different", `${w}px: the verdict must be "different", not "same"`);
      if (w === 1280) assert.ok(r.ratio < 0.01, "at 1280px the change is under 1%: a tolerance of 1% would have let it pass");
    }
    console.log("  " + rows.join("\n  "));
  });
});
