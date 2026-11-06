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
