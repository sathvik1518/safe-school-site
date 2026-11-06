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
