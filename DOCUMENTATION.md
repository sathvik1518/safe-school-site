# Safe School Site: Five Pages, a Backup That Was Really Restored, Three Closed Username Doors, and Tests That Break When Something Changes

**Day 45 Mini Capstone, Safe School Site (CMS Practice)**  
**Project folder:** `safe-school-site`

---

## 1. Goal

Hand over a small WordPress site for a school. The task (Day 45, Mini Capstone, *task only*) asked for:

1. Pages: **Home, About, Students, News, Contact**. The Students page **lists names and has a search box**.
2. A **static front page**, a **menu** and a **working contact form**.
3. A **backup** and a **tested restore**, with the steps in a **short note**.
4. **File editors off, XML-RPC off**, and a visitor **cannot read a username** in the three ways: `?author=1`, the REST users list, the users sitemap.
5. **Five pages pass a smoke test**; the home page has a **visual test for three screen sizes**.
6. Hints: **core blocks only**, **hardening in a small plugin**, **config lines in a text note**, **run the tests after every change**.

**What is real and what is not (read this first).** There is no MySQL, no Apache and no Local/XAMPP in the sandbox this was built in. Everything ran on a **real WordPress 7.1.4** (from GitHub) with the official **SQLite Database Integration** plugin, served by PHP's built-in server. The plugins, the theme, the pages, the REST API, the sitemaps, the login page, the block editor and Chromium are all real. What was **not** tested (MySQL, `.htaccess`, HTTPS, real mail, your Windows machine) is listed in *Known limit*.

Think of a school office handing the keys to a new caretaker. **The site** has to open for visitors, **the backup** is the spare key (and a spare key you never tried is not a spare key), and **the hardening** is the lock on the doors that were open: the author address, the users list, the sitemap, the old remote-control address and the code editors.

---

## 2. Tools

| Tool | Role |
|---|---|
| WordPress 7.1.4 (tag from GitHub) | The CMS, with the real block editor |
| SQLite Database Integration plugin (pinned commit) | Lets WordPress run on a SQLite file in the sandbox (no MySQL here) |
| PHP 8.3 built-in server (`php -S`) + `router.php` | Runs the test site with pretty links. Ignores `.htaccess` |
| `safe-school-hardening` plugin | XML-RPC off, the three username doors closed, the file editors locked, uniform login answers |
| `safe-school-site` plugin | The student list (names only) and the contact form |
| `safe-school` theme | Menu, plain page layout, news cards, student list in search results, 404 |
| `node:test` + `linkedom` | HTTP-level tests against the REAL WordPress: hardening, site, backup and restore |
| Playwright (Chromium) | Browser smoke test, the block editor check, and the visual test at three sizes |
| `pixelmatch` + `pngjs` | Compare two screenshots pixel by pixel with no tolerance |

---

## 3. Project structure

```
safe-school-site/
├── README.md
├── DOCUMENTATION.md
├── BACKUP_AND_RESTORE.md         (the short note: take a backup, restore it, what goes wrong)
├── break45.py                    (breaks 64 rules once each; the tests must notice)
├── package.json, .gitignore
├── plugin/
│   ├── safe-school-hardening/safe-school-hardening.php   (the small hardening plugin)
│   └── safe-school-site/safe-school-site.php             (students + contact form)
├── theme/safe-school/
│   ├── style.css, functions.php
│   ├── header.php, footer.php, index.php, page.php, single.php, 404.php
├── hardening/                    (the text notes and config lines the school keeps)
│   ├── CONFIG-NOTE.txt           (what is closed, where, how it was tested, what was not)
│   ├── wp-config-lines.php       (paste into wp-config.php; the test site runs this exact file)
│   ├── make-keys.mjs             (prints 8 fresh random secret keys)
│   ├── htaccess.txt, uploads-htaccess.txt, nginx.txt     (NOT tested here)
├── harness/                      (a real test WordPress; not part of the plugins or theme)
│   ├── wp.mjs, wp-config.php, router.php
│   ├── install.php               (builds the test site: users, 5 pages from core blocks, 12 students, news, menu)
│   ├── checks.php                (blocks used, settings, counts, saved messages, rights)
│   ├── backup.php, restore.php, restore.mjs   (backup, integrity check, restore, address fix)
├── scripts/backup.mjs, restore.mjs
└── tests/
    ├── hardening.test.mjs, site.test.mjs, restore.test.mjs, browser.test.mjs
    ├── lib/client.mjs, smoke.mjs, doors.mjs, visual.mjs
    └── baselines/linux/home-375.png, home-768.png, home-1280.png
```

---

## 4. Setup commands

```bash
# Needs Node 22+ and PHP 8.1+ with pdo_sqlite, sqlite3, mbstring, gd, fileinfo, curl, openssl enabled (php -m)
npm install
npx playwright install chromium
npm run wp:setup                      # once: downloads WordPress + the SQLite plugin from GitHub, installs the test site
```

**`package.json` scripts**

```json
"wp:setup": "node harness/wp.mjs setup",
"wp:start": "node harness/wp.mjs start",
"backup": "node scripts/backup.mjs",
"restore": "node scripts/restore.mjs",
"keys": "node hardening/make-keys.mjs",
"test:wp": "node --test --test-concurrency=1 tests/hardening.test.mjs tests/site.test.mjs tests/restore.test.mjs",
"test:browser": "node --test --test-concurrency=1 tests/browser.test.mjs",
"check": "npm run test:wp && npm run test:browser"
```

---

## 5. The idea: close the doors you can test, then test again

**The three username doors.** A username is half of a login. WordPress gives it away in three places that nobody notices:

| Door | What WordPress does | What this site does now |
|---|---|---|
| `/?author=1` | Redirects to `/author/<login>/`, which spells out the login name | A Visitor gets **404 with no redirect**. The block runs *before* WordPress's own redirect (hook priority 0, not 10). A name that exists and one that does not look **identical** |
| `/wp-json/wp/v2/users` (and `/users/1`) | Lists every author with `slug` (the login) | The two routes **do not exist** for a Visitor (404 `rest_no_route`). `/users/me` stays, so a person can still read their own account |
| `/wp-sitemap-users-1.xml` | Lists `/author/<login>/` addresses | The `users` sitemap provider is removed: 404, and gone from `/wp-sitemap.xml` |

**Who counts as a Visitor?** Anyone who is not signed in, *or* signed in without the `list_users` right. So a Subscriber and an Editor are treated as Visitors; an Administrator keeps all three doors (they can see usernames in the dashboard anyway). All of this is tested as four different people.

**Doors found while testing, also closed.** *XML-RPC* answers **403 before WordPress even runs**, so even `system.listMethods` (which needs no password) says nothing. *oEmbed* gave out `author_name` and `author_url` (`/author/<login>/`). The *login page* said different things for "no such user" and "wrong password", so one could test which names exist; now both show one sentence and do not repeat the typed name. *"Lost your password?"* gave an error for a made-up name and a redirect for a real one; now both redirect. The display name is never the login: the site prints "School Office", not `admin`.

**The file editors have two locks.** `DISALLOW_FILE_EDIT` in `wp-config.php` is the real switch. A second lock in the plugin (`map_meta_cap`) covers the day a host re-creates `wp-config.php` without the line. Both are tested **separately**: one run with the plugin's lock removed, one run with the config line left out. `DISALLOW_FILE_MODS` is *not* used: it would also hide the Plugins menu and block updates (the test checks the Plugins menu is still there).

**What is deliberately not turned on.** `FORCE_SSL_ADMIN` is a comment in `wp-config-lines.php`. It needs a working `https://` host; turned on without one it locks everybody out of the dashboard. A test makes sure it stays a comment.

**The backup is two things plus a note.** `db.sqlite` (a safe copy made while the site runs; on MySQL this is `mysqldump`), `files/` (the uploads folder) and `manifest.json` (sizes, counts, a checksum). The code is not in the backup because it is in Git. A **restore** builds a second site in its own folder with its own database, copies the uploads back and then **changes the site address everywhere it was saved**: in settings, in the menu link that was typed by hand, in a link inside a post and in a value saved as *serialized* text (an array with string lengths in front of each string; a plain find-and-replace would break the lengths). The restored site then passes the **same** smoke test and the **same** hardening tests as the live one.

**Three broken restores are produced on purpose** (and the symptom of each is a test): address not changed (the site opens but its links lead to the old site), wrong/empty database (every page redirects to the installer), uploads not copied (pages open, the picture is gone). A fourth, `.htaccess` and folder name, cannot be tested here and is marked so.

**The smoke test** is turned into one function and run on the live site *and* on the restored copy. For each of the 5 pages: status 200, the title, exactly one `h1`, a `main` area, `lang`, a viewport tag, the menu is Home / About / Students / News / Contact with the right item marked, no PHP message, every address on the page points at *this* site's port and every link works, plus checks for what that page is for (12 names A to Z and a search box; 3 news items; the form's fields).

**The visual test uses no tolerance.** Two screenshots match only if **every pixel is identical** (`pixelmatch` with `threshold: 0`, anti-aliasing counted). The course measured that a tolerance of 1% let a changed heading through. The same was measured here: changing the home heading differs by about **1,500 pixels = 0.13% to 0.38%** of the picture at 1280 / 768 / 375 px, far below 1%. A test with that tolerance would have passed a changed page. A test inside the suite changes the heading, expects a difference at all three sizes and expects the verdict "different". **Baselines are per operating system** (every system draws fonts a little differently): the first run on a new system writes its own baselines, takes a second screenshot to prove the page is stable, and says so. The Linux baselines are in `tests/baselines/linux/`.

**Core blocks only.** The five pages are made of `core/paragraph`, `core/heading`, `core/buttons`, `core/button`, `core/columns`, `core/column`, `core/list`, `core/list-item`, `core/search`, `core/query`, `core/post-template`, `core/post-title` and `core/shortcode`. A test reads every block name with WordPress's own `parse_blocks` and requires `core/`. A second test opens each page in the **real block editor** and requires every block to be valid (no "block problem" box), because markup written by hand can look right on the site and still be broken in the editor.

**Students are their own content type, not posts.** That keeps names out of News, the news feed and the post sitemap. A student has no page of their own: the address of one student, or of the whole list, goes back to the Students page (301). Only the name is stored: no author shown, no picture. Draft and private students are never listed or found. All 12 names are made up.

---

## 6. The code

### `plugin/safe-school-hardening/safe-school-hardening.php`

```php
<?php
/**
 * Plugin Name: Safe School Hardening
 * Description: Closes the three ways a visitor can read a username (?author=1, the REST users list, the users sitemap), turns XML-RPC off, and switches off the file editors. Small on purpose.
 * Version: 1.0.0
 * Requires PHP: 8.0
 * License: GPL-2.0-or-later
 * Text Domain: safe-school-hardening
 *
 * Who counts as "allowed to see users"? Anybody who is signed in AND has the right "list_users" (administrators).
 * Everybody else (visitors, teachers, subscribers) is treated as a visitor.
 *
 * This plugin has no settings page. Switch it off and every rule goes away.
 */
defined( 'ABSPATH' ) || exit;

/** True when this person may see usernames. */
function ssh_may_list_users(): bool {
	return is_user_logged_in() && current_user_can( 'list_users' );
}

/* ---------------------------------------------------------------------------------------------------------------
 * 1. XML-RPC: off.
 *    xmlrpc.php sets XMLRPC_REQUEST before WordPress loads. We stop right there, before anything else runs,
 *    so even harmless-looking methods (system.listMethods) are not answered.
 * ------------------------------------------------------------------------------------------------------------- */
if ( defined( 'XMLRPC_REQUEST' ) && XMLRPC_REQUEST ) {
	status_header( 403 );
	header( 'Content-Type: text/plain; charset=utf-8' );
	exit( 'XML-RPC is turned off on this site.' );
}
add_filter( 'xmlrpc_enabled', '__return_false' );
add_filter( 'xmlrpc_methods', '__return_empty_array' );
remove_action( 'wp_head', 'rsd_link' );             // the "Really Simple Discovery" tag that advertises xmlrpc.php
remove_action( 'wp_head', 'wlwmanifest_link' );     // the same for an old Windows writing program
add_filter( 'wp_headers', static function ( array $headers ): array {
	unset( $headers['X-Pingback'] );                // the header that advertises xmlrpc.php
	return $headers;
} );

/* ---------------------------------------------------------------------------------------------------------------
 * 2. File editors: off. The real switch is DISALLOW_FILE_EDIT in wp-config.php (hardening/wp-config-lines.php).
 *    This is the second lock: if a host re-creates wp-config.php and the line is lost, the editors stay off.
 * ------------------------------------------------------------------------------------------------------------- */
add_filter( 'map_meta_cap', static function ( array $caps, string $cap ): array {
	if ( in_array( $cap, array( 'edit_themes', 'edit_plugins', 'edit_files' ), true ) ) {
		return array( 'do_not_allow' );
	}
	return $caps;
}, 10, 2 );

/* ---------------------------------------------------------------------------------------------------------------
 * 3. Username door 1: /?author=1  (and /?author_name=admin, and /author/admin/)
 *    WordPress normally sends /?author=1 to /author/admin/ , which spells out the login name.
 *    For a visitor every author address now answers 404, and it does so BEFORE WordPress can redirect.
 * ------------------------------------------------------------------------------------------------------------- */
add_action( 'template_redirect', static function (): void {
	if ( ssh_may_list_users() ) {
		return;
	}
	if ( is_author() || isset( $_GET['author'] ) || isset( $_GET['author_name'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification -- read only
		global $wp_query;
		$wp_query->set_404();
		status_header( 404 );
		nocache_headers();
	}
}, 0 ); // priority 0: before redirect_canonical (priority 10)

// An author address that is never printed in links for visitors either.
add_filter( 'author_link', static fn( string $link ): string => ssh_may_list_users() ? $link : home_url( '/' ) );

/* ---------------------------------------------------------------------------------------------------------------
 * 4. Username door 2: the REST API users list  (/wp-json/wp/v2/users , /wp-json/wp/v2/users/1)
 *    The two routes are removed for everybody who may not list users. /users/me (your own account) stays.
 * ------------------------------------------------------------------------------------------------------------- */
add_filter( 'rest_endpoints', static function ( array $routes ): array {
	if ( ssh_may_list_users() ) {
		return $routes;
	}
	unset( $routes['/wp/v2/users'], $routes['/wp/v2/users/(?P<id>[\d]+)'] );
	return $routes;
} );

/* ---------------------------------------------------------------------------------------------------------------
 * 5. Username door 3: the users sitemap  (/wp-sitemap-users-1.xml)
 *    Remove the "users" provider. The sitemap index no longer lists it and the address answers 404.
 * ------------------------------------------------------------------------------------------------------------- */
add_filter( 'wp_sitemaps_add_provider', static function ( $provider, string $name ) {
	return 'users' === $name ? false : $provider;
}, 10, 2 );

/* ---------------------------------------------------------------------------------------------------------------
 * 6. Extra doors that give away the same thing (found while testing the three above)
 * ------------------------------------------------------------------------------------------------------------- */
// oEmbed answers with author_name and author_url ( /author/<login>/ ).
add_filter( 'oembed_response_data', static function ( array $data ): array {
	if ( ! ssh_may_list_users() ) {
		unset( $data['author_name'], $data['author_url'] );
	}
	return $data;
} );

// The login page: "no such user" and "wrong password" must look the same, or an attacker can test which names exist.
add_filter( 'login_errors', static function ( string $message ): string {
	global $errors;
	if ( $errors instanceof WP_Error && array_intersect( array( 'invalid_username', 'incorrect_password', 'invalid_email', 'invalidcombo' ), $errors->get_error_codes() ) ) {
		return '<strong>Error:</strong> The username or password is not correct.';
	}
	return $message;
} );

// "Lost your password?": the answer is the same whether the name exists or not.
add_action( 'login_form_lostpassword', static function (): void {
	if ( 'POST' !== ( $_SERVER['REQUEST_METHOD'] ?? '' ) || '' === trim( (string) ( $_POST['user_login'] ?? '' ) ) ) { // phpcs:ignore WordPress.Security.NonceVerification
		return; // an empty box gets WordPress's normal "enter a username" text: that gives nothing away
	}
	retrieve_password(); // sends the mail if the account exists; the result is deliberately ignored
	wp_safe_redirect( add_query_arg( 'checkemail', 'confirm', wp_login_url() ) );
	exit;
} );
```

