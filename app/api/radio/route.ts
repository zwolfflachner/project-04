const RADIO_API = 'https://api.radioparadise.com/api/get_block';

export async function GET(request: Request) {
  const incoming = new URL(request.url);
  if (incoming.searchParams.get('channels') === '1') {
    const result = await fetch('https://api.radioparadise.com/api/list_chan');
    if (!result.ok) return Response.json({ error: 'Channels unavailable' }, { status: 502 });
    const channels = await result.json() as { chan: string; title: string }[];
    return Response.json(channels.map(({ chan, title }) => ({ chan, title })));
  }
  const upstream = new URL(RADIO_API);
  upstream.searchParams.set('bitrate', '4');
  const channel = incoming.searchParams.get('chan') || '42';
  if (!/^\d{1,4}$/.test(channel)) return new Response('Invalid channel', { status: 400 });
  upstream.searchParams.set('chan', channel);
  upstream.searchParams.set('info', 'true');

  const event = incoming.searchParams.get('event');
  const elapsed = incoming.searchParams.get('elapsed');
  if (event && /^\d+$/.test(event)) upstream.searchParams.set('event', event);
  if (elapsed && /^\d+$/.test(elapsed)) upstream.searchParams.set('elapsed', elapsed);

  const response = await fetch(upstream, { headers: { accept: 'application/json' } });
  if (!response.ok) return Response.json({ error: 'Radio unavailable' }, { status: 502 });

  const block = await response.json();
  return Response.json(block, { headers: { 'cache-control': 'no-store' } });
}
