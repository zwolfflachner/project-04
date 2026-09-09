const RADIO_API = 'https://api.radioparadise.com/api/get_block';
const CHANNELS_API = 'https://api.radioparadise.com/api/list_chan';
const ALLOWED_AUDIO_HOST = 'audio.radioparadise.stream';

function corsOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return '*';

  try {
    const url = new URL(origin);
    if (url.origin === 'https://zwolfflachner.github.io') return url.origin;
    if ((url.hostname === 'localhost' || url.hostname === '127.0.0.1') && url.protocol === 'http:') {
      return url.origin;
    }
  } catch {
    return null;
  }

  return null;
}

function withCors(request: Request, response: Response) {
  const origin = corsOrigin(request);
  if (!origin) return response;

  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', origin);
  headers.set('access-control-allow-methods', 'GET, OPTIONS');
  headers.set('access-control-allow-headers', 'Range');
  headers.set('access-control-expose-headers', 'Accept-Ranges, Content-Length, Content-Range');
  headers.append('vary', 'Origin');

  return new Response(response.body, { status: response.status, headers });
}

async function radioResponse(request: Request, url: URL) {
  if (url.searchParams.get('channels') === '1') {
    const result = await fetch(CHANNELS_API, { headers: { accept: 'application/json' } });
    if (!result.ok) return Response.json({ error: 'Channels unavailable' }, { status: 502 });
    const channels = await result.json() as { chan: string; title: string }[];
    return Response.json(channels.map(({ chan, title }) => ({ chan, title })));
  }

  const upstream = new URL(RADIO_API);
  upstream.searchParams.set('bitrate', '4');
  const channel = url.searchParams.get('chan') || '42';
  if (!/^\d{1,4}$/.test(channel)) return new Response('Invalid channel', { status: 400 });
  upstream.searchParams.set('chan', channel);
  upstream.searchParams.set('info', 'true');

  const event = url.searchParams.get('event');
  const elapsed = url.searchParams.get('elapsed');
  if (event && /^\d+$/.test(event)) upstream.searchParams.set('event', event);
  if (elapsed && /^\d+$/.test(elapsed)) upstream.searchParams.set('elapsed', elapsed);

  const result = await fetch(upstream, { headers: { accept: 'application/json' } });
  if (!result.ok) return Response.json({ error: 'Radio unavailable' }, { status: 502 });

  return new Response(result.body, {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

async function audioResponse(request: Request, url: URL) {
  const source = url.searchParams.get('url');
  if (!source) return new Response('Missing audio URL', { status: 400 });

  let audioUrl: URL;
  try {
    audioUrl = new URL(source);
  } catch {
    return new Response('Invalid audio URL', { status: 400 });
  }

  if (audioUrl.protocol !== 'https:' || audioUrl.hostname !== ALLOWED_AUDIO_HOST) {
    return new Response('Audio host is not allowed', { status: 403 });
  }

  const range = request.headers.get('range');
  const result = await fetch(audioUrl, { headers: range ? { range } : undefined });
  if (!result.ok && result.status !== 206) return new Response('Audio unavailable', { status: 502 });

  const headers = new Headers();
  for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
    const value = result.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set('cache-control', 'public, max-age=3600');

  return new Response(result.body, { status: result.status, headers });
}

export default {
  async fetch(request: Request) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      const origin = corsOrigin(request);
      return withCors(request, new Response(null, { status: origin ? 204 : 403 }));
    }

    if (request.method !== 'GET') return withCors(request, new Response('Method not allowed', { status: 405 }));

    let response: Response;
    if (url.pathname === '/api/radio') response = await radioResponse(request, url);
    else if (url.pathname === '/api/radio/audio') response = await audioResponse(request, url);
    else response = new Response('Not found', { status: 404 });

    return withCors(request, response);
  },
};
