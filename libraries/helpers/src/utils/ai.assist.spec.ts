import {
  buildAskPrompt,
  buildCaptionPrompt,
  captionAction,
  CAPTION_ACTIONS,
  creditsForTask,
  isVideoPath,
  mediaSummary,
  pageContextFor,
  platformLimit,
  taskWeight,
  visionImages,
} from './ai.assist';

describe('pageContextFor', () => {
  it('maps the pages the brief names, with the headline prompt first', () => {
    expect(pageContextFor('/automation').suggestions[0]).toBe(
      'Help me build this automation.'
    );
    expect(pageContextFor('/analytics').suggestions[0]).toBe(
      'Analyze these analytics.'
    );
    expect(pageContextFor('/reports').suggestions[0]).toBe(
      'Summarize this report.'
    );
    expect(pageContextFor('/leads').suggestions[0]).toBe(
      'Which leads should I contact first?'
    );
  });

  it('treats a detail route as its page — /leads/abc is still Leads', () => {
    expect(pageContextFor('/leads/abc-123-def').page).toBe('leads');
    expect(pageContextFor('/campaigns/9/edit').page).toBe('campaigns');
  });

  it('survives a locale prefix, because the segment scan is not positional', () => {
    expect(pageContextFor('/ar/analytics').page).toBe('analytics');
    expect(pageContextFor('/en-GB/automation/flow-1').page).toBe('automation');
  });

  it('falls back rather than guessing, and still offers something to type', () => {
    const ctx = pageContextFor('/somewhere-we-have-never-heard-of');
    expect(ctx.page).toBe('other');
    expect(ctx.suggestions.length).toBeGreaterThan(0);
    expect(ctx.task).toBe('chat');
  });

  it('handles empty, null and query strings without throwing', () => {
    expect(pageContextFor('').page).toBe('other');
    expect(pageContextFor(null).page).toBe('other');
    expect(pageContextFor('/reports?range=30').page).toBe('reports');
  });

  it('routes each page to a task the router knows', () => {
    const known = [
      'caption',
      'strategy',
      'research',
      'recommendation',
      'summarize',
      'translate',
      'chat',
      'vision',
    ];
    for (const path of [
      '/dashboard',
      '/automation',
      '/analytics',
      '/reports',
      '/leads',
      '/launches',
      '/campaigns',
      '/clients',
      '/accounts',
      '/post-library',
      '/tasks',
      '/team',
      '/settings',
    ]) {
      expect(known).toContain(pageContextFor(path).task);
    }
  });
});

describe('caption actions', () => {
  it('exposes every action the brief asks for', () => {
    const keys = CAPTION_ACTIONS.map((a) => a.key);
    for (const k of [
      'suggest',
      'improve',
      'shorten',
      'professional',
      'engaging',
      'cta',
      'hashtags',
      'translate',
    ]) {
      expect(keys).toContain(k);
    }
  });

  it('only "suggest" can run on an empty caption', () => {
    expect(captionAction('suggest')!.needsExisting).toBe(false);
    for (const a of CAPTION_ACTIONS.filter((x) => x.key !== 'suggest')) {
      expect(a.needsExisting).toBe(true);
    }
  });

  it('returns null for an action that does not exist', () => {
    expect(captionAction('delete_everything')).toBeNull();
  });
});

describe('visionImages', () => {
  it('sends an image by its own url', () => {
    expect(visionImages([{ path: 'https://x/a.jpg' }])).toEqual([
      'https://x/a.jpg',
    ]);
  });

  it('sends a video by its POSTER, never the video url', () => {
    const out = visionImages([
      { path: 'https://x/clip.mp4', thumbnail: 'https://x/clip.png' },
    ]);
    expect(out).toEqual(['https://x/clip.png']);
    expect(out.join()).not.toContain('.mp4');
  });

  it('drops a video that has no poster rather than sending an mp4', () => {
    expect(visionImages([{ path: 'https://x/clip.mov' }])).toEqual([]);
  });

  it('caps how many images are sent', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      path: `https://x/${i}.jpg`,
    }));
    expect(visionImages(many, 4)).toHaveLength(4);
  });

  it('is safe on empty and undefined input', () => {
    expect(visionImages([])).toEqual([]);
    expect(visionImages(undefined as any)).toEqual([]);
  });

  it('lets an extensionless upload path through', () => {
    expect(visionImages([{ path: '/uploads/2026/a1b2c3d4' }])).toEqual([
      '/uploads/2026/a1b2c3d4',
    ]);
  });
});

