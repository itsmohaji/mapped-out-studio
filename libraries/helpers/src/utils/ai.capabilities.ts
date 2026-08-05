/**
 * The AI capability registry — one definition per thing the assistant can do.
 *
 * A capability is defined ONCE and drives four things that used to be written
 * separately and drift apart:
 *
 *   1. the card on the AI Assistant page (icon, title, blurb, button)
 *   2. the skill pipeline that runs it
 *   3. the brief handed to the model
 *   4. the SHAPE of the answer, section by section
 *
 * (4) is the important one. Asking a model nicely for headings produces a wall
 * of markdown that is *usually* structured; the layout is then at the mercy of
 * whichever model the router picked that day. Declaring the sections here and
 * requiring JSON back means the page renders real components into a known
 * layout, and a malformed answer is detectable instead of merely ugly.
 *
 * Pure: the browser imports it to draw the cards, the API imports it to build
 * the prompt and validate the reply.
 */

export type SectionKind =
  /** One or two sentences. The thing a busy person reads and stops. */
  | 'summary'
  /** Bulleted points. */
  | 'list'
  /** Ordered, do-this-then-that. */
  | 'steps'
  /** Label/value pairs — numbers, targets, segments. */
  | 'metrics'
  /** Rows with a date and an item; a plan or a schedule. */
  | 'schedule';

/**
 * Where a capability is offered.
 *
 * Declared here rather than filtered in the page, so it cannot drift back onto
 * the wrong surface later — the same reason the analytics gate is derived from
 * this registry rather than listed twice (ADR-028).
 */
export type CapabilitySurface = 'assistant' | 'composer';

export interface SectionSpec {
  key: string;
  /** Heading shown above the section. */
  title: string;
  kind: SectionKind;
  /** Told to the model so it knows what belongs here. */
  hint: string;
  /** A section the model may legitimately leave empty. */
  optional?: boolean;
}

export interface CapabilitySpec {
  key: string;
  name: string;
  /** Shown on the card. Kept here so the page has no second list to maintain. */
  icon: string;
  blurb: string;
  /** Verb on the button. "Analyze", not "Run". */
  action: string;
  /** Ordered skill keys. Must exist in ai.skills.ts — asserted by a test. */
  skills: string[];
  /** True when the capability makes claims about measured performance. */
  needsAnalytics?: boolean;
  /** Needs an image provider, which is not configured yet. */
  kind?: 'text' | 'image';
  /** What this capability specifically must produce. */
  brief: string;
  sections: SectionSpec[];
  /** Placeholder for the free-text box on the card. */
  inputHint: string;
  /** Defaults to 'assistant' when omitted. */
  surface?: CapabilitySurface;}

// Section shapes reused across capabilities, so headings stay consistent
// between one answer and the next — the same information should not be called
// "Key Findings" on one card and "What we found" on another.
const SUMMARY: SectionSpec = {
  key: 'summary',
  title: 'Summary',
  kind: 'summary',
  hint: 'Two or three sentences. What someone needs to know if they read nothing else.',
};
const FINDINGS: SectionSpec = {
  key: 'findings',
  title: 'Key Findings',
  kind: 'list',
  hint: 'What the data shows. Each point must quote the figure it rests on.',
};
const PROBLEMS: SectionSpec = {
  key: 'problems',
  title: 'Problems',
  kind: 'list',
  hint: 'What is going wrong or holding this account back. Empty is a valid answer.',
  optional: true,
};
const RECOMMENDATIONS: SectionSpec = {
  key: 'recommendations',
  title: 'Recommendations',
  kind: 'list',
  hint: 'What to do, and why this account specifically. Three strong beats ten generic.',
};
const NEXT_ACTIONS: SectionSpec = {
  key: 'nextActions',
  title: 'Next Actions',
  kind: 'steps',
  hint: 'Concrete steps in order, each one something a person can start today.',
};
const KPIS: SectionSpec = {
  key: 'kpis',
  title: 'KPIs',
  kind: 'metrics',
  hint: 'How success is judged. label + value. Use "to be measured" where no baseline exists.',
};

