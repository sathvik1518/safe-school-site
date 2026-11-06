# Backup and restore (short note for the school)

A backup is only a backup after you have restored it once. This note was tested on the test site (see "What was tested").

## What a backup must contain

| Part | Where it lives | How we save it |
|---|---|---|
| Database (pages, posts, students, users, settings) | MySQL on a real host (SQLite file on the test site) | a database dump / `npm run backup` |
| Uploads (pictures, documents) | `wp-content/uploads/` | copy the folder |
| Code (theme, the two plugins, the config lines) | this Git repository | already saved by `git push` |
| Secrets (the real `wp-config.php`: database password, 8 secret keys) | the host only | copy it once into a password manager. NOT into Git |

## Take a backup

On the real site (MySQL):

1. `mysqldump --single-transaction -u DBUSER -p DBNAME > db.sql`  (or the host's "Export" button in phpMyAdmin)
2. Copy `wp-content/uploads/` to a safe place.
3. Write down the site address that is saved in the database (Settings > General).

On the test site: `npm run backup`. It writes `backups/<time>/` with `db.sqlite`, `files/` and `manifest.json` (sizes, counts, a checksum).

## Restore it (into a second folder and a second database)

1. **Fresh WordPress files** in a new folder. Put the theme, the two plugins and the config lines back from Git.
2. **New empty database**, then load the dump: `mysql -u DBUSER -p NEWDB < db.sql`. Put the new database name and password in the new `wp-config.php`.
3. **Copy the uploads folder** back to `wp-content/uploads/`.
4. **Change the site address everywhere.** The backup still holds the OLD address in the settings, in the menu links typed by hand, and in links inside pages. Use WP-CLI: `wp search-replace "https://old-address" "https://new-address" --all-tables` (it handles the "serialized" values correctly; a plain text find-and-replace does not).
5. **`.htaccess` and the folder name.** If the new site sits in a different folder (for example `/school-test/` instead of `/`), open Settings > Permalinks and press Save. WordPress then rewrites `.htaccess` with the new folder name. Without this, only the home page opens and every other page gives 404.
6. **Check it.** Open the 5 pages. Run the smoke test and the hardening tests against the restored site (the tests do this for the test site, see below).

On the test site: `npm run backup`, then `npm run restore -- backups/<time>` builds the copy in `.wp/restored` and runs it at http://localhost:8081.

## What goes wrong, and what you see (all three were produced on purpose in the tests)

| Mistake | What you see |
|---|---|
| Site address not changed (step 4) | Pages open, but the menu and links still lead to the OLD site |
| Wrong or empty database (step 2) | Every page redirects to the WordPress installer |
| Uploads not copied (step 3) | Pages open, pictures are missing |
| `.htaccess` or folder name wrong (step 5) | Home opens, other pages give 404. **Not tested here** (the test server has no `.htaccess`) |

## What was tested (and what was not)

Tested in the sandbox, with SQLite: backup of a running site, an integrity check of the copy, a checksum that catches a damaged backup, restore into a second folder with its own database, the address fix (settings, a menu link, a link inside a post), same counts of pages / posts / students / messages / users / pictures, the uploaded picture is identical byte for byte, same people can sign in, the 5-page smoke test and the hardening checks pass on the restored copy.

**Not tested:** `mysqldump` and loading a dump into MySQL (the sandbox has no MySQL), `wp search-replace` (WP-CLI was not used: `harness/restore.php` does the same job on SQLite), `.htaccess` and permalinks after a move, a real host.
