/** Destroy an Uppy instance — after its uploads finish, if any are running. */
export const disposeUppy = (uppy: {
  getFiles: () => Array<{ progress?: { uploadStarted?: number | null; uploadComplete?: boolean } }>;
  once: (event: 'complete', cb: () => void) => unknown;
  destroy: () => void;
}) => {
  const busy = uppy
    .getFiles()
    .some((f) => f.progress?.uploadStarted && !f.progress?.uploadComplete);
  if (busy) uppy.once('complete', () => uppy.destroy());
  else uppy.destroy();
};
