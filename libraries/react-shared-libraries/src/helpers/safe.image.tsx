'use client';

import { FC, useEffect, useState } from 'react';
import { ImageProps } from 'next/image';
import { thumbnailUrl } from '@gitroom/react/helpers/image.url';

type SafeImageProps = Omit<ImageProps, 'src'> & {
  src: string;
};

/**
 * <img> that asks for a thumbnail sized to its `width` (see image.url.ts),
 * loads lazily, and never shows a broken image: if the thumbnail fails it
 * falls back to the original, and if that fails too (e.g. an expired
 * Instagram link) it stays invisible instead of showing the broken icon.
 */
const SafeImage: FC<SafeImageProps> = ({
  src,
  alt,
  width,
  height,
  className,
  style,
  priority,
  onClick,
}) => {
  const optimised = typeof width === 'number' ? thumbnailUrl(src, width) : src;
  // 0: thumbnail, 1: original, 2: give up (hidden)
  const [stage, setStage] = useState(0);
  useEffect(() => setStage(0), [src]);
  return (
    <img
      src={stage === 0 ? optimised : src}
      alt={alt?.toString() || ''}
      width={typeof width === 'number' ? width : undefined}
      height={typeof height === 'number' ? height : undefined}
      className={className}
      style={stage === 2 ? { ...style, visibility: 'hidden' } : style}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      onClick={onClick as any}
      onError={() => setStage((s) => (s === 0 && optimised !== src ? 1 : 2))}
    />
  );
};

export default SafeImage;
