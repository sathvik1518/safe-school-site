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
