"""Break each rule once on purpose and check that the tests notice.
Run from the project folder:   python3 break45.py            (all)     or    python3 break45.py "xml" "sitemap"   (only matching names)
Each case edits one file, runs the right test suite, expects it to FAIL, then puts the file back.
  hard = tests/hardening.test.mjs   site = tests/site.test.mjs   restore = tests/restore.test.mjs   browser = tests/browser.test.mjs
If a run is killed half-way, a rule may stay broken: run  git diff  (or compare with the zip) and put the file back."""
import pathlib, subprocess, sys

ROOT = pathlib.Path(__file__).parent
HARD = ROOT / "plugin/safe-school-hardening/safe-school-hardening.php"
SITE = ROOT / "plugin/safe-school-site/safe-school-site.php"
LINES = ROOT / "hardening/wp-config-lines.php"
HTACC = ROOT / "hardening/htaccess.txt"
UPLOADS = ROOT / "hardening/uploads-htaccess.txt"
KEYS = ROOT / "hardening/make-keys.mjs"
WPCONF = ROOT / "harness/wp-config.php"
INSTALL = ROOT / "harness/install.php"
RESTORE_PHP = ROOT / "harness/restore.php"
RESTORE_MJS = ROOT / "harness/restore.mjs"
HEADER, PAGE, CSS = ROOT / "theme/safe-school/header.php", ROOT / "theme/safe-school/page.php", ROOT / "theme/safe-school/style.css"
VISUAL = ROOT / "tests/lib/visual.mjs"

