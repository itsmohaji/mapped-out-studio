import { isPlatformOwner, platformOwnerEmails } from './platform.owner';

const withEnv = (value: string | undefined, run: () => void) => {
  const previous = process.env.SUPERADMIN_EMAILS;
  if (value === undefined) {
    delete process.env.SUPERADMIN_EMAILS;
  } else {
    process.env.SUPERADMIN_EMAILS = value;
  }
  try {
    run();
  } finally {
    if (previous === undefined) {
      delete process.env.SUPERADMIN_EMAILS;
    } else {
      process.env.SUPERADMIN_EMAILS = previous;
    }
  }
};

describe('isPlatformOwner', () => {
  it('refuses an org SUPERADMIN who is not a platform owner', () => {
    // The vulnerability. Every self-registered user is SUPERADMIN of their own
    // organization, and that role used to gate the platform-wide AI key.
    withEnv('owner@mappedout.co', () => {
      expect(
        isPlatformOwner({ isSuperAdmin: false, email: 'agency2@example.com' })
      ).toBe(false);
    });
  });

  it('fails closed when nothing is configured', () => {
    // Nothing in this codebase ever sets `User.isSuperAdmin`, so with the env
    // unset NOBODY may change platform config. Losing a settings page is
    // recoverable; leaking the platform key is not.
    withEnv(undefined, () => {
      expect(isPlatformOwner({ isSuperAdmin: false, email: 'owner@mappedout.co' })).toBe(
        false
      );
      expect(platformOwnerEmails()).toEqual([]);
    });
  });

  it('accepts the database flag', () => {
    withEnv(undefined, () => {
      expect(isPlatformOwner({ isSuperAdmin: true, email: 'owner@mappedout.co' })).toBe(
        true
      );
    });
  });

  it('accepts a configured email, case- and space-insensitively', () => {
    withEnv(' Owner@MappedOut.co , second@example.com ', () => {
      expect(isPlatformOwner({ email: 'owner@mappedout.co' })).toBe(true);
      expect(isPlatformOwner({ email: 'SECOND@example.com' })).toBe(true);
      expect(isPlatformOwner({ email: 'someone@example.com' })).toBe(false);
    });
  });

  it('refuses a user with no email and no flag', () => {
    withEnv('owner@mappedout.co', () => {
      expect(isPlatformOwner({ email: null })).toBe(false);
      expect(isPlatformOwner(null)).toBe(false);
      expect(isPlatformOwner(undefined)).toBe(false);
    });
  });

  it('does not treat an empty env as a wildcard', () => {
    withEnv(',  , ,', () => {
      expect(isPlatformOwner({ email: 'anyone@example.com' })).toBe(false);
      expect(platformOwnerEmails()).toEqual([]);
    });
  });
});
