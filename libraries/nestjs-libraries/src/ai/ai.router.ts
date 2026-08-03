/**
 * The AI router.
 *
 * Nothing in the product picks a provider by name. Callers ask for a TASK
 * ("write a caption", "generate an image") and the router decides which
 * configured provider and model serves it, based on what the platform owner
 * enabled and how they ordered it.
 *
 * Pure — takes a task and a list of configured providers, returns a decision.
 * That is what makes routing testable without any network or database.
 */

import { AiCapability, providerMeta } from './ai.providers.registry';

export type AiTask =
  | 'caption'
  | 'strategy'
  | 'image_prompt'
  | 'image'
  | 'research'
  | 'recommendation'
  | 'chat'
  | 'translate'
  | 'summarize'
  | 'qualify'
  | 'vision';

export interface ConfiguredProvider {
  key: string;
  enabled: boolean;
  /** Lower runs first. Set by the platform owner. */
  priority: number;
  hasKey: boolean;
  /** 'unknown' has never been tested; only 'error' takes a provider out. */
  health: 'unknown' | 'ok' | 'error';
  models: string[];
}

interface TaskProfile {
  needs: AiCapability;
  /**
   * Providers that suit this task, best first.
   *
   * A HINT, not a rule: it only breaks ties between providers the owner has
   * enabled. It can never introduce a provider they did not configure, which
   * is what stops routing from quietly spending money somewhere unexpected.
   */
  prefer: string[];
  description: string;
}

const TASKS: Record<AiTask, TaskProfile> = {
  caption: {
    needs: 'text',
    prefer: ['groq', 'gemini', 'openai'],
    description: 'Short social copy — speed matters more than depth.',
  },
  recommendation: {
    needs: 'text',
    prefer: ['groq', 'gemini', 'openai'],
    description: 'Quick suggestions in the UI.',
  },
  translate: {
    needs: 'text',
    prefer: ['gemini', 'groq', 'openai'],
    description: 'Language conversion.',
  },
  summarize: {
    needs: 'text',
    prefer: ['groq', 'anthropic', 'openai'],
    description: 'Condensing a conversation or a report.',
  },
  qualify: {
    needs: 'text',
    prefer: ['groq', 'openai', 'anthropic'],
    description: 'Deciding whether a lead looks real — runs on every reply.',
  },
  chat: {
    needs: 'text',
    prefer: ['openai', 'anthropic', 'gemini'],
    description: 'Conversational replies to a customer.',
  },
  strategy: {
    needs: 'text',
    prefer: ['openai', 'anthropic'],
    description: 'Monthly plans and campaign strategy — reasoning over speed.',
  },
  research: {
    needs: 'text',
    prefer: ['openai', 'anthropic'],
    description: 'Long analysis over a lot of context.',
  },
  image_prompt: {
    needs: 'text',
    prefer: ['openai', 'gemini'],
    description: 'Writing the prompt that an image model will render.',
  },
  image: {
    needs: 'image',
    prefer: ['nano_banana', 'gemini', 'openai'],
    description: 'Actually generating the image.',
  },
  /**
   * Writing ABOUT an image or a video poster the model is shown.
   *
   * Separate from `caption` on purpose. A caption is a text task and routes to
   * whatever is fastest; the moment media is attached the caller asks for this
   * instead, and only a provider that declares `vision` can win it. That is what
   * lets media understanding light up the day a vision provider is enabled,
   * with no code change — and fail honestly, in one place, until then.
   */
  vision: {
    needs: 'vision',
    prefer: ['gemini', 'openai', 'anthropic'],
    description: 'Reading an attached image before writing about it.',
  },
};

export function taskProfile(task: AiTask): TaskProfile | null {
  return TASKS[task] ?? null;
}

export function allTasks(): { task: AiTask; description: string; needs: AiCapability }[] {
  return (Object.keys(TASKS) as AiTask[]).map((task) => ({
    task,
    description: TASKS[task].description,
    needs: TASKS[task].needs,
  }));
}

