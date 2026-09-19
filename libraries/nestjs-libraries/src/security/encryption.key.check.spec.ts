// Password hashing is unrelated here, and bcrypt is a native module.
jest.mock('bcrypt', () => ({ hashSync: jest.fn(), compareSync: jest.fn() }));
const captureMessage = jest.fn();
jest.mock('@sentry/nestjs', () => ({
  captureMessage: (...a: any[]) => captureMessage(...a),
}));

import { Logger } from '@nestjs/common';
import {
  encrypt_legacy_using_IV,
  decrypt_legacy_using_IV,
} from '@gitroom/helpers/auth/auth.service';
import {
  evaluateEncryptionKey,
  runEncryptionKeyCheck,
} from '@gitroom/nestjs-libraries/security/encryption.key.check';

const env = { ...process.env };
const OLD = 'the-secret-the-data-was-encrypted-with';
const WRONG = 'a-freshly-invented-value';
const PLAIN = ['AbCdEfGhIjKlMnOpQrSt', 'ZyXwVuTsRqPoNmLkJiHg', '0123456789abcdefABCD'];

/** Ciphertexts as the database holds them: encrypted with the ORIGINAL secret. */
function storedWith(secret: string) {
  process.env.JWT_SECRET = secret;
  delete process.env.ENCRYPTION_KEY;
  return PLAIN.map((p) => encrypt_legacy_using_IV(p));
}

let logs: string[];
beforeEach(() => {
  logs = [];
  captureMessage.mockReset();
  for (const level of ['log', 'warn', 'error'] as const) {
    jest
      .spyOn(Logger.prototype, level)
      .mockImplementation((msg: any) => void logs.push(String(msg)));
  }
});
afterEach(() => {
  process.env = { ...env };
  jest.restoreAllMocks();
});

const prismaWith = (keys: (string | null)[]) => ({
  organization: { findMany: async () => keys.map((apiKey) => ({ apiKey })) },
});

describe('evaluateEncryptionKey', () => {
  it('passes when ENCRYPTION_KEY is the value the data was encrypted with', () => {
    const stored = storedWith(OLD);
    process.env.ENCRYPTION_KEY = OLD;
    process.env.JWT_SECRET = 'rotated-session-secret';
    expect(evaluateEncryptionKey(process.env, stored, decrypt_legacy_using_IV)).toEqual({
      source: 'ENCRYPTION_KEY',
      checked: 3,
      failed: 0,
    });
  });

  it('fails every check when ENCRYPTION_KEY is set to a different value', () => {
    const stored = storedWith(OLD);
    process.env.ENCRYPTION_KEY = WRONG;
    const r = evaluateEncryptionKey(process.env, stored, decrypt_legacy_using_IV);
    expect(r.source).toBe('ENCRYPTION_KEY');
    expect(r.failed).toBe(3);
  });

  it('reports the JWT_SECRET fallback when ENCRYPTION_KEY is unset', () => {
    const stored = storedWith(OLD);
    expect(evaluateEncryptionKey(process.env, stored, decrypt_legacy_using_IV)).toEqual({
      source: 'JWT_SECRET',
      checked: 3,
      failed: 0,
    });
  });

  it('skips values that are not ciphertext instead of calling them failures', () => {
    const stored = storedWith(OLD);
    const r = evaluateEncryptionKey(
      process.env,
      [...stored, 'not-hex-at-all', 'abc'],
      decrypt_legacy_using_IV
    );
    expect(r).toMatchObject({ checked: 3, failed: 0 });
  });
});

describe('runEncryptionKeyCheck (boot)', () => {
  it('raises a fatal Sentry event on a wrong key — and never logs a secret or a plaintext', async () => {
    const stored = storedWith(OLD);
    process.env.ENCRYPTION_KEY = WRONG;
    const r = await runEncryptionKeyCheck(prismaWith(stored));

    expect(r?.failed).toBe(3);
    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage.mock.calls[0][1].level).toBe('fatal');

    const everything = JSON.stringify([logs, captureMessage.mock.calls]);
    for (const secret of [OLD, WRONG, ...PLAIN, ...stored]) {
      expect(everything).not.toContain(secret);
    }
  });

  it('warns that JWT_SECRET must not be rotated while it is the fallback', async () => {
    const stored = storedWith(OLD);
    await runEncryptionKeyCheck(prismaWith(stored));
    expect(captureMessage).not.toHaveBeenCalled();
    expect(logs.join(' ')).toMatch(/Do NOT rotate JWT_SECRET/);
  });

  it('confirms a correctly migrated key quietly', async () => {
    const stored = storedWith(OLD);
    process.env.ENCRYPTION_KEY = OLD;
    await runEncryptionKeyCheck(prismaWith(stored));
    expect(captureMessage).not.toHaveBeenCalled();
    expect(logs.join(' ')).toMatch(/ENCRYPTION_KEY verified against 3 stored values/);
  });

  it('never throws and never blocks boot, even if the database is unreachable', async () => {
    const broken = {
      organization: {
        findMany: async () => {
          throw new Error('connection refused');
        },
      },
    };
    await expect(runEncryptionKeyCheck(broken)).resolves.toBeNull();
  });
});