### `plugin/safe-school-site/safe-school-site.php`

```php
<?php
/**
 * Plugin Name: Safe School Site
 * Description: The school's own features: the Student list (names only) and the contact form [school_contact_form].
 * Version: 1.0.0
 * Requires PHP: 8.0
 * License: GPL-2.0-or-later
 * Text Domain: safe-school-site
 */
defined( 'ABSPATH' ) || exit;

/* ---------------------------------------------------------------------------------------------------------------
 * 1. Students: a content type with a name (the title) and nothing else.
 *    - They are not posts, so they never show up in the News page, the news feed or the post sitemap.
 *    - Only names are stored. No author is shown, no picture, no age.
 *    - A student has no page of its own: the address of one student goes back to the Students page.
 * ------------------------------------------------------------------------------------------------------------- */
add_action( 'init', 'sss_register_student_type' );

function sss_register_student_type(): void {
	register_post_type( 'student', array(
		'labels'              => array( 'name' => __( 'Students', 'safe-school-site' ), 'singular_name' => __( 'Student', 'safe-school-site' ) ),
		'public'              => true,   // must be public so the search box on the Students page can search it
		'publicly_queryable'  => true,
		'exclude_from_search' => false,  // the site-wide search finds students too (names only, no links)
		'has_archive'         => false,
		'show_in_rest'        => false,  // not in the REST API, and the block editor is not needed for a name
		'show_in_nav_menus'   => false,
		'rewrite'             => array( 'slug' => 'student', 'with_front' => false ),
		'supports'            => array( 'title' ), // no author, no editor, no thumbnail
		'menu_icon'           => 'dashicons-groups',
	) );
}

// Not in the sitemap (a student has no page worth listing).
add_filter( 'wp_sitemaps_post_types', static function ( array $types ): array {
	unset( $types['student'] );
	return $types;
} );

// One student's own address, or the list of all students, goes to the Students page. Search results are not touched.
add_action( 'template_redirect', static function (): void {
	if ( is_search() ) {
		return;
	}
	if ( is_singular( 'student' ) || 'student' === get_query_var( 'post_type' ) ) {
		$page = get_page_by_path( 'students' );
		wp_safe_redirect( $page ? get_permalink( $page ) : home_url( '/' ), 301 );
		exit;
	}
}, 0 );

/* ---------------------------------------------------------------------------------------------------------------
 * 2. The contact form: [school_contact_form]
 *    Every message is saved (so nothing is lost if e-mail is not set up on the host) and then e-mailed to the admin.
 *    Messages can only be read by administrators.
 * ------------------------------------------------------------------------------------------------------------- */
const SSS_MESSAGE = 'contact_message';

add_action( 'init', 'sss_register_message_type' );

function sss_register_message_type(): void {
	$admin_only = array(); // every right of this type needs "manage_options", which only administrators have
	foreach ( array( 'edit_post', 'read_post', 'delete_post', 'edit_posts', 'edit_others_posts', 'delete_posts', 'publish_posts', 'read_private_posts', 'delete_private_posts', 'delete_published_posts', 'delete_others_posts', 'edit_private_posts', 'edit_published_posts', 'create_posts' ) as $cap ) {
		$admin_only[ $cap ] = 'manage_options';
	}
	register_post_type( SSS_MESSAGE, array(
		'labels'          => array( 'name' => __( 'Contact messages', 'safe-school-site' ), 'singular_name' => __( 'Contact message', 'safe-school-site' ) ),
		'public'          => false,   // never on the website, never in the REST API
		'show_ui'         => true,
		'show_in_rest'    => false,
		'menu_icon'       => 'dashicons-email',
		'supports'        => array( 'title', 'editor' ),
		'capabilities'    => $admin_only,
		'map_meta_cap'    => false,
	) );
}

/** The result of the last submit, shared between the part that handles the POST and the part that draws the form. */
function sss_form_state( ?array $set = null ): array {
	static $state = array( 'errors' => array(), 'values' => array( 'name' => '', 'email' => '', 'message' => '' ), 'submitted' => false );
	if ( null !== $set ) {
		$state = $set;
	}
	return $state;
}

function sss_validate( array $in ): array {
	$errors  = array();
	$name    = trim( preg_replace( '/[\r\n\t]+/', ' ', sanitize_text_field( $in['name'] ?? '' ) ) );
	$email   = trim( sanitize_text_field( $in['email'] ?? '' ) );
	$message = trim( sanitize_textarea_field( $in['message'] ?? '' ) );

	if ( '' === $name ) {
		$errors['name'] = __( 'Please enter your name.', 'safe-school-site' );
	} elseif ( mb_strlen( $name ) > 80 ) {
		$errors['name'] = __( 'Your name is too long. Please use 80 letters or fewer.', 'safe-school-site' );
	}
	if ( '' === $email ) {
		$errors['email'] = __( 'Please enter your email address.', 'safe-school-site' );
	} elseif ( ! is_email( $email ) ) {
		$errors['email'] = __( "That doesn't look like an email address. It needs an @ and a dot, like name@example.com.", 'safe-school-site' );
	}
	if ( '' === $message ) {
		$errors['message'] = __( 'Please write a message.', 'safe-school-site' );
	} elseif ( mb_strlen( $message ) > 2000 ) {
		$errors['message'] = sprintf( __( 'Your message is too long (%d characters). Please keep it under 2000.', 'safe-school-site' ), mb_strlen( $message ) );
	}
	return array( $errors, array( 'name' => $name, 'email' => $email, 'message' => $message ) );
}

add_action( 'template_redirect', static function (): void {
	if ( 'POST' !== ( $_SERVER['REQUEST_METHOD'] ?? '' ) || ! isset( $_POST['sss_contact_nonce'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification
		return;
	}
	$raw = wp_unslash( $_POST ); // phpcs:ignore WordPress.Security.NonceVerification -- the nonce is checked on the next line
	if ( ! wp_verify_nonce( sanitize_text_field( (string) $raw['sss_contact_nonce'] ), 'sss_contact' ) ) {
		sss_form_state( array( 'errors' => array( 'form' => __( 'This form has expired. Please reload the page and try again.', 'safe-school-site' ) ), 'values' => array( 'name' => '', 'email' => '', 'message' => '' ), 'submitted' => true ) );
		return;
	}
	// The fields are called sender_name, sender_email, sender_message on purpose: a field named just "name" is a
	// WordPress query word (the address of a post), and WordPress would answer 404 for the whole page.
	[ $errors, $values ] = sss_validate( array( 'name' => $raw['sender_name'] ?? '', 'email' => $raw['sender_email'] ?? '', 'message' => $raw['sender_message'] ?? '' ) );
	if ( $errors ) {
		sss_form_state( array( 'errors' => $errors, 'values' => $values, 'submitted' => true ) );
		return;
	}
	// A hidden field that people never see but spam robots fill in. We pretend it worked and keep nothing.
	if ( '' === trim( (string) ( $raw['website'] ?? '' ) ) ) {
		$id = wp_insert_post( array(
			'post_type'    => SSS_MESSAGE,
			'post_status'  => 'publish',
			'post_title'   => wp_strip_all_tags( sprintf( '%s <%s>', $values['name'], $values['email'] ) ),
			'post_content' => $values['message'],
		) );
		if ( $id && ! is_wp_error( $id ) ) {
			add_post_meta( $id, '_sender_email', $values['email'] );
			$sent = wp_mail( get_option( 'admin_email' ), '[' . get_bloginfo( 'name' ) . '] Message from ' . $values['name'], $values['message'], array( 'Reply-To: ' . $values['email'] ) );
			if ( ! $sent ) {
				error_log( 'Safe School Site: message ' . $id . ' saved, but the e-mail could not be sent.' ); // phpcs:ignore WordPress.PHP.DevelopmentFunctions
			}
		}
	}
	wp_safe_redirect( add_query_arg( 'sent', '1', get_permalink() ?: home_url( '/' ) ) ); // after a POST, always redirect: a refresh must not send it again
	exit;
} );

add_shortcode( 'school_contact_form', static function (): string {
	if ( isset( $_GET['sent'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification -- only decides which text to show
		return '<p class="notice-ok" role="status">' . esc_html__( 'Thank you! Your message has been sent. We will reply by email.', 'safe-school-site' ) . '</p>';
	}
	$state  = sss_form_state();
	$errors = $state['errors'];
	$v      = $state['values'];
	$out    = '';
	if ( $errors ) {
		$out .= '<div class="notice-error" role="alert" id="form-errors"><strong>' . esc_html__( 'Your message was not sent.', 'safe-school-site' ) . '</strong> ' . esc_html( $errors['form'] ?? __( 'Please fix the items below.', 'safe-school-site' ) ) . '</div>';
	}
	$attrs = static function ( string $key ) use ( $errors ): string {
		$a = 'id="sender_' . $key . '" name="sender_' . $key . '" required';
		if ( isset( $errors[ $key ] ) ) {
			$a .= ' aria-invalid="true" aria-describedby="sender_' . $key . '_error"';
		}
		return $a;
	};
	$field = static function ( string $key, string $label, string $control ) use ( $errors ): string {
		$html  = '<div class="field' . ( isset( $errors[ $key ] ) ? ' has-error' : '' ) . '">';
		$html .= '<label for="sender_' . $key . '">' . esc_html( $label ) . '</label>' . $control;
		if ( isset( $errors[ $key ] ) ) {
			$html .= '<p class="field-error" id="sender_' . $key . '_error">' . esc_html( $errors[ $key ] ) . '</p>';
		}
		return $html . '</div>';
	};
	$out .= '<form class="contact-form" method="post" action="" novalidate>';
	$out .= $field( 'name', __( 'Your name', 'safe-school-site' ), '<input type="text" ' . $attrs( 'name' ) . ' autocomplete="name" value="' . esc_attr( $v['name'] ) . '">' );
	$out .= $field( 'email', __( 'Your email', 'safe-school-site' ), '<input type="email" ' . $attrs( 'email' ) . ' autocomplete="email" value="' . esc_attr( $v['email'] ) . '">' );
	$out .= $field( 'message', __( 'Your message', 'safe-school-site' ), '<textarea ' . $attrs( 'message' ) . ' rows="6">' . esc_textarea( $v['message'] ) . '</textarea>' );
	$out .= '<div class="hp" aria-hidden="true"><label>Leave this empty <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>';
	$out .= wp_nonce_field( 'sss_contact', 'sss_contact_nonce', true, false );
	$out .= '<button type="submit">' . esc_html__( 'Send message', 'safe-school-site' ) . '</button></form>';
	return $out;
} );
```

### `theme/safe-school/style.css`

```css
/*
Theme Name: Safe School
Description: A small classic theme for the safe school site: a top menu, plain pages made of core blocks, news cards, a student list and a contact form.
Version: 1.0.0
Requires PHP: 8.0
License: GPL-2.0-or-later
Text Domain: safe-school
*/
:root { --bg:#f6f7f9; --card:#fff; --text:#1c2230; --muted:#5a6478; --line:#d9deea; --accent:#2b5fd9; --err:#b3261e; --ok:#1b6e3c; }
* { box-sizing: border-box; }
body { margin: 0; font: 16px/1.55 system-ui, sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; display: flex; flex-direction: column; } /* the footer stays at the bottom of a short page */
a { color: var(--accent); }
.site-header { background: var(--card); border-bottom: 1px solid var(--line); }
.site-header .inner, .site-main, .site-footer .inner { max-width: 980px; margin: 0 auto; padding: 0 16px; }
.site-header .inner { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; min-height: 64px; }
.site-title { font-weight: 700; font-size: 1.2rem; text-decoration: none; color: var(--text); }
.menu { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4px; }
.menu a { display: block; padding: 10px 12px; text-decoration: none; color: var(--text); border-radius: 8px; }
.menu a:hover, .menu a:focus-visible { background: var(--bg); }
.menu .current-menu-item > a { font-weight: 700; box-shadow: inset 0 -3px 0 var(--accent); border-radius: 0; }
.site-main { padding-top: 24px; padding-bottom: 48px; flex: 1; width: 100%; }
.site-footer { border-top: 1px solid var(--line); background: var(--card); padding: 16px 0; color: var(--muted); font-size: .9rem; }
h1 { font-size: 1.8rem; margin: 0 0 16px; line-height: 1.2; }
.entry h2 { margin-top: 1.6em; }
.entry .wp-block-buttons { margin: 20px 0; }
.entry .wp-block-column > :first-child { margin-top: 12px; }
.entry .wp-block-column { background: var(--card); box-shadow: 0 0 0 1px var(--line); border-radius: 12px; padding: 4px 16px 12px; }
.cards { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); gap: 16px; }
.card { background: var(--card); box-shadow: 0 0 0 1px var(--line); border-radius: 12px; }
.card .body { padding: 12px 16px 16px; }
.card h2 { margin: 0 0 4px; font-size: 1.1rem; }
.card time, .meta { color: var(--muted); font-size: .85rem; }
.card p { margin: 8px 0 0; color: var(--muted); }
.student { background: var(--card); box-shadow: 0 0 0 1px var(--line); border-radius: 8px; padding: 8px 12px; }
.wp-block-search { margin: 0 0 20px; max-width: 520px; }
.wp-block-search__inside-wrapper { display: flex; gap: 8px; }
.wp-block-search__input { flex: 1; font: inherit; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; min-width: 0; }
.wp-block-search__button { font: inherit; padding: 8px 14px; border: 0; border-radius: 8px; background: var(--accent); color: #fff; cursor: pointer; }
.wp-block-post-template { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 220px), 1fr)); gap: 10px; }
.wp-block-post-template > li { background: var(--card); box-shadow: 0 0 0 1px var(--line); border-radius: 8px; padding: 8px 12px; }
.wp-block-post-title { font-size: 1rem; margin: 0; }
.contact-form { display: grid; gap: 14px; max-width: 520px; }
.field label { display: block; font-size: .9rem; margin-bottom: 4px; }
.field input, .field textarea { width: 100%; font: inherit; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--card); color: var(--text); }
.field.has-error input, .field.has-error textarea { border-color: var(--err); }
.field-error { color: var(--err); margin: 4px 0 0; font-size: .9rem; }
.notice-error { border: 1px solid var(--err); color: var(--err); border-radius: 8px; padding: 10px 14px; margin-bottom: 14px; max-width: 520px; }
.notice-ok { border: 1px solid var(--ok); color: var(--ok); border-radius: 8px; padding: 10px 14px; max-width: 520px; }
.hp { position: absolute; left: -9999px; }
button[type=submit] { font: inherit; padding: 10px 16px; border: 0; border-radius: 8px; background: var(--accent); color: #fff; cursor: pointer; justify-self: start; }
.pagination { margin-top: 20px; }
```

### `theme/safe-school/functions.php`

```php
<?php
defined( 'ABSPATH' ) || exit;

// Everything a theme sets up goes on "after_setup_theme": it runs once, early, on every request.
add_action( 'after_setup_theme', static function (): void {
	add_theme_support( 'title-tag' );
	add_theme_support( 'html5', array( 'search-form', 'gallery', 'caption', 'style', 'script' ) );
	register_nav_menus( array( 'primary' => __( 'Main menu', 'safe-school' ) ) );
} );

add_action( 'wp_enqueue_scripts', static function (): void {
	wp_enqueue_style( 'safe-school', get_stylesheet_uri(), array(), wp_get_theme()->get( 'Version' ) );
} );
```

### `theme/safe-school/header.php`

```php
<!doctype html>
<html <?php language_attributes(); ?>>
<head>
	<meta charset="<?php bloginfo( 'charset' ); ?>">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<?php wp_head(); ?>
</head>
<body <?php body_class(); ?>>
<?php wp_body_open(); ?>
<header class="site-header">
	<div class="inner">
		<a class="site-title" href="<?php echo esc_url( home_url( '/' ) ); ?>"><?php bloginfo( 'name' ); ?></a>
		<nav aria-label="<?php esc_attr_e( 'Main menu', 'safe-school' ); ?>">
			<?php wp_nav_menu( array( 'theme_location' => 'primary', 'container' => false, 'menu_class' => 'menu', 'fallback_cb' => false ) ); ?>
		</nav>
	</div>
</header>
<main class="site-main">
```

