import { persistExpiringImage } from '@gitroom/nestjs-libraries/upload/persist.expiring.image';

const IG = 'https://scontent-kul3-1.cdninstagram.com/v/t51/abc.jpg?stp=x&oe=123';

describe('persistExpiringImage', () => {
  it('stores our own copy of an Instagram CDN image', async () => {
    const upload = jest.fn(async () => 'https://app.example/uploads/2026/09/19/copy.jpg');
    await expect(persistExpiringImage(IG, upload)).resolves.toBe('https://app.example/uploads/2026/09/19/copy.jpg');
    expect(upload).toHaveBeenCalledWith(IG);
  });

  it('also covers Facebook CDN hosts', async () => {
    const upload = jest.fn(async () => 'copy');
    await persistExpiringImage('https://scontent.xx.fbcdn.net/v/p.jpg', upload);
    expect(upload).toHaveBeenCalled();
  });

  it('never fetches any other host (keeps the URL as is)', async () => {
    const upload = jest.fn();
    for (const u of ['https://example.com/a.jpg', 'http://169.254.169.254/latest', 'https://evilcdninstagram.com/x.jpg']) {
      await expect(persistExpiringImage(u, upload)).resolves.toBe(u);
    }
    expect(upload).not.toHaveBeenCalled();
  });

  it('keeps the original URL if the copy fails — never blocks the caller', async () => {
    await expect(persistExpiringImage(IG, async () => { throw new Error('403'); })).resolves.toBe(IG);
  });

  it('gives up after the timeout and keeps the original URL', async () => {
    jest.useFakeTimers();
    const p = persistExpiringImage(IG, () => new Promise(() => undefined), 5000);
    jest.advanceTimersByTime(5000);
    await expect(p).resolves.toBe(IG);
    jest.useRealTimers();
  });

  it('passes empty values through', async () => {
    await expect(persistExpiringImage(null, jest.fn())).resolves.toBeNull();
    await expect(persistExpiringImage('not a url', jest.fn())).resolves.toBe('not a url');
  });
});
