# safe-school-site

A small WordPress site for a school, handed over safe: five pages made only of core blocks (Home as a static front page, About, Students with names and a search box, News, Contact with a working form), a backup that was restored for real, and hardening in a small plugin (XML-RPC off, file editors off, and no username readable through `?author=1`, the REST users list or the users sitemap).

- `npm run wp:setup` then `npm run wp:start`: the site at http://localhost:8080
- `npm run check`: every test (hardening, site, backup and restore, browser smoke, block editor, visual test with no tolerance)
- `npm run backup` / `npm run restore -- backups/<time>`: a backup, and a restore into a second site on port 8081
- `hardening/`: the config lines and the text notes for the school; `BACKUP_AND_RESTORE.md`: the short backup note

Not tested here: MySQL, `.htaccess`/nginx rules, HTTPS, real e-mail, Windows (visual baselines are per operating system). See the documentation.

See `DOCUMENTATION.md` for the full write-up.