### `theme/safe-school/footer.php`

```php
</main>
<footer class="site-footer">
	<div class="inner"><?php bloginfo( 'name' ); ?> &middot; <?php esc_html_e( 'Questions? Use the Contact page.', 'safe-school' ); ?></div>
</footer>
<?php wp_footer(); ?>
</body>
</html>
```

### `theme/safe-school/index.php`

```php
<?php
// News (the posts page), search results, and any other list. The author of a post is never printed.
get_header();
if ( is_search() ) {
	/* translators: %s: what was searched for */
	$heading = sprintf( __( 'Search: %s', 'safe-school' ), get_search_query() );
} elseif ( is_home() ) {
	$heading = single_post_title( '', false );
} else {
	$heading = get_the_archive_title();
}
?>
<h1><?php echo esc_html( $heading ); ?></h1>
<?php if ( have_posts() ) : ?>
	<ul class="cards">
		<?php while ( have_posts() ) : the_post(); ?>
			<?php if ( 'student' === get_post_type() ) : ?>
				<li class="student"><?php the_title(); ?></li>
			<?php else : ?>
				<li class="card">
					<div class="body">
						<h2><a href="<?php the_permalink(); ?>"><?php the_title(); ?></a></h2>
						<time datetime="<?php echo esc_attr( get_the_date( 'c' ) ); ?>"><?php echo esc_html( get_the_date() ); ?></time>
						<p><?php echo esc_html( get_the_excerpt() ); ?></p>
					</div>
				</li>
			<?php endif; ?>
		<?php endwhile; ?>
	</ul>
	<div class="pagination"><?php the_posts_pagination(); ?></div>
<?php else : ?>
	<p class="empty"><?php esc_html_e( 'Nothing found.', 'safe-school' ); ?></p>
<?php endif; ?>
<?php get_footer(); ?>
```

### `theme/safe-school/page.php`

```php
<?php get_header(); ?>
<?php while ( have_posts() ) : the_post(); ?>
	<article class="entry">
		<h1><?php the_title(); ?></h1>
		<?php the_content(); ?>
	</article>
<?php endwhile; ?>
<?php get_footer(); ?>
```

### `theme/safe-school/single.php`

```php
<?php get_header(); ?>
<?php while ( have_posts() ) : the_post(); ?>
	<article class="entry">
		<h1><?php the_title(); ?></h1>
		<p class="meta"><?php echo esc_html( get_the_date() ); ?></p>
		<?php the_content(); ?>
	</article>
<?php endwhile; ?>
<?php get_footer(); ?>
```

### `theme/safe-school/404.php`

```php
<?php get_header(); ?>
<h1><?php esc_html_e( 'Page not found', 'safe-school' ); ?></h1>
<p><?php esc_html_e( 'We could not find that page. It may have been removed, or it is not published yet.', 'safe-school' ); ?></p>
<p><a href="<?php echo esc_url( home_url( '/' ) ); ?>"><?php esc_html_e( 'Back to the home page', 'safe-school' ); ?></a></p>
<?php get_footer(); ?>
```

### `hardening/wp-config-lines.php` (the lines for wp-config.php)

```php
<?php
/**
 * The lines for wp-config.php.
 *
 * Paste everything below the "<?php" line into wp-config.php, ABOVE the line that says
 *     That's all, stop editing! Happy publishing.
 * (The test site includes this very file, so the tests run these exact lines.)
 */

// 1. Turn off the Theme File Editor and the Plugin File Editor (the code editors inside the dashboard).
//    A stolen admin password then cannot be used to write PHP into the site from the browser.
//    Do NOT use DISALLOW_FILE_MODS instead: that also hides the Plugins menu and blocks updates.
if ( ! defined( 'DISALLOW_FILE_EDIT' ) ) {
	define( 'DISALLOW_FILE_EDIT', true );
}

// 2. Keep error messages out of the pages (they can show file paths). Errors still go to wp-content/debug.log.
if ( ! defined( 'WP_DEBUG_DISPLAY' ) ) {
	define( 'WP_DEBUG_DISPLAY', false );
}

// 3. HTTPS for the login page and the dashboard.
//    LEFT OFF ON PURPOSE. Turn it on only after https:// works on your host. If https does not work,
//    this line locks everybody out of the dashboard. Test: open https://your-site/wp-login.php first.
// define( 'FORCE_SSL_ADMIN', true );

// 4. The eight secret keys: do NOT put them here. They belong in wp-config.php as eight define() lines with
//    random values. Run  node hardening/make-keys.mjs  to print eight fresh lines. Changing them logs everybody out.
```

### `hardening/make-keys.mjs`

```js
// Prints the eight secret-key lines for wp-config.php, each with a fresh random value.
//   node hardening/make-keys.mjs
// Uses Node's cryptographic random generator (not Math.random). Run it once per site, never share the output.
import { randomBytes } from "node:crypto";

export const KEY_NAMES = ["AUTH_KEY", "SECURE_AUTH_KEY", "LOGGED_IN_KEY", "NONCE_KEY", "AUTH_SALT", "SECURE_AUTH_SALT", "LOGGED_IN_SALT", "NONCE_SALT"];
/** 64 random characters from letters and digits only, so the value never needs quoting tricks inside PHP. */
export function randomValue(length = 64) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = randomBytes(length * 2);
  let out = "";
  for (const b of bytes) {
    if (b < 248) out += alphabet[b % alphabet.length]; // 248 = 4 * 62: throw away the top bytes so every character is equally likely
    if (out.length === length) break;
  }
  return out;
}
export const makeLines = () => KEY_NAMES.map((n) => `define( '${n}', '${randomValue()}' );`).join("\n");

if (process.argv[1] === import.meta.filename) console.log(makeLines());
```

### `hardening/htaccess.txt` (Apache; not tested here)

```apache
# Put these lines at the TOP of the .htaccess file in the site's main folder (Apache 2.4).
# They are NOT run by the test site (PHP's built-in server ignores .htaccess). Test them on your host:
# after saving, open /xmlrpc.php, /wp-config.php, /readme.html in a browser. Each must say "403 Forbidden", and the home page must still open.

# Nobody may fetch the files that give attackers a way in or tell them which WordPress version you have.
<FilesMatch "^(xmlrpc\.php|wp-config\.php|readme\.html|license\.txt|wp-config-sample\.php)$">
    Require all denied
</FilesMatch>

# Do not list the contents of a folder that has no index file.
Options -Indexes

# Three small safety headers. They sit inside IfModule: if the headers module is off on your host, the site still works
# (without this wrapper the same lines give a 500 error for the whole site).
<IfModule mod_headers.c>
    Header always set X-Frame-Options "SAMEORIGIN"
    Header always set X-Content-Type-Options "nosniff"
    Header always set Referrer-Policy "strict-origin-when-cross-origin"
</IfModule>

# Do NOT use <Directory> in this file. Apache answers 500: <Directory> belongs in the server's own config, not in .htaccess.
# Do NOT use "Order deny,allow / Deny from all": that is the Apache 2.2 way and only works if an old-compatibility module is loaded.

# ...then WordPress's own block (WordPress writes this itself when you save Settings > Permalinks):
# BEGIN WordPress
# END WordPress
```

### `hardening/uploads-htaccess.txt` (Apache; not tested here)

```apache
# Save as  wp-content/uploads/.htaccess   (Apache 2.4)
# People can upload pictures and documents here. If a PHP file ever lands in this folder (through a weak plugin, say),
# this rule stops the server from running it. Not run by the test site: test it on your host by putting a file
# named test.php in uploads and opening it in a browser. It must say "403 Forbidden".
<FilesMatch "\.(php|phtml|php[0-9]|phar)$">
    Require all denied
</FilesMatch>
```

### `hardening/nginx.txt` (nginx; not tested here)

```nginx
# If the host runs nginx instead of Apache, .htaccess does nothing. The same three jobs, as nginx rules.
# NOT tested here (no nginx in the sandbox). Put them inside the server { } block, then reload nginx and test /xmlrpc.php.
location = /xmlrpc.php { deny all; }
location ~* ^/(wp-config\.php|readme\.html|license\.txt|wp-config-sample\.php)$ { deny all; }
location ~* ^/wp-content/uploads/.*\.(php|phtml|phar)$ { deny all; }
```

### `hardening/CONFIG-NOTE.txt` (the text note)

```text
HARDENING NOTE: what is closed, where the switch is, how it was tested
=======================================================================

The school's hardening is in three small places. Nothing here needs a settings page.

1. wp-config.php            hardening/wp-config-lines.php   (paste above "That's all, stop editing!")
2. the plugin               plugin/safe-school-hardening/    (activate it; it has no settings)
3. Apache / host files      hardening/htaccess.txt, hardening/uploads-htaccess.txt   (NOT tested here)

WHAT EACH LINE DOES
-------------------
DISALLOW_FILE_EDIT   removes BOTH code editors (Appearance > Theme File Editor and Plugins > Plugin File Editor).
                     Do not use DISALLOW_FILE_MODS instead: it also hides the Plugins menu and stops updates.
                     The plugin adds a second lock for the same editors, in case wp-config.php is ever re-created without the line.
WP_DEBUG_DISPLAY     false: error text never prints on a page (it can show file paths).
FORCE_SSL_ADMIN      OFF on purpose. Turn it on only after https:// works on your host, or you lock everybody out of the
                     dashboard. Check first: open https://your-site/wp-login.php.
SECRET KEYS          8 of them, random, only in the real wp-config.php. Run  node hardening/make-keys.mjs  to print 8 fresh lines.
                     Changing them logs everybody out. The test site uses fake keys ("test-only-key-1"): never copy those.

THE THREE USERNAME DOORS (the plugin closes all three)
------------------------------------------------------
1. /?author=1          WordPress sends it to /author/<login>/ . Now a Visitor gets 404, with no redirect.
2. /wp-json/wp/v2/users   the REST list of users. Now the route does not exist for a Visitor (404).
3. /wp-sitemap-users-1.xml   the users sitemap. Now removed (404) and not listed in /wp-sitemap.xml.
"Visitor" means: not signed in, OR signed in without the "list_users" right (so Editors and Subscribers are treated as Visitors).
Administrators keep all three, because they can see usernames in the dashboard anyway.

EXTRA DOORS FOUND WHILE TESTING (also closed)
---------------------------------------------
- XML-RPC (xmlrpc.php): answers 403 to everything, before WordPress runs. No RSD link, no X-Pingback header.
- oEmbed (/wp-json/oembed/1.0/embed): author_name and author_url removed for Visitors.
- Login page: "no such user", "wrong password" and "unknown email" all show one sentence.
- "Lost your password?": the same redirect for a real and a made-up name.
- Display names: the website prints "School Office", never the login "admin". Set a different display name for every user.

HOW IT WAS TESTED (npm run check)
---------------------------------
Every door above is tested as a Visitor, as a Subscriber, as an Editor and as an Administrator. The tests run on the live test
site AND on a restored copy. A separate script (break45.py) breaks the code on purpose, one rule at a time, and checks that a test fails.

NOT TESTED HERE
---------------
- .htaccess and nginx rules: the test server (PHP's built-in server) ignores them. Test on the real host: after saving,
  /xmlrpc.php, /wp-config.php and /readme.html must each say 403, and the home page must still open.
- FORCE_SSL_ADMIN: needs a working https host.
- Real mail delivery (contact form and "Lost your password?"): the sandbox has no mail server. Messages are saved first, so none is lost.
- MySQL. The tests ran on SQLite.
```

### `BACKUP_AND_RESTORE.md` (the short backup and restore note)

```markdown
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
```

### `package.json`

```json
{
  "name": "safe-school-site",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "wp:setup": "node harness/wp.mjs setup",
    "wp:start": "node harness/wp.mjs start",
    "backup": "node scripts/backup.mjs",
    "restore": "node scripts/restore.mjs",
    "keys": "node hardening/make-keys.mjs",
    "test:wp": "node --test --test-concurrency=1 tests/hardening.test.mjs tests/site.test.mjs tests/restore.test.mjs",
    "test:browser": "node --test --test-concurrency=1 tests/browser.test.mjs",
    "check": "npm run test:wp && npm run test:browser"
  },
  "devDependencies": {
    "linkedom": "^0.18.0",
    "playwright": "^1.63.0",
    "pixelmatch": "^7.1.0",
    "pngjs": "^7.0.0"
  }
}
```

### `harness/wp.mjs` (test harness)

```js
// Builds and runs a throw-away WordPress for testing the plugin.
//   node harness/wp.mjs setup     download WordPress + the SQLite plugin (once), install a fresh site with test data
//   node harness/wp.mjs start     run the site at http://localhost:8080   (Ctrl+C to stop)
//
// Needs: git, and PHP 8.1+ with the sqlite extension (pdo_sqlite). No MySQL, no Docker.
// WordPress is cloned from GitHub (the wordpress.org download site is not needed).
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

export const root = path.resolve(import.meta.dirname, "..");
export const wpDir = path.join(root, ".wp");
export const siteDir = path.join(wpDir, "site");
export const credsFile = path.join(wpDir, "creds.json");
export const dbDir = path.join(siteDir, "wp-content", "database");
const cacheDir = path.join(wpDir, "cache");
const php = process.env.PHP ?? "php";

// Pinned, so the test site is the same every time.
const WORDPRESS = { url: "https://github.com/WordPress/WordPress.git", tag: "7.1.4" };
const SQLITE_PLUGIN = { url: "https://github.com/WordPress/sqlite-database-integration.git", sha: "6ca5528eec8aa1cb66ac6af038b42e5b8cbd7a4c" };

function run(cmd, args, options = {}) {
  const r = spawnSync(cmd, args, { stdio: options.quiet ? "pipe" : "inherit", encoding: "utf8", ...options });
  if (r.status !== 0) {
    // PHP prints its errors on stdout, so show both
    throw new Error(`${cmd} ${args.join(" ")} failed (exit code ${r.status ?? "none"})${r.error ? `\n${r.error.message}` : ""}${r.stdout ? `\n${r.stdout}` : ""}${r.stderr ? `\n${r.stderr}` : ""}`);
  }
  return r.stdout;
}

function cloneWordPress(target) {
  console.log(`Cloning WordPress ${WORDPRESS.tag} ...`);
  run("git", ["clone", "--depth", "1", "--branch", WORDPRESS.tag, WORDPRESS.url, target]);
}
function cloneSqlitePlugin(target) {
  console.log("Fetching the SQLite Database Integration plugin ...");
  mkdirSync(target, { recursive: true });
  run("git", ["init", "-q"], { cwd: target });
  run("git", ["fetch", "--depth", "1", "-q", SQLITE_PLUGIN.url, SQLITE_PLUGIN.sha], { cwd: target });
  run("git", ["checkout", "-q", "FETCH_HEAD"], { cwd: target });
}

/** WordPress + the SQLite plugin + our plugin, put together in .wp/site. Downloads only the first time. */
export function ensureSite(target = siteDir) {
  if (!existsSync(path.join(target, "wp-load.php"))) {
    mkdirSync(cacheDir, { recursive: true });
    const wpClone = path.join(cacheDir, "WordPress");
    const sqliteClone = path.join(cacheDir, "sqlite");
    if (!existsSync(wpClone)) cloneWordPress(wpClone);
    if (!existsSync(sqliteClone)) cloneSqlitePlugin(sqliteClone);
    console.log("Putting the site together ...");
    rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 }); // Windows can hold files for a moment (antivirus, a leftover php.exe)
    cpSync(wpClone, target, { recursive: true, filter: (src) => !src.includes(`${path.sep}.git${path.sep}`) && !src.endsWith(`${path.sep}.git`) });
    const pluginTarget = path.join(target, "wp-content", "plugins", "sqlite-database-integration");
    // dereference: the plugin folder in the repo uses a symbolic link for its database code
    cpSync(path.join(sqliteClone, "packages", "plugin-sqlite-database-integration"), pluginTarget, { recursive: true, dereference: true });
    // On Windows, git does not create symbolic links: the "database" folder arrives as a small text file. So copy the real folder in explicitly (works everywhere).
    const dbCode = path.join(pluginTarget, "wp-includes", "database");
    rmSync(dbCode, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
    cpSync(path.join(sqliteClone, "packages", "mysql-on-sqlite", "src"), dbCode, { recursive: true });
    // On Windows, git often turns a symbolic link into a small text file. Then `wp-includes/database` is a file, not a folder,
    // and WordPress crashes. If so, copy the real folder the link points to.
    const linked = path.join(pluginTarget, "wp-includes", "database");
    if (!statSync(linked).isDirectory()) {
      rmSync(linked, { force: true });
      cpSync(path.join(sqliteClone, "packages", "mysql-on-sqlite", "src"), linked, { recursive: true });
    }
    let dbPhp = readFileSync(path.join(pluginTarget, "db.copy"), "utf8");
    dbPhp = dbPhp.replaceAll("'{SQLITE_IMPLEMENTATION_FOLDER_PATH}'", "__DIR__.'/plugins/sqlite-database-integration'").replaceAll("{SQLITE_PLUGIN}", "sqlite-database-integration/load.php");
    writeFileSync(path.join(target, "wp-content", "db.php"), dbPhp); // the "drop-in" that swaps MySQL for SQLite
  }
  // our plugins, our theme and settings are copied fresh every time, so edits are picked up
  for (const [from, to] of [["plugin", "plugins"], ["theme", "themes"]]) {
    for (const name of readdirSync(path.join(root, from))) {
      const dest = path.join(target, "wp-content", to, name);
      rmSync(dest, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
      cpSync(path.join(root, from, name), dest, { recursive: true });
    }
  }
  cpSync(path.join(root, "harness", "wp-config.php"), path.join(target, "wp-config.php"));
  // the hardening lines are the SAME file the school gets in hardening/: the test site runs the delivered lines, not a copy
  cpSync(path.join(root, "hardening", "wp-config-lines.php"), path.join(target, "wp-config-lines.php"));
}

/** An empty database, WordPress installed, plugin active, test users and notices added. */
export function installFresh() {
  const mods = spawnSync(php, ["-m"], { encoding: "utf8" });
  if (mods.error) throw new Error("PHP was not found. Install PHP 8.1+ and put it on PATH (php -v), or set the PHP environment variable to php.exe.");
  const have = (mods.stdout || "").toLowerCase();
  for (const need of ["pdo_sqlite", "sqlite3", "mbstring"]) {
    if (!have.includes(need)) throw new Error(`Your PHP is missing the "${need}" extension. Open php.ini (php --ini shows where), remove the ; before extension=${need}, save, and run again.`);
  }
  ensureSite();
  mkdirSync(dbDir, { recursive: true });
  for (const f of readdirSync(dbDir)) if (f.startsWith(".ht.sqlite")) rmSync(path.join(dbDir, f), { force: true });
  console.log("Installing WordPress ...");
  const out = run(php, [path.join(root, "harness", "install.php"), siteDir, credsFile], { quiet: true });
  console.log(out.trim());
}

/** Starts PHP's built-in web server. Resolves when WordPress answers. */
export async function startServer({ port = 8080, dbFile, dbDirOverride, site = siteDir, env: extraEnv = {} } = {}) {
  const env = { ...process.env, WP_PORT: String(port), ...extraEnv };
  if (dbFile) env.WP_DB_FILE = dbFile;
  if (dbDirOverride) env.WP_DB_DIR = dbDirOverride;
  const child = spawn(php, ["-S", `localhost:${port}`, "-t", site, path.join(root, "harness", "router.php")], { env, stdio: "ignore" });
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`http://localhost:${port}/wp-json/`);
      if (res.ok) return child;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  child.kill();
  throw new Error(`WordPress did not start on port ${port}`);
}

