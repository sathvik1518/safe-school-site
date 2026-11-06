// npm run backup        copies the running test site's database and uploads into backups/<time>/
import { makeBackup } from "../harness/restore.mjs";
const { dir, manifest } = makeBackup();
console.log(`Backup written to ${dir}`);
console.log(`  database: ${manifest.database.bytes} bytes, integrity ${manifest.database.integrity}`);
console.log(`  uploads : ${manifest.files.count} files, ${manifest.files.bytes} bytes`);
console.log(`  content : ${JSON.stringify(manifest.counts)}`);
