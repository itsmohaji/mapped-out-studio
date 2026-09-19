import { NextRequest, NextResponse } from 'next/server';
import { createReadStream, statSync } from 'fs';
// @ts-ignore
import mime from 'mime';
import { resolveUploadPath } from './resolve.upload.path';
async function* nodeStreamToIterator(stream: any) {
  for await (const chunk of stream) {
    yield chunk;
  }
}
function iteratorToStream(iterator: any) {
  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) {
        controller.close();
      } else {
        controller.enqueue(new Uint8Array(value));
      }
    },
  });
}
export const GET = async (
  request: NextRequest,
  context: {
    params: Promise<{
      path?: string[];
    }>;
  }
) => {
  const { path } = await context.params;
  const filePath = resolveUploadPath(process.env.UPLOAD_DIRECTORY, path ?? []);
  const fileStats = filePath ? statSync(filePath, { throwIfNoEntry: false }) : undefined;
  if (!filePath || !fileStats?.isFile()) {
    return new Response('Not found', { status: 404 });
  }
  const response = createReadStream(filePath);
  const contentType = mime.getType(filePath) || 'application/octet-stream';
  const iterator = nodeStreamToIterator(response);
  const webStream = iteratorToStream(iterator);
  return new Response(webStream, {
    headers: {
      'Content-Type': contentType,
      // Set the appropriate content-type header
      'Content-Length': fileStats.size.toString(),
      // Set the content-length header
      'Last-Modified': fileStats.mtime.toUTCString(),
      // Set the last-modified header
      'Cache-Control': 'public, max-age=31536000, immutable', // Example cache-control header
    },
  });
};
