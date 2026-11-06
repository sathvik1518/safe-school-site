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
