import OpenAI from 'openai';
import { aiKeyStore } from '@gitroom/nestjs-libraries/openai/ai.keys.store';

export interface TextResult {
  text: string;
  promptTokens?: number | null;
  outputTokens?: number | null;
}

/**
 * Every provider implements this. Adding one means adding a file and a registry
 * entry — the orchestrator never changes.
 */
export interface AiProvider {
  key: string;
  label: string;
  available(): boolean;
  generateText(params: {
    model: string;
    instruction: string;
    input: string;
  }): Promise<TextResult>;
}

// Rebuilt whenever an admin saves a new key (aiKeyStore notifies listeners).
let openAiClient = new OpenAI({ apiKey: aiKeyStore.openAiKey });
aiKeyStore.onChange(() => {
  openAiClient = new OpenAI({ apiKey: aiKeyStore.openAiKey });
});

const openAiProvider: AiProvider = {
  key: 'openai',
  label: 'OpenAI',
  available: () => aiKeyStore.hasOpenAiKey(),
  async generateText({ model, instruction, input }) {
    const res = await openAiClient.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: instruction },
        { role: 'user', content: input },
      ],
    });
    return {
      text: res.choices?.[0]?.message?.content || '',
      // The provider's OWN numbers. Missing stays missing — never estimated.
      promptTokens: res.usage?.prompt_tokens ?? null,
      outputTokens: res.usage?.completion_tokens ?? null,
    };
  },
};

/**
 * Registered but with no implementation yet. It reports itself unavailable, so
 * the UI shows it honestly as not ready instead of hiding it or pretending.
 */
const nanoBananaProvider: AiProvider = {
  key: 'nano_banana',
  label: 'Nano Banana',
  available: () => false,
  async generateText() {
    throw new Error('nano_banana provider is not implemented yet');
  },
};

const registry: Record<string, AiProvider> = {
  [openAiProvider.key]: openAiProvider,
  [nanoBananaProvider.key]: nanoBananaProvider,
};

export const getProvider = (key?: string | null): AiProvider | null =>
  registry[key || 'openai'] || null;

export const listProviders = () =>
  Object.values(registry).map((p) => ({
    key: p.key,
    label: p.label,
    available: p.available(),
  }));
