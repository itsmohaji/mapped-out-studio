process.env.JWT_SECRET = 'test-secret-for-purpose-claims';

// `bcrypt` is a native addon and its prebuilt binding is not present for the
// Node version this repo runs on, so importing auth.service.ts pulls in a module
// that cannot load. Nothing under test here hashes a password — these are the
// JWT purpose rules — so the addon is stubbed rather than the tests skipped.
jest.mock('bcrypt', () => ({
  hashSync: (value: string) => `hashed:${value}`,
  compareSync: (value: string, hash: string) => hash === `hashed:${value}`,
}));

import { sign } from 'jsonwebtoken';
import {
  AuthService,
  encryptionSecret,
  passwordVersion,
} from './auth.service';

const SECRET = process.env.JWT_SECRET!;

/** A session token as it was issued before purposes existed: a whole User row. */
const legacySession = (over: Record<string, any> = {}) =>
  sign(
    {
      id: 'user-1',
      email: 'owner@example.com',
      name: 'Owner',
      activated: true,
      providerName: 'LOCAL',
      ...over,
    },
    SECRET
  );

/** A reset token as `forgot()` used to mint it. */
const legacyReset = () =>
  sign({ id: 'user-1', expires: '2030-01-01 00:00:00' }, SECRET);

describe('token purposes', () => {
  describe('the vulnerability', () => {
    it('refuses a password-reset token as a session', () => {
      const reset = AuthService.signJWT(
        { id: 'user-1', purpose: 'reset', pv: 'abc' },
        { expiresIn: '20m' }
      );

      // This is the whole bug: AuthMiddleware asked only for `.id`, and this
      // token has one. Signature-valid, and now refused anyway.
      expect((AuthService.verifyJWT(reset) as any).id).toBe('user-1');
      expect(
        AuthService.verifyPurposeJWT(reset, 'session', (p) => !!p.email)
      ).toBeNull();
    });

    it('refuses a reset token minted BEFORE purposes existed', () => {
      // Already in people's inboxes at deploy time, so the legacy predicate has
      // to exclude it on shape alone.
      expect(
        AuthService.verifyPurposeJWT(
          legacyReset(),
          'session',
          (p) =>
            typeof p.email === 'string' &&
            p.expires === undefined &&
            p.timeLimit === undefined
        )
      ).toBeNull();
    });

    it('refuses an invite token as a session', () => {
      const invite = AuthService.signJWT({
        id: 'abc12',
        orgId: 'org-1',
        role: 'ADMIN',
        email: 'invited@example.com',
        timeLimit: '2030-01-01 00:00:00',
        purpose: 'invite',
      });

      expect(
        AuthService.verifyPurposeJWT(
          invite,
          'session',
          (p) =>
            typeof p.email === 'string' &&
            p.expires === undefined &&
            p.timeLimit === undefined
        )
      ).toBeNull();
    });

    it('refuses a session token as an invite', () => {
      expect(
        AuthService.verifyPurposeJWT(
          legacySession(),
          'invite',
          (p) => typeof p.timeLimit === 'string' && !!p.orgId
        )
      ).toBeNull();
    });
  });

  describe('existing users are not logged out', () => {
    it('accepts a session issued before purposes existed', () => {
      const payload = AuthService.verifyPurposeJWT<{ id: string }>(
        legacySession(),
        'session',
        (p) =>
          typeof p.email === 'string' &&
          p.expires === undefined &&
          p.timeLimit === undefined
      );

      expect(payload?.id).toBe('user-1');
    });

    it('accepts a session issued after purposes exist', () => {
      const token = AuthService.signJWT(
        { id: 'user-1', email: 'owner@example.com', purpose: 'session' },
        { expiresIn: '365d' }
      );

      expect(AuthService.verifyPurposeJWT<{ id: string }>(token, 'session')?.id).toBe(
        'user-1'
      );
    });
  });

  describe('rejections', () => {
    it('rejects a token signed with a different secret', () => {
      const forged = sign(
        { id: 'user-1', email: 'a@b.c', purpose: 'session' },
        'not-the-secret'
      );

      expect(AuthService.verifyPurposeJWT(forged, 'session')).toBeNull();
    });

    it('rejects an expired token instead of throwing', () => {
      const expired = AuthService.signJWT(
        { id: 'user-1', purpose: 'reset' },
        { expiresIn: '-1s' }
      );

      expect(AuthService.verifyPurposeJWT(expired, 'reset')).toBeNull();
    });

    it('rejects an unsigned ("none" algorithm) token', () => {
      // The classic downgrade. `algorithms: ['HS256']` at verify time is what
      // refuses it — without the pin the library would consider the header.
      const none = sign({ id: 'user-1', purpose: 'session' }, '', {
        algorithm: 'none',
      });

      expect(AuthService.verifyPurposeJWT(none, 'session')).toBeNull();
      expect(() => AuthService.verifyJWT(none)).toThrow();
    });

    it('does not let the legacy predicate readmit a wrongly-purposed token', () => {
      // A token that DECLARES another purpose never reaches the predicate, even
      // one written loosely enough to accept anything.
      const reset = AuthService.signJWT({
        id: 'user-1',
        email: 'owner@example.com',
        purpose: 'reset',
      });

      expect(AuthService.verifyPurposeJWT(reset, 'session', () => true)).toBeNull();
    });
  });

  describe('encryption secret', () => {
    const withEncryptionKey = (value: string | undefined, run: () => void) => {
      const previous = process.env.ENCRYPTION_KEY;
      if (value === undefined) {
        delete process.env.ENCRYPTION_KEY;
      } else {
        process.env.ENCRYPTION_KEY = value;
      }
      try {
        run();
      } finally {
        if (previous === undefined) {
          delete process.env.ENCRYPTION_KEY;
        } else {
          process.env.ENCRYPTION_KEY = previous;
        }
      }
    };

    it('falls back to JWT_SECRET, so nothing already stored becomes unreadable', () => {
      withEncryptionKey(undefined, () => {
        expect(encryptionSecret()).toBe(SECRET);
      });
    });

    it('lets JWT_SECRET be rotated without touching stored ciphertext', () => {
      // The point of the seam. Encrypt under today's shared secret...
      const ciphertext = AuthService.fixedEncryption('social-access-token');

      withEncryptionKey(SECRET, () => {
        // ...then pin ENCRYPTION_KEY to that value and change JWT_SECRET. The
        // credential still decrypts, which is what makes rotating the session
        // secret survivable instead of a mass channel disconnection.
        const previousJwt = process.env.JWT_SECRET;
        process.env.JWT_SECRET = 'rotated-session-secret';
        try {
          expect(AuthService.fixedDecryption(ciphertext)).toBe(
            'social-access-token'
          );
        } finally {
          process.env.JWT_SECRET = previousJwt;
        }
      });
    });

    it('uses ENCRYPTION_KEY when set', () => {
      withEncryptionKey('a-separate-encryption-key', () => {
        expect(encryptionSecret()).toBe('a-separate-encryption-key');
        expect(AuthService.fixedDecryption(AuthService.fixedEncryption('x'))).toBe(
          'x'
        );
      });
    });
  });

  describe('passwordVersion', () => {
    it('changes when the password hash changes, which retires old links', () => {
      const before = passwordVersion('$2b$10$aaaaaaaaaaaaaaaaaaaaaa');
      const after = passwordVersion('$2b$10$bbbbbbbbbbbbbbbbbbbbbb');

      expect(before).not.toEqual(after);
      expect(before).toEqual(passwordVersion('$2b$10$aaaaaaaaaaaaaaaaaaaaaa'));
    });

    it('does not leak the stored hash', () => {
      const hash = '$2b$10$aaaaaaaaaaaaaaaaaaaaaa';
      expect(passwordVersion(hash)).not.toContain(hash);
      expect(passwordVersion(hash)).toHaveLength(16);
    });
  });
});