export interface RouteDecision {
  provider: string;
  model: string | null;
  /** Why this one won, in words a human can read in a log. */
  reason: string;
}

export interface RouteFailure {
  provider: null;
  reason: string;
}

/**
 * Choose a provider for a task.
 *
 * Order of elimination matters and is deliberate:
 *   1. disabled            — the owner turned it off
 *   2. no key              — configured in name only
 *   3. health 'error'      — it failed its last real call
 *   4. missing capability  — Groq cannot make an image, ever
 * then rank by the task's preference list, then by the owner's priority.
 *
 * Returns a REASON on failure rather than null, because "no AI configured" and
 * "you have three providers but none of them can generate images" need very
 * different responses from whoever is reading the run log.
 */
export function routeTask(
  task: AiTask,
  providers: ConfiguredProvider[],
  override?: { provider?: string; model?: string }
): RouteDecision | RouteFailure {
  const profile = TASKS[task];
  if (!profile) return { provider: null, reason: `Unknown task "${task}".` };

  const all = providers ?? [];

  // An explicit override still has to be usable — a pinned provider that is
  // disabled or keyless must fail loudly, not silently fall back somewhere else
  // and produce a surprise bill.
  if (override?.provider) {
    const pinned = all.find((p) => p.key === override.provider);
    if (!pinned) {
      return { provider: null, reason: `Provider "${override.provider}" is not configured.` };
    }
    const why = unusableReason(pinned, profile.needs);
    if (why) return { provider: null, reason: `Provider "${pinned.key}" ${why}.` };
    return {
      provider: pinned.key,
      model: override.model ?? pinned.models[0] ?? defaultModel(pinned.key),
      reason: 'Pinned by the caller.',
    };
  }

  const usable = all.filter((p) => !unusableReason(p, profile.needs));

  if (!usable.length) {
    const anyEnabled = all.some((p) => p.enabled && p.hasKey && p.health !== 'error');
    return {
      provider: null,
      reason: anyEnabled
        ? `No enabled provider can handle "${task}" (needs ${profile.needs}).`
        : 'No AI provider is enabled and configured.',
    };
  }

  const ranked = [...usable].sort((a, b) => {
    const ai = profile.prefer.indexOf(a.key);
    const bi = profile.prefer.indexOf(b.key);
    // Not in the preference list sorts last, not first.
    const aRank = ai === -1 ? Number.MAX_SAFE_INTEGER : ai;
    const bRank = bi === -1 ? Number.MAX_SAFE_INTEGER : bi;
    if (aRank !== bRank) return aRank - bRank;
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.key.localeCompare(b.key);
  });

  const chosen = ranked[0];
  const preferred = profile.prefer.includes(chosen.key);

  return {
    provider: chosen.key,
    model: chosen.models[0] ?? defaultModel(chosen.key),
    reason: preferred
      ? `Best fit for ${task}.`
      : `Only enabled provider that supports ${profile.needs}.`,
  };
}

function unusableReason(p: ConfiguredProvider, needs: AiCapability): string | null {
  if (!p.enabled) return 'is disabled';
  if (!p.hasKey) return 'has no API key';
  if (p.health === 'error') return 'failed its last connection test';
  const meta = providerMeta(p.key);
  if (!meta) return 'is not a known provider';
  if (!meta.capabilities.includes(needs)) return `cannot do ${needs}`;
  return null;
}

function defaultModel(key: string): string | null {
  return providerMeta(key)?.defaultModels[0] ?? null;
}

/**
 * The full routing table, for the settings screen.
 *
 * Showing the owner which provider each task will actually use is the whole
 * point of a router they cannot see into otherwise.
 */
export function routingTable(providers: ConfiguredProvider[]) {
  return allTasks().map(({ task, description, needs }) => {
    const decision = routeTask(task, providers);
    return {
      task,
      description,
      needs,
      provider: decision.provider,
      model: 'model' in decision ? decision.model : null,
      reason: decision.reason,
    };
  });
}
