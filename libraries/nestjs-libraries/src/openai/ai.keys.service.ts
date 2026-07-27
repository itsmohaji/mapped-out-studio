import { Injectable, OnModuleInit } from '@nestjs/common';
import OpenAI from 'openai';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { aiKeyStore } from '@gitroom/nestjs-libraries/openai/ai.keys.store';
import {
  decrypt_legacy_using_IV,
  encrypt_legacy_using_IV,
} from '@gitroom/helpers/auth/auth.service';

export type AiProvider = 'openai' | 'nano_banana';

const KEYS: Record<AiProvider, string> = {
  openai: 'openai_api_key',
  nano_banana: 'nano_banana_api_key',
};

export interface ProviderStatus {
  configured: boolean;
  last4?: string;
}

@Injectable()
export class AiKeysService implements OnModuleInit {
  constructor(private _settings: PrismaRepository<'systemSetting'>) {}

  // Load persisted keys into the in-memory store at boot so the AI clients use them.
  async onModuleInit() {
    const openai = await this.readDecrypted('openai');
    if (openai) {
      aiKeyStore.setOpenAiKey(openai);
    }
    const nano = await this.readDecrypted('nano_banana');
    if (nano) {
      aiKeyStore.setNanoBananaKey(nano);
    }
  }

  private async readDecrypted(provider: AiProvider): Promise<string> {
    try {
      const row = await this._settings.model.systemSetting.findUnique({
        where: { key: KEYS[provider] },
      });
      if (!row?.value) return '';
      return decrypt_legacy_using_IV(row.value) || '';
    } catch {
      // A missing table (pre-migration) or a decrypt failure must never crash boot.
      return '';
    }
  }

  private last4(value: string): string | undefined {
    if (!value || value.length < 4) return undefined;
    return value.slice(-4);
  }

  async getStatus(): Promise<Record<AiProvider, ProviderStatus>> {
    const result = {} as Record<AiProvider, ProviderStatus>;
    for (const provider of Object.keys(KEYS) as AiProvider[]) {
      const value = await this.readDecrypted(provider);
      result[provider] = { configured: !!value, last4: this.last4(value) };
    }
    return result;
  }

  // Blank value clears the key (delete row + reset the in-memory store to env).
  async setKey(provider: AiProvider, apiKey: string) {
    const trimmed = (apiKey || '').trim();
    if (!trimmed) {
      try {
        await this._settings.model.systemSetting.deleteMany({
          where: { key: KEYS[provider] },
        });
      } catch {
        // ignore missing row
      }
      this.applyToStore(provider, '');
      return { configured: false };
    }

    const encrypted = encrypt_legacy_using_IV(trimmed);
    await this._settings.model.systemSetting.upsert({
      where: { key: KEYS[provider] },
      update: { value: encrypted },
      create: { key: KEYS[provider], value: encrypted },
    });
    this.applyToStore(provider, trimmed);
    return { configured: true, last4: this.last4(trimmed) };
  }

  private applyToStore(provider: AiProvider, plaintext: string) {
    if (provider === 'openai') {
      aiKeyStore.setOpenAiKey(plaintext);
    } else {
      aiKeyStore.setNanoBananaKey(plaintext);
    }
  }

  // Validate a key. If no explicit key is passed, test the stored one.
  async testKey(
    provider: AiProvider,
    apiKey?: string
  ): Promise<{ ok: boolean; message: string }> {
    const key = (apiKey || '').trim() || (await this.readDecrypted(provider));
    if (!key) {
      return { ok: false, message: 'No API key configured to test.' };
    }

    if (provider === 'openai') {
      try {
        const client = new OpenAI({ apiKey: key });
        await client.models.list();
        return { ok: true, message: 'OpenAI key is valid.' };
      } catch (err: any) {
        const status = err?.status || err?.response?.status;
        if (status === 401) {
          return { ok: false, message: 'Invalid OpenAI API key.' };
        }
        return {
          ok: false,
          message: err?.message || 'Could not validate the OpenAI key.',
        };
      }
    }

    // Nano Banana provider is not wired into a client yet — accept + store the key.
    return {
      ok: true,
      message: 'Nano Banana key saved. Live integration is coming soon.',
    };
  }
}
