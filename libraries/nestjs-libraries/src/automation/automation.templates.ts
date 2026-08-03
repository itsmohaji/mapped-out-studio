/**
 * Automation template catalogue.
 *
 * A template is a prebuilt list of BLOCKS — the same blocks the builder edits.
 * That is deliberate: if templates emitted raw engine nodes, a template's
 * send + wait + collect would reopen as three disconnected cards instead of one
 * "Ask a Question", and the gallery would quietly produce worse workflows than
 * building by hand.
 *
 * `requiresMessaging` marks templates whose steps need Instagram's messaging
 * scope (pending Meta App Review). They are still offered and still saveable —
 * the UI explains the wait rather than hiding the capability.
 */

import { BlockKind } from './automation.blocks';
import { ChannelKey, TriggerKind } from './automation.types';

export interface TemplateBlock {
  kind: BlockKind;
  config: Record<string, any>;
}

export type TemplateCategory =
  | 'engagement'
  | 'lead'
  | 'sales'
  | 'booking'
  | 'ecommerce'
  | 'ai'
  | 'custom';

export interface AutomationTemplate {
  key: string;
  name: string;
  tagline: string;
  description: string;
  icon: string;
  accent: string;
  channels: ChannelKey[];
  trigger: TriggerKind;
  category: TemplateCategory;
  keywords?: string[];
  requiresMessaging: boolean;
  /**
   * How much editing this needs before it is ready to turn on.
   *
   * There is deliberately no "estimated conversion" figure. We have no data to
   * base one on, and a made-up percentage next to a template would be a number
   * people plan budgets around. Difficulty is something we can actually know.
   */
  difficulty: 'easy' | 'medium' | 'advanced';
  /** Offered but inert until an AI provider is configured. */
  comingSoon?: boolean;
  blocks: TemplateBlock[];
}

export const TEMPLATE_CATEGORIES: { key: TemplateCategory; label: string; blurb: string }[] = [
  { key: 'engagement', label: 'Engagement', blurb: 'Reply, welcome and deliver.' },
  { key: 'lead', label: 'Lead Generation', blurb: 'Capture details and route them.' },
  { key: 'sales', label: 'Sales', blurb: 'Recommend, offer and upsell.' },
  { key: 'booking', label: 'Booking', blurb: 'Fill the calendar.' },
  { key: 'ecommerce', label: 'E-commerce', blurb: 'Products, stock and orders.' },
  { key: 'ai', label: 'AI', blurb: 'Let AI handle what rules cannot.' },
  { key: 'custom', label: 'Custom', blurb: 'Start from nothing.' },
];

// Compact block builders — the templates below are data, and should read like it.
const msg = (message: string): TemplateBlock => ({ kind: 'send_message', config: { message } });
const ask = (question: string, saveAs: string, buttons?: string[]): TemplateBlock => ({
  kind: 'ask_question',
  config: { question, saveAs, buttons: buttons ?? [] },
});
const choose = (message: string, buttons: string[]): TemplateBlock => ({
  kind: 'show_buttons',
  config: { message, buttons },
});
const lead = (fields: string[] = []): TemplateBlock => ({
  kind: 'create_lead',
  config: { fields },
});
const notify = (message: string): TemplateBlock => ({ kind: 'notify_team', config: { message } });
const tag = (...tags: string[]): TemplateBlock => ({ kind: 'add_tag', config: { tags } });
const ai = (instruction: string): TemplateBlock => ({ kind: 'ai_action', config: { instruction } });

const IG_FB: ChannelKey[] = ['instagram', 'facebook'];
const ALL: ChannelKey[] = ['instagram', 'facebook', 'whatsapp', 'website'];

/** Shared defaults so forty entries do not repeat themselves. */
const t = (
  key: string,
  name: string,
  tagline: string,
  description: string,
  category: TemplateCategory,
  blocks: TemplateBlock[],
  over: Partial<AutomationTemplate> = {}
): AutomationTemplate => ({
  key,
  name,
  tagline,
  description,
  category,
  blocks,
  icon: over.icon ?? '💬',
  accent: over.accent ?? '#6ba3da',
  channels: over.channels ?? IG_FB,
  trigger: over.trigger ?? 'comment',
  keywords: over.keywords,
  requiresMessaging: over.requiresMessaging ?? true,
  difficulty: over.difficulty ?? 'easy',
  comingSoon: over.comingSoon,
});

