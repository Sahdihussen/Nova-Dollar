import 'dotenv/config';

function localTime() {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Baghdad', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
}

export default async function handler(req: any, res: any) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'unauthorized' });
  const time = localTime();
  const open = process.env.OPEN_TIME || '10:00';
  const close = process.env.CLOSE_TIME || '17:30';
  const base = process.env.APP_URL;
  if (!base) return res.status(500).json({ error: 'APP_URL missing' });
  let type: string | null = null;
  if (time === open) type = 'OPEN';
  if (time === close) type = 'CLOSE';
  if (!type) return res.status(200).json({ ok: true, skipped: true, time });
  const r = await fetch(`${base.replace(/\/$/, '')}/api/publish/${type}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  const body = await r.text();
  res.status(r.status).setHeader('content-type', 'application/json').send(body);
}
