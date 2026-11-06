<?php get_header(); ?>
<h1><?php esc_html_e( 'Page not found', 'safe-school' ); ?></h1>
<p><?php esc_html_e( 'We could not find that page. It may have been removed, or it is not published yet.', 'safe-school' ); ?></p>
<p><a href="<?php echo esc_url( home_url( '/' ) ); ?>"><?php esc_html_e( 'Back to the home page', 'safe-school' ); ?></a></p>
<?php get_footer(); ?>
