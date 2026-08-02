/**
 * Automation template catalogue.
 *
 * A template is just a prebuilt workflow + node graph, so nothing here is a new
 * concept for the engine to understand — picking one is the same as building
 * the same steps by hand. That keeps the builder and the templates from ever
 * drifting apart.
 *
 * `requiresMessaging` marks templates whose steps need Instagram's messaging
 * scope (pending Meta App Review). They are still offered and still saveable —
 * the UI explains the wait rather than hiding the capability.
 */

import { ActionKind, ChannelKey, TriggerKind } from './automation.types';

export interface TemplateNode {
  kind: ActionKind;
  config?: Record<string, any>;
  branchKey?: string | null;
}

export interface AutomationTemplate {
  key: string;
  name: string;
  tagline: string;
  /** One line on when to reach for this, in the user's language, not ours. */
  description: string;
  icon: string;
  accent: string;
  channels: ChannelKey[];
  trigger: TriggerKind;
  category: 'engagement' | 'lead' | 'support' | 'booking' | 'advanced';
  keywords?: string[];
  requiresMessaging: boolean;
  /** Offered but inert until an AI provider is configured. */
  comingSoon?: boolean;
  nodes: TemplateNode[];
}

const dm = (message: string) => ({ kind: 'send_dm' as ActionKind, config: { message } });
const wait = () => ({ kind: 'wait_reply' as ActionKind, config: { timeoutDays: 7 } });
const collect = (field: string) => ({ kind: 'collect_field' as ActionKind, config: { field } });