export const readCreds = () => JSON.parse(readFileSync(credsFile, "utf8"));

if (process.argv[1] === import.meta.filename) {
  const [command] = process.argv.slice(2);
  if (command === "setup") {
    installFresh();
    console.log("\nDone. Start it with:  npm run wp:start");
    console.log("Log in at http://localhost:8080/wp-login.php   (admin / admin-pass-123, editor1 / editor-pass-123, parent1 / parent-pass-123)");
  } else if (command === "start") {
    ensureSite();
    if (!existsSync(credsFile)) installFresh();
    const child = await startServer();
    console.log("WordPress is running at http://localhost:8080   (Ctrl+C to stop)");
    child.on("exit", () => process.exit(0));
    process.on("SIGINT", () => child.kill());
  } else {
    console.log("Usage: node harness/wp.mjs setup | start");
    process.exit(1);
  }
}
```

### `harness/wp-config.php` (test harness)

```php
<?php
// The test site's settings (the real school site would use real secret keys: see hardening/CONFIG-NOTE.txt). Written next to WordPress by harness/wp.mjs.
// The database is a SQLite file (the "SQLite Database Integration" plugin makes WordPress use it instead of MySQL).
$port = getenv( 'WP_PORT' ) ?: '8080';
define( 'DB_NAME', 'wordpress' );
define( 'DB_USER', 'unused' );
define( 'DB_PASSWORD', 'unused' );
define( 'DB_HOST', 'localhost' );
define( 'DB_CHARSET', 'utf8' );
define( 'DB_COLLATE', '' );
define( 'DB_DIR', getenv( 'WP_DB_DIR' ) ?: __DIR__ . '/wp-content/database/' );
define( 'DB_FILE', getenv( 'WP_DB_FILE' ) ?: '.ht.sqlite' ); // a different file here is a different database
define( 'WP_ENVIRONMENT_TYPE', 'local' ); // also lets Application Passwords work over plain http
define( 'WP_HOME', 'http://localhost:' . $port );
define( 'WP_SITEURL', 'http://localhost:' . $port );
define( 'WP_DEBUG', true );
define( 'WP_DEBUG_DISPLAY', false );
define( 'WP_DEBUG_LOG', true );
define( 'AUTH_KEY', 'test-only-key-1' );
define( 'SECURE_AUTH_KEY', 'test-only-key-2' );
define( 'LOGGED_IN_KEY', 'test-only-key-3' );
define( 'NONCE_KEY', 'test-only-key-4' );
define( 'AUTH_SALT', 'test-only-salt-1' );
define( 'SECURE_AUTH_SALT', 'test-only-salt-2' );
define( 'LOGGED_IN_SALT', 'test-only-salt-3' );
define( 'NONCE_SALT', 'test-only-salt-4' );
$table_prefix = 'wp_';
// The hardening lines the school gets (hardening/wp-config-lines.php). SSS_NO_CONFIG_LINES=1 leaves them out,
// so a test can check what the hardening PLUGIN does on its own.
if ( ! getenv( 'SSS_NO_CONFIG_LINES' ) ) {
	require __DIR__ . '/wp-config-lines.php';
}
if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', __DIR__ . '/' );
}
require_once ABSPATH . 'wp-settings.php';
```

### `harness/router.php` (test harness)

```php
<?php
/**
 * Lets PHP's built-in web server behave like Apache with "pretty permalinks" (mod_rewrite):
 * real files are served as they are, everything else goes to WordPress's index.php.
 * Only for the test site. A real host does this itself.
 */
$path = parse_url( $_SERVER['REQUEST_URI'], PHP_URL_PATH );
$file = $_SERVER['DOCUMENT_ROOT'] . $path;

if ( '/' !== $path && is_file( $file ) ) {
	return false; // wp-login.php, images, css... served directly
}
if ( is_dir( $file ) && is_file( rtrim( $file, '/' ) . '/index.php' ) ) {
	chdir( $file ); // /wp-admin/
	require rtrim( $file, '/' ) . '/index.php';
	return true;
}
$_SERVER['SCRIPT_NAME']     = '/index.php';
$_SERVER['SCRIPT_FILENAME'] = $_SERVER['DOCUMENT_ROOT'] . '/index.php';
chdir( $_SERVER['DOCUMENT_ROOT'] );
require $_SERVER['DOCUMENT_ROOT'] . '/index.php';
```

### `harness/install.php` (test harness)

```php
<?php
/**
 * Installs WordPress into a fresh database and builds the Safe School test site:
 * two plugins + the theme on, users, 5 pages made ONLY of core blocks, a static front page, a posts page (News),
 * 12 students, news posts (and hidden ones), and the main menu.
 *   php harness/install.php <site folder> <credentials json file>
 */
[ , $root, $creds_file ] = $argv;
define( 'WP_INSTALLING', true );
require $root . '/wp-load.php';
require_once ABSPATH . 'wp-admin/includes/upgrade.php';
require_once ABSPATH . 'wp-admin/includes/plugin.php';

wp_install( 'Greenfield School', 'admin', 'office@example.com', true, '', 'admin-pass-123' );
update_option( 'permalink_structure', '/%postname%/' );
update_option( 'default_comment_status', 'closed' );
update_option( 'default_ping_status', 'closed' );
update_option( 'blogdescription', 'A small school website' );

foreach ( array( 'safe-school-site/safe-school-site.php', 'safe-school-hardening/safe-school-hardening.php' ) as $plugin ) {
	$activated = activate_plugin( $plugin );
	if ( is_wp_error( $activated ) ) {
		fwrite( STDERR, 'Could not activate ' . $plugin . ': ' . $activated->get_error_message() . "\n" );
		exit( 1 );
	}
}
switch_theme( 'safe-school' );
// "init" and "after_setup_theme" already ran before the plugins and the theme were switched on in this process: run them again.
sss_register_student_type();
sss_register_message_type();
require get_theme_root() . '/safe-school/functions.php';
do_action( 'after_setup_theme' );

// ---- people --------------------------------------------------------------------------------------------------
// The display name (what the website may print) is never the login name (what must stay secret).
wp_update_user( array( 'ID' => 1, 'display_name' => 'School Office', 'nickname' => 'School Office' ) );
$creds = array( 'admin' => array( 'id' => 1, 'login' => 'admin', 'password' => 'admin-pass-123' ) );
foreach ( array(
	'editor1' => array( 'editor', 'editor-pass-123', 'Mrs Rao' ),
	'parent1' => array( 'subscriber', 'parent-pass-123', 'A Parent' ),
) as $login => [ $role, $password, $display ] ) {
	$id = wp_create_user( $login, $password, $login . '@example.com' );
	wp_update_user( array( 'ID' => $id, 'role' => $role, 'display_name' => $display, 'nickname' => $display ) );
	$creds[ $login ] = array( 'id' => $id, 'login' => $login, 'password' => $password );
}
foreach ( $creds as $login => $c ) { // an Application Password lets the tests call the REST API as this person
	[ $app ] = WP_Application_Passwords::create_new_application_password( $c['id'], array( 'name' => 'harness' ) );
	$creds[ $login ]['appPassword'] = $app;
}
wp_delete_post( 1, true ); // "Hello world"
wp_delete_post( 2, true ); // "Sample Page"
if ( $privacy = (int) get_option( 'wp_page_for_privacy_policy' ) ) {
	wp_delete_post( $privacy, true ); // the draft "Privacy Policy" page WordPress makes on its own
	update_option( 'wp_page_for_privacy_policy', 0 );
}

// ---- pages: core blocks only ---------------------------------------------------------------------------------
$h2   = static fn( string $t ): string => "<!-- wp:heading -->\n<h2 class=\"wp-block-heading\">{$t}</h2>\n<!-- /wp:heading -->";
$p    = static fn( string $t ): string => "<!-- wp:paragraph -->\n<p>{$t}</p>\n<!-- /wp:paragraph -->";
$btn  = static fn( string $label, string $url ): string => "<!-- wp:button -->\n<div class=\"wp-block-button\"><a class=\"wp-block-button__link wp-element-button\" href=\"{$url}\">{$label}</a></div>\n<!-- /wp:button -->";
$col  = static fn( string $title, string $text ): string => "<!-- wp:column -->\n<div class=\"wp-block-column\">" . $h2( $title ) . "\n" . $p( $text ) . "</div>\n<!-- /wp:column -->";
$list = static fn( array $items ): string => "<!-- wp:list -->\n<ul class=\"wp-block-list\">" . implode( '', array_map( static fn( $i ) => "<!-- wp:list-item -->\n<li>{$i}</li>\n<!-- /wp:list-item -->", $items ) ) . "</ul>\n<!-- /wp:list -->";

$home_url = home_url( '/' );
$page = static fn( string $title, string $slug, string $content ): int => wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'publish', 'post_title' => $title, 'post_name' => $slug, 'post_content' => $content ), true );

$home = $page( 'Welcome to Greenfield School', 'home',
	$p( 'Greenfield School is a small school with a big heart. Classes run from Grade 1 to Grade 8, and every child is known by name.' )
	. "\n<!-- wp:buttons -->\n<div class=\"wp-block-buttons\">" . $btn( 'About the school', $home_url . 'about/' ) . "\n" . $btn( 'Read the news', $home_url . 'news/' ) . "</div>\n<!-- /wp:buttons -->\n"
	. "<!-- wp:columns -->\n<div class=\"wp-block-columns\">" . $col( 'Learn', 'Small classes, reading every day, and a science lab.' ) . "\n" . $col( 'Play', 'Football, chess club and a school garden.' ) . "\n" . $col( 'Stay in touch', 'Questions? Write to us on the Contact page.' ) . "</div>\n<!-- /wp:columns -->"
);
$about = $page( 'About', 'about',
	$p( 'Greenfield School opened in 1998. We teach Grade 1 to Grade 8 with about 240 students and 18 teachers.' )
	. "\n" . $h2( 'What we care about' ) . "\n" . $list( array( 'Every child is safe, and feels safe.', 'Reading before anything else.', 'Clear, honest talk with parents.' ) )
	. "\n" . $h2( 'Visiting' ) . "\n" . $p( 'The office is open on school days from 8:00 to 15:00. Please use the Contact page to book a visit.' )
);
$students_cat = null; // students are their own content type: no category is needed
$students_page = $page( 'Students', 'students',
	$p( 'The names of our current students. Type a name in the box to search.' )
	. "\n<!-- wp:search {\"label\":\"Search students\",\"showLabel\":true,\"placeholder\":\"Type a name\",\"buttonText\":\"Search\",\"query\":{\"post_type\":\"student\"}} /-->\n"
	. "<!-- wp:query {\"queryId\":0,\"query\":{\"perPage\":100,\"pages\":0,\"offset\":0,\"postType\":\"student\",\"order\":\"asc\",\"orderBy\":\"title\",\"author\":\"\",\"search\":\"\",\"exclude\":[],\"sticky\":\"\",\"inherit\":false}} -->\n<div class=\"wp-block-query\"><!-- wp:post-template -->\n<!-- wp:post-title {\"level\":0,\"isLink\":false} /-->\n<!-- /wp:post-template --></div>\n<!-- /wp:query -->"
);
$news    = $page( 'News', 'news', '' ); // the posts page: WordPress fills it with the latest posts
$contact = $page( 'Contact', 'contact', "<!-- wp:paragraph -->\n<p>Write to the school office. We answer within two school days.</p>\n<!-- /wp:paragraph -->\n\n<!-- wp:shortcode -->\n[school_contact_form]\n<!-- /wp:shortcode -->" );

update_option( 'show_on_front', 'page' );
update_option( 'page_on_front', $home );
update_option( 'page_for_posts', $news );

// ---- students: made-up names ----------------------------------------------------------------------------------
$names = array( 'Aarav Mehta', 'Ananya Iyer', 'Arjun Nair', 'Diya Kapoor', 'Ishaan Verma', 'Kavya Reddy', 'Meera Joshi', 'Neel Shah', 'Priya Singh', 'Rohan Das', 'Sana Khan', 'Tara Menon' );
foreach ( $names as $name ) {
	wp_insert_post( array( 'post_type' => 'student', 'post_status' => 'publish', 'post_title' => $name ) );
}
wp_insert_post( array( 'post_type' => 'student', 'post_status' => 'draft', 'post_title' => 'DRAFT STUDENT Hidden Name' ) );
wp_insert_post( array( 'post_type' => 'student', 'post_status' => 'private', 'post_title' => 'PRIVATE STUDENT Hidden Name' ) );

