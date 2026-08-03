/**
 * Conversation blocks — the vocabulary the builder shows a human.
 *
 * Deliberately NOT the same list as ActionKind. The engine's vocabulary is
 * precise ("send_dm", "wait_reply", "collect_field"); a marketer's is not. One
 * block can expand to several engine nodes, which is what lets "Ask a Question"
 * be a single card instead of three.
 *
 * No developer terminology reaches this file's labels. If a name needs a
 * glossary, it is the wrong name.
 */

export type BlockKind =
  | 'send_message'
  | 'ask_question'
  | 'show_buttons'
  | 'wait'
  | 'condition'
  | 'collect_information'
  | 'create_lead'
  | 'add_tag'
  | 'notify_team'
  | 'ai_action';

export interface BlockMeta {
  kind: BlockKind;
  label: string;
  /** One line, in the user's language, about what this does. */
  summary: string;
  icon: string;
  accent: string;
  group: 'Conversation' | 'Logic' | 'Outcome';
  /** True when the block cannot run until an AI provider is configured. */
  needsAi?: boolean;
}

export const BLOCKS: BlockMeta[] = [
  {
    kind: 'send_message',
    label: 'Send Message',
    summary: 'Send them a message.',
    icon: '💬',
    accent: '#6ba3da',
    group: 'Conversation',
  },
  {
    kind: 'ask_question',
    label: 'Ask a Question',
    summary: 'Ask something and save their answer.',
    icon: '❓',
    accent: '#b57edc',
    group: 'Conversation',
  },
  {
    kind: 'show_buttons',
    label: 'Show Buttons',
    summary: 'Give them options to tap instead of typing.',
    icon: '🔘',
    accent: '#6ba3da',
    group: 'Conversation',
  },
  {
    kind: 'wait',
    label: 'Wait',
    summary: 'Pause before the next step.',
    icon: '⏳',
    accent: '#daa646',
    group: 'Logic',
  },
  {
    kind: 'condition',
    label: 'Condition',
    summary: 'Send them down a different path based on what they said.',
    icon: '🔀',
    accent: '#daa646',
    group: 'Logic',
  },
  {
    kind: 'collect_information',
    label: 'Collect Information',
    summary: 'Save what they just said into a field.',
    icon: '📥',
    accent: '#47b985',
    group: 'Logic',
  },
  {
    kind: 'create_lead',
    label: 'Create Lead',
    summary: 'Save them as a lead with everything collected.',
    icon: '🎯',
    accent: '#47b985',
    group: 'Outcome',
  },
  {
    kind: 'add_tag',
    label: 'Add Tag',
    summary: 'Label them for later.',
    icon: '🏷️',
    accent: '#47b985',
    group: 'Outcome',
  },
  {
    kind: 'notify_team',
    label: 'Notify Team',
    summary: 'Tell your team someone is waiting.',
    icon: '🔔',
    accent: '#e2685f',
    group: 'Outcome',
  },
  {
    kind: 'ai_action',
    label: 'AI Action',
    summary: 'Let AI write the reply. Needs an AI provider.',
    icon: '✨',
    accent: '#8b93a5',
    group: 'Conversation',
    needsAi: true,
  },
];

export function blockMeta(kind: string): BlockMeta | null {
  return BLOCKS.find((b) => b.kind === kind) ?? null;
}

// ---------------------------------------------------------------- templates

export interface QuestionTemplate {
  key: string;
  label: string;
  question: string;
  /** Field the answer is saved into. */
  saveAs: string;
  buttons?: string[];
}

/**
 * Ready-made questions.
 *
 * Every one is editable after inserting — these are a starting point, not a
 * constraint. `saveAs` matters more than the wording: it is what the lead
 * record and the {{variables}} key off.
 */
export const QUESTION_TEMPLATES: QuestionTemplate[] = [
  {
    key: 'name',
    label: 'Name Collection',
    question: 'What is your name?',
    saveAs: 'first_name',
  },
  {
    key: 'email',
    label: 'Email Collection',
    question: 'What is your email?',
    saveAs: 'email',
  },
  {
    key: 'phone',
    label: 'Phone Number',
    question: 'What is your phone number?',
    saveAs: 'phone',
  },
  {
    key: 'budget',
    label: 'Budget',
    question: 'What is your budget?',
    saveAs: 'budget',
    buttons: ['Under 500', '500–1000', '1000+'],
  },
  {
    key: 'service',
    label: 'Service',
    question: 'What service are you interested in?',
    saveAs: 'interested_service',
    buttons: [
      'Branding',
      'Marketing',
      'Website',
      'Consultation',
      'Photography',
      'Video Production',
    ],
  },
  {
    key: 'appointment',
    label: 'Appointment',
    question: 'When would you like us to contact you?',
    saveAs: 'preferred_time',
    buttons: ['Today', 'Tomorrow', 'This Week', 'Next Week'],
  },
  {
    key: 'company',
    label: 'Company',
    question: 'Which company are you with?',
    saveAs: 'company',
  },
];

export interface ButtonTemplate {
  key: string;
  label: string;
  buttons: string[];
}

export const BUTTON_TEMPLATES: ButtonTemplate[] = [
  {
    key: 'service',
    label: 'Choose a Service',
    buttons: ['Branding', 'Marketing', 'Website', 'Book Meeting'],
  },
  {
    key: 'package',
    label: 'Choose Package',
    buttons: ['Starter', 'Professional', 'Enterprise'],
  },
  { key: 'yes_no', label: 'Yes / No', buttons: ['Yes', 'No'] },
  { key: 'continue', label: 'Continue', buttons: ['Continue', 'Talk to Human'] },
  {
    key: 'appointment',
    label: 'Book Appointment',
    buttons: ['Today', 'Tomorrow', 'Next Week'],
  },
];

/** Fields a Create Lead block can save. Custom fields are added on top. */
export const LEAD_FIELDS: { key: string; label: string }[] = [
  { key: 'first_name', label: 'First Name' },
  { key: 'last_name', label: 'Last Name' },
  { key: 'handle', label: 'Username' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'interested_service', label: 'Interested Service' },
  { key: 'budget', label: 'Budget' },
  { key: 'company', label: 'Company' },
  { key: 'country', label: 'Country' },
  { key: 'notes', label: 'Notes' },
];

/**
 * Attribution a lead ALWAYS stores, whatever is ticked above.
 *
 * Listed here so the UI can show it as "always saved" rather than offering it
 * as a choice — these are not optional and must not look optional.
 */
export const ALWAYS_CAPTURED: string[] = [
  'Instagram account',
  'Instagram username',
  'Workflow name',
  'Source (Instagram)',
  'Date and time',
  'Which post triggered it',
  'Post ID, or “All posts”',
  'Campaign, if set',
];
