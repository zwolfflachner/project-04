const ALLOWED_AUDIO_HOST = 'audio.radioparadise.stream';

export async function GET(request: Request) {
  const incoming = new URL(request.url);
  const source = incoming.searchParams.get('url');
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
  const upstream = await fetch(audioUrl, {
    headers: range ? { range } : undefined,
  });
  if (!upstream.ok && upstream.status !== 206) {
    return new Response('Audio unavailable', { status: 502 });
  }

  const headers = new Headers();
  for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set('cache-control', 'public, max-age=3600');

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}
