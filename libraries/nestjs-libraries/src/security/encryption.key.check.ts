import { Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { decrypt_legacy_using_IV } from '@gitroom/helpers/auth/auth.service';

/**
 * Proves, from inside the running backend, that the at-rest encryption key can
 * read what is already stored — without any person or tool ever seeing it.
 *
 * Why (P0, 2026-09-19): AI provider keys, third-party API keys and some channel
 * credentials (Bluesky, Lemmy, Listmonk, Skool) are encrypted with
 * `ENCRYPTION_KEY`, falling back to `JWT_SECRET`. The correct migration is to
 * set `ENCRYPTION_KEY` to the CURRENT `JWT_SECRET` value. Any other value
 * silently makes every one of those unreadable — the AI features and those
 * channels stop working, and nothing says why. Checking configuration by reading
 * the secret is exactly what we must not do, so instead we try the key on real
 * stored ciphertext at boot and say loudly if it cannot read it.
 *
 * Canaries: `Organization.apiKey`. Every org gets one at creation, encrypted
 * with this key from `makeId(20)`, so the right key always yields 20 printable
 * characters. Rows that are not hex ciphertext are skipped, not counted.
 */
export interface EncryptionKeyReport {
  source: 'ENCRYPTION_KEY' | 'JWT_SECRET' | 'none';
  checked: number;
  failed: number;
}

const CIPHERTEXT = /^(?:[0-9a-f]{32})+$/i;

export function evaluateEncryptionKey(
  env: Record<string, string | undefined>,
  samples: string[],
  decrypt: (hex: string) => string
): EncryptionKeyReport {
  const source = env.ENCRYPTION_KEY
    ? 'ENCRYPTION_KEY'
    : env.JWT_SECRET
    ? 'JWT_SECRET'
    : 'none';
  const usable = samples.filter((s) => CIPHERTEXT.test(s));
  let failed = 0;
  for (const hex of usable) {
    try {
      const plain = decrypt(hex);
      // A wrong key almost always fails the padding check and throws; the rare
      // pass yields bytes, not the printable id that was stored.
      if (!plain || !/^[\x20-\x7e]+$/.test(plain)) failed += 1;
    } catch {
      failed += 1;
    }
  }
  return { source, checked: usable.length, failed };
}

type OrgReader = {
  organization: {
    findMany(args: any): Promise<Array<{ apiKey: string | null }>>;
  };
};

/** Never throws, never blocks boot, never logs a secret or a plaintext. */
export async function runEncryptionKeyCheck(prisma: OrgReader) {
  const log = new Logger('EncryptionKey');
  try {
    const rows = await prisma.organization.findMany({
      where: { apiKey: { not: null } },
      select: { apiKey: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    const report = evaluateEncryptionKey(
      process.env,
      rows.map((r) => r.apiKey as string),
      decrypt_legacy_using_IV
    );

    if (report.source === 'none') {
      log.error('No at-rest encryption secret is configured (ENCRYPTION_KEY and JWT_SECRET are both unset).');
      Sentry.captureMessage('At-rest encryption secret missing', { level: 'fatal' });
      return report;
    }
    if (report.failed > 0) {
      log.error(
        `${report.source} CANNOT decrypt stored data (${report.failed} of ${report.checked} checks failed). ` +
          'AI provider keys, third-party keys and some channel credentials are unreadable. ' +
          'If ENCRYPTION_KEY was just set, it must equal the JWT_SECRET value the data was encrypted with.'
      );
      Sentry.captureMessage('At-rest encryption key cannot read stored data', {
        level: 'fatal',
        tags: { kind: 'encryption_key', source: report.source },
        extra: { checked: report.checked, failed: report.failed },
      });
      return report;
    }
    if (report.source === 'JWT_SECRET') {
      log.warn(
        `ENCRYPTION_KEY is not set; at-rest encryption is using JWT_SECRET (verified against ${report.checked} stored values). ` +
          'Do NOT rotate JWT_SECRET until ENCRYPTION_KEY is set to its current value.'
      );
      return report;
    }
    log.log(`ENCRYPTION_KEY verified against ${report.checked} stored values.`);
    return report;
  } catch (e: any) {
    log.warn(`Encryption key check could not run: ${e?.message || 'unknown error'}`);
    return null;
  }
}