export const CAPABILITIES: CapabilitySpec[] = [
  {
    key: 'analyze_account',
    name: 'Account Health',
    icon: '📊',
    blurb: 'Strengths, weaknesses, growth score and where the opportunities are.',
    action: 'Analyze',
    skills: ['analyst'],
    needsAnalytics: true,
    brief:
      'Assess the health of this account. Cover what is working, what is not, and where the opportunity is. Give a growth score out of 100 in the KPIs with one line on how you arrived at it — and say plainly if the data is too thin to score, rather than scoring anyway.',
    sections: [SUMMARY, FINDINGS, PROBLEMS, RECOMMENDATIONS, KPIS],
    inputHint: 'Anything specific you want looked at?',
  },
  {
    key: 'write_captions',
    name: 'Caption Studio',
    icon: '📝',
    blurb: 'Captions written from the selected media, in the client’s voice.',
    action: 'Generate Captions',
    skills: ['copywriter', 'final_reviewer'],
    surface: 'composer',    brief:
      'Write captions for this client. Offer three distinct options with different angles, not three rewordings of one idea. Respect the channel’s length limit and the account’s own hashtag habits.',
    sections: [
      SUMMARY,
      {
        key: 'options',
        title: 'Caption Options',
        kind: 'list',
        hint: 'Three captions, each complete and ready to post. Label the angle of each.',
      },
      {
        key: 'hashtags',
        title: 'Suggested Hashtags',
        kind: 'list',
        hint: 'Only if this account uses them, matching how many it usually uses.',
        optional: true,
      },
    ],
    inputHint: 'What is the post about?',
  },
  {
    key: 'monthly_plan',
    name: 'Monthly Planner',
    icon: '📅',
    blurb: 'A complete posting calendar for the month ahead.',
    action: 'Build Plan',
    skills: ['strategist', 'final_reviewer'],
    brief:
      'Produce a posting plan for the coming month. Give a cadence per channel, then a dated schedule of specific posts — each with its channel, format and the idea. Base the cadence on what this account has actually sustained, not on a generic best practice. Do not invent campaign dates, launches or promotions that you were not told about; where a date matters, mark it [confirm date].',
    sections: [
      SUMMARY,
      {
        key: 'cadence',
        title: 'Cadence',
        kind: 'metrics',
        hint: 'Posts per week per channel. label = channel, value = cadence.',
      },
      {
        key: 'schedule',
        title: 'The Plan',
        kind: 'schedule',
        hint: 'Dated rows. when = the date or week, what = channel, format and the idea.',
      },
      RECOMMENDATIONS,
      KPIS,
    ],
    inputHint: 'Any launches, seasons or themes for this month?',
  },
  {
    key: 'campaign_strategy',
    name: 'Campaign Strategy',
    icon: '🎯',
    blurb: 'A campaign built from what this account’s numbers actually show.',
    action: 'Build Strategy',
    skills: ['strategist', 'final_reviewer'],
    needsAnalytics: true,
    brief:
      'Design one campaign for this client. Give the angle, the audience, the channel mix, the beats over time, and how it will be judged. Every claim about the account must trace to a figure in the DATA block. Where the campaign needs a budget, an offer or a date you were not given, mark it in square brackets rather than inventing one.',
    sections: [
      SUMMARY,
      {
        key: 'angle',
        title: 'The Angle',
        kind: 'summary',
        hint: 'The single idea the campaign rests on, and why it fits this account.',
      },
      FINDINGS,
      {
        key: 'beats',
        title: 'Campaign Beats',
        kind: 'schedule',
        hint: 'Phases over time. when = week or phase, what = what runs then.',
      },
      NEXT_ACTIONS,
      KPIS,
    ],
    inputHint: 'What is the campaign for?',
  },
  {
    key: 'content_ideas',
    name: 'Content Ideas',
    icon: '💡',
    blurb: 'Post ideas drawn from what has already performed.',
    action: 'Generate Ideas',
    skills: ['creative_director', 'copywriter'],
    brief:
      'Generate content directions for this client. Ground each one in what this account has actually published and what performed. An idea that could be handed to any brand in the category is a failure — say what makes it this client’s.',
    sections: [
      SUMMARY,
      {
        key: 'ideas',
        title: 'Ideas',
        kind: 'list',
        hint: 'Each with a working title, the angle, the format, and why it fits this account.',
      },
      NEXT_ACTIONS,
    ],
    inputHint: 'A theme, a product, or leave blank for open ideas',
  },
  {
    key: 'target_audience',
    name: 'Target Audience',
    icon: '🎯',
    blurb: 'Who to talk to, and which segments are worth the spend.',
    action: 'Recommend',
    skills: ['analyst', 'strategist'],
    brief:
      'Recommend audience segments for this client. Describe each segment by what it wants and where it already engages, not by demographics alone. Rank them by how strong the evidence is. If the account’s own data does not support a segment, say it is a hypothesis to test — never present an assumption as a finding.',
    sections: [
      SUMMARY,
      {
        key: 'segments',
        title: 'Segments',
        kind: 'list',
        hint: 'Each with who they are, what they want, where they engage, and the evidence.',
      },
      {
        key: 'evidence',
        title: 'What the Data Supports',
        kind: 'list',
        hint: 'Which segments are evidenced and which are hypotheses. Be explicit.',
      },
      NEXT_ACTIONS,
    ],
    inputHint: 'What are you trying to sell or promote?',
  },
  {
    key: 'recommend_budget',
    name: 'Budget Recommendation',
    icon: '💰',
    blurb: 'Where advertising spend should go, and what to expect from it.',
    action: 'Recommend',
    skills: ['performance_analyst', 'final_reviewer'],
    needsAnalytics: true,
    brief:
      'Recommend how to allocate advertising budget for this client. Split it by channel and by objective, each with the reasoning. Work in PERCENTAGES unless the operator gives you a total — never invent a currency amount. State plainly what the recommendation would need in order to be more than an educated split, and never present a projection as a forecast.',
    sections: [
      SUMMARY,
      {
        key: 'allocation',
        title: 'Allocation',
        kind: 'metrics',
        hint: 'label = channel or objective, value = share of budget.',
      },
      {
        key: 'reasoning',
        title: 'Reasoning',
        kind: 'list',
        hint: 'Why each slice is what it is, tied to a figure where one exists.',
      },
      {
        key: 'assumptions',
        title: 'Assumptions',
        kind: 'list',
        hint: 'Everything this rests on that is not measured. Be exhaustive and blunt.',
      },
      KPIS,
    ],
    inputHint: 'Total budget and what it is for (optional)',
  },
  {
    key: 'performance_recos',
    name: 'Performance Insights',
    icon: '📈',
    blurb: 'What the numbers mean, and what to do about them.',
    action: 'Explain',
    skills: ['performance_analyst', 'final_reviewer'],
    needsAnalytics: true,
    brief:
      'Explain this account’s performance and what to do about it. Every recommendation must name the figure that motivated it. A recommendation with no number behind it is a hypothesis — label it as one or drop it.',
    sections: [SUMMARY, FINDINGS, PROBLEMS, RECOMMENDATIONS, NEXT_ACTIONS, KPIS],
    inputHint: 'A post, a channel, or a period to focus on',
  },
  {
    key: 'generate_images',
    name: 'Image Concepts',
    icon: '🎨',
    blurb: 'Art direction for the visuals — subject, composition, mood.',
    action: 'Direct',
    // Text pipeline: this SPECIFIES visuals, it does not render them. Actually
    // generating an image needs an image provider, which is not configured.
    skills: ['art_director'],
    brief:
      'Specify visuals for this client. For each, give the subject, composition, colour direction, mood and any on-image text. Describe only what a designer or an image model could execute, and never claim a visual has been produced — you are writing the brief for one.',
    sections: [
      SUMMARY,
      {
        key: 'concepts',
        title: 'Concepts',
        kind: 'list',
        hint: 'Each with subject, composition, colour, mood and on-image text.',
      },
    ],
    inputHint: 'What should the visuals show?',
  },
];

