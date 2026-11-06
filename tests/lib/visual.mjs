// Visual comparison with NO tolerance: a picture matches only if every single pixel is identical.
// Why: a tolerance such as "up to 1% of pixels may differ" lets a real change through. We measured it: a changed
// heading moved 1,025 pixels, which was under 1% of the picture, so a test with that tolerance passed a changed page.
//
// Baselines (the "known good" pictures) live in tests/baselines/<platform>/. They are per operating system, because every
// system draws fonts a little differently. The first run on a new system makes its own baselines; after that every run compares.
// UPDATE_BASELINE=1 npm run test:browser   replaces them (do this only after you looked at the change and agree with it).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { root, wpDir } from "../../harness/wp.mjs";

export const baselineDir = path.join(root, "tests", "baselines", process.platform);
const outDir = path.join(wpDir, "visual");

/** Compares a PNG (Buffer) with the saved baseline of that name. Returns { status, diffPixels, total, ratio }. */
export function compareWithBaseline(name, png) {
  mkdirSync(baselineDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });
  const file = path.join(baselineDir, `${name}.png`);
  if (!existsSync(file) || process.env.UPDATE_BASELINE === "1") {
    writeFileSync(file, png);
    return { status: "created", diffPixels: 0, total: 0, ratio: 0 };
  }
  return comparePngs(readFileSync(file), png, name);
}

/** Pixel by pixel. threshold 0 = a colour that differs by even 1 step counts. includeAA = anti-aliased edges count too. */
export function comparePngs(expectedBuf, actualBuf, name = "diff") {
  const a = PNG.sync.read(expectedBuf);
  const b = PNG.sync.read(actualBuf);
  if (a.width !== b.width || a.height !== b.height) {
    writeFileSync(path.join(outDir, `${name}.actual.png`), actualBuf);
    return { status: "size-changed", diffPixels: Infinity, total: a.width * a.height, ratio: 1, expected: [a.width, a.height], actual: [b.width, b.height] };
  }
  const diff = new PNG({ width: a.width, height: a.height });
  const diffPixels = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0, includeAA: true });
  const total = a.width * a.height;
  if (diffPixels > 0) {
    writeFileSync(path.join(outDir, `${name}.actual.png`), actualBuf);
    writeFileSync(path.join(outDir, `${name}.diff.png`), PNG.sync.write(diff));
  }
  return { status: diffPixels === 0 ? "same" : "different", diffPixels, total, ratio: diffPixels / total };
}
