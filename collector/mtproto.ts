import 'dotenv/config';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { NewMessage } from 'telegram/events/index.js';

const apiId = Number(process.env.TELEGRAM_API_ID || 0);
const apiHash = process.env.TELEGRAM_API_HASH || '';
const session = process.env.TELEGRAM_SESSION || '';
const ingestUrl = process.env.INGEST_URL || 'http://localhost:8787/api/collector/ingest';
const ingestSecret = process.env.INGEST_SECRET || '';
const syncCount = Math.max(0, Number(process.env.MTPROTO_SYNC_COUNT || 10));
const sources = (process.env.MTPROTO_SOURCES || 'pashagoldd,borsat_alkfah,Borsa_Erbil,PMCgroup,nrxidolar,iraqborsa,RaprsyWnrx,borsakurdstan,httpswyTu0W4VrKZkMGZi,Ranyadollar,kurddolar,NrxiDraw24,nrxidraw852,YarGold_Co')
  .split(',').map(x => x.trim().replace(/^@/, '')).filter(Boolean);

if (!apiId || !apiHash || !session || !ingestSecret) throw new Error('TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_SESSION and INGEST_SECRET are required');

const client = new TelegramClient(new StringSession(session), apiId, apiHash, { connectionRetries: 10 });
const seen = new Set<string>();

async function send(username: string, msg: any) {
  const text = String(msg.message || '');
  if (!text) return;
  const key = `${username}:${msg.id}`;
  if (seen.has(key)) return;
  seen.add(key);
  const payload = {
    chat: { id: String(msg.chatId || ''), username: '@' + username, title: String(msg.chat?.title || username) },
    message: { message_id: Number(msg.id), date: Number(msg.date || Math.floor(Date.now() / 1000)), text, caption: text },
    telegram_url: `https://t.me/${username}/${msg.id}`
  };
  try {
    const r = await fetch(ingestUrl, { method: 'POST', headers: { 'content-type': 'application/json', 'x-ingest-secret': ingestSecret }, body: JSON.stringify(payload) });
    const body = await r.text();
    if (!r.ok) console.error(`[INGEST ERROR] @${username}/${msg.id} ${r.status} ${body}`);
    else console.log(`[PRICE PIPELINE] @${username}/${msg.id} accepted: ${body.slice(0, 500)}`);
  } catch (e: any) { console.error(`[INGEST ERROR] @${username}/${msg.id}: ${e.message}`); }
}

async function main() {
  await client.connect();
  const me = await client.getMe();
  console.log(`[MTPROTO] connected as ${me.username ? '@' + me.username : me.id}`);
  const entities: any[] = [];
  for (const username of sources) {
    try { const entity = await client.getEntity(username); entities.push(entity); console.log(`[MTPROTO] watching @${username}`); }
    catch (e: any) { console.error(`[MTPROTO] cannot resolve @${username}: ${e.message}`); }
  }
  if (syncCount > 0) {
    console.log(`[MTPROTO] syncing last ${syncCount} messages per source...`);
    for (const entity of entities) {
      try {
        const username = String((entity as any).username || '').replace(/^@/, '');
        const messages = await client.getMessages(entity, { limit: syncCount });
        for (const msg of [...messages].reverse()) await send(username, msg);
        console.log(`[MTPROTO] sync complete @${username}: ${messages.length} messages`);
      } catch (e: any) { console.error(`[MTPROTO] sync failed: ${e.message}`); }
    }
  }
  client.addEventHandler(async (event: any) => {
    const msg = event.message;
    if (!msg?.message) return;
    try {
      const chat = await msg.getChat();
      const username = String((chat as any)?.username || '').replace(/^@/, '');
      if (!username || !sources.includes(username)) return;
      console.log(`[MTPROTO] NEW MESSAGE @${username}/${msg.id}: ${String(msg.message).slice(0, 180)}`);
      await send(username, msg);
    } catch (e: any) { console.error(`[MTPROTO] event error: ${e.message}`); }
  }, new NewMessage({ chats: entities }));
  console.log('[MTPROTO] listening for new source posts...');
  await new Promise(() => {});
}

main().catch(e => { console.error('[MTPROTO FATAL]', e); process.exit(1); });