export const capabilitySpec = (key: string): CapabilitySpec | null =>
  CAPABILITIES.find((c) => c.key === key) || null;

export const assistantCapabilities = (): CapabilitySpec[] =>
  CAPABILITIES.filter((c) => (c.surface || 'assistant') === 'assistant');

/**
 * The JSON contract handed to the model.
 *
 * Spelled out rather than hand-waved, because "return JSON" without a shape
 * gets you a different shape every time. The renderer is strict about the outer
 * structure and forgiving inside it — see `parseStructured`.
 */
export function outputContract(spec: CapabilitySpec): string {
  const shape = spec.sections
    .map((s) => {
      const value =
        s.kind === 'summary'
          ? '"a short paragraph"'
          : s.kind === 'metrics'
          ? '[{ "label": "...", "value": "..." }]'
          : s.kind === 'schedule'
          ? '[{ "when": "...", "what": "..." }]'
          : '["point", "point"]';
      return `  "${s.key}": ${value}${s.optional ? '   // may be omitted' : ''}  // ${s.hint}`;
    })
    .join('\n');

  return [
    'Return ONLY a JSON object. No markdown, no code fence, no text before or after it.',
    '',
    '{',
    shape,
    '}',
    '',
    'Every string is plain text — no markdown syntax inside the values. Omit a',
    'section entirely rather than filling it with a placeholder, an apology, or',
    '"N/A".',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Parsing the answer back
// ---------------------------------------------------------------------------

export interface MetricItem {
  label: string;
  value: string;
}
export interface ScheduleItem {
  when: string;
  what: string;
}

export interface RenderedSection {
  key: string;
  title: string;
  kind: SectionKind;
  text?: string;
  items?: string[];
  metrics?: MetricItem[];
  schedule?: ScheduleItem[];
}

export interface StructuredAnswer {
  sections: RenderedSection[];
  /**
   * True when the model ignored the contract and we fell back to showing its
   * raw text. Used for logging, never shown to the user — they still get their
   * answer, which is the only thing they care about.
   */
  degraded: boolean;
}

/**
 * Pull a JSON object out of a model reply.
 *
 * Models fence JSON, prefix it with "Here is the JSON:", or trail a closing
 * remark, no matter how firmly they are told not to. Rather than fail on any of
 * that, take the outermost braces and try that.
 */
function extractJson(raw: string): any | null {
  const text = (raw || '').trim();
  if (!text) return null;

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1], text].filter(Boolean) as string[];

  for (const candidate of candidates) {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end <= start) continue;
    try {
      const parsed = JSON.parse(candidate.slice(start, end + 1));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Try the next candidate rather than giving up on the whole answer.
    }
  }
  return null;
}

