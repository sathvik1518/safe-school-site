// Prints the eight secret-key lines for wp-config.php, each with a fresh random value.
//   node hardening/make-keys.mjs
// Uses Node's cryptographic random generator (not Math.random). Run it once per site, never share the output.
import { randomBytes } from "node:crypto";

export const KEY_NAMES = ["AUTH_KEY", "SECURE_AUTH_KEY", "LOGGED_IN_KEY", "NONCE_KEY", "AUTH_SALT", "SECURE_AUTH_SALT", "LOGGED_IN_SALT", "NONCE_SALT"];
/** 64 random characters from letters and digits only, so the value never needs quoting tricks inside PHP. */
export function randomValue(length = 64) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = randomBytes(length * 2);
  let out = "";
  for (const b of bytes) {
    if (b < 248) out += alphabet[b % alphabet.length]; // 248 = 4 * 62: throw away the top bytes so every character is equally likely
    if (out.length === length) break;
  }
  return out;
}
export const makeLines = () => KEY_NAMES.map((n) => `define( '${n}', '${randomValue()}' );`).join("\n");

if (process.argv[1] === import.meta.filename) console.log(makeLines());
