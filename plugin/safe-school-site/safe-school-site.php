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
