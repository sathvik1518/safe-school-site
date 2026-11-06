// npm run restore -- backups/<time> [port]
// Builds a second copy of the site in .wp/restored with its own database, from a backup, and runs it on port 8081.
import path from "node:path";
import { startServer } from "../harness/wp.mjs";
import { restoreBackup, restoredDir } from "../harness/restore.mjs";

const [backupArg, portArg] = process.argv.slice(2);
if (!backupArg) {
  console.log("Usage: npm run restore -- backups/<folder> [port]\n(run `npm run backup` first to make a backup)");
  process.exit(1);
}
const port = Number(portArg ?? 8081);
const { target, changed } = restoreBackup({ backupDir: path.resolve(backupArg), target: restoredDir(), port, oldOrigin: "http://localhost:8080" });
console.log(`Restored into ${target}. Address fixed in: ${JSON.stringify(changed)}`);
const child = await startServer({ port, site: target });
console.log(`The restored site is running at http://localhost:${port}   (Ctrl+C to stop)`);
child.on("exit", () => process.exit(0));
process.on("SIGINT", () => child.kill());
