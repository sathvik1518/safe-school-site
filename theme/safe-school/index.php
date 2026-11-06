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
