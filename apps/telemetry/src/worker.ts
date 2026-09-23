import { type D1Like, insertGuard, insertShift } from './db';
import { GuardRecordSchema, ShiftRecordSchema } from './schema';

export interface Env {
  readonly DB: D1Like;
  /** Comma-separated origins allowed to post; `https://*.example.com` matches subdomains. */
  readonly ALLOWED_ORIGINS?: string;
}

/** Records are a few KB; anything bigger isn't from the game. */
export const MAX_BODY_BYTES = 32_768;

/** The allowed origin to echo back, or null. */
export function allowedOrigin(origin: string | null, allowList: string | undefined): string | null {
  if (!origin) return null;
  for (const entry of (allowList ?? '').split(',').map((e) => e.trim())) {
    if (!entry) continue;
    if (entry === origin) return origin;
    const wild = /^(https?):\/\/\*\.(.+)$/.exec(entry);
    if (wild) {
      const [, scheme, domain] = wild;
      let url: URL;
      try {
        url = new URL(origin);
      } catch {
        continue;
      }
      if (url.protocol === `${scheme}:` && url.hostname.endsWith(`.${domain}`)) return origin;
    }
  }
  return null;
}

async function readBody(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) return null;
  const text = await request.text();
  return new TextEncoder().encode(text).length > MAX_BODY_BYTES ? null : text;
}

export interface Deps {
  readonly newId: () => string;
  readonly today: () => string;
}

export async function handle(request: Request, env: Env, deps: Deps): Promise<Response> {
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  const allowed = allowedOrigin(origin, env.ALLOWED_ORIGINS);
  const cors: Record<string, string> = allowed ? { 'access-control-allow-origin': allowed, vary: 'origin' } : {};
  const reply = (status: number, body: string | null = null) => new Response(body, { status, headers: cors });

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: allowed ? 204 : 403,
      headers: { ...cors, 'access-control-allow-methods': 'POST', 'access-control-max-age': '86400' },
    });
  }
  if (request.method === 'GET' && url.pathname === '/v1/health') return reply(200, 'ok');
  if (request.method !== 'POST') return reply(405);
  // Browsers always send Origin on a cross-site POST; refuse sites we don't know.
  if (origin !== null && !allowed) return reply(403);

  const text = await readBody(request);
  if (text === null) return reply(413);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return reply(400);
  }

  if (url.pathname === '/v1/shift') {
    const r = ShiftRecordSchema.safeParse(json);
    if (!r.success) return reply(400);
    await insertShift(env.DB, deps.newId(), deps.today(), r.data);
    return reply(204);
  }
  if (url.pathname === '/v1/guard') {
    const r = GuardRecordSchema.safeParse(json);
    if (!r.success) return reply(400);
    await insertGuard(env.DB, deps.newId(), deps.today(), r.data);
    return reply(204);
  }
  return reply(404);
}

export default {
  fetch: (request: Request, env: Env): Promise<Response> =>
    handle(request, env, {
      newId: () => crypto.randomUUID(),
      today: () => new Date().toISOString().slice(0, 10),
    }),
};