export const TEMPLATES: AutomationTemplate[] = [
  // ------------------------------------------------------------- engagement
  t(
    'comment_to_dm',
    'Comment → DM',
    'The classic',
    'Someone comments a keyword on your post and instantly gets a direct message. The one everyone asks for.',
    'engagement',
    [msg("Hi {{handle}} 👋 Thanks for commenting!\n\nHere's what you asked for:"), notify('Someone replied to a comment automation')],
    { keywords: ['YES'], accent: '#6ba3da' }
  ),
  t(
    'story_reply',
    'Story Reply',
    'Answer story replies',
    'When someone replies to your story, send an automatic response and let your team know.',
    'engagement',
    [msg('Thanks for replying 🙏 How can we help?'), notify('Story reply from {{handle}}')],
    { trigger: 'direct_message', icon: '📲', channels: ALL }
  ),
  t(
    'story_mention',
    'Story Mention Reply',
    'Thank the people who share you',
    'When someone mentions you in their story, send an automatic thank-you.',
    'engagement',
    [msg('Thank you so much for the mention {{handle}} 🙏'), tag('shared-our-story')],
    { trigger: 'story_mention', icon: '✨', accent: '#b57edc', channels: ['instagram'] }
  ),
  t(
    'keyword_reply',
    'Keyword Reply',
    'One word, one answer',
    'Watch for specific words in comments or DMs and send the matching reply.',
    'engagement',
    [msg("Here's what you asked for 👇")],
    { trigger: 'keyword', keywords: ['PRICE', 'INFO'], icon: '🔑', channels: ALL }
  ),
  t(
    'welcome_message',
    'Welcome Message',
    'Start every conversation right',
    'The first time someone messages you, greet them properly and set expectations.',
    'engagement',
    [msg('Welcome {{handle}} 👋 Great to have you here. Someone will reply shortly.'), tag('new-contact')],
    { trigger: 'direct_message', icon: '👋', accent: '#daa646', channels: ALL }
  ),
  t(
    'giveaway_entry',
    'Giveaway Entry',
    'Collect entries automatically',
    'Comment the keyword to enter, get confirmation, and be tagged as an entrant.',
    'engagement',
    [
      msg("You're in! 🎉 Thanks for entering."),
      ask('What email should we use if you win?', 'email'),
      tag('giveaway-entrant'),
      lead(['handle', 'email']),
    ],
    { keywords: ['ENTER', 'ME'], icon: '🎁', accent: '#b57edc', difficulty: 'medium' }
  ),
  t(
    'free_resource',
    'Free Resource Delivery',
    'Deliver the thing you promised',
    'Comment the keyword and receive the guide, checklist or file automatically.',
    'engagement',
    [
      msg("Here it is 👇\n\n[paste your link]\n\nEnjoy!"),
      ask('Want me to send anything else?', 'follow_up', ['Yes please', 'No thanks']),
    ],
    { keywords: ['GUIDE', 'FREE'], icon: '📘', accent: '#47b985' }
  ),
  t(
    'link_delivery',
    'Link Delivery',
    'Stop saying “link in bio”',
    'Send the link straight to anyone who asks for it in the comments.',
    'engagement',
    [msg('Here you go 👇\n\n[paste your link]')],
    { keywords: ['LINK'], icon: '🔗' }
  ),
  t(
    'faq_auto_reply',
    'FAQ Auto Reply',
    'Answer the same five questions once',
    'Recognise a common question and send the right answer instead of typing it again.',
    'engagement',
    [msg('Great question! Here is what you need to know:\n\n[your answer]'), notify('FAQ answered for {{handle}}')],
    { trigger: 'direct_message', icon: '📚', accent: '#47b985', channels: ALL }
  ),
  t(
    'dm_auto_reply',
    'Direct Message Auto Reply',
    'Never leave them waiting',
    'Answer every incoming DM immediately, then hand over to a human.',
    'engagement',
    [msg("Thanks for the message! We've got it and someone will reply shortly."), notify('New DM from {{handle}}')],
    { trigger: 'direct_message', icon: '⚡', accent: '#daa646', channels: ALL }
  ),

  // ------------------------------------------------------- lead generation
  t(
    'lead_collection',
    'Lead Collection',
    'Capture and route',
    'Ask for a name and an email in the DM, save the contact, and hand the lead to the right person.',
    'lead',
    [
      msg('Happy to help! Just a couple of quick questions.'),
      ask('What is your name?', 'first_name'),
      ask('And your email?', 'email'),
      lead(['first_name', 'email', 'handle']),
      notify('New lead: {{first_name}} ({{email}})'),
    ],
    { keywords: ['INFO', 'DETAILS'], icon: '🎯', accent: '#47b985', channels: ALL, difficulty: 'medium' }
  ),
  t(
    'quote_request',
    'Quote Request',
    'Qualify before you quote',
    'Collect what they need and their budget before your team spends time on a quote.',
    'lead',
    [
      msg("Let's get you a quote 📋"),
      ask('What service are you interested in?', 'interested_service', ['Branding', 'Marketing', 'Website', 'Photography']),
      ask('What is your budget?', 'budget', ['Under 500', '500–1000', '1000+']),
      ask('Best email to send it to?', 'email'),
      lead(['first_name', 'email', 'interested_service', 'budget']),
      notify('Quote request: {{interested_service}} · {{budget}}'),
    ],
    { keywords: ['QUOTE'], icon: '📋', accent: '#47b985', difficulty: 'medium' }
  ),
  t(
    'consultation_request',
    'Consultation Request',
    'Book the discovery call',
    'Collect the details you need before a consultation and notify the account manager.',
    'lead',
    [
      msg('Happy to set up a consultation 🗓️'),
      ask('What is your name?', 'first_name'),
      ask('What would you like to discuss?', 'notes'),
      ask('Best email or phone?', 'email'),
      lead(['first_name', 'email', 'notes']),
      notify('Consultation request from {{first_name}}'),
    ],
    { keywords: ['CONSULT'], icon: '🤝', accent: '#47b985', difficulty: 'medium' }
  ),
  t(
    'price_inquiry',
    'Price Inquiry',
    'Answer “how much?” instantly',
    'Send pricing to anyone who asks, and capture them as a lead at the same time.',
    'lead',
    [
      msg('Our pricing starts at [your price] 💰'),
      ask('Want a full breakdown by email?', 'email', ['Yes please', 'Not now']),
      lead(['handle', 'email']),
    ],
    { keywords: ['PRICE', 'COST', 'HOW MUCH'], icon: '💰', accent: '#daa646' }
  ),
  t(
    'catalogue_request',
    'Catalogue Request',
    'Send the catalogue',
    'Deliver your catalogue and keep the contact details of everyone who asked.',
    'lead',
    [
      msg('Here is our catalogue 📖\n\n[paste your link]'),
      ask('Where should we send updates?', 'email'),
      lead(['handle', 'email']),
    ],
    { keywords: ['CATALOGUE', 'CATALOG'], icon: '📖', accent: '#47b985' }
  ),
  t(
    'download_guide',
    'Download Guide',
    'Lead magnet delivery',
    'Trade a guide for an email — the classic lead magnet, fully automatic.',
    'lead',
    [
      msg('Happy to send that over 📘'),
      ask('What email should I send it to?', 'email'),
      msg('On its way! Check your inbox in a minute.'),
      lead(['handle', 'email']),
      tag('downloaded-guide'),
    ],
    { keywords: ['GUIDE', 'DOWNLOAD'], icon: '⬇️', accent: '#47b985', difficulty: 'medium' }
  ),
  t(
    'waitlist',
    'Waitlist',
    'Build demand before launch',
    'Collect emails for something that has not launched yet, and tag them for the announcement.',
    'lead',
    [
      msg("You're early 🙌 Want to be first to know when we launch?"),
      ask('Drop your email and I will add you', 'email'),
      tag('waitlist'),
      lead(['handle', 'email']),
    ],
    { keywords: ['WAITLIST', 'NOTIFY ME'], icon: '⏰', accent: '#b57edc' }
  ),

  // ------------------------------------------------------------------ sales
  t(
    'product_recommendation',
    'Product Recommendation',
    'Point them at the right thing',
    'Ask what they are looking for, then recommend the product that fits.',
    'sales',
    [
      msg('Let me help you find the right one 🛍️'),
      ask('What are you looking for?', 'interested_service', ['Everyday', 'Gift', 'Premium']),
      msg('Based on that, I would recommend [your product].'),
      lead(['handle', 'interested_service']),
    ],
    { keywords: ['HELP ME CHOOSE'], icon: '🛍️', accent: '#b57edc', difficulty: 'medium' }
  ),
  t(
    'package_selection',
    'Package Selection',
    'Let them self-select',
    'Show your packages and capture which one they picked.',
    'sales',
    [
      choose('Which package suits you best?', ['Starter', 'Professional', 'Enterprise']),
      ask('Great choice! What is your email?', 'email'),
      lead(['handle', 'email', 'interested_service']),
      notify('Package interest from {{handle}}'),
    ],
    { keywords: ['PACKAGES'], icon: '📦', accent: '#b57edc', difficulty: 'medium' }
  ),
  t(
    'discount_campaign',
    'Discount Campaign',
    'Deliver the code',
    'Comment the keyword, get the discount code, and be tagged for follow-up.',
    'sales',
    [msg('Here is your code 🎟️\n\n[YOUR CODE]\n\nUse it at checkout.'), tag('discount-claimed'), lead(['handle'])],
    { keywords: ['DISCOUNT', 'CODE'], icon: '🎟️', accent: '#daa646' }
  ),
  t(
    'limited_offer',
    'Limited Offer',
    'Create urgency honestly',
    'Announce a time-limited offer to anyone who asks, and record who claimed it.',
    'sales',
    [
      msg('This one is only on until [date] ⏳\n\n[your offer]'),
      ask('Want me to reserve one for you?', 'email', ['Yes', 'No thanks']),
      tag('offer-claimed'),
      lead(['handle', 'email']),
    ],
    { keywords: ['OFFER'], icon: '⏳', accent: '#e2685f', difficulty: 'medium' }
  ),
  t(
    'upsell_flow',
    'Upsell Flow',
    'Offer the natural next step',
    'After someone shows interest, offer the complementary product or upgrade.',
    'sales',
    [
      msg('Glad you like it! Most people also add [your upsell].'),
      choose('Want me to include it?', ['Yes, add it', 'Just the original']),
      lead(['handle', 'interested_service']),
      notify('Upsell response from {{handle}}'),
    ],
    { keywords: ['MORE'], icon: '📈', accent: '#47b985', difficulty: 'medium' }
  ),
  t(
    'product_finder',
    'Product Finder',
    'A short quiz that sells',
    'Two or three questions that narrow down what they need, then a recommendation.',
    'sales',
    [
      msg('Answer two quick questions and I will find your match 🔍'),
      ask('Who is it for?', 'recipient', ['Me', 'A gift']),
      ask('What is your budget?', 'budget', ['Under 500', '500–1000', '1000+']),
      msg('Perfect — I would go with [your product].'),
      lead(['handle', 'budget', 'recipient']),
    ],
    { keywords: ['FIND'], icon: '🔍', accent: '#b57edc', difficulty: 'advanced' }
  ),

  // ---------------------------------------------------------------- booking
  t(
    'appointment_booking',
    'Appointment Booking',
    'Fill the calendar',
    'Qualify the enquiry, collect contact details, and hand off to book a time.',
    'booking',
    [
      msg("Let's get you booked in 📅"),
      ask('What is your name?', 'first_name'),
      ask('When suits you?', 'preferred_time', ['Today', 'Tomorrow', 'This Week', 'Next Week']),
      ask('Best email for the invite?', 'email'),
      lead(['first_name', 'email', 'preferred_time']),
      notify('Booking request from {{first_name}} — {{preferred_time}}'),
    ],
    { keywords: ['BOOK', 'APPOINTMENT'], icon: '📅', accent: '#b57edc', channels: ALL, difficulty: 'medium' }
  ),
  t(
    'demo_booking',
    'Demo Booking',
    'Show them the product',
    'Collect what they want to see before the demo so it is not a cold call.',
    'booking',
    [
      msg('Happy to run you through it 🖥️'),
      ask('What would you most like to see?', 'notes'),
      ask('Best email to send the invite?', 'email'),
      lead(['handle', 'email', 'notes']),
      notify('Demo request from {{handle}}'),
    ],
    { keywords: ['DEMO'], icon: '🖥️', accent: '#6ba3da', channels: ALL, difficulty: 'medium' }
  ),
  t(
    'consultation_booking',
    'Consultation Booking',
    'Book the paid call',
    'Qualify, collect details, then hand to your team to confirm a slot.',
    'booking',
    [
      msg('Let me get a few details first 🗓️'),
      ask('What is your name?', 'first_name'),
      ask('What would you like to cover?', 'notes'),
      ask('When works best?', 'preferred_time', ['Today', 'Tomorrow', 'This Week', 'Next Week']),
      lead(['first_name', 'notes', 'preferred_time']),
      notify('Consultation booking from {{first_name}}'),
    ],
    { keywords: ['CONSULTATION'], icon: '🤝', accent: '#47b985', channels: ALL, difficulty: 'medium' }
  ),
  t(
    'workshop_registration',
    'Workshop Registration',
    'Sign them up',
    'Register attendees for a workshop and collect everything you need to email them.',
    'booking',
    [
      msg('Great — let me sign you up 📝'),
      ask('What is your name?', 'first_name'),
      ask('And your email?', 'email'),
      tag('workshop'),
      lead(['first_name', 'email']),
      notify('Workshop registration: {{first_name}}'),
    ],
    { keywords: ['WORKSHOP', 'REGISTER'], icon: '📝', accent: '#daa646', channels: ALL, difficulty: 'medium' }
  ),
  t(
    'event_registration',
    'Event Registration',
    'Fill the room',
    'Take registrations from a post, tag attendees, and notify whoever runs the event.',
    'booking',
    [
      msg('Saving you a spot 🎟️'),
      ask('What name should I put down?', 'first_name'),
      ask('Best email for the details?', 'email'),
      tag('event-attendee'),
      lead(['first_name', 'email']),
      notify('Event registration: {{first_name}}'),
    ],
    { keywords: ['EVENT', 'ATTEND'], icon: '🎪', accent: '#b57edc', channels: ALL, difficulty: 'medium' }
  ),

  // ------------------------------------------------------------- e-commerce
  t(
    'product_inquiry',
    'Product Inquiry',
    'Answer product questions',
    'Reply to “is this available” style questions and capture the interest.',
    'ecommerce',
    [
      msg('Thanks for asking! Here are the details 👇\n\n[product details]'),
      ask('Want me to check stock for you?', 'email', ['Yes please', 'Just browsing']),
      lead(['handle', 'email']),
    ],
    { keywords: ['INFO', 'DETAILS'], icon: '🛒', accent: '#6ba3da' }
  ),
  t(
    'catalogue_browser',
    'Catalogue Browser',
    'Let them browse by category',
    'Show your categories as options and send the matching catalogue section.',
    'ecommerce',
    [
      choose('What are you shopping for?', ['New in', 'Best sellers', 'Sale', 'Gifts']),
      msg('Here you go 👇\n\n[paste the matching link]'),
      lead(['handle', 'interested_service']),
    ],
    { keywords: ['SHOP', 'BROWSE'], icon: '🗂️', accent: '#b57edc', difficulty: 'medium' }
  ),
  t(
    'best_sellers',
    'Best Sellers',
    'Send your top products',
    'Anyone who asks gets your best sellers without you typing them out.',
    'ecommerce',
    [msg('Our most loved right now 🔥\n\n[your best sellers]'), lead(['handle'])],
    { keywords: ['BEST', 'POPULAR'], icon: '🔥', accent: '#e2685f' }
  ),
  t(
    'product_availability',
    'Product Availability',
    'Stop answering “in stock?”',
    'Take the enquiry, capture what they want, and let your team confirm.',
    'ecommerce',
    [
      msg('Let me check that for you 🔎'),
      ask('Which item and size?', 'notes'),
      lead(['handle', 'notes']),
      notify('Stock check: {{notes}}'),
    ],
    { keywords: ['STOCK', 'AVAILABLE'], icon: '🔎', accent: '#daa646', difficulty: 'medium' }
  ),
  t(
    'size_guide',
    'Size Guide',
    'Send sizing instantly',
    'Deliver your size guide to anyone who asks about fit.',
    'ecommerce',
    [msg('Here is our size guide 📏\n\n[paste your link]')],
    { keywords: ['SIZE', 'FIT'], icon: '📏', accent: '#6ba3da' }
  ),
  t(
    'color_selection',
    'Colour Selection',
    'Show the options',
    'Let them pick a colour and record the preference.',
    'ecommerce',
    [
      choose('Which colour would you like?', ['Black', 'White', 'Beige', 'Something else']),
      msg('Great pick! Here it is 👇\n\n[paste your link]'),
      lead(['handle', 'interested_service']),
    ],
    { keywords: ['COLOUR', 'COLOR'], icon: '🎨', accent: '#b57edc' }
  ),
  t(
    'order_request',
    'Order Request',
    'Take the order in the DM',
    'Collect what they want, their details, and hand it to whoever fulfils orders.',
    'ecommerce',
    [
      msg('Happy to take that order 🛍️'),
      ask('What would you like?', 'notes'),
      ask('Name for the order?', 'first_name'),
      ask('Best phone number?', 'phone'),
      lead(['first_name', 'phone', 'notes']),
      notify('Order request from {{first_name}}: {{notes}}'),
    ],
    { keywords: ['ORDER', 'BUY'], icon: '🧾', accent: '#47b985', difficulty: 'advanced' }
  ),
  t(
    'delivery_information',
    'Delivery Information',
    'Answer shipping questions',
    'Send delivery times and costs to anyone who asks.',
    'ecommerce',
    [msg('Here is how delivery works 🚚\n\n[your delivery info]')],
    { keywords: ['DELIVERY', 'SHIPPING'], icon: '🚚', accent: '#daa646' }
  ),
  t(
    'review_request',
    'Review Request',
    'Ask at the right moment',
    'Ask happy customers for a review and route anything negative to your team instead.',
    'ecommerce',
    [
      msg('So glad you liked it! 🙏'),
      choose('Would you leave us a quick review?', ['Sure', 'Maybe later']),
      msg('Thank you! Here is the link 👇\n\n[paste your link]'),
      notify('Review requested from {{handle}}'),
    ],
    { trigger: 'direct_message', icon: '⭐', accent: '#daa646', channels: ALL, difficulty: 'medium' }
  ),

  // --------------------------------------------------------------------- ai
  t(
    'ai_assistant',
    'AI Assistant',
    'When nothing else matches',
    'Falls back to an AI reply only when no rule or saved answer fits. Rules always win.',
    'ai',
    [ai('Answer their question briefly and in a friendly tone. If unsure, offer a human.'), notify('AI handled a message from {{handle}}')],
    { trigger: 'direct_message', icon: '🤖', accent: '#8b93a5', channels: ALL, comingSoon: true, difficulty: 'medium' }
  ),
  t(
    'ai_lead_qualification',
    'AI Lead Qualification',
    'Score before you spend time',
    'Let AI read the conversation and decide whether this is a real opportunity.',
    'ai',
    [
      ask('What are you looking for?', 'notes'),
      ai('Decide whether this is a serious enquiry. Reply helpfully either way.'),
      lead(['handle', 'notes']),
      notify('AI-qualified lead from {{handle}}'),
    ],
    { icon: '🧠', accent: '#8b93a5', channels: ALL, comingSoon: true, difficulty: 'advanced' }
  ),
  t(
    'ai_reply_translation',
    'AI Translation',
    'Reply in their language',
    'Detect the language someone wrote in and reply in it automatically.',
    'ai',
    [ai('Reply in the same language the person used. Keep it short and warm.')],
    { trigger: 'direct_message', icon: '🌍', accent: '#8b93a5', channels: ALL, comingSoon: true, difficulty: 'medium' }
  ),

  // ----------------------------------------------------------------- custom
  t(
    'custom',
    'Blank Workflow',
    'Start from nothing',
    'An empty canvas. Pick your own trigger and build the steps yourself.',
    'custom',
    [],
    { icon: '✏️', accent: '#8b93a5', channels: ALL, requiresMessaging: false }
  ),
];

export function templateByKey(key: string): AutomationTemplate | null {
  return TEMPLATES.find((t) => t.key === key) ?? null;
}

/** Templates a given channel can actually run. */
export function templatesForChannel(channel: ChannelKey): AutomationTemplate[] {
  return TEMPLATES.filter((t) => t.channels.includes(channel));
}
