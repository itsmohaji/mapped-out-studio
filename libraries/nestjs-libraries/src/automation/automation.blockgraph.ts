/**
 * Blocks ⇄ engine nodes.
 *
 * The builder edits BLOCKS ("Ask a Question"). The engine runs NODES
 * ("send a message", "wait for a reply", "save the answer"). One block can be
 * three nodes.
 *
 * Translating here rather than teaching the engine about blocks is deliberate:
 * a stateful "ask" node would need to be visited twice — send, then collect —
 * which the cursor model does not do, and inventing that would put new failure
 * modes into the one part of this system that is fully tested. Expansion is a
 * pure function instead, so a card is a card and the engine stays boring.
 *
 * Round-tripping is the contract: collapse(expand(blocks)) === blocks.
 */

import { BlockKind } from './automation.blocks';

export interface Block {
  /** Stable across saves. A running conversation's cursor points into it. */
  id: string;
  kind: BlockKind;
  config: Record<string, any>;
}

export interface FlatNode {
  id: string;
  parentId: string | null;
  branchKey: string | null;
  kind: string;
  config: Record<string, any>;
  position: number;
}

/**
 * Render buttons into the message body.
 *
 * Our Instagram send path is plain text today, so buttons become a numbered
 * list the contact can reply to. That is a real limitation and the UI says so —
 * silently dropping the buttons, or pretending they render natively, would both
 * be worse than a numbered list that actually works.
 */
export function renderButtons(message: string, buttons?: string[]): string {
  const list = (buttons ?? []).filter((b) => b && b.trim());
  if (!list.length) return message ?? '';
  const options = list.map((b, i) => `${i + 1}. ${b.trim()}`).join('\n');
  return `${(message ?? '').trim()}\n\n${options}`.trim();
}

/** Sub-node ids are derived, so they stay stable across saves. */
const sub = (blockId: string, role: string) => `${blockId}__${role}`;

function nodesForBlock(block: Block): { kind: string; role: string; config: Record<string, any> }[] {
  const c = block.config ?? {};

  switch (block.kind) {
    case 'send_message':
      return [{ kind: 'send_dm', role: 'msg', config: { message: c.message ?? '' } }];

    case 'show_buttons':
      return [
        {
          kind: 'send_dm',
          role: 'msg',
          config: { message: renderButtons(c.message ?? '', c.buttons) },
        },
      ];

    case 'ask_question':
      // The three moves that make a question: say it, wait, keep the answer.
      return [
        {
          kind: 'send_dm',
          role: 'msg',
          config: { message: renderButtons(c.question ?? '', c.buttons) },
        },
        { kind: 'wait_reply', role: 'wait', config: { timeoutDays: c.timeoutDays ?? 7 } },
        { kind: 'collect_field', role: 'save', config: { field: c.saveAs ?? 'answer' } },
      ];

    case 'wait':
      return [{ kind: 'wait', role: 'wait', config: { minutes: c.minutes ?? 5 } }];

    case 'condition':
      return [{ kind: 'branch', role: 'branch', config: { conditions: c.conditions ?? [] } }];

    case 'collect_information':
      return [{ kind: 'collect_field', role: 'save', config: { field: c.saveAs ?? 'answer' } }];

    case 'create_lead':
      return [
        { kind: 'create_lead', role: 'lead', config: { fields: c.fields ?? [], assignTo: c.assignTo ?? null } },
      ];

    case 'add_tag':
      return [{ kind: 'add_tag', role: 'tag', config: { tags: c.tags ?? [] } }];

    case 'notify_team':
      return [{ kind: 'notify_team', role: 'notify', config: { message: c.message ?? '' } }];

    case 'ai_action':
      return [{ kind: 'ai_reply', role: 'ai', config: { instruction: c.instruction ?? '' } }];

    default:
      return [];
  }
}

/**
 * Blocks → a linear node chain.
 *
 * Every emitted node carries `_block`, which is what lets collapse() put the
 * card back together. Without it a saved workflow would reopen as nine
 * disconnected engine steps instead of three blocks.
 */
export function expandBlocks(blocks: Block[]): FlatNode[] {
  const out: FlatNode[] = [];
  let previousId: string | null = null;
  let position = 0;

  for (const block of blocks ?? []) {
    const parts = nodesForBlock(block);
    for (const part of parts) {
      const id = parts.length === 1 ? block.id : sub(block.id, part.role);
      out.push({
        id,
        parentId: previousId,
        branchKey: null,
        kind: part.kind,
        config: {
          ...part.config,
          _block: { id: block.id, kind: block.kind, role: part.role },
        },
        position: position++,
      });
      previousId = id;
    }
  }

  return out;
}

