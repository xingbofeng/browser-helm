import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
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
      void respondUnifiedAgentStream(request, response, 'BrowserHelm streaming 已合并到回复。 长页面正文已读取。');
      return;
    }
    if (rawPath === '/v1-slow/chat/completions') {
      void respondUnifiedAgentStream(request, response, '首轮流式 正在吐字 完成。');
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

async function respondUnifiedAgentStream(
  request: IncomingMessage,
  response: ServerResponse,
  finishMessage: string
): Promise<void> {
  const body = await readRequestBody(request);
  const hasArticleResult = requestHasArticleToolResult(body);
  const decision = hasArticleResult
    ? JSON.stringify({ type: 'finish', message: finishMessage })
    : JSON.stringify({
      type: 'tool_call',
      tool: 'bh_page_read_article',
      args: { maxChars: 36000, includeHeadings: true, includeLinks: true },
      reason: '读取长页面正文后再总结'
    });
  await writeSlowStream(response, splitIntoThreeChunks(decision));
}

function requestHasArticleToolResult(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { messages?: Array<{ content?: unknown }> };
    const messages = payload.messages ?? [];
    const content = [...messages].reverse().find((message) => typeof message.content === 'string')?.content;
    if (typeof content !== 'string') {
      return false;
    }
    const jsonStart = content.indexOf('{');
    const userContext = JSON.parse(jsonStart >= 0 ? content.slice(jsonStart) : content) as {
      lastToolResult?: {
        tool?: unknown;
        ok?: unknown;
      };
    };
    return userContext.lastToolResult?.tool === 'bh_page_read_article' &&
      userContext.lastToolResult.ok === true;
  } catch {
    return false;
  }
}

function readRequestBody(request: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function splitIntoThreeChunks(value: string): string[] {
  const first = Math.ceil(value.length / 3);
  const second = Math.ceil((value.length * 2) / 3);
  return [value.slice(0, first), value.slice(first, second), value.slice(second)];
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
  const extension = extname(filePath);
  if (extension === '.html') return 'text/html; charset=utf-8';
  if (extension === '.pdf') return 'application/pdf';
  return 'text/plain';
}
