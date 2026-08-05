import { threadTitleFrom, DEFAULT_FOLDERS, STARTER_CARDS } from './ai.threads';

describe('threadTitleFrom', () => {
  it('uses the first line of the question', () => {
    expect(threadTitleFrom('Why did the Reel flop?\nMore detail')).toBe(
      'Why did the Reel flop?'
    );
  });

  it('truncates long questions on a word boundary', () => {
    const title = threadTitleFrom('a'.repeat(20) + ' ' + 'b'.repeat(80));
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title.endsWith('…')).toBe(true);
  });

  it('never returns an empty title', () => {
    expect(threadTitleFrom('')).toBe('New chat');
    expect(threadTitleFrom('   \n  ')).toBe('New chat');
  });

  it('collapses whitespace', () => {
    expect(threadTitleFrom('  what   should   we post ')).toBe(
      'what should we post'
    );
  });
});

describe('starter cards', () => {
  it('every card names a real folder', () => {
    for (const c of STARTER_CARDS) expect(DEFAULT_FOLDERS).toContain(c.folder);
  });

  it('automatic cards take no channel input', () => {
    for (const c of STARTER_CARDS) {
      if (c.mode === 'automatic') expect(c.prefill).toBe('');
    }
  });

  it('assisted cards carry a prefill for the composer', () => {
    for (const c of STARTER_CARDS) {
      if (c.mode === 'assisted') expect(c.prefill.length).toBeGreaterThan(0);
    }
  });
});
