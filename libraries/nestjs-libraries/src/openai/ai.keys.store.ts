/**
 * Workspace-level AI provider keys, held in memory so the (module-level) AI
 * clients can be rebuilt whenever an admin changes a key — without threading a
 * key/orgId through every AI call site.
 *
 * - Initial value comes from env (OPENAI_API_KEY) so nothing breaks before the
 *   DB value is loaded at boot (AiKeysService.onModuleInit).
 * - When a key is set (boot-load or admin save), all registered listeners run,
 *   so each AI client (OpenAI / ChatOpenAI / DallE) rebuilds with the new key.
 */
type Listener = () => void;

let openAiKey = process.env.OPENAI_API_KEY || '';
let nanoBananaKey = process.env.NANO_BANANA_API_KEY || '';
const listeners: Listener[] = [];

const notify = () => {
  for (const l of listeners) {
    try {
      l();
    } catch {
      // never let a rebuild error break a key update
    }
  }
};

export const aiKeyStore = {
  // Fallback to the historical placeholder so existing behaviour is unchanged
  // when no key is configured anywhere (the OpenAI call simply fails as before).
  get openAiKey(): string {
    return openAiKey || 'sk-proj-';
  },
  get nanoBananaKey(): string {
    return nanoBananaKey;
  },
  hasOpenAiKey(): boolean {
    return !!openAiKey;
  },
  hasNanoBananaKey(): boolean {
    return !!nanoBananaKey;
  },
  setOpenAiKey(value: string) {
    openAiKey = value || '';
    notify();
  },
  setNanoBananaKey(value: string) {
    nanoBananaKey = value || '';
  },
  /**
   * Register a rebuild callback. It runs immediately (to build the initial
   * client from the current key) and again on every subsequent key change.
   */
  onChange(listener: Listener) {
    listeners.push(listener);
    try {
      listener();
    } catch {
      // ignore initial build errors
    }
  },
};
