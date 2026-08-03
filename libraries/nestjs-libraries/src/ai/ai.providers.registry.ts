/**
 * AI provider catalogue.
 *
 * The list of providers Mapped Out can talk to, and what each one needs to be
 * configured. Data, not code — adding a provider is an entry here plus nothing
 * else, because almost every one of them speaks the OpenAI wire format.
 *
 * Nothing in here is client-facing. Clients see credits; only the platform
 * owner ever sees that providers exist.
 */

export type AiCapability = 'text' | 'vision' | 'image' | 'embedding';

export interface AiProviderMeta {
  key: string;
  label: string;
  /** Most of these speak the OpenAI wire format, which is why one client works. */
  openAiCompatible: boolean;
  defaultEndpoint: string | null;
  /** True when the operator must supply the endpoint themselves. */
  requiresEndpoint: boolean;
  requiresOrgId: boolean;
  capabilities: AiCapability[];
  defaultModels: string[];
  /** Where to get a key — saves a support round trip. */
  consoleUrl: string;
  /** Rough positioning, shown in the UI to make routing decisions legible. */
  note: string;
}

export const AI_PROVIDERS: AiProviderMeta[] = [
  {
    key: 'openai',
    label: 'OpenAI',
    openAiCompatible: true,
    defaultEndpoint: 'https://api.openai.com/v1',
    requiresEndpoint: false,
    requiresOrgId: true,
    capabilities: ['text', 'vision', 'image', 'embedding'],
    defaultModels: ['gpt-4o', 'gpt-4o-mini'],
    consoleUrl: 'https://platform.openai.com/api-keys',
    note: 'Strongest general reasoning. The safe default for long-form work.',
  },
  {
    key: 'anthropic',
    label: 'Anthropic',
    openAiCompatible: false,
    defaultEndpoint: 'https://api.anthropic.com/v1',
    requiresEndpoint: false,
    requiresOrgId: false,
    capabilities: ['text', 'vision'],
    defaultModels: ['claude-sonnet-4-5', 'claude-haiku-4-5'],
    consoleUrl: 'https://console.anthropic.com/settings/keys',
    note: 'Long context and careful instruction following. No image generation.',
  },
  {
    key: 'gemini',
    label: 'Google Gemini',
    openAiCompatible: true,
    defaultEndpoint: 'https://generativelanguage.googleapis.com/v1beta/openai',
    requiresEndpoint: false,
    requiresOrgId: false,
    capabilities: ['text', 'vision', 'image'],
    defaultModels: ['gemini-2.0-flash', 'gemini-2.5-pro'],
    consoleUrl: 'https://aistudio.google.com/apikey',
    note: 'Fast and cheap, and can generate images.',
  },
  {
    key: 'groq',
    label: 'Groq',
    openAiCompatible: true,
    defaultEndpoint: 'https://api.groq.com/openai/v1',
    requiresEndpoint: false,
    requiresOrgId: false,
    capabilities: ['text'],
    defaultModels: ['llama-3.3-70b-versatile'],
    consoleUrl: 'https://console.groq.com/keys',
    note: 'Very fast inference. Best for short, latency-sensitive work.',
  },
  {
    key: 'nvidia_nim',
    label: 'NVIDIA NIM',
    openAiCompatible: true,
    defaultEndpoint: 'https://integrate.api.nvidia.com/v1',
    requiresEndpoint: false,
    requiresOrgId: false,
    capabilities: ['text', 'vision'],
    defaultModels: ['meta/llama-3.3-70b-instruct'],
    consoleUrl: 'https://build.nvidia.com',
    note: 'Hosted open models.',
  },
  {
    key: 'openrouter',
    label: 'OpenRouter',
    openAiCompatible: true,
    defaultEndpoint: 'https://openrouter.ai/api/v1',
    requiresEndpoint: false,
    requiresOrgId: false,
    capabilities: ['text', 'vision', 'image'],
    defaultModels: ['openai/gpt-4o-mini'],
    consoleUrl: 'https://openrouter.ai/keys',
    note: 'One key, many models. Useful as a fallback when a direct provider is down.',
  },
  {
    key: 'deepseek',
    label: 'DeepSeek',
    openAiCompatible: true,
    defaultEndpoint: 'https://api.deepseek.com/v1',
    requiresEndpoint: false,
    requiresOrgId: false,
    capabilities: ['text'],
    defaultModels: ['deepseek-chat'],
    consoleUrl: 'https://platform.deepseek.com/api_keys',
    note: 'Low cost per token.',
  },
  {
    key: 'kimi',
    label: 'Kimi (Moonshot)',
    openAiCompatible: true,
    defaultEndpoint: 'https://api.moonshot.cn/v1',
    requiresEndpoint: false,
    requiresOrgId: false,
    capabilities: ['text'],
    defaultModels: ['moonshot-v1-32k'],
    consoleUrl: 'https://platform.moonshot.cn/console/api-keys',
    note: 'Long context, strong on Chinese.',
  },
  {
    key: 'glm',
    label: 'GLM (Zhipu)',
    openAiCompatible: true,
    defaultEndpoint: 'https://open.bigmodel.cn/api/paas/v4',
    requiresEndpoint: false,
    requiresOrgId: false,
    capabilities: ['text', 'vision'],
    defaultModels: ['glm-4-plus'],
    consoleUrl: 'https://open.bigmodel.cn',
    note: 'Long context, strong on Chinese.',
  },
  {
    key: 'nano_banana',
    label: 'Nano Banana',
    openAiCompatible: false,
    defaultEndpoint: null,
    requiresEndpoint: true,
    requiresOrgId: false,
    capabilities: ['image'],
    defaultModels: [],
    consoleUrl: '',
    note: 'Image generation. Already registered elsewhere in the app.',
  },
  {
    key: 'custom',
    label: 'Custom OpenAI-Compatible',
    openAiCompatible: true,
    defaultEndpoint: null,
    requiresEndpoint: true,
    requiresOrgId: false,
    capabilities: ['text', 'vision', 'embedding'],
    defaultModels: [],
    consoleUrl: '',
    note: 'Any self-hosted or third-party endpoint that speaks the OpenAI API.',
  },
];

export function providerMeta(key: string): AiProviderMeta | null {
  return AI_PROVIDERS.find((p) => p.key === key) ?? null;
}

/**
 * Mask a secret for display.
 *
 * The full key is NEVER returned to any client, including the super admin's
 * browser — once stored, it only ever leaves the server as four characters.
 */
export function maskKey(value?: string | null): string | null {
  if (!value) return null;
  if (value.length <= 4) return '••••';
  return `••••••••${value.slice(-4)}`;
}