// ---- news: 3 published (two authors), plus things a visitor must never see --------------------------------------
$day = static fn( int $d ): string => gmdate( 'Y-m-d H:i:s', time() - $d * DAY_IN_SECONDS );
$make = static function ( string $title, string $status, int $author, int $ago ) use ( $day ): int {
	return wp_insert_post( array(
		'post_type' => 'post', 'post_status' => $status, 'post_title' => $title, 'post_author' => $author,
		'post_content' => "<!-- wp:paragraph -->\n<p>Details for: {$title}. The school will share more information soon.</p>\n<!-- /wp:paragraph -->",
		'post_date' => get_date_from_gmt( $day( $ago ) ), 'post_date_gmt' => $day( $ago ),
	), true );
};
$posts = array(
	'annual'  => $make( 'Annual Day is on Friday', 'publish', 1, 1 ),
	'science' => $make( 'Science fair results', 'publish', $creds['editor1']['id'], 3 ),
	'library' => $make( 'New library timetable', 'publish', 1, 5 ),
	'draft'   => $make( 'DRAFT: budget notes', 'draft', 1, 0 ),
	'future'  => $make( 'SCHEDULED: Founders Day', 'future', 1, -20 ),
);

// ---- the menu: Home, About, Students, News, Contact ----------------------------------------------------------
$menu = wp_create_nav_menu( 'Main menu' );
$item = static fn( string $title, int $pos, array $extra ) => wp_update_nav_menu_item( $menu, 0, array_merge( array( 'menu-item-title' => $title, 'menu-item-status' => 'publish', 'menu-item-position' => $pos ), $extra ) );
$item( 'Home', 1, array( 'menu-item-type' => 'custom', 'menu-item-url' => $home_url ) ); // an address typed in by hand: it holds the site address, like in real life
foreach ( array( 'About' => $about, 'Students' => $students_page, 'News' => $news, 'Contact' => $contact ) as $label => $id ) {
	static $pos = 1;
	$item( $label, ++$pos, array( 'menu-item-type' => 'post_type', 'menu-item-object' => 'page', 'menu-item-object-id' => $id ) );
}
set_theme_mod( 'nav_menu_locations', array( 'primary' => $menu ) );
// An array saved as ONE value (WordPress stores it as "serialized" text with string lengths). Many plugins and themes do this with links.
update_option( 'sss_useful_links', array( 'home' => $home_url, 'about' => $home_url . 'about/', 'nested' => array( 'contact' => $home_url . 'contact/' ) ) );
flush_rewrite_rules();

$creds['pages'] = compact( 'home', 'about', 'news', 'contact' ) + array( 'students' => $students_page );
$creds['posts'] = $posts;
file_put_contents( $creds_file, json_encode( $creds, JSON_PRETTY_PRINT ) );
echo 'installed: 5 pages (core blocks), ' . count( $names ) . ' students (+2 hidden), 3 news posts (+2 hidden), 3 users, menu' . "\n";
```

### `harness/checks.php` (test harness)

```php
<?php
/**
 * Small checks that need WordPress itself (not the web or REST):
 *   php harness/checks.php <site folder> blocks        every block name used by the 5 pages
 *   php harness/checks.php <site folder> options       front page settings and the menu links
 *   php harness/checks.php <site folder> counts        how many pages, posts, students, messages, pictures
 *   php harness/checks.php <site folder> messages      the saved contact messages, as JSON
 *   php harness/checks.php <site folder> authorlink    the author address a Visitor would be given
 *   php harness/checks.php <site folder> caps          what an administrator may do (file editors) and which constants are set
 */
[ , $root, $what ] = array_pad( $argv, 3, null );
require $root . '/wp-load.php';

if ( 'blocks' === $what ) {
	$out = array();
	foreach ( get_posts( array( 'post_type' => 'page', 'post_status' => 'any', 'numberposts' => -1, 'orderby' => 'ID', 'order' => 'ASC' ) ) as $page ) {
		$names = array();
		$walk  = static function ( array $blocks ) use ( &$walk, &$names ): void {
			foreach ( $blocks as $b ) {
				if ( '' !== (string) $b['blockName'] ) {
					$names[] = $b['blockName'];
				}
				$walk( $b['innerBlocks'] );
			}
		};
		$walk( parse_blocks( $page->post_content ) );
		$out[ $page->post_name ] = array_values( array_unique( $names ) );
	}
	echo json_encode( $out );
} elseif ( 'options' === $what ) {
	$menu_urls = array();
	foreach ( wp_get_nav_menu_items( 'Main menu' ) as $item ) {
		$menu_urls[ $item->title ] = $item->url;
	}
	echo json_encode( array(
		'show_on_front' => get_option( 'show_on_front' ),
		'front'         => get_post( (int) get_option( 'page_on_front' ) )->post_name ?? null,
		'posts_page'    => get_post( (int) get_option( 'page_for_posts' ) )->post_name ?? null,
		'home'          => get_option( 'home' ),
		'siteurl'       => get_option( 'siteurl' ),
		'menu'          => $menu_urls,
		'menu_location' => get_nav_menu_locations()['primary'] ?? null,
		'links'         => get_option( 'sss_useful_links' ),
	) );
} elseif ( 'counts' === $what ) {
	$n = static fn( string $type, string $status = 'publish' ): int => (int) ( wp_count_posts( $type )->$status ?? 0 );
	echo json_encode( array(
		'pages'    => $n( 'page' ),
		'posts'    => $n( 'post' ),
		'drafts'   => $n( 'post', 'draft' ),
		'students' => $n( 'student' ),
		'messages' => $n( 'contact_message' ),
		'pictures' => (int) ( wp_count_attachments()->{'image/png'} ?? 0 ) + (int) ( wp_count_attachments()->{'image/jpeg'} ?? 0 ),
		'users'    => (int) count_users()['total_users'],
		'home'     => get_option( 'home' ),
	) );
} elseif ( 'messages' === $what ) {
	$out = array();
	foreach ( get_posts( array( 'post_type' => 'contact_message', 'post_status' => 'any', 'numberposts' => -1, 'orderby' => 'ID', 'order' => 'ASC' ) ) as $p ) {
		$out[] = array( 'title' => $p->post_title, 'content' => $p->post_content, 'email' => get_post_meta( $p->ID, '_sender_email', true ), 'status' => $p->post_status );
	}
	echo json_encode( $out );
} elseif ( 'authorlink' === $what ) {
	wp_set_current_user( 0 ); // a Visitor
	echo json_encode( array( 'visitor' => get_author_posts_url( 1 ) ) );
} elseif ( 'caps' === $what ) {
	wp_set_current_user( 1 );
	$report = array(
		'constants' => array(
			'DISALLOW_FILE_EDIT' => defined( 'DISALLOW_FILE_EDIT' ) ? DISALLOW_FILE_EDIT : null,
			'DISALLOW_FILE_MODS' => defined( 'DISALLOW_FILE_MODS' ) ? DISALLOW_FILE_MODS : null,
			'FORCE_SSL_ADMIN'    => defined( 'FORCE_SSL_ADMIN' ) ? FORCE_SSL_ADMIN : null,
		),
		'withPlugin' => array(),
		'withoutPluginFilter' => array(),
	);
	$check = static fn(): array => array(
		'edit_themes'  => current_user_can( 'edit_themes' ),
		'edit_plugins' => current_user_can( 'edit_plugins' ),
		'edit_files'   => current_user_can( 'edit_files' ),
		'install_plugins' => current_user_can( 'install_plugins' ), // must stay true: the Plugins menu is not hidden
		'activate_plugins' => current_user_can( 'activate_plugins' ),
	);
	$report['withPlugin'] = $check();
	remove_all_filters( 'map_meta_cap' ); // take the plugin's second lock away: what is left is wp-config.php alone
	$report['withoutPluginFilter'] = $check();
	echo json_encode( $report );
}
```

### `harness/backup.php` (test harness)

```php
<?php
/**
 * Copies the site's database to a new file while the site may still be running.
 *   php harness/backup.php <database file> <backup file>
 * "VACUUM INTO" is SQLite's safe copy (the same job as `mysqldump` for MySQL): the copy is complete and consistent.
 * Prints the integrity check of the new file ("ok" when it is sound).
 */
[ , $from, $to ] = $argv;
if ( ! is_file( $from ) ) {
	fwrite( STDERR, "No database file at $from\n" );
	exit( 1 );
}
if ( file_exists( $to ) ) {
	fwrite( STDERR, "$to already exists. A backup is never overwritten.\n" );
	exit( 1 );
}
$pdo = new PDO( 'sqlite:' . $from );
$pdo->exec( 'VACUUM INTO ' . $pdo->quote( $to ) );
$copy = new PDO( 'sqlite:' . $to );
echo $copy->query( 'PRAGMA integrity_check' )->fetchColumn(), "\n";
```

### `harness/restore.php` (test harness)

```php
<?php
/**
 * Fixes the site address inside a restored database.
 *   WP_PORT=<new port> php harness/restore.php <restored site folder> <old address> <new address>
 * A backup still holds the OLD address in many places: the settings, the menu links typed by hand, and links inside
 * pages. Without this step the restored site works, but half its links point at the old site.
 * Some values are stored as PHP "serialized" text, where every string has its length written in front of it.
 * A plain find-and-replace would break those lengths, so we read the value, change it, and write it back.
 */
[ , $root, $old, $new ] = $argv;
require $root . '/wp-load.php';
global $wpdb;

function sss_replace_deep( $data, string $from, string $to ) {
	if ( is_string( $data ) ) {
		if ( is_serialized( $data ) ) {
			$value = @unserialize( $data, array( 'allowed_classes' => false ) );
			if ( false !== $value || 'b:0;' === $data ) {
				return serialize( sss_replace_deep( $value, $from, $to ) );
			}
		}
		return str_replace( $from, $to, $data );
	}
	if ( is_array( $data ) ) {
		$out = array();
		foreach ( $data as $k => $v ) {
			$out[ is_string( $k ) ? str_replace( $from, $to, $k ) : $k ] = sss_replace_deep( $v, $from, $to );
		}
		return $out;
	}
	return $data;
}

$changed = array( 'options' => 0, 'postmeta' => 0, 'posts' => 0 );
$like    = '%' . $wpdb->esc_like( $old ) . '%';
foreach ( $wpdb->get_results( $wpdb->prepare( "SELECT option_id, option_value FROM {$wpdb->options} WHERE option_value LIKE %s", $like ) ) as $row ) {
	$wpdb->update( $wpdb->options, array( 'option_value' => sss_replace_deep( $row->option_value, $old, $new ) ), array( 'option_id' => $row->option_id ) );
	$changed['options']++;
}
foreach ( $wpdb->get_results( $wpdb->prepare( "SELECT meta_id, meta_value FROM {$wpdb->postmeta} WHERE meta_value LIKE %s", $like ) ) as $row ) {
	$wpdb->update( $wpdb->postmeta, array( 'meta_value' => sss_replace_deep( $row->meta_value, $old, $new ) ), array( 'meta_id' => $row->meta_id ) );
	$changed['postmeta']++;
}
foreach ( $wpdb->get_results( $wpdb->prepare( "SELECT ID, post_content, post_excerpt, guid FROM {$wpdb->posts} WHERE post_content LIKE %s OR post_excerpt LIKE %s OR guid LIKE %s", $like, $like, $like ) ) as $row ) {
	$wpdb->update( $wpdb->posts, array( 'post_content' => str_replace( $old, $new, $row->post_content ), 'post_excerpt' => str_replace( $old, $new, $row->post_excerpt ), 'guid' => str_replace( $old, $new, $row->guid ) ), array( 'ID' => $row->ID ) );
	$changed['posts']++;
}
wp_cache_flush();
echo json_encode( $changed ), "\n";
```

### `harness/restore.mjs` (test harness)

```js
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
```

### `scripts/backup.mjs`

```js
// npm run backup        copies the running test site's database and uploads into backups/<time>/
import { makeBackup } from "../harness/restore.mjs";
const { dir, manifest } = makeBackup();
console.log(`Backup written to ${dir}`);
console.log(`  database: ${manifest.database.bytes} bytes, integrity ${manifest.database.integrity}`);
console.log(`  uploads : ${manifest.files.count} files, ${manifest.files.bytes} bytes`);
console.log(`  content : ${JSON.stringify(manifest.counts)}`);
```

### `scripts/restore.mjs`

```js
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
```

### Design decisions

| Decision | Reason |
|---|---|
| Hardening in its own small plugin, with no settings page | The brief's hint. Switching the plugin off removes every rule; nothing hides in the database |
| The username block runs at `template_redirect` priority 0 | WordPress's own redirect runs at 10 and would turn `?author=1` into `/author/admin/` first (a mutation test proves the order matters) |
| 404, not 403 or a redirect, for author addresses | A 404 for a real author and for a number that does not exist is the same page: nothing is confirmed |
| "Visitor" means: not signed in, or signed in without `list_users` | Subscribers and Editors have no reason to list usernames; Administrators keep working as before |
| REST users routes are removed, not just refused | A removed route gives the same `rest_no_route` as a route that never existed. `/users/me` stays |
| XML-RPC stops at plugin load | Even `system.listMethods` (no password needed) gets no answer. A filter alone would leave it open |
| Two independent locks for the file editors, tested separately | A host that re-creates `wp-config.php` loses the config line; the plugin still locks. A test per lock proves each one works alone |
| `DISALLOW_FILE_EDIT`, never `DISALLOW_FILE_MODS` | FILE_MODS hides the Plugins menu and stops updates; a test checks the Plugins menu is still there |
| `FORCE_SSL_ADMIN` left as a comment, with a test | On a host without working https it locks everybody out |
| The test site includes the delivered `wp-config-lines.php` | The tests run the lines the school gets, not a copy that could drift |
| Login error and lost-password answers made uniform | "No such user" vs "wrong password" lets an attacker test which names exist |
| Display name is never the login name | The feed and pages print display names; a test lists the creators and finds no login |
| Students are a content type, not posts | They stay out of News, the feed and the post sitemap; they can be removed from the site by deleting one plugin |
| A student's own address redirects to the Students page | No half-empty page per child; nothing to index |
| The Students search box is a core Search block with a hidden `post_type=student` | Core blocks only; the results contain names, not news |
| Contact messages: private type, administrators only, saved before e-mail is tried | Messages hold personal data: not public, not in REST, not readable by Editors; nothing is lost if mail is not set up |
| Backup = database copy + uploads + manifest with a checksum | A damaged backup is noticed before it is needed; the restore refuses a bad one |
| `VACUUM INTO` for the database copy (the `mysqldump` analog) | A complete, consistent copy while the site keeps running; the copy is integrity-checked |
| Restore changes the site address in options, post meta and posts, and understands serialized values | Otherwise the restored site works but half its links lead to the old one. Serialized text has string lengths that a plain replace breaks |
| Restore goes into a second folder with its own database | Proves the backup does not depend on the original files |
| One smoke-test function, used for the live site and the restored copy | The same promise must hold after a restore |
| The smoke test checks every address on the page points at this site's port | This is the check that catches a restore that forgot to change the address (a plain 'status 200' would not) |
| Visual test with `threshold: 0` and no ratio | A tolerance lets a changed heading through (measured: 0.13% to 0.38%) |
| Baselines per operating system, made on first run, with a stability check | Fonts differ per system; a first run proves the page is stable by comparing two screenshots |
| Layout checks that do not depend on fonts, next to the pixel test | Columns stack on a phone and sit side by side on a desktop even where the pixel baseline has to be re-made |
| Pages built from plain core blocks, checked with `parse_blocks` and in the real editor | The brief's hint, proved two ways: by name, and by opening each page in the block editor |
| `npm run check` runs everything | "Run the tests after every change" is one command |
| Every test run starts from a freshly installed site | No test depends on what an earlier run left behind |

---

## 7. Tests (167 tests)

Four layers, each finds different mistakes:

1. **`tests/hardening.test.mjs` (47)** against the real WordPress: all three username doors for a Visitor, a Subscriber, an Editor and an Administrator, XML-RPC, the login page, lost password, oEmbed, the feed, the two file editors (each lock alone), the config files, and the secret-key script.
2. **`tests/site.test.mjs` (38)**: the 5-page smoke test, core blocks only, the static front page and posts page, the menu, students and search, news, the contact form and who can read its messages.
3. **`tests/restore.test.mjs` (66)**: backup, integrity and damage checks, a restore into a second folder and database, the address fix, the **same smoke test and hardening tests on the restored copy**, and three restores broken on purpose.
4. **`tests/browser.test.mjs` (16)** in real Chromium: the smoke test of 5 pages (no console error, no sideways scroll on a phone), the menu, the search box and the contact form by hand, the block editor opening every page with no broken block, and the home page at **375, 768 and 1280 px** with **no tolerance**.

And **`break45.py`** breaks **64 rules** one at a time (an author block that runs too late, a REST route left open, the old Apache words, the users sitemap back, a link colour one step off, a visual test with a 1% tolerance, ...) and checks that a test fails each time.

| # | Test | What it proves |
|---|---|---|
| 1 | Door 1: `?author=1` | A Visitor gets 404 with no redirect for `?author=1/2/3`, `?author_name=`, `/author/admin/`, `/author/editor1/`; a real and a made-up number give the same page; a Subscriber is blocked too; an Administrator still gets WordPress's redirect; no public page or feed prints an author address; `get_author_posts_url` gives a Visitor no author address |
| 2 | Door 2: REST users | 404 `rest_no_route` for the list, `/users/1`, `?search=`, `?slug=`, `context=embed` and `?rest_route=`; the routes index does not list them; Editor and Subscriber refused but `/users/me` works; an Administrator still gets the list; a Visitor cannot create or change a user; posts show only a number as author and `_embed` leaks no login |
| 3 | Door 3: sitemap | `/wp-sitemap-users-1.xml` is 404; the index still works, lists posts and pages, not users or students; every sitemap page opens and shows no login |
| 4 | XML-RPC | GET gives 403; POSTed `system.listMethods` and a real `wp.getUsersBlogs` login attempt get 403 and no XML; no RSD link, no X-Pingback header |
| 5 | Login page | "No such user", "right user + wrong password" and an unknown email give one identical sentence that does not repeat the name; lost password gives the same redirect for a real and a made-up name; an empty box still gets WordPress's normal message |
| 6 | Other leaks | oEmbed has no author name or address for a Visitor and keeps it for an Administrator; the feed lists display names only; 14 public addresses (pages, feeds, search, REST, sitemap, robots.txt) contain no login name |
| 7 | File editors | `DISALLOW_FILE_EDIT` on; `DISALLOW_FILE_MODS` and `FORCE_SSL_ADMIN` not on; an administrator may not edit themes, plugins or files but may still install and activate plugins; **each lock alone is enough**; in the dashboard both editor pages say "not allowed" and are not in the menu, the Plugins menu is still there |
| 8 | Notes and files | The config lines have the editor switch and keep HTTPS as a comment; the Apache file has Apache 2.4 words, `IfModule` around `Header`, no `<Directory>`; the uploads file blocks PHP; the key script prints 8 different 64-character values, never the placeholder |
| 9 | Smoke test (5 pages x 2, + 404) | Status 200, title, exactly one h1, `main`, `lang`, viewport tag, menu of 5 with the right item current, no PHP message, every address points at this site's port, every link works, plus page-specific content; a missing page gives a friendly 404. Run on the live site and on the restored copy |
| 10 | Core blocks, front page, menu | Every block name starts with `core/`; the needed blocks are present; the front page is the Home page and News is the posts page; `/` is a page, `/news/` is the list; the menu has 5 items in order and each goes to the right address |
| 11 | Students and search | Search finds only matching names (4 terms, any case); no news mixed in; no match gives a friendly sentence; draft and private students never listed or found; typed text shown as text; a student's address redirects to the Students page; not in REST |
| 12 | News | 3 published posts, newest first; no draft, scheduled post or student; hidden posts are 404 by number; a news page does not print who wrote it |
| 13 | Contact form | Empty gives 3 sentences with `aria-invalid`; bad email explained and input kept; 2001 characters refused; a good message redirects, shows thanks, hides the form and is saved; the robot trap saves nothing; no security code saves nothing; line breaks in the name cannot inject mail headers; HTML is stored as plain text; messages are not in search or REST; only an Administrator can read them in the dashboard |
| 14 | Backup | Has database, uploads and manifest; SQLite's integrity check says ok; taken while the site runs; a damaged database is caught by its checksum and refused; a missing manifest or files folder is noticed; an old backup is never overwritten |
| 15 | Restore: same content | A different folder and database file; same counts of pages, posts, students, messages, users, pictures; the post written after the install is in the right place; the uploaded picture is identical byte for byte; the contact message is there; the same people sign in with the same passwords; the live site is untouched |
| 16 | Restore: the address | Settings, the menu link, a link inside a post and a serialized array all say the new address and none says the old; the report of the fix says what was changed |
| 17 | Restore: same promises | The 5-page smoke test and all the hardening checks, run again on the restored copy |
| 18 | Restore broken on purpose | Address not changed: the site opens but the old address is in the page; empty database: redirect to the installer; uploads not copied: the picture file is gone |
| 19 | Browser: smoke | 5 pages at 375 px: status 200, one h1, menu visible, no script/console/request error, no sideways scroll; clicking through the menu; the home buttons |
| 20 | Browser: by hand | The Students search box finds one student; the contact form shows errors, then thanks, and a refresh does not send it again; the robot-trap field is off screen |
| 21 | Browser: editor | Each of the 5 pages opens in the block editor with every block valid, no `core/freeform` or `core/missing`, core blocks only |
| 22 | Browser: visual | Home page at 375, 768 and 1280 px: **every pixel** equals the baseline (a first run on a new system writes one and checks stability); layout: columns stacked on a phone, side by side on a desktop; **a changed heading is noticed at all three sizes** and the verdict is "different", although it is under 1% of the picture at 1280 px |

### `tests/lib/client.mjs` (shared helpers)

```js
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
```

### `tests/lib/smoke.mjs` (the smoke test, written once)

```js
// The smoke test: five pages, same checks on the live site and on a restored copy.
// "Smoke test" = turn it on and see if smoke comes out. It does not prove the site is right, it proves the site is not broken.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { texts } from "./client.mjs";

