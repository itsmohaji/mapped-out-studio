import { resolveUploadPath } from './resolve.upload.path';

describe('resolveUploadPath', () => {
  const root = '/uploads';
  it('resolves ordinary upload paths inside the directory', () => {
    expect(resolveUploadPath(root, ['2026', '08', '29', 'abc.jpeg'])).toBe('/uploads/2026/08/29/abc.jpeg');
  });
  it('refuses anything that could leave the directory', () => {
    for (const segs of [['..', 'etc', 'passwd'], ['2026', '..', '..', 'x'], ['a/../../b'], ['a\\..\\b'], ['.'], [''], ['x\0y'], []]) {
      expect([segs, resolveUploadPath(root, segs)]).toEqual([segs, null]);
    }
  });
  it('refuses when no upload directory is configured', () => {
    expect(resolveUploadPath(undefined, ['a.jpg'])).toBeNull();
  });
});
