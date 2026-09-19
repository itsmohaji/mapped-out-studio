import { thumbnailUrl } from '@gitroom/react/helpers/image.url';

const UPLOAD = 'https://social.mappedout.co/uploads/2026/08/29/abc.jpeg';

describe('thumbnailUrl', () => {
  it('asks the optimiser for a size bucket matching the display size (2x density)', () => {
    expect(thumbnailUrl(UPLOAD, 34)).toBe(`/_next/image?url=${encodeURIComponent(UPLOAD)}&w=96&q=75`);
    expect(thumbnailUrl(UPLOAD, 192)).toContain('&w=384&');
  });

  it('covers Instagram and Facebook CDN images', () => {
    expect(thumbnailUrl('https://scontent-kul3-1.cdninstagram.com/v/x.jpg?oe=1', 38)).toMatch(/^\/_next\/image\?url=/);
    expect(thumbnailUrl('https://scontent.xx.fbcdn.net/v/x.jpg', 38)).toMatch(/^\/_next\/image\?url=/);
  });

  it('leaves everything else alone', () => {
    for (const src of [
      '/uploads/2026/08/29/abc.jpeg', // relative: would go through the Next uploads route
      '/icons/platforms/instagram.png',
      'https://example.com/a.jpg',
      'https://evilcdninstagram.com/a.jpg',
      'https://social.mappedout.co/uploads/x.svg',
      'https://social.mappedout.co/uploads/x.gif',
      'https://social.mappedout.co/uploads/x.mp4',
      'data:image/png;base64,AAAA',
      'blob:https://social.mappedout.co/1',
    ]) {
      expect(thumbnailUrl(src, 64)).toBe(src);
    }
    expect(thumbnailUrl('', 64)).toBe('');
    expect(thumbnailUrl(UPLOAD, 0)).toBe(UPLOAD);
  });

  it('never asks for more than the largest size', () => {
    expect(thumbnailUrl(UPLOAD, 5000)).toContain('&w=3840&');
  });
});
