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
