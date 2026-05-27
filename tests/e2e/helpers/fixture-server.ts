import { createServer, type Server, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

export type FixtureServer = {
  origin: string;
  close: () => Promise<void>;
};

export async function startFixtureServer(): Promise<FixtureServer> {
  const root = join(process.cwd(), 'tests/e2e/fixtures');
  const server = createServer((request, response) => {
    const rawPath = request.url?.split('?')[0] ?? '/basic-form.html';
    if (rawPath === '/v1/chat/completions') {
      const chunks = [
        'BrowserHelm streaming ',
        '已合并到回复。',
        ' 长页面正文已读取。'
      ];
      response.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache'
      });
      for (const chunk of chunks) {
        response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`);
      }
      response.end('data: [DONE]\n\n');
      return;
    }
    if (rawPath === '/v1-slow/chat/completions') {
      void writeSlowStream(response, [
        '首轮流式 ',
        '正在吐字 ',
        '完成。'
      ]);
      return;
    }
    const filePath = normalize(join(root, rawPath));
    if (!filePath.startsWith(root)) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }

    try {
      const body = readFileSync(filePath);
      response.writeHead(200, {
        'content-type': contentType(filePath)
      });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end('Not found');
    }
  });

  await listen(server);
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Fixture server did not bind to a port');
  }

  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      })
  };
}

async function writeSlowStream(
  response: ServerResponse,
  chunks: string[]
): Promise<void> {
  response.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache'
  });
  for (const chunk of chunks) {
    response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`);
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  response.end('data: [DONE]\n\n');
}

function listen(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
}

function contentType(filePath: string): string {
  return extname(filePath) === '.html' ? 'text/html; charset=utf-8' : 'text/plain';
}
