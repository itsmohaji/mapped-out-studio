import { firstMediaPath } from './post.media';

describe('firstMediaPath', () => {
  it('returns null when there is no media', () => {
    expect(firstMediaPath(null)).toBeNull();
    expect(firstMediaPath({})).toBeNull();
    expect(firstMediaPath({ image: '' })).toBeNull();
    expect(firstMediaPath({ image: '[]' })).toBeNull();
  });

  it('reads the first item from the JSON string column', () => {
    expect(
      firstMediaPath({ image: '[{"id":"1","path":"/uploads/a.png"}]' })
    ).toBe('/uploads/a.png');
  });

  it('accepts an already-parsed array or single object', () => {
    expect(firstMediaPath({ image: [{ path: '/uploads/a.png' }] })).toBe(
      '/uploads/a.png'
    );
    expect(firstMediaPath({ image: { path: '/uploads/a.png' } })).toBe(
      '/uploads/a.png'
    );
  });

  it('prefers a thumbnail over the raw path', () => {
    expect(
      firstMediaPath({ image: [{ path: '/uploads/a.mp4', thumbnail: '/t.jpg' }] })
    ).toBe('/t.jpg');
  });

  it('never returns a video path (it would render as a broken <img>)', () => {
    for (const ext of ['mp4', 'mov', 'webm', 'm4v', 'avi']) {
      expect(firstMediaPath({ image: [{ path: `/uploads/a.${ext}` }] })).toBeNull();
    }
    expect(firstMediaPath({ image: [{ path: '/uploads/a.MP4?v=2' }] })).toBeNull();
  });

  it('survives malformed JSON instead of throwing into the calendar render', () => {
    expect(firstMediaPath({ image: 'not json' })).toBeNull();
    expect(firstMediaPath({ image: '[{' })).toBeNull();
  });
});
