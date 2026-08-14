import { sign, verify, SignOptions } from 'jsonwebtoken';
import { hashSync, compareSync } from 'bcrypt';
import crypto from 'crypto';
// @ts-ignore
import EVP_BytesToKey from 'evp_bytestokey';
const algorithm = 'aes-256-cbc';
const { keyLength, ivLength } = crypto.getCipherInfo(algorithm);

/**
 * The secret that protects data AT REST: every social access token, every
 * third-party API key, every org API key, every OAuth client secret.
 *
 * It used to be `JWT_SECRET` itself, which also signs sessions, password-reset
 * links and invites. That single fact made the session secret unrotatable: the
 * one response you need after a leaked or shared secret — rotate it — would
 * have left every stored credential on the install undecryptable, disconnecting
 * every channel. A key you cannot rotate is a key you have already lost.
 *
 * Defaulting to `JWT_SECRET` keeps every existing ciphertext readable, so this
 * changes nothing until `ENCRYPTION_KEY` is set. Setting it to the CURRENT
 * `JWT_SECRET` value is the whole migration: from then on the two can move
 * independently, and `JWT_SECRET` can be rotated on its own.
 */
export function encryptionSecret(): string {
  return process.env.ENCRYPTION_KEY || process.env.JWT_SECRET!;
}

function deriveLegacyKeyIv(secret: string) {
  const { keyLength, ivLength } = crypto.getCipherInfo(algorithm); // 32, 16
  const pass = Buffer.isBuffer(secret) ? secret : Buffer.from(secret ?? '', 'utf8');

  // evp_bytestokey: key length in **bits**, IV length in **bytes**
  const { key, iv } = EVP_BytesToKey(pass, null, keyLength * 8, ivLength, 'md5');

  if (key.length !== keyLength || iv.length !== ivLength) {
    throw new Error(`Derived wrong sizes (key=${key.length}, iv=${iv.length})`);
  }
  return { key, iv };
}

export function decrypt_legacy_using_IV(hexCiphertext: string) {
  const { key, iv } = deriveLegacyKeyIv(encryptionSecret());
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  const out = Buffer.concat([decipher.update(hexCiphertext, 'hex'), decipher.final()]);
  return out.toString('utf8');
}

export function encrypt_legacy_using_IV(utf8Plaintext: string) {
  const { key, iv } = deriveLegacyKeyIv(encryptionSecret());
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  const out = Buffer.concat([cipher.update(utf8Plaintext, 'utf8'), cipher.final()]);
  return out.toString('hex');
}
/**
 * What a token is FOR.
 *
 * One secret signs every token this system issues: sessions, password resets,
 * team invites, OAuth state, enterprise service calls. Until this claim existed
 * they were interchangeable, because each verifier only checked the signature
 * and then read the fields it happened to care about.
 *
 * That is how a password-reset link became a permanent login: the reset token is
 * `{ id, expires }`, `AuthMiddleware` only asked for `.id`, and the 20-minute
 * `expires` was checked exclusively on the reset route — never on the session
 * path. Anyone holding an old reset email held an account.
 *
 * A token is now only usable for the job it was minted for.
 */
export type JwtPurpose = 'session' | 'reset' | 'invite';

/** Pinned. Never let the token itself choose how it is verified. */
const ALGORITHM = 'HS256' as const;

/**
 * A short fingerprint of the stored password hash, for binding a reset token to
 * the password it was issued against.
 *
 * Hashing an already-hashed value, so it reveals nothing about the password, and
 * it is compared only against a value recomputed server-side — it is an equality
 * marker, not a credential. Changing the password changes the fingerprint, which
 * is what makes a reset link single-use without adding a column to track it.
 */
export function passwordVersion(passwordHash: string): string {
  return crypto
    .createHash('sha256')
    .update(passwordHash)
    .digest('hex')
    .slice(0, 16);
}

export class AuthService {
  static hashPassword(password: string) {
    return hashSync(password, 10);
  }
  static comparePassword(password: string, hash: string) {
    return compareSync(password, hash);
  }
  static signJWT(value: object, options: SignOptions = {}) {
    return sign(value, process.env.JWT_SECRET!, {
      algorithm: ALGORITHM,
      ...options,
    });
  }
  static verifyJWT(token: string) {
    // `algorithms` is what stops a token from nominating its own algorithm.
    return verify(token, process.env.JWT_SECRET!, { algorithms: [ALGORITHM] });
  }

  /**
   * Verify a token AND that it was minted for `purpose`.
   *
   * Returns null instead of throwing on any failure — bad signature, expired,
   * wrong purpose — so callers cannot accidentally treat a rejection as a pass.
   *
   * `allowLegacy` covers tokens signed before purposes existed. It is given a
   * predicate rather than a boolean so each call site must state HOW it can tell
   * an old token of its own kind from an old token of someone else's kind. For
   * sessions that test is decisive: a session payload is a User row and carries
   * `email`, while a reset payload is `{ id, expires }` and never does.
   */
  static verifyPurposeJWT<T = Record<string, any>>(
    token: string,
    purpose: JwtPurpose,
    allowLegacy?: (payload: Record<string, any>) => boolean
  ): T | null {
    try {
      const payload = this.verifyJWT(token) as Record<string, any> | null;
      if (!payload || typeof payload !== 'object') {
        return null;
      }
      if (payload.purpose === purpose) {
        return payload as T;
      }
      // A token that declares a DIFFERENT purpose is always refused; only an
      // unmarked one can fall through to the legacy test.
      if (payload.purpose === undefined && allowLegacy?.(payload)) {
        return payload as T;
      }
      return null;
    } catch (err) {
      return null;
    }
  }

  static fixedEncryption(value: string) {
    return encrypt_legacy_using_IV(value);
  }

  static fixedDecryption(hash: string) {
    return decrypt_legacy_using_IV(hash);
  }
}