export const TEMPLATES: AutomationTemplate[] = [
  {
    key: 'comment_to_dm',
    name: 'Comment → DM',
    tagline: 'The classic',
    description:
      'Someone comments a keyword on your post and instantly gets a direct message. The one everyone asks for.',
    icon: '💬',
    accent: '#6ba3da',
    channels: ['instagram', 'facebook'],
    trigger: 'comment',
    category: 'engagement',
    keywords: ['YES'],
    requiresMessaging: true,
    nodes: [
      dm("Hi {{handle}} 👋 Thanks for commenting!\n\nHere's the link you asked for:"),
      wait(),
      { kind: 'notify_team', config: { message: 'A commenter replied on Instagram' } },
    ],
  },
  {
    key: 'lead_collection',
    name: 'Lead Collection',
    tagline: 'Capture and route',
    description:
      'Ask for a name and an email in the DM, save the contact, and hand the lead to the right person.',
    icon: '🎯',
    accent: '#47b985',
    channels: ['instagram', 'facebook', 'whatsapp', 'website'],
    trigger: 'comment',
    category: 'lead',
    keywords: ['INFO', 'DETAILS', 'PRICE'],
    requiresMessaging: true,
    nodes: [
      dm("Happy to help! What's your name?"),
      wait(),
      collect('first_name'),
      dm('Thanks {{first_name}}! What email should we send it to?'),
      wait(),
      collect('email'),
      { kind: 'create_lead', config: {} },
      { kind: 'notify_team', config: { message: 'New lead: {{first_name}} ({{email}})' } },
    ],
  },
  {
    key: 'dm_auto_reply',
    name: 'Direct Message Auto Reply',
    tagline: 'Never leave them waiting',
    description:
      'Answer every incoming DM immediately, then hand over to a human when someone is available.',
    icon: '⚡',
    accent: '#daa646',
    channels: ['instagram', 'facebook', 'whatsapp', 'website'],
    trigger: 'direct_message',
    category: 'support',
    requiresMessaging: true,
    nodes: [
      dm("Thanks for the message! We've got it and someone will reply shortly."),
      { kind: 'notify_team', config: { message: 'New DM from {{handle}}' } },
    ],
  },
  {
    key: 'story_mention',
    name: 'Story Mention Reply',
    tagline: 'Thank the people who share you',
    description: 'When someone mentions you in their story, send an automatic thank-you.',
    icon: '✨',
    accent: '#b57edc',
    channels: ['instagram'],
    trigger: 'story_mention',
    category: 'engagement',
    requiresMessaging: true,
    nodes: [dm('Thank you so much for the mention {{handle}} 🙏')],
  },
  {
    key: 'keyword_reply',
    name: 'Keyword Reply',
    tagline: 'One word, one answer',
    description:
      'Watch for specific words anywhere — comments or DMs — and send the matching reply.',
    icon: '🔑',
    accent: '#6ba3da',
    channels: ['instagram', 'facebook', 'whatsapp', 'website'],
    trigger: 'keyword',
    category: 'engagement',
    keywords: ['PRICE', 'INFO'],
    requiresMessaging: true,
    nodes: [dm("Here's what you asked for 👇")],
  },
  {
    key: 'faq_auto_reply',
    name: 'FAQ Auto Reply',
    tagline: 'Answer the same five questions once',
    description:
      'Branch on what they asked and send the right answer — opening hours, pricing, delivery.',
    icon: '📚',
    accent: '#47b985',
    channels: ['instagram', 'facebook', 'whatsapp', 'website'],
    trigger: 'direct_message',
    category: 'support',
    requiresMessaging: true,
    nodes: [
      {
        kind: 'branch',
        config: { conditions: [{ kind: 'keyword', match: 'contains', values: ['price', 'cost'] }] },
      },
      { kind: 'send_dm', config: { message: 'Our pricing starts at …' }, branchKey: 'match' },
      { kind: 'send_dm', config: { message: 'Happy to help — what would you like to know?' }, branchKey: 'no_match' },
    ],
  },
  {
    key: 'welcome_message',
    name: 'Welcome Message',
    tagline: 'Start every conversation right',
    description: 'The first time someone messages you, greet them properly and set expectations.',
    icon: '👋',
    accent: '#daa646',
    channels: ['instagram', 'facebook', 'whatsapp', 'website'],
    trigger: 'direct_message',
    category: 'engagement',
    requiresMessaging: true,
    nodes: [
      dm('Welcome {{handle}} 👋 Great to have you here.'),
      { kind: 'add_tag', config: { tags: ['new-contact'] } },
    ],
  },
  {
    key: 'appointment_booking',
    name: 'Appointment Booking',
    tagline: 'Fill the calendar',
    description: 'Qualify the enquiry, collect contact details, and hand off to book a time.',
    icon: '📅',
    accent: '#b57edc',
    channels: ['instagram', 'facebook', 'whatsapp', 'website'],
    trigger: 'comment',
    category: 'booking',
    keywords: ['BOOK', 'APPOINTMENT'],
    requiresMessaging: true,
    nodes: [
      dm("Let's get you booked in. What's your name?"),
      wait(),
      collect('first_name'),
      dm('Thanks {{first_name}} — best email for the invite?'),
      wait(),
      collect('email'),
      { kind: 'create_lead', config: {} },
      { kind: 'create_task', config: { title: 'Book appointment for {{first_name}}' } },
      { kind: 'notify_team', config: { message: 'Booking request from {{first_name}}' } },
    ],
  },
  {
    key: 'ai_assistant',
    name: 'AI Assistant',
    tagline: 'When nothing else matches',
    description:
      'Falls back to an AI reply only when no rule or saved answer fits. Rules always win.',
    icon: '🤖',
    accent: '#8b93a5',
    channels: ['instagram', 'facebook', 'whatsapp', 'website'],
    trigger: 'direct_message',
    category: 'advanced',
    requiresMessaging: true,
    comingSoon: true,
    nodes: [{ kind: 'generate_ai_response', config: {} }],
  },
  {
    key: 'custom',
    name: 'Custom Automation',
    tagline: 'Start from nothing',
    description: 'An empty canvas. Pick your own trigger and build the steps yourself.',
    icon: '✏️',
    accent: '#8b93a5',
    channels: ['instagram', 'facebook', 'whatsapp', 'website'],
    trigger: 'comment',
    category: 'advanced',
    requiresMessaging: false,
    nodes: [],
  },
];

export function templateByKey(key: string): AutomationTemplate | null {
  return TEMPLATES.find((t) => t.key === key) ?? null;
}

/** Templates a given channel can actually run. */
export function templatesForChannel(channel: ChannelKey): AutomationTemplate[] {
  return TEMPLATES.filter((t) => t.channels.includes(channel));
}
