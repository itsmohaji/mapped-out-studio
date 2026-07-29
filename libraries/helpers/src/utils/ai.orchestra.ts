/**
 * AI Orchestra — the decision rules.
 *
 * These live in a pure module because they decide whether an organisation is
 * allowed to spend money, and that has to be testable without a database, a
 * provider key, or a running Nest app.
 */

export const PLAN_ORDER = ['FREE', 'STANDARD', 'PRO', 'TEAM', 'ULTIMATE'] as const;
export type Plan = (typeof PLAN_ORDER)[number];

export interface CapabilityLike {
  key: string;
  name: string;
  enabled: boolean;
  minPlan: string;
  kind: string; // 'text' | 'image'
  skillKeys: string;
}

export interface UsageLike {
  creditsUsed: number;
  imagesUsed: number;
}

export interface EntitlementLike {
  monthlyCredits: number;
  monthlyImages: number;
}

export type RefusalReason =
  | 'capability_disabled'
  | 'plan_too_low'
  | 'no_credits'
  | 'no_image_credits'
  | 'provider_unavailable'
  | 'not_configured';

export interface Decision {
  allowed: boolean;
  reason?: RefusalReason;
  /** Client-safe sentence. Never mentions skills, prompts, models or providers. */
  message?: string;
}

const rank = (plan: string) => {
  const i = PLAN_ORDER.indexOf((plan || 'FREE').toUpperCase() as Plan);
  // An unknown plan is treated as the LOWEST, never the highest — an unknown
  // value must not accidentally unlock everything.
  return i === -1 ? 0 : i;
};

export function planAllows(orgPlan: string, minPlan: string): boolean {
  return rank(orgPlan) >= rank(minPlan);
}

/** Ordered skill pipeline for a capability. Empty means "not configured yet". */
export function skillPipeline(capability: CapabilityLike): string[] {
  return (capability.skillKeys || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Can this org run this capability right now? Every refusal carries a reason so
 * the run log can answer "why did nothing happen".
 */
export function canRun(params: {
  capability: CapabilityLike;
  orgPlan: string;
  entitlement: EntitlementLike;
  usage: UsageLike;
  providerAvailable: boolean;
}): Decision {
  const { capability, orgPlan, entitlement, usage, providerAvailable } = params;

  if (!capability.enabled) {
    return {
      allowed: false,
      reason: 'capability_disabled',
      message: 'This capability is not available yet.',
    };
  }

  if (!skillPipeline(capability).length) {
    return {
      allowed: false,
      reason: 'not_configured',
      message: 'This capability is not available yet.',
    };
  }

  if (!planAllows(orgPlan, capability.minPlan)) {
    return {
      allowed: false,
      reason: 'plan_too_low',
      message: 'This capability is not included in your plan.',
    };
  }

  if (!providerAvailable) {
    return {
      allowed: false,
      reason: 'provider_unavailable',
      message: 'This capability is temporarily unavailable.',
    };
  }

  if (capability.kind === 'image') {
    if (usage.imagesUsed >= entitlement.monthlyImages) {
      return {
        allowed: false,
        reason: 'no_image_credits',
        message: 'You have used all of this month’s image generations.',
      };
    }
    return { allowed: true };
  }

  if (usage.creditsUsed >= entitlement.monthlyCredits) {
    return {
      allowed: false,
      reason: 'no_credits',
      message: 'You have used all of this month’s AI credits.',
    };
  }

  return { allowed: true };
}

export const remaining = (limit: number, used: number) =>
  Math.max(0, limit - used);

/**
 * Approximate cost in millionths of a US cent, from the provider's OWN reported
 * token counts. Returns null when a provider reported no usage — we record an
 * unknown as unknown rather than inventing a number.
 */
const RATE_MICROS_PER_1K: Record<string, { in: number; out: number }> = {
  'gpt-4o-mini': { in: 150, out: 600 },
  'gpt-4o': { in: 2500, out: 10000 },
  'gpt-4.1-mini': { in: 400, out: 1600 },
};

export function costMicros(
  model: string,
  promptTokens?: number | null,
  outputTokens?: number | null
): number | null {
  if (promptTokens == null && outputTokens == null) return null;
  const rate = RATE_MICROS_PER_1K[model];
  if (!rate) return null;
  const inCost = ((promptTokens || 0) / 1000) * rate.in;
  const outCost = ((outputTokens || 0) / 1000) * rate.out;
  return Math.round(inCost + outCost);
}

/**
 * One credit per 1k tokens, minimum 1 for any successful run — so a trivial
 * request still costs something and the meter can never sit at zero forever.
 */
export function creditsForRun(
  promptTokens?: number | null,
  outputTokens?: number | null
): number {
  const total = (promptTokens || 0) + (outputTokens || 0);
  if (!total) return 1;
  return Math.max(1, Math.round(total / 1000));
}

/** The client-facing shape. Deliberately omits skills, models and providers. */
export function toClientCapability(
  capability: CapabilityLike,
  decision: Decision
) {
  return {
    key: capability.key,
    name: capability.name,
    kind: capability.kind,
    available: decision.allowed,
    unavailableMessage: decision.allowed ? undefined : decision.message,
  };
}