const asText = (v: any): string =>
  typeof v === 'string'
    ? v.trim()
    : Array.isArray(v)
    ? v.map(asText).filter(Boolean).join(' ')
    : v == null
    ? ''
    : String(v);

/** A list may come back as an array, or as one newline-separated string. */
function asList(v: any): string[] {
  if (Array.isArray(v)) {
    return v
      .map((item) =>
        item && typeof item === 'object'
          ? [item.title, item.text, item.detail, item.description]
              .filter(Boolean)
              .map(asText)
              .join(' — ') || asText(Object.values(item).join(' — '))
          : asText(item)
      )
      .map((s) => s.replace(/^[-*•]\s*/, '').trim())
      .filter(Boolean);
  }
  const text = asText(v);
  if (!text) return [];
  return text
    .split('\n')
    .map((l) => l.replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean);
}

function asMetrics(v: any): MetricItem[] {
  if (Array.isArray(v)) {
    return v
      .map((m) =>
        m && typeof m === 'object'
          ? { label: asText(m.label ?? m.name ?? m.key), value: asText(m.value ?? m.target ?? m.amount) }
          : { label: asText(m), value: '' }
      )
      .filter((m) => m.label || m.value);
  }
  if (v && typeof v === 'object') {
    return Object.entries(v).map(([label, value]) => ({
      label,
      value: asText(value),
    }));
  }
  return asList(v).map((line) => {
    const [label, ...rest] = line.split(/[:—-]\s*/);
    return { label: (label || '').trim(), value: rest.join(' ').trim() };
  });
}

function asSchedule(v: any): ScheduleItem[] {
  if (!Array.isArray(v)) {
    return asList(v).map((line) => {
      const [when, ...rest] = line.split(/[:—]\s*/);
      return { when: (when || '').trim(), what: rest.join(' ').trim() || line };
    });
  }
  return v
    .map((row) =>
      row && typeof row === 'object'
        ? {
            when: asText(row.when ?? row.date ?? row.week ?? row.phase),
            what: asText(row.what ?? row.item ?? row.post ?? row.description),
          }
        : { when: '', what: asText(row) }
    )
    .filter((r) => r.when || r.what);
}

/**
 * Turn a model reply into sections the page can render.
 *
 * NEVER throws and never returns nothing. If the reply is not usable JSON, the
 * raw text is returned as a single section — a degraded answer beats a blank
 * card, which is indistinguishable from the feature being broken.
 */
export function parseStructured(
  raw: string,
  spec: CapabilitySpec
): StructuredAnswer {
  const json = extractJson(raw);

  if (!json) {
    const text = (raw || '').trim();
    return {
      degraded: true,
      sections: text
        ? [{ key: 'answer', title: spec.name, kind: 'summary', text }]
        : [],
    };
  }

  const sections: RenderedSection[] = [];
  for (const s of spec.sections) {
    const value = json[s.key];
    if (value == null || (Array.isArray(value) && !value.length)) continue;

    const base = { key: s.key, title: s.title, kind: s.kind };
    if (s.kind === 'summary') {
      const text = asText(value);
      if (text) sections.push({ ...base, text });
    } else if (s.kind === 'metrics') {
      const metrics = asMetrics(value);
      if (metrics.length) sections.push({ ...base, metrics });
    } else if (s.kind === 'schedule') {
      const schedule = asSchedule(value);
      if (schedule.length) sections.push({ ...base, schedule });
    } else {
      const items = asList(value);
      if (items.length) sections.push({ ...base, items });
    }
  }

  // Valid JSON whose keys we do not recognise is still an answer. Showing the
  // raw text is better than showing an empty card.
  if (!sections.length) {
    const text = (raw || '').trim();
    return {
      degraded: true,
      sections: text ? [{ key: 'answer', title: spec.name, kind: 'summary', text }] : [],
    };
  }

  return { sections, degraded: false };
}
