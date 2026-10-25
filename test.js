// Room isolation check: a message sent in room A must not reach room B.
// Run with `npm test` (no Supabase needed; it uses a stub).
const assert = require('assert');
const WebSocket = require('ws');
const { createServer } = require('./server');

const stub = {
  from: () => ({
    select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }),
    insert: async () => ({ error: null }),
  }),
};

const open = (url) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.received = [];
    ws.on('message', (m) => ws.received.push(JSON.parse(m)));
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const server = createServer({ port: 0, supabase: stub });
  await new Promise((r) => server.on('listening', r));
  const base = `ws://localhost:${server.address().port}`;

  const a1 = await open(`${base}/roomA`);
  const a2 = await open(`${base}/roomA`);
  const b1 = await open(`${base}/roomB`);
  await wait(50);

  a1.send(JSON.stringify({ type: 'CHAT', email: 'a@x', content: 'hi A', full_name: 'A', avatar_url: '' }));
  a1.send(JSON.stringify({ type: 'PLAY_SONG', songId: 'song-1' }));
  b1.send('not json');
  await wait(100);

  // CHAT waits on the insert, so PLAY_SONG can arrive first; order isn't guaranteed.
  assert.deepStrictEqual(a2.received.map((m) => m.type).sort(), ['CHAT', 'PLAY_SONG']);
  assert.strictEqual(a2.received.find((m) => m.type === 'CHAT').content, 'hi A');
  assert.strictEqual(a1.received.length, 2, 'sender also gets its own room broadcast');
  assert.strictEqual(b1.received.length, 0, 'room B must not see room A traffic');

  [a1, a2, b1].forEach((ws) => ws.close());
  server.close();
  console.log('ok: room isolation');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
