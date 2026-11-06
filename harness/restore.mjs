// Backup and restore, for the test site. Used by scripts/backup.mjs, scripts/restore.mjs and the tests.
import { spawnSync } from "node:child_process";
import { cpSync, createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { ensureSite, root, siteDir, wpDir } from "./wp.mjs";

const php = process.env.PHP ?? "php";
const DB_NAME = ".ht.sqlite";

const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const folderSize = (dir) => (existsSync(dir) ? readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).reduce((n, e) => n + statSync(path.join(e.parentPath, e.name)).size, 0) : 0);
function runPhp(args, env = {}) {
  const r = spawnSync(php, args, { encoding: "utf8", env: { ...process.env, ...env } });
  if (r.status !== 0) throw new Error(`php ${args.join(" ")} failed\n${r.stdout}${r.stderr}`);
  return r.stdout.trim();
}
export const counts = (site, env = {}) => JSON.parse(runPhp([path.join(root, "harness", "checks.php"), site, "counts"], env));

/**
 * BACKUP = two things, always both:
 *   db.sqlite   a safe copy of the database (pages, posts, users, settings)
 *   files/      the uploads folder (pictures and documents people added)
 *   manifest.json   what was copied, how big, and a checksum, so a damaged backup is noticed before it is needed
 * Code (plugins, theme, wp-config) is not in the backup: it lives in Git. Secret keys and passwords for the database
 * live in the host's wp-config.php and must be saved separately (see BACKUP_AND_RESTORE.md).
 */
export function makeBackup({ site = siteDir, outRoot = path.join(root, "backups"), label } = {}) {
  const stamp = label ?? new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(outRoot, stamp);
  mkdirSync(dir, { recursive: true });
  const integrity = runPhp([path.join(root, "harness", "backup.php"), path.join(site, "wp-content", "database", DB_NAME), path.join(dir, "db.sqlite")]);
  if (integrity !== "ok") throw new Error(`The backup database failed its integrity check: ${integrity}`);
  const uploads = path.join(site, "wp-content", "uploads");
  if (existsSync(uploads)) cpSync(uploads, path.join(dir, "files"), { recursive: true });
  else mkdirSync(path.join(dir, "files"));
  const manifest = {
    madeAt: new Date().toISOString(),
    database: { file: "db.sqlite", bytes: statSync(path.join(dir, "db.sqlite")).size, sha256: sha256(path.join(dir, "db.sqlite")), integrity },
    files: { folder: "files", bytes: folderSize(path.join(dir, "files")), count: readdirSync(path.join(dir, "files"), { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).length },
    counts: counts(site),
  };
  writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return { dir, manifest };
}

/** Is this backup folder complete and undamaged? Returns a list of problems (empty = fine). */
export function checkBackup(dir) {
  const problems = [];
  if (!existsSync(path.join(dir, "manifest.json"))) return ["manifest.json is missing"];
  const m = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8"));
  if (!existsSync(path.join(dir, "db.sqlite"))) problems.push("db.sqlite is missing");
  else if (sha256(path.join(dir, "db.sqlite")) !== m.database.sha256) problems.push("db.sqlite does not match its checksum (damaged or changed)");
  if (!existsSync(path.join(dir, "files"))) problems.push("files/ is missing");
  return problems;
}

/**
 * RESTORE into a second, separate site folder with its own database:
 *   1. fresh WordPress files + our plugins, theme and config lines (from Git, not from the backup)
 *   2. the backup database becomes the new site's database
 *   3. the uploads folder is copied back
 *   4. the site address is changed from the old one to the new one, everywhere it was saved
 * Options let a test skip a step on purpose, to see what a broken restore looks like.
 */
export function restoreBackup({ backupDir, target, port, oldOrigin, skip = [] }) {
  const problems = checkBackup(backupDir);
  if (problems.length) throw new Error(`Refusing to restore from a bad backup:\n- ${problems.join("\n- ")}`);
  rmSync(path.join(target, "wp-content", "database"), { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  rmSync(path.join(target, "wp-content", "uploads"), { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  ensureSite(target); // step 1
  mkdirSync(path.join(target, "wp-content", "database"), { recursive: true });
  if (!skip.includes("database")) cpSync(path.join(backupDir, "db.sqlite"), path.join(target, "wp-content", "database", DB_NAME)); // step 2
  if (!skip.includes("files")) cpSync(path.join(backupDir, "files"), path.join(target, "wp-content", "uploads"), { recursive: true }); // step 3
  let changed = null;
  if (!skip.includes("address") && !skip.includes("database")) {
    changed = JSON.parse(runPhp([path.join(root, "harness", "restore.php"), target, oldOrigin, `http://localhost:${port}`], { WP_PORT: String(port) })); // step 4
  }
  return { target, changed };
}

export const restoredDir = (name = "restored") => path.join(wpDir, name);