/**
 * Node chain → blocks.
 *
 * Nodes without `_block` are from an older save (or hand-edited) and each
 * become their own block, mapped back to the closest human equivalent. Dropping
 * them would silently delete steps on the next save.
 */
export function collapseNodes(nodes: FlatNode[]): Block[] {
  const order: string[] = [];
  const byBlock = new Map<string, { kind: BlockKind; parts: FlatNode[] }>();

  for (const node of nodes ?? []) {
    const marker = node.config?._block;
    const blockId = marker?.id ?? node.id;
    const kind: BlockKind = marker?.kind ?? legacyKind(node.kind);

    if (!byBlock.has(blockId)) {
      byBlock.set(blockId, { kind, parts: [] });
      order.push(blockId);
    }
    byBlock.get(blockId)!.parts.push(node);
  }

  return order.map((id) => {
    const { kind, parts } = byBlock.get(id)!;
    return { id, kind, config: configFor(kind, parts) };
  });
}

/** Map a raw engine kind back to the friendliest block that represents it. */
function legacyKind(nodeKind: string): BlockKind {
  switch (nodeKind) {
    case 'send_dm':
    case 'send_template':
    case 'reply_comment':
      return 'send_message';
    case 'wait_reply':
    case 'wait':
      return 'wait';
    case 'branch':
    case 'split':
      return 'condition';
    case 'collect_field':
      return 'collect_information';
    case 'create_lead':
      return 'create_lead';
    case 'add_tag':
      return 'add_tag';
    case 'notify_team':
    case 'assign_manager':
      return 'notify_team';
    case 'ai_reply':
    case 'ai_qualify':
    case 'generate_ai_response':
      return 'ai_action';
    default:
      return 'send_message';
  }
}

function configFor(kind: BlockKind, parts: FlatNode[]): Record<string, any> {
  const byRole = (role: string) => parts.find((p) => p.config?._block?.role === role);
  const first = parts[0];

  switch (kind) {
    case 'ask_question': {
      const msg = byRole('msg') ?? first;
      const wait = byRole('wait');
      const save = byRole('save');
      const { text, buttons } = splitButtons(msg?.config?.message ?? '');
      return {
        question: text,
        buttons,
        saveAs: save?.config?.field ?? 'answer',
        timeoutDays: wait?.config?.timeoutDays ?? 7,
      };
    }
    case 'show_buttons': {
      const { text, buttons } = splitButtons(first?.config?.message ?? '');
      return { message: text, buttons };
    }
    case 'send_message':
      return { message: first?.config?.message ?? '' };
    case 'wait':
      return first?.kind === 'wait_reply'
        ? { minutes: 0, timeoutDays: first?.config?.timeoutDays ?? 7 }
        : { minutes: first?.config?.minutes ?? 5 };
    case 'condition':
      return { conditions: first?.config?.conditions ?? [] };
    case 'collect_information':
      return { saveAs: first?.config?.field ?? 'answer' };
    case 'create_lead':
      return { fields: first?.config?.fields ?? [], assignTo: first?.config?.assignTo ?? null };
    case 'add_tag':
      return { tags: first?.config?.tags ?? [] };
    case 'notify_team':
      return { message: first?.config?.message ?? '' };
    case 'ai_action':
      return { instruction: first?.config?.instruction ?? '' };
    default:
      return {};
  }
}

/**
 * Undo renderButtons.
 *
 * Only treats a trailing run of "N. label" lines as buttons, so a message that
 * happens to contain a numbered list in the middle is left alone.
 */
export function splitButtons(body: string): { text: string; buttons: string[] } {
  const lines = (body ?? '').split('\n');
  const buttons: string[] = [];

  let end = lines.length;
  while (end > 0) {
    const line = lines[end - 1].trim();
    if (!line) {
      end--;
      continue;
    }
    const m = /^(\d+)\.\s+(.+)$/.exec(line);
    if (!m) break;
    buttons.unshift(m[2].trim());
    end--;
  }

  // A single numbered line is far more likely to be prose than a button set.
  if (buttons.length < 2) return { text: (body ?? '').trim(), buttons: [] };

  return { text: lines.slice(0, end).join('\n').trim(), buttons };
}