describe('isVideoPath / mediaSummary', () => {
  it('recognises video regardless of a query string', () => {
    expect(isVideoPath('https://x/a.mp4?v=2')).toBe(true);
    expect(isVideoPath('https://x/a.jpg')).toBe(false);
    expect(isVideoPath(null)).toBe(false);
  });

  it('counts images and videos separately', () => {
    expect(
      mediaSummary([
        { path: 'a.jpg' },
        { path: 'b.png' },
        { path: 'c.mp4' },
      ])
    ).toBe('2 images and 1 video attached.');
    expect(mediaSummary([])).toBe('No media is attached.');
  });
});

describe('creditsForTask', () => {
  it('never charges zero for a successful run', () => {
    expect(creditsForTask('caption', 0, 0)).toBe(1);
    expect(creditsForTask('caption', null, null)).toBe(1);
  });

  it('charges more for reasoning than for a caption on the same tokens', () => {
    expect(creditsForTask('strategy', 3000, 1000)).toBeGreaterThan(
      creditsForTask('caption', 3000, 1000)
    );
  });

  it('scales with tokens', () => {
    expect(creditsForTask('caption', 10000, 0)).toBeGreaterThan(
      creditsForTask('caption', 1000, 0)
    );
  });

  it('treats an unknown task as the cheapest weight rather than free', () => {
    expect(taskWeight('something_new')).toBe(1);
    expect(creditsForTask('something_new', 0, 0)).toBe(1);
  });
});

describe('buildCaptionPrompt', () => {
  it('tells a vision-capable run to look at the media first', () => {
    const { instruction } = buildCaptionPrompt({
      action: 'suggest',
      canSeeMedia: true,
      media: [{ path: 'a.jpg' }],
    });
    expect(instruction).toContain('Look at it first');
    expect(instruction).not.toContain('You cannot see');
  });

  it('tells a text-only run not to describe media it has not seen', () => {
    const { instruction } = buildCaptionPrompt({
      action: 'suggest',
      canSeeMedia: false,
      media: [{ path: 'a.jpg' }],
    });
    expect(instruction).toContain('cannot see the attached media');
    expect(instruction).toContain('do not describe anything you have not been told');
  });

  it('carries the platform limit', () => {
    expect(platformLimit('x')).toBe(280);
    expect(platformLimit('instagram')).toBe(2200);
    expect(platformLimit('nowhere')).toBeNull();
    const { instruction } = buildCaptionPrompt({
      action: 'suggest',
      platform: 'x',
      canSeeMedia: false,
    });
    expect(instruction).toContain('280 characters');
  });

  it('always carries the no-invention rules', () => {
    for (const a of CAPTION_ACTIONS) {
      const { instruction } = buildCaptionPrompt({
        action: a.key,
        existing: 'hello',
        canSeeMedia: false,
      });
      expect(instruction).toContain('Never invent a fact');
    }
  });

  it('puts the existing caption in the input for an edit action', () => {
    const { input } = buildCaptionPrompt({
      action: 'shorten',
      existing: 'a very long caption',
      canSeeMedia: false,
    });
    expect(input).toContain('a very long caption');
  });

  it('forbids inventing an offer when adding a CTA — the obvious failure mode', () => {
    const { instruction } = buildCaptionPrompt({
      action: 'cta',
      existing: 'hi',
      canSeeMedia: false,
    });
    expect(instruction).toContain('never invent a link, a discount, a code');
  });
});

describe('buildAskPrompt', () => {
  it('names the page the user is on', () => {
    const p = buildAskPrompt(pageContextFor('/analytics'));
    expect(p).toContain('Analytics');
  });

  it('names the client when one is selected, and says so when none is', () => {
    expect(buildAskPrompt(pageContextFor('/leads'), 'Epoque')).toContain('Epoque');
    expect(buildAskPrompt(pageContextFor('/leads'))).toContain(
      'No single client is selected'
    );
  });
});