export const MENU = ["Home", "About", "Students", "News", "Contact"];
export const STUDENTS = ["Aarav Mehta", "Ananya Iyer", "Arjun Nair", "Diya Kapoor", "Ishaan Verma", "Kavya Reddy", "Meera Joshi", "Neel Shah", "Priya Singh", "Rohan Das", "Sana Khan", "Tara Menon"];
export const NEWS = ["Annual Day is on Friday", "Science fair results", "New library timetable"];

export const PAGES = [
  { path: "/", h1: "Welcome to Greenfield School", current: "Home", extra: (d) => { assert.deepEqual(texts(d, ".wp-block-button__link"), ["About the school", "Read the news"]); assert.equal(d.querySelectorAll(".wp-block-column").length, 3); } },
  { path: "/about/", h1: "About", current: "About", extra: (d) => { assert.equal(d.querySelectorAll(".wp-block-list li").length, 3); } },
  { path: "/students/", h1: "Students", current: "Students", extra: (d) => {
    assert.deepEqual(texts(d, ".wp-block-post-title"), STUDENTS, "12 names, A to Z");
    const form = d.querySelector("form[role=search]");
    assert.ok(form, "a search box");
    assert.equal(form.querySelector("input[name=s]")?.getAttribute("type"), "search");
    assert.equal(form.querySelector("input[name=post_type]")?.getAttribute("value"), "student");
  } },
  { path: "/news/", h1: "News", current: "News", extra: (d, news) => { assert.deepEqual(texts(d, ".card h2"), news, "newest first, only published news"); } },
  { path: "/contact/", h1: "Contact", current: "Contact", extra: (d) => {
    const names = [...d.querySelectorAll(".contact-form [name]")].map((n) => n.getAttribute("name"));
    for (const f of ["sender_name", "sender_email", "sender_message", "sss_contact_nonce"]) assert.ok(names.includes(f), `form field ${f}`);
  } },
];