# (name, file, old text, new text, suite)
CASES = [
  # ---- XML-RPC ----
  ("xml-rpc: the early stop is gone", HARD, "if ( defined( 'XMLRPC_REQUEST' ) && XMLRPC_REQUEST ) {", "if ( false ) {", "hard"),
  ("xml-rpc: the RSD link is still in the page head", HARD, "remove_action( 'wp_head', 'rsd_link' );", "", "hard"),
  # ---- door 1: ?author=1 ----
  ("door 1: author addresses are not blocked", HARD, "if ( is_author() || isset( $_GET['author'] ) || isset( $_GET['author_name'] ) ) {", "if ( false ) {", "hard"),
  ("door 1: the block runs AFTER WordPress's own redirect", HARD, "}, 0 ); // priority 0", "}, 20 ); // priority 0", "hard"),
  ("door 1: administrators are blocked too", HARD, "\tif ( ssh_may_list_users() ) {\n\t\treturn;\n\t}\n\tif ( is_author()", "\tif ( is_author()", "hard"),
  ("door 1: any signed-in person (a Subscriber) may list users", HARD, "return is_user_logged_in() && current_user_can( 'list_users' );", "return is_user_logged_in();", "hard"),
  ("door 1: author links still print the author address", HARD, "ssh_may_list_users() ? $link : home_url( '/' )", "$link", "hard"),
  # ---- door 2: REST ----
  ("door 2: the users routes are not removed", HARD, "unset( $routes['/wp/v2/users'], $routes['/wp/v2/users/(?P<id>[\\d]+)'] );", "", "hard"),
  ("door 2: only the list is removed, not /users/<number>", HARD, "unset( $routes['/wp/v2/users'], $routes['/wp/v2/users/(?P<id>[\\d]+)'] );", "unset( $routes['/wp/v2/users'] );", "hard"),
  ("door 2: administrators lose the users list", HARD, "if ( ssh_may_list_users() ) {\n\t\treturn $routes;", "if ( false ) {\n\t\treturn $routes;", "hard"),
  # ---- door 3: sitemap ----
  ("door 3: the users sitemap is still there", HARD, "return 'users' === $name ? false : $provider;", "return $provider;", "hard"),
  # ---- extra doors ----
  ("oembed: author_name is still given out", HARD, "unset( $data['author_name'], $data['author_url'] );", "unset( $data['author_url'] );", "hard"),
  ("login: the real error text is shown", HARD, "return '<strong>Error:</strong> The username or password is not correct.';", "return $message;", "hard"),
  ("login: a wrong password gets its own text", HARD, "array( 'invalid_username', 'incorrect_password', 'invalid_email', 'invalidcombo' )", "array( 'invalid_username', 'invalid_email', 'invalidcombo' )", "hard"),
  ("lost password: a made-up name is told apart", HARD, "add_action( 'login_form_lostpassword',", "add_action( 'login_form_lostpassword_off',", "hard"),
  ("lost password: an empty box is also redirected", HARD, " || '' === trim( (string) ( $_POST['user_login'] ?? '' ) ) ) {", " ) {", "hard"),
  # ---- file editors ----
  ("editors: the plugin's own lock is gone", HARD, "return array( 'do_not_allow' );", "return $caps;", "hard"),
  ("editors: wp-config line says false", LINES, "define( 'DISALLOW_FILE_EDIT', true );", "define( 'DISALLOW_FILE_EDIT', false );", "hard"),
  ("editors: the wp-config lines are not loaded by the test site", WPCONF, "\trequire __DIR__ . '/wp-config-lines.php';", "\t// not loaded", "hard"),
  ("editors: DISALLOW_FILE_MODS used instead (hides the Plugins menu)", LINES, "// 2. Keep error messages", "define( 'DISALLOW_FILE_MODS', true );\n// 2. Keep error messages", "hard"),
  ("editors: HTTPS forced although the host may not support it", LINES, "// define( 'FORCE_SSL_ADMIN', true );", "define( 'FORCE_SSL_ADMIN', true );", "hard"),
  # ---- secret keys ----
  ("keys: Math.random-style repeat (same value for every key)", KEYS, "export const makeLines = () => KEY_NAMES.map((n) => `define( '${n}', '${randomValue()}' );`).join(\"\\n\");", "export const makeLines = () => { const v = randomValue(); return KEY_NAMES.map((n) => `define( '${n}', '${v}' );`).join(\"\\n\"); };", "hard"),
  ("keys: values are only 8 characters", KEYS, "export function randomValue(length = 64) {", "export function randomValue(length = 8) {", "hard"),
  # ---- Apache / uploads files ----
  ("htaccess: the old Apache 2.2 words", HTACC, "    Require all denied\n</FilesMatch>", "    Order deny,allow\n    Deny from all\n</FilesMatch>", "hard"),
  ("htaccess: a <Directory> block (gives 500)", HTACC, "Options -Indexes", "Options -Indexes\n<Directory /var/www>\n</Directory>", "hard"),
  ("htaccess: Header lines without the module check", HTACC, "<IfModule mod_headers.c>", "<IfModule mod_rewrite.c>", "hard"),
  ("uploads: PHP is not blocked", UPLOADS, "    Require all denied\n", "    Require all granted\n", "hard"),
  # ---- students ----
  ("students: they appear in the sitemap", SITE, "\tunset( $types['student'] );\n", "", "hard"),
  ("students: their own address does not go back to the list", SITE, "if ( is_singular( 'student' ) || 'student' === get_query_var( 'post_type' ) ) {", "if ( false ) {", "site"),
  ("students: search is also redirected away", SITE, "\tif ( is_search() ) {\n\t\treturn;\n\t}\n", "", "site"),
  ("students: the search cannot find them", SITE, "'exclude_from_search' => false,", "'exclude_from_search' => true,", "site"),
  ("students: they are in the REST API", SITE, "'show_in_rest'        => false,  // not in the REST API", "'show_in_rest'        => true,  // not in the REST API", "site"),
  # ---- contact form ----
  ("contact: the security code is not checked", SITE, "if ( ! wp_verify_nonce(", "if ( false && ! wp_verify_nonce(", "site"),
  ("contact: an empty name is accepted", SITE, "if ( '' === $name ) {", "if ( false ) {", "site"),
  ("contact: any text is accepted as an email", SITE, "} elseif ( ! is_email( $email ) ) {", "} elseif ( false ) {", "site"),
  ("contact: an empty message is accepted", SITE, "if ( '' === $message ) {", "if ( false ) {", "site"),
  ("contact: a very long message is accepted", SITE, "mb_strlen( $message ) > 2000", "mb_strlen( $message ) > 2000000", "site"),
  ("contact: the robot trap field is ignored", SITE, "if ( '' === trim( (string) ( $raw['website'] ?? '' ) ) ) {", "if ( true ) {", "site"),
  ("contact: no redirect after a good message", SITE, "wp_safe_redirect( add_query_arg( 'sent', '1', get_permalink() ?: home_url( '/' ) ) ); // after a POST, always redirect: a refresh must not send it again\n\texit;", "return;", "site"),
  ("contact: the field is called 'name' (a WordPress word: the page becomes 404)", SITE, "name=\"sender_' . $key . '\"", "name=\"' . $key . '\"", "site"),
  ("contact: line breaks allowed in the name (mail header injection)", SITE, "trim( preg_replace( '/[\\r\\n\\t]+/', ' ', sanitize_text_field( $in['name'] ?? '' ) ) )", "trim( (string) ( $in['name'] ?? '' ) )", "site"),
  ("contact: HTML in a message is kept", SITE, "sanitize_textarea_field( $in['message'] ?? '' )", "(string) ( $in['message'] ?? '' )", "site"),
  ("contact: Editors may read the messages", SITE, "$admin_only[ $cap ] = 'manage_options';", "$admin_only[ $cap ] = 'edit_posts';", "site"),
  ("contact: messages become public pages", SITE, "'public'          => false,   // never", "'public'          => true,   // never", "site"),
  ("contact: the browser's own pop-ups are on (no novalidate)", SITE, "method=\"post\" action=\"\" novalidate>", "method=\"post\" action=\"\">", "browser"),
  # ---- the site: pages, menu, theme ----
  ("site: the front page is not the Home page", INSTALL, "update_option( 'page_on_front', $home );", "", "site"),
  ("site: News is not the posts page", INSTALL, "update_option( 'page_for_posts', $news );", "", "site"),
  ("site: a block that is not a core block", INSTALL, "<!-- wp:shortcode -->\\n[school_contact_form]", "<!-- wp:acme/box /-->\\n\\n<!-- wp:shortcode -->\\n[school_contact_form]", "site"),
  ("site: the Students list is Z to A", INSTALL, "\\\"order\\\":\\\"asc\\\"", "\\\"order\\\":\\\"desc\\\"", "site"),
  ("site: the search box does not ask for students", INSTALL, ",\\\"query\\\":{\\\"post_type\\\":\\\"student\\\"}} /-->", "} /-->", "site"),
  ("site: the menu is missing from the header", HEADER, "wp_nav_menu( array(", "$unused = ( array(", "site"),
  ("site: no viewport tag (phones)", HEADER, "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">", "", "site"),
  ("site: no <main> area", HEADER, "<main class=\"site-main\">", "<div class=\"site-main\">", "site"),
  ("site: a page without its h1", PAGE, "<h1><?php the_title(); ?></h1>", "", "site"),
  # ---- backup and restore ----
  ("restore: the address is never changed", RESTORE_MJS, "if (!skip.includes(\"address\") && !skip.includes(\"database\")) {", "if (false) {", "restore"),
  ("restore: links inside posts are not changed", RESTORE_PHP, "post_content LIKE %s OR post_excerpt LIKE %s OR guid LIKE %s", "post_content LIKE %s AND post_excerpt LIKE %s AND guid LIKE %s", "restore"),
  ("restore: menu links (post meta) are not changed", RESTORE_PHP, "SELECT meta_id, meta_value FROM {$wpdb->postmeta} WHERE meta_value LIKE %s", "SELECT meta_id, meta_value FROM {$wpdb->postmeta} WHERE meta_value LIKE %s AND 1=0", "restore"),
  ("restore: serialized values are changed as plain text (lengths break)", RESTORE_PHP, "if ( is_serialized( $data ) ) {", "if ( false ) {", "restore"),
  ("restore: the uploads are not copied back", RESTORE_MJS, "if (!skip.includes(\"files\")) cpSync(", "if (false) cpSync(", "restore"),
  ("restore: a damaged backup is not noticed", RESTORE_MJS, "else if (sha256(path.join(dir, \"db.sqlite\")) !== m.database.sha256)", "else if (false)", "restore"),
  # ---- the visual test itself ----
  ("visual: a heading is changed in the page", INSTALL, "'Welcome to Greenfield School', 'home',", "'Welcome to Greenfield Academy', 'home',", "browser"),
  ("visual: text is one pixel larger", CSS, "h1 { font-size: 1.8rem;", "h1 { font-size: 1.85rem;", "browser"),
  ("visual: a link colour is one step off", CSS, "--accent:#2b5fd9;", "--accent:#2b5fd8;", "browser"),
  ("visual: the test accepts up to 1% of pixels that differ", VISUAL, "status: diffPixels === 0 ? \"same\" : \"different\"", "status: diffPixels / total < 0.01 ? \"same\" : \"different\"", "browser"),
]

SUITES = {
  "hard": "node --test --test-concurrency=1 tests/hardening.test.mjs",
  "site": "node --test --test-concurrency=1 tests/site.test.mjs",
  "restore": "node --test --test-concurrency=1 tests/restore.test.mjs",
  "browser": "node --test --test-concurrency=1 tests/browser.test.mjs",
}

def run(suite):
    subprocess.run("pkill -f 'php -S' ; true", shell=True)
    return subprocess.run(SUITES[suite], shell=True, cwd=ROOT, capture_output=True, text=True).returncode

only = sys.argv[1:]
print("baseline (nothing broken):")
suites = {c[4] for c in CASES if not only or any(o in c[0] for o in only)}
for s in sorted(suites):
    code = run(s)
    print(f"  {s}: {'pass' if code == 0 else 'FAIL'}", flush=True)
    if code:
        sys.exit("baseline must be green before breaking things")

missed = ran = 0
for name, path, old, new, suite in CASES:
    if only and not any(o in name for o in only):
        continue
    ran += 1
    text = path.read_text()
    if old not in text:
        print(f"SKIP   {name}  (text not found in {path.name})")
        missed += 1
        continue
    path.write_text(text.replace(old, new, 1))
    try:
        code = run(suite)
    finally:
        path.write_text(text)
    caught = code != 0
    missed += not caught
    print(f"{'CAUGHT' if caught else 'MISSED'}  {name}", flush=True)
print(f"\n{ran - missed}/{ran} broken rules were caught by the tests.")
sys.exit(1 if missed else 0)
