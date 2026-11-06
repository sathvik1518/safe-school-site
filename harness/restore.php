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
