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