/** Registers the smoke tests for one running site. `getClient` is a function so the site can start after registration. */
export function registerSmoke(label, getClient, { news = NEWS } = {}) {
  describe(`Smoke test, 5 pages: ${label}`, () => {
    for (const page of PAGES) {
      it(`${page.path} is healthy`, async () => {
        const c = getClient();
        const res = await c.web(page.path);
        assert.equal(res.status, 200, "status");
        const d = res.doc;
        assert.ok(d.title.includes("Greenfield School"), `title: ${d.title}`);
        assert.deepEqual(texts(d, "h1"), [page.h1], "exactly one h1");
        assert.ok(d.querySelector("main"), "a <main> area");
        assert.ok(d.documentElement.getAttribute("lang"), "a lang attribute");
        assert.ok(d.querySelector("meta[name=viewport]"), "a viewport tag (phones)");
        assert.deepEqual(texts(d, ".menu > li > a"), MENU, "the menu: Home, About, Students, News, Contact");
        const current = texts(d, ".menu .current-menu-item > a");
        assert.deepEqual(current, page.current ? [page.current] : [], "the right menu item is marked as current");
        assert.ok(!/(Warning|Notice|Deprecated|Fatal error|Parse error)\s*:/.test(res.html), "no PHP message on the page");
        page.extra(d, news);
      });

      it(`${page.path}: every address on it points at THIS site and works`, async () => {
        const c = getClient();
        const res = await c.web(page.path);
        // any http://localhost:PORT written into the page must be this site's own port (a restore that keeps the old address fails here)
        const ports = new Set([...res.html.matchAll(/https?:\/\/localhost:(\d+)/g)].map((m) => m[1]));
        assert.deepEqual([...ports], [new URL(c.origin).port], "addresses of another site found in the page");
        const hrefs = new Set();
        for (const a of res.doc.querySelectorAll("a[href]")) {
          const h = a.getAttribute("href");
          if (/^(mailto:|tel:|#|javascript:)/.test(h)) continue;
          hrefs.add(new URL(h, c.origin + page.path).href);
        }
        assert.ok(hrefs.size >= 5, "the page has links");
        for (const href of hrefs) {
          const r = await c.web(href, { redirect: "follow" });
          assert.equal(r.status, 200, `link ${href}`);
        }
      });
    }
    it("a page that does not exist answers 404 with a friendly page", async () => {
      const r = await getClient().web("/no-such-page/");
      assert.equal(r.status, 404);
      assert.deepEqual(texts(r.doc, "h1"), ["Page not found"]);
    });
  });
}
```

### `tests/lib/doors.mjs` (the hardening checks, written once)

```js
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
```

### `tests/lib/visual.mjs` (pixel comparison with no tolerance)

```js
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
```

### `tests/hardening.test.mjs` (47 tests)

```js
// Hardening of the live test site: the three username doors, XML-RPC, login answers, and the two file editors.
// Run:  node --test --test-concurrency=1 tests/hardening.test.mjs   (or npm run test:wp)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { installFresh, readCreds, root, siteDir, startServer } from "../harness/wp.mjs";
import { KEY_NAMES, makeLines, randomValue } from "../hardening/make-keys.mjs";
import { client, wpCheck } from "./lib/client.mjs";
import { registerDoors } from "./lib/doors.mjs";

const PORT = 8080;
let server;
let c;
before(async () => {
  installFresh(); // an empty database every run
  server = await startServer({ port: PORT });
  c = client(`http://localhost:${PORT}`, readCreds());
});
after(() => server?.kill());

registerDoors("live site", () => c);

describe("the two file editors", () => {
  it("wp-config lines: DISALLOW_FILE_EDIT is on; DISALLOW_FILE_MODS and FORCE_SSL_ADMIN are not", () => {
    const r = wpCheck(siteDir, "caps");
    assert.equal(r.constants.DISALLOW_FILE_EDIT, true);
    assert.notEqual(r.constants.DISALLOW_FILE_MODS, true, "FILE_MODS would hide the Plugins menu");
    assert.notEqual(r.constants.FORCE_SSL_ADMIN, true, "left off on purpose: needs a working https host");
  });
  it("an administrator may not edit themes, plugins or files", () => {
    const r = wpCheck(siteDir, "caps");
    assert.deepEqual([r.withPlugin.edit_themes, r.withPlugin.edit_plugins, r.withPlugin.edit_files], [false, false, false]);
  });
  it("...but may still install and activate plugins (the Plugins menu is not hidden)", () => {
    const r = wpCheck(siteDir, "caps");
    assert.equal(r.withPlugin.install_plugins, true);
    assert.equal(r.withPlugin.activate_plugins, true);
  });
  it("the wp-config.php line alone is enough (the plugin's own lock taken away)", () => {
    const r = wpCheck(siteDir, "caps");
    assert.deepEqual([r.withoutPluginFilter.edit_themes, r.withoutPluginFilter.edit_plugins, r.withoutPluginFilter.edit_files], [false, false, false]);
  });
  it("the plugin's lock alone is enough (the wp-config.php line left out)", () => {
    const r = wpCheck(siteDir, "caps", { SSS_NO_CONFIG_LINES: "1" });
    assert.equal(r.constants.DISALLOW_FILE_EDIT, null, "the line really is absent in this run");
    assert.deepEqual([r.withPlugin.edit_themes, r.withPlugin.edit_plugins, r.withPlugin.edit_files], [false, false, false]);
  });
  it("(author links) a Visitor is never handed an author address", () => {
    assert.ok(!/author/.test(wpCheck(siteDir, "authorlink").visitor));
  });
  it("in the dashboard, both editor pages say 'not allowed' and the menu does not link to them", async () => {
    const cookie = await c.signIn("admin");
    for (const p of ["/wp-admin/theme-editor.php", "/wp-admin/plugin-editor.php"]) {
      const r = await c.web(p, { cookie });
      assert.equal(r.status, 403, p);
      assert.match(r.html, /not allowed/i);
    }
    const dash = await c.web("/wp-admin/", { cookie });
    assert.equal(dash.status, 200);
    assert.ok(!dash.html.includes("theme-editor.php") && !dash.html.includes("plugin-editor.php"));
    assert.ok(dash.html.includes("plugins.php"), "the Plugins menu is still there");
  });
});

describe("the notes and files that come with the site", () => {
  const read = (f) => readFileSync(path.join(root, "hardening", f), "utf8");
  it("the config lines file has the editor switch and keeps HTTPS as a comment", () => {
    const t = read("wp-config-lines.php");
    assert.match(t, /^\s*define\( 'DISALLOW_FILE_EDIT', true \);/m);
    assert.match(t, /^\/\/ define\( 'FORCE_SSL_ADMIN', true \);/m);
    assert.ok(!/^\s*define\( 'DISALLOW_FILE_MODS'/m.test(t));
    assert.ok(!/^\s*define\( 'FORCE_SSL_ADMIN'/m.test(t), "HTTPS must stay a comment until the host supports it");
  });
  it("the Apache file uses Apache 2.4 words, wraps Header in IfModule and has no <Directory>", () => {
    const t = read("htaccess.txt").split("\n").filter((l) => !l.trim().startsWith("#")).join("\n"); // the rules only, not the explanations
    assert.match(t, /Require all denied/);
    assert.ok(!/Order\s+deny|Deny from/i.test(t));
    assert.ok(!/<Directory/i.test(t));
    const headerLines = t.split("\n").filter((l) => /^\s*Header /.test(l));
    assert.ok(headerLines.length >= 2);
    assert.match(t, /<IfModule mod_headers\.c>[\s\S]*Header[\s\S]*<\/IfModule>/);
  });
  it("the uploads file stops PHP from running there", () => {
    const t = read("uploads-htaccess.txt").split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
    assert.match(t, /Require all denied/);
    assert.match(t, /php/);
  });
});

describe("secret keys: node hardening/make-keys.mjs", () => {
  it("prints the 8 WordPress key names, each with its own random 64-character value", () => {
    const lines = makeLines().split("\n");
    assert.equal(lines.length, 8);
    const values = lines.map((l, i) => {
      const m = l.match(/^define\( '([A-Z_]+)', '([A-Za-z0-9]{64})' \);$/);
      assert.ok(m, `line ${i + 1} has the right shape: ${l}`);
      assert.equal(m[1], KEY_NAMES[i]);
      return m[2];
    });
    assert.equal(new Set(values).size, 8, "all 8 values are different");
    assert.notEqual(makeLines(), makeLines(), "a second run gives new values");
  });
  it("none of the values is the placeholder text WordPress ships, and each uses many different characters", () => {
    for (let i = 0; i < 50; i++) {
      const v = randomValue();
      assert.ok(!/put your unique phrase here/.test(v));
      assert.ok(new Set(v).size >= 20, v);
    }
  });
  it("the test site's own keys are the fake ones, and the note says so", () => {
    assert.match(readFileSync(path.join(root, "harness", "wp-config.php"), "utf8"), /test-only-key-1/);
    assert.match(readFileSync(path.join(root, "hardening", "CONFIG-NOTE.txt"), "utf8"), /never copy those/);
  });
});
```

### `tests/site.test.mjs` (38 tests)

```js
// The school site itself: pages made of core blocks, the static front page, students and search, news, the contact form.
// Run:  node --test --test-concurrency=1 tests/site.test.mjs   (or npm run test:wp)
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { installFresh, readCreds, siteDir, startServer } from "../harness/wp.mjs";
import { client, texts, wpCheck } from "./lib/client.mjs";
import { NEWS, STUDENTS, registerSmoke } from "./lib/smoke.mjs";

const PORT = 8080;
let server;
let c;
let creds;
before(async () => {
  installFresh();
  creds = readCreds();
  server = await startServer({ port: PORT });
  c = client(`http://localhost:${PORT}`, creds);
});
after(() => server?.kill());

registerSmoke("live site", () => c);

describe("pages are made of core blocks only", () => {
  it("every block on every page has a name starting with core/", () => {
    const pages = wpCheck(siteDir, "blocks");
    assert.deepEqual(Object.keys(pages).sort(), ["about", "contact", "home", "news", "students"]);
    for (const [slug, names] of Object.entries(pages)) {
      assert.ok(names.length > 0 || slug === "news", `${slug} has blocks`);
      for (const n of names) assert.match(n, /^core\//, `${slug}: ${n}`);
    }
  });
  it("the pages use the blocks the brief needs (heading, buttons, columns, search, query loop, shortcode)", () => {
    const pages = wpCheck(siteDir, "blocks");
    assert.ok(["core/paragraph", "core/buttons", "core/button", "core/columns", "core/column"].every((b) => pages.home.includes(b)));
    assert.ok(["core/heading", "core/list", "core/list-item"].every((b) => pages.about.includes(b)));
    assert.ok(["core/search", "core/query", "core/post-template", "core/post-title"].every((b) => pages.students.includes(b)));
    assert.ok(pages.contact.includes("core/shortcode"));
  });
});

describe("static front page, posts page and menu", () => {
  it("settings: the front page is the Home page, News is the posts page", () => {
    const o = wpCheck(siteDir, "options");
    assert.equal(o.show_on_front, "page");
    assert.equal(o.front, "home");
    assert.equal(o.posts_page, "news");
    assert.ok(o.menu_location, "the menu is placed in the theme's menu spot");
  });
  it("/ is the page, not the list of posts; /news/ is the list", async () => {
    const home = await c.web("/");
    assert.ok(home.doc.body.className.split(" ").includes("page"));
    assert.ok(!home.doc.body.className.split(" ").includes("blog"));
    assert.equal(home.doc.querySelectorAll(".card").length, 0);
    const news = await c.web("/news/");
    assert.ok(news.doc.body.className.split(" ").includes("blog"));
  });
  it("the menu has 5 items in order and each goes to the right page", async () => {
    const r = await c.web("/");
    const links = [...r.doc.querySelectorAll(".menu > li > a")].map((a) => [a.textContent.trim(), new URL(a.getAttribute("href"), c.origin).pathname]);
    assert.deepEqual(links, [["Home", "/"], ["About", "/about/"], ["Students", "/students/"], ["News", "/news/"], ["Contact", "/contact/"]]);
  });
});

describe("students and the search box", () => {
  it("search finds only matching names", async () => {
    for (const term of ["an", "Rao", "sh", "TARA"]) {
      const r = await c.web(`/?s=${encodeURIComponent(term)}&post_type=student`);
      const expected = STUDENTS.filter((n) => n.toLowerCase().includes(term.toLowerCase()));
      assert.deepEqual(texts(r.doc, ".student").sort(), expected.sort(), term);
      assert.equal(r.status, 200);
    }
  });
  it("search results are names only: no news post is mixed in, because the box asks for students", async () => {
    const r = await c.web("/?s=a&post_type=student");
    assert.equal(r.doc.querySelectorAll(".card").length, 0);
  });
  it("the site-wide search (no box, no post_type) finds students too, as names only", async () => {
    const r = await c.web("/?s=Aarav");
    assert.deepEqual(texts(r.doc, ".student"), ["Aarav Mehta"]);
  });
  it("no match shows a friendly sentence, not an error", async () => {
    const r = await c.web("/?s=zzzzzz&post_type=student");
    assert.equal(r.status, 200);
    assert.deepEqual(texts(r.doc, ".empty"), ["Nothing found."]);
  });
  it("a draft or private student is never listed or found", async () => {
    const list = (await c.web("/students/")).html;
    assert.ok(!/Hidden Name/.test(list));
    assert.ok(!/Hidden Name/.test((await c.web("/?s=hidden&post_type=student")).html));
    assert.ok(!/Hidden Name/.test((await c.web("/?s=hidden")).html));
  });
  it("what a visitor types is shown as text, never run", async () => {
    const r = await c.web(`/?s=${encodeURIComponent("<script>alert(1)</script>")}&post_type=student`);
    assert.ok(!r.html.includes("<script>alert(1)</script>"));
    assert.ok(r.html.includes("&lt;script&gt;"));
  });
  it("a student has no page of their own: the address goes back to the Students page", async () => {
    for (const p of ["/student/aarav-mehta/", "/?post_type=student&p=9", "/?post_type=student"]) {
      const r = await c.web(p);
      assert.equal(r.status, 301, p);
      assert.match(r.location, /\/students\/$/);
    }
  });
  it("the REST API does not list students", async () => {
    assert.equal((await c.api("GET", "/wp/v2/student")).status, 404);
    assert.equal((await c.api("GET", "/wp/v2/students")).status, 404);
  });
});

describe("news", () => {
  it("shows the 3 published posts, newest first, and none of the 2 hidden ones or any student", async () => {
    const r = await c.web("/news/");
    assert.deepEqual(texts(r.doc, ".card h2"), NEWS);
    assert.ok(!/DRAFT|SCHEDULED|Mehta/.test(r.html));
  });
  it("a draft and a scheduled post answer 404 to a Visitor, even with their number", async () => {
    for (const id of [creds.posts.draft, creds.posts.future]) assert.equal((await c.web(`/?p=${id}`)).status, 404, String(id));
  });
  it("a news page does not print who wrote it", async () => {
    const r = await c.web("/annual-day-is-on-friday/");
    assert.equal(r.status, 200);
    assert.ok(!/Mrs Rao|School Office|admin/.test(texts(r.doc, "main").join(" ")));
  });
});

describe("contact form", () => {
  const nonce = async () => (await c.web("/contact/")).doc.querySelector("[name=sss_contact_nonce]").getAttribute("value");
  const post = async (fields, withNonce = true) => c.web("/contact/", { method: "POST", form: { ...(withNonce ? { sss_contact_nonce: await nonce() } : {}), ...fields } });
  const saved = () => wpCheck(siteDir, "messages");

  it("empty: the page comes back with one sentence per field, and nothing is saved", async () => {
    const r = await post({ sender_name: "", sender_email: "", sender_message: "" });
    assert.equal(r.status, 200);
    assert.deepEqual(texts(r.doc, ".field-error"), ["Please enter your name.", "Please enter your email address.", "Please write a message."]);
    assert.equal(r.doc.querySelector("#sender_name").getAttribute("aria-invalid"), "true");
    assert.equal(saved().length, 0);
  });
  it("a bad email is explained, and what the person typed is kept", async () => {
    const r = await post({ sender_name: "Asha", sender_email: "asha-at-example", sender_message: "Hello" });
    assert.match(texts(r.doc, ".field-error")[0], /doesn't look like an email address/);
    assert.equal(r.doc.querySelector("#sender_name").getAttribute("value"), "Asha");
    assert.equal(saved().length, 0);
  });
  it("a message over 2000 characters is refused", async () => {
    const r = await post({ sender_name: "Asha", sender_email: "asha@example.com", sender_message: "x".repeat(2001) });
    assert.match(texts(r.doc, ".field-error")[0], /too long \(2001 characters\)/);
  });
  it("a good message: redirect with ?sent=1, a thank-you, and the message is saved", async () => {
    const r = await post({ sender_name: "Asha Rao", sender_email: "asha@example.com", sender_message: "Can I visit on Monday?" });
    assert.equal(r.status, 302);
    assert.match(r.location, /\/contact\/\?sent=1$/);
    const after = await c.web(r.location);
    assert.deepEqual(texts(after.doc, ".notice-ok"), ["Thank you! Your message has been sent. We will reply by email."]);
    assert.equal(after.doc.querySelector("form.contact-form"), null, "the form is gone, so a refresh cannot send it twice");
    assert.deepEqual(saved().map((m) => [m.email, m.content]), [["asha@example.com", "Can I visit on Monday?"]]);
  });
  it("a WRONG security code saves nothing", async () => {
    const before = saved().length;
    const r = await post({ sender_name: "Eve", sender_email: "eve@example.com", sender_message: "forged", sss_contact_nonce: "0000000000" });
    assert.equal(r.status, 200);
    assert.match(r.html, /form has expired/);
    assert.equal(saved().length, before);
  });
  it("the spam trap: a robot that fills the hidden field is thanked but nothing is saved", async () => {
    const before = saved().length;
    const r = await post({ sender_name: "Bot", sender_email: "bot@example.com", sender_message: "buy now", website: "http://spam.example" });
    assert.equal(r.status, 302);
    assert.equal(saved().length, before);
  });
  it("without the secret form code nothing is saved", async () => {
    const before = saved().length;
    const r = await post({ sender_name: "Eve", sender_email: "eve@example.com", sender_message: "no code" }, false);
    assert.equal(r.status, 200);
    assert.equal(saved().length, before);
  });
  it("a name with a line break cannot add e-mail headers", async () => {
    const r = await post({ sender_name: "Eve\r\nBcc: victim@example.com", sender_email: "eve@example.com", sender_message: "hi" });
    assert.equal(r.status, 302);
    const last = saved().at(-1);
    assert.ok(!/[\r\n]/.test(last.title));
  });
  it("HTML in a message is stored as plain text", async () => {
    await post({ sender_name: "Tag", sender_email: "tag@example.com", sender_message: "<b>bold</b><script>x()</script>hello" });
    assert.ok(!/<script|<b>/.test(saved().at(-1).content));
  });
  it("messages are private: not in search, not in the REST API, not on any address", async () => {
    assert.ok(!/Can I visit/.test((await c.web("/?s=visit")).html));
    assert.ok(!/Can I visit/.test((await c.web("/?s=visit&post_type=contact_message")).html));
    assert.equal((await c.api("GET", "/wp/v2/contact_message")).status, 404);
    assert.ok(!/Can I visit|Asha/.test((await c.web("/?post_type=contact_message")).html), "an unknown content type is ignored: the home page comes back");
  });
  it("only an administrator can read messages in the dashboard (an Editor cannot)", async () => {
    const admin = await c.signIn("admin");
    const ok = await c.web("/wp-admin/edit.php?post_type=contact_message", { cookie: admin });
    assert.equal(ok.status, 200);
    assert.match(ok.html, /Asha Rao/);
    const editor = await c.signIn("editor1");
    const no = await c.web("/wp-admin/edit.php?post_type=contact_message", { cookie: editor });
    assert.equal(no.status, 403);
    assert.ok(!/Asha Rao/.test(no.html));
  });
});
```

### `tests/restore.test.mjs` (66 tests)

```js
// Backup and restore, tested for real:
//   1. add some content to the live site that a restore must carry over (a post, a picture, a contact message)
//   2. take a backup while the site is running
//   3. restore it into a SECOND site folder with its OWN database, on another port
//   4. prove the restored copy has the same content, passes the same smoke test and the same hardening checks
//   5. break the restore on purpose in three ways and write down the symptom of each
// Run:  node --test --test-concurrency=1 tests/restore.test.mjs   (or npm run test:wp)
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { after, before, describe, it } from "node:test";
import { PNG } from "pngjs";
import { installFresh, readCreds, root, siteDir, startServer, wpDir } from "../harness/wp.mjs";
import { checkBackup, counts, makeBackup, restoreBackup } from "../harness/restore.mjs";
import { client, texts, wpCheck } from "./lib/client.mjs";
import { registerDoors } from "./lib/doors.mjs";
import { NEWS, registerSmoke } from "./lib/smoke.mjs";

const LIVE = 8080;
const servers = [];
const sites = {};
let live, restored, backup, liveCountsBefore, canaryPng, canaryUrl;

const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const siteAt = (name) => path.join(wpDir, name);

before(async () => {
  installFresh();
  const creds = readCreds();
  servers.push(await startServer({ port: LIVE }));
  live = client(`http://localhost:${LIVE}`, creds);

  // 1. content that exists ONLY in the live database/uploads (not in the install script)
  const post = await live.api("POST", "/wp/v2/posts", { as: "admin", body: { title: "Restore canary", status: "publish", content: `<!-- wp:paragraph --><p>Read more on <a href="${live.origin}/about/">the About page</a>.</p><!-- /wp:paragraph -->` } });
  assert.equal(post.status, 201, post.text);
  const png = new PNG({ width: 8, height: 8 });
  png.data.fill(200);
  canaryPng = PNG.sync.write(png);
  const media = await live.api("POST", "/wp/v2/media", { as: "admin", raw: canaryPng, headers: { "Content-Type": "image/png", "Content-Disposition": 'attachment; filename="canary.png"' } });
  assert.equal(media.status, 201, media.text);
  canaryUrl = new URL(media.json.source_url).pathname;
  const nonce = (await live.web("/contact/")).doc.querySelector("[name=sss_contact_nonce]").getAttribute("value");
  await live.web("/contact/", { method: "POST", form: { sss_contact_nonce: nonce, sender_name: "Canary Sender", sender_email: "canary@example.com", sender_message: "This message must survive the restore." } });
  liveCountsBefore = counts(siteDir);

  // 2 + 3. backup the RUNNING site, then restore it
  backup = makeBackup({ outRoot: path.join(wpDir, "test-backups"), label: `run-${Date.now()}` });
  sites.restored = restoreBackup({ backupDir: backup.dir, target: siteAt("restored"), port: 8081, oldOrigin: live.origin });
  servers.push(await startServer({ port: 8081, site: siteAt("restored") }));
  restored = client("http://localhost:8081", creds);
});
after(() => {
  for (const s of servers) s.kill();
});

describe("the backup", () => {
  it("has the database, the uploads folder and a manifest, and the database passes SQLite's own integrity check", () => {
    assert.equal(backup.manifest.database.integrity, "ok");
    assert.ok(existsSync(path.join(backup.dir, "db.sqlite")) && existsSync(path.join(backup.dir, "files")) && existsSync(path.join(backup.dir, "manifest.json")));
    assert.ok(backup.manifest.database.bytes > 100_000, "a real database, not an empty file");
    assert.ok(backup.manifest.files.count >= 1, "the uploaded picture is in files/");
    assert.equal(backup.manifest.counts.students, 12);
    assert.ok(backup.manifest.counts.posts >= 4);
    assert.equal(backup.manifest.counts.messages, 1);
  });
  it("was taken while the site kept running (the live site still answers)", async () => {
    assert.equal((await live.web("/")).status, 200);
  });
  it("is checked before it is used: a good backup has no problems", () => {
    assert.deepEqual(checkBackup(backup.dir), []);
  });
  it("a damaged database is noticed (checksum), and restoring from it is refused", () => {
    const bad = mkdtempSync(path.join(os.tmpdir(), "bad-backup-"));
    cpSync(backup.dir, bad, { recursive: true });
    const f = path.join(bad, "db.sqlite");
    const bytes = readFileSync(f);
    bytes[bytes.length - 10] ^= 0xff;
    writeFileSync(f, bytes);
    assert.match(checkBackup(bad).join(" "), /checksum/);
    assert.throws(() => restoreBackup({ backupDir: bad, target: siteAt("never"), port: 8099, oldOrigin: live.origin }), /bad backup/);
    rmSync(bad, { recursive: true, force: true });
  });
  it("a missing manifest or missing files folder is noticed", () => {
    const bad = mkdtempSync(path.join(os.tmpdir(), "bad-backup-"));
    cpSync(backup.dir, bad, { recursive: true });
    rmSync(path.join(bad, "files"), { recursive: true });
    assert.deepEqual(checkBackup(bad), ["files/ is missing"]);
    rmSync(path.join(bad, "manifest.json"));
    assert.deepEqual(checkBackup(bad), ["manifest.json is missing"]);
    rmSync(bad, { recursive: true, force: true });
  });
  it("never overwrites an older backup", () => {
    const run = spawnSync("php", [path.join(root, "harness", "backup.php"), path.join(siteDir, "wp-content", "database", ".ht.sqlite"), path.join(backup.dir, "db.sqlite")], { encoding: "utf8" });
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /already exists/);
  });
});

describe("the restored copy: same content", () => {
  it("is a different folder with a different database file", () => {
    assert.notEqual(siteAt("restored"), siteDir);
    assert.ok(existsSync(path.join(siteAt("restored"), "wp-content", "database", ".ht.sqlite")));
    assert.notEqual(path.join(siteAt("restored"), "wp-content", "database", ".ht.sqlite"), path.join(siteDir, "wp-content", "database", ".ht.sqlite"));
  });
  it("has the same counts: pages, posts, students, messages, users, pictures", () => {
    const r = counts(siteAt("restored"), { WP_PORT: "8081" });
    const { home: liveHome, ...liveRest } = liveCountsBefore;
    const { home: restoredHome, ...restoredRest } = r;
    assert.deepEqual(restoredRest, liveRest);
    assert.equal(restoredHome, "http://localhost:8081");
    assert.equal(liveHome, "http://localhost:8080");
    assert.equal(liveRest.messages, 1);
    assert.equal(liveRest.students, 12);
  });
  it("has the post written after the install, in the right place in the news list", async () => {
    const r = await restored.web("/restore-canary/");
    assert.equal(r.status, 200);
    const news = await restored.web("/news/");
    assert.deepEqual(texts(news.doc, ".card h2"), ["Restore canary", ...NEWS]);
  });
  it("has the uploaded picture, byte for byte", async () => {
    const res = await fetch(`${restored.origin}${canaryUrl}`);
    assert.equal(res.status, 200);
    assert.equal(sha(Buffer.from(await res.arrayBuffer())), sha(canaryPng));
  });
  it("has the contact message", () => {
    assert.deepEqual(wpCheck(siteAt("restored"), "messages", { WP_PORT: "8081" }).map((m) => m.content), ["This message must survive the restore."]);
  });
  it("lets the same people sign in with the same passwords", async () => {
    assert.match(await restored.signIn("admin"), /wordpress_logged_in_/);
    assert.match(await restored.signIn("editor1"), /wordpress_logged_in_/);
  });
  it("the live site was not touched by the restore", async () => {
    assert.deepEqual(counts(siteDir), liveCountsBefore);
    assert.equal((await live.web("/")).status, 200);
  });
});

describe("the restored copy: the site address was changed everywhere", () => {
  it("settings, menu link and a link inside a post all say :8081 and none says :8080", () => {
    const o = wpCheck(siteAt("restored"), "options", { WP_PORT: "8081" });
    assert.equal(o.home, "http://localhost:8081");
    assert.equal(o.siteurl, "http://localhost:8081");
    assert.equal(o.menu.Home, "http://localhost:8081/");
  });
  it("a value saved as serialized text (an array with string lengths) was changed AND is still readable", () => {
    const o = wpCheck(siteAt("restored"), "options", { WP_PORT: "8081" });
    assert.deepEqual(o.links, { home: "http://localhost:8081/", about: "http://localhost:8081/about/", nested: { contact: "http://localhost:8081/contact/" } });
  });
  it("serialized values survive an address with a DIFFERENT LENGTH (a same-length swap would hide a broken restore)", () => {
    const t = siteAt("restore-longer");
    restoreBackup({ backupDir: backup.dir, target: t, port: 18085, oldOrigin: live.origin });
    const o = wpCheck(t, "options", { WP_PORT: "18085" });
    assert.deepEqual(o.links, { home: "http://localhost:18085/", about: "http://localhost:18085/about/", nested: { contact: "http://localhost:18085/contact/" } });
  });
  it("the report of the fix says where it changed things", () => {
    assert.ok(sites.restored.changed.options >= 2, JSON.stringify(sites.restored.changed));
    assert.ok(sites.restored.changed.postmeta >= 1);
    assert.ok(sites.restored.changed.posts >= 1);
  });
  it("the link inside the canary post (typed with the old address) now points at the new site", async () => {
    const r = await restored.web("/restore-canary/");
    const href = r.doc.querySelector(".entry a")?.getAttribute("href");
    assert.equal(href, "http://localhost:8081/about/");
  });
});

registerSmoke("restored copy", () => restored, { news: ["Restore canary", ...NEWS] });
registerDoors("restored copy", () => restored);

describe("breaking the restore on purpose: what each mistake looks like", () => {
  it("1. address not changed: the site opens, but its menu and links still lead to the OLD site", async () => {
    restoreBackup({ backupDir: backup.dir, target: siteAt("broken-address"), port: 8082, oldOrigin: live.origin, skip: ["address"] });
    servers.push(await startServer({ port: 8082, site: siteAt("broken-address") }));
    const c = client("http://localhost:8082", readCreds());
    const r = await c.web("/");
    assert.equal(r.status, 200, "looks fine at first glance");
    const ports = new Set([...r.html.matchAll(/https?:\/\/localhost:(\d+)/g)].map((m) => m[1]));
    assert.ok(ports.has("8080"), "...but the old address is still in the page (the Home menu link)");
    const o = wpCheck(siteAt("broken-address"), "options", { WP_PORT: "8082" });
    assert.equal(o.menu.Home, "http://localhost:8080/");
    // the smoke test's address check would fail on this site
    assert.notDeepEqual([...ports], ["8082"]);
  });
  it("2. wrong (empty) database: every page sends you to the WordPress installer", async () => {
    restoreBackup({ backupDir: backup.dir, target: siteAt("broken-db"), port: 8083, oldOrigin: live.origin, skip: ["database"] });
    servers.push(await startServer({ port: 8083, site: siteAt("broken-db") }));
    const r = await client("http://localhost:8083", readCreds()).web("/");
    assert.equal(r.status, 302);
    assert.match(r.location, /install\.php/);
  });
  it("3. uploads not copied back: pages open, the picture file is gone", async () => {
    restoreBackup({ backupDir: backup.dir, target: siteAt("broken-files"), port: 8084, oldOrigin: live.origin, skip: ["files"] });
    servers.push(await startServer({ port: 8084, site: siteAt("broken-files") }));
    const c = client("http://localhost:8084", readCreds());
    assert.equal((await c.web("/restore-canary/")).status, 200);
    const pic = await fetch(`${c.origin}${canaryUrl}`, { redirect: "manual" }); // WordPress may guess and redirect to the picture's page: that is still not the picture
    assert.ok(!(pic.headers.get("content-type") ?? "").startsWith("image/"), `no picture file came back (status ${pic.status})`);
    assert.ok([301, 404].includes(pic.status), String(pic.status));
  });
});
```

### `tests/browser.test.mjs` (16 tests, real Chromium)

```js
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
```

### `break45.py` (64 broken rules)

```python
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
```

---

## 8. Results

| Check | Command | Result |
|---|---|---|
| Hardening | `node --test tests/hardening.test.mjs` | **47 passed**, 0 failed |
| Site | `node --test tests/site.test.mjs` | **38 passed**, 0 failed |
| Backup and restore | `node --test tests/restore.test.mjs` | **66 passed**, 0 failed |
| Browser (smoke, editor, visual) | `node --test tests/browser.test.mjs` | **16 passed**, 0 failed (run twice: the second run compares against the saved baselines) |
| Break-it | `python3 break45.py` | **64 / 64** broken rules caught (3 slipped through first: a wrong security code (my test sent none at all), the site-wide search finding students, and a restore that changes serialized text naively, hidden because port 8080 and 8081 have the same length. Three tests added, including a restore to a longer address) |
| Visual strictness measured | inside `browser.test.mjs` | changed heading = 1,520 / 1,507 / 1,507 pixels = 0.38% / 0.22% / 0.13% of the picture at 375 / 768 / 1280 px; all noticed; a 1% tolerance would have passed the 1280 px case |
| Self-check: a Visitor cannot read a username | 3 doors x 4 people | pass: `?author=1`, REST users, users sitemap (and oEmbed, login page, lost password, feed) |
| Self-check: editors off, XML-RPC off | tests 4 and 7 | pass: each editor lock alone is enough; XML-RPC gives 403 before WordPress runs |
| Self-check: backup restored | tests 14 to 18 | pass: second folder, second database, same counts, same checks, picture identical |
| Self-check: say what you did not test | see 'Known limit' | listed below |

---

## 9. Problems avoided

| Problem | Cause | Fix |
|---|---|---|
| PHP stopped on the config lines file with a parse error | A comment in it contained the characters that end a PHP comment (the WordPress "stop editing" line) | The line is described in words in the comment |
| A test said `DISALLOW_FILE_MODS` was null | WordPress itself defines it as `false` when you do not | The test asserts "not true" instead of "not defined" |
| The routes test failed after the REST fix | `/wp/v2/users/me` is a separate route and rightly stays | The test checks the list and the by-number routes are gone, not every route that starts with `/wp/v2/users` |
| The Apache-words test flagged my own note | The note's comments mention the old words to warn against them | The test reads only the lines that are not comments |
| A "Privacy Policy" draft page appeared | WordPress creates it on install | The installer deletes it, so the site has exactly 5 pages |
| `/?post_type=student` showed a list | With no archive a content type's list address still answered 200 | The redirect to the Students page also covers that address |
| The Home menu item was marked as current | A custom link equal to the page address counts as the current item, which is correct | The test expects `Home` as current on `/` |
| The footer floated in the middle of a short page; the home columns had a gap above the heading | No full-height layout; a heading's top margin inside a column | `body` is a full-height column with the footer pushed down; the first item in a column has a small top margin. Found by looking at the screenshots, then the baselines were re-made |
| A restore without the uploads still answered 200 for the picture | WordPress guesses what you meant and redirects a missing picture to its page | The test looks at the content type and requires that no image comes back |
| A serialized value could be broken by a restore | Serialized text stores the length of each string; a changed address has another length | The restore reads the value, changes the strings, writes it again. The installer saves such a value so a test can prove it |
| `/?post_type=contact_message` answered 200 | An unknown content type is ignored and the home page comes back | The test checks that no message text is in the answer |
| A break-it run left the plugin broken once | A previous project's run was stopped half-way (a killed process cannot restore the file) | This script restores in a `finally`; let it finish. A copy of the clean project is made before it starts |

---

## 10. What was practiced

- Closing the three username doors, and finding the extra ones (XML-RPC, oEmbed, login and lost-password answers, display names)
- Testing as a Visitor, a Subscriber, an Editor and an Administrator
- File editors: `DISALLOW_FILE_EDIT` vs `DISALLOW_FILE_MODS`, and two locks that are tested one by one
- Hook order: why a block at priority 0 works and one at priority 20 leaks
- A backup that was restored for real, with an integrity check and a checksum
- The site address inside a database: settings, menu links, post content and serialized values
- Breaking a restore three ways on purpose and writing down the symptom of each
- A smoke test written once and run twice (live and restored)
- A visual test with no tolerance, and measuring why a tolerance hides a change
- Core blocks only, proved by name and by opening every page in the block editor
- Saying plainly what was not tested

---

## 11. Known limit

**What was NOT tested.** Be ready to say these out loud:

- **MySQL.** Everything ran on SQLite. `mysqldump`, loading a dump into MySQL and `wp search-replace` (WP-CLI) were **not run**. The steps in `BACKUP_AND_RESTORE.md` for them are the standard commands, not tested here. `harness/backup.php` and `harness/restore.php` do the same jobs on SQLite.
- **`.htaccess` and nginx.** PHP's built-in server ignores them, so `htaccess.txt`, `uploads-htaccess.txt` and `nginx.txt` were never run. Only their *text* is checked (Apache 2.4 words, `IfModule` around `Header`, no `<Directory>`, PHP blocked in uploads). Test them on the real host: `/xmlrpc.php`, `/wp-config.php` and `/readme.html` must say 403, the home page must still open, a `test.php` in uploads must say 403.
- **A restore after a move to another folder on Apache** (permalinks and the `.htaccess` folder name). Not tested; the steps are in the note.
- **`FORCE_SSL_ADMIN` and HTTPS.** There is no https host here. It is left as a comment on purpose.
- **Real e-mail** (contact form and "Lost your password?"). The sandbox has no mail server. Messages are saved before any mail is tried (tested). The reset e-mail itself was never delivered or read.
- **Your Windows machine.** Linux only. The **visual baselines are per operating system**: `tests/baselines/linux/` was made in the sandbox. On Windows the first `npm run test:browser` writes `tests/baselines/win32/` and prints "NEW BASELINE"; open the three pictures once, check they look right, and commit them. Another Linux (different fonts) will also need `UPDATE_BASELINE=1`.
- **Other browsers.** Only Chromium. **Screen readers** were never used.
- **Local or XAMPP.** Not run there.
- **Attacks beyond the three doors.** No scanner, no brute-force run, no password-guess rate limit. The plugin does not add one (a real site should use a rate-limiting plugin or the host's firewall).
- **Many students at once.** The list shows up to 100 names and has no paging.

Other limits by design:

- Student names are **made up**. A real school should have the parents' consent before publishing names, and may prefer first names or initials.
- "Visitor" includes a signed-in Editor and Subscriber. If a Teacher account must see author addresses, give it the `list_users` right.
- The test passwords, keys and salts in `harness/` are for the test site only. Never use them on a real site; run `node hardening/make-keys.mjs` for real keys.

---

## 12. How to run it

```bash
# one-time
npm install
npx playwright install chromium
npm run wp:setup                 # downloads WordPress 7.1.4 + SQLite plugin from GitHub (needs internet, needs php on PATH)

# see it working
npm run wp:start                 # http://localhost:8080    (Ctrl+C stops it)
#   the website:   http://localhost:8080/
#   the dashboard: http://localhost:8080/wp-admin/
#   admin / admin-pass-123 · editor1 / editor-pass-123 · parent1 / parent-pass-123

# every test (they install and start their own fresh WordPress; stop npm run wp:start first)
npm run check                    # = npm run test:wp  then  npm run test:browser
npm run test:wp                  # 151 tests: hardening, site, backup and restore
npm run test:browser             # 16 tests in real Chromium, incl. the visual test

# backup and restore by hand (start the site first, in another window: npm run wp:start)
npm run backup                   # writes backups/<time>/
npm run restore -- backups/<time>     # builds .wp/restored with its own database at http://localhost:8081

# real secret keys for a real site
npm run keys

# optional: break 64 rules one by one; the tests must notice (takes about 20 minutes; let it finish)
python3 break45.py
```

**To use it on your own WordPress (Local or XAMPP):** copy `plugin/safe-school-hardening` and `plugin/safe-school-site` into `wp-content/plugins` and `theme/safe-school` into `wp-content/themes`; activate both plugins and the theme. Make the five pages, put a *Shortcode* block with `[school_contact_form]` on Contact, and build the menu in **Appearance > Menus**. In **Settings > Reading** choose "A static page": Home as the front page, News as the posts page. Paste `hardening/wp-config-lines.php` into `wp-config.php` above the line that says "That's all, stop editing!", add real keys from `npm run keys`, and put `hardening/htaccess.txt` and `hardening/uploads-htaccess.txt` in place if the host runs Apache (otherwise `hardening/nginx.txt`).

**Windows notes.** PHP must be on `PATH` (`php -v`) with `pdo_sqlite`, `sqlite3`, `mbstring`, `gd`, `fileinfo`, `curl` and `openssl` switched on in `php.ini`. Use `python` instead of `python3` for `break45.py`. The tests use ports **8080 to 8084**; close anything using them. If a test says it cannot delete a folder, close the PHP window and run it again.
