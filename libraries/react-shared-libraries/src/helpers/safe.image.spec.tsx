/**
 * @jest-environment ./jest.jsdom.env.cjs
 */
import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import SafeImage from '@gitroom/react/helpers/safe.image';

const UPLOAD = 'https://social.mappedout.co/uploads/2026/08/29/abc.jpeg';

describe('SafeImage', () => {
  it('requests a thumbnail sized to its width, lazily', () => {
    const { container } = render(<SafeImage src={UPLOAD} width={34} height={34} alt="" />);
    const img = container.querySelector('img')!;
    expect(img.getAttribute('src')).toMatch(/^\/_next\/image\?url=.*&w=96&q=75$/);
    expect(img.getAttribute('loading')).toBe('lazy');
  });

  it('falls back to the original if the thumbnail fails, then hides instead of showing a broken image', () => {
    const { container } = render(<SafeImage src={UPLOAD} width={34} alt="" />);
    const img = container.querySelector('img')!;
    fireEvent.error(img);
    expect(img.getAttribute('src')).toBe(UPLOAD);
    expect(img.style.visibility).toBe('');
    fireEvent.error(img);
    expect(img.style.visibility).toBe('hidden');
  });

  it('leaves non-optimisable images exactly as before', () => {
    const { container } = render(<SafeImage src="/icons/platforms/x.png" width={18} alt="" />);
    expect(container.querySelector('img')!.getAttribute('src')).toBe('/icons/platforms/x.png');
  });

  it('keeps click handlers working', () => {
    const onClick = jest.fn();
    const { container } = render(<SafeImage src={UPLOAD} width={200} alt="" onClick={onClick} />);
    fireEvent.click(container.querySelector('img')!);
    expect(onClick).toHaveBeenCalled();
  });
});
