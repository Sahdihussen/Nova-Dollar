import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const app = express();
const PORT = Number(process.env.PORT || 8787);
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || true }));
app.use(express.json({ limit: '4mb' }));

const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

const defaults: Record<string, any> = {
  validation: { enabled: true, minRate: 140000, maxRate: 165000, warningOnly: false, anomalyEnabled: true, anomalyDelta: 3000, anomalyWindowMinutes: 10, freshnessMinutes: 180 },
  publishing: { enabled: false, livePriceEnabled: true, minConfidence: .8, minIndependentSources: 1, maxPostsPerHour: 30, quietStart: '23:00', quietEnd: '08:00', radarEnabled: true, radarDelta: 250, radarWindowMinutes: 60, openTime: '10:00', closeTime: '17:30' },
  market: { defaultCity: 'SULAYMANIYAH', headlineCategory: 'STANDARD_MIX', freshnessMinutes: 180, radarDelta: 250, radarWindowMinutes: 60 },
  polling: { enabled: true, peakIntervalMinutes: 2, normalIntervalMinutes: 5, nightIntervalMinutes: 15, timezone: 'Asia/Baghdad', peakStart: '10:00', peakEnd: '18:00' },
  ai: { enabled: true, provider: 'groq', endpoint: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.3-70b-versatile', temperature: 0, maxTokens: 2200 },
  commodities: { silverKgEnabled: false, dubaiLira72gEnabled: false, silverMinConfidence: .75, liraMinConfidence: .75 },
  commands: { price: true, source: true }
};

async function cfg(key: string) {
  if (!supabase) return defaults[key] ?? {};
  const { data, error } = await supabase.from('app_config').select('value').eq('key', key).maybeSingle();
  if (error) throw error;
  return data?.value ?? defaults[key] ?? {};
}
async function setCfg(key: string, value: any) {
  if (supabase) {
    const { error } = await supabase.from('app_config').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) throw error;
  }
  defaults[key] = value;
  return value;
}
async function rows(table: string, limit = 300) {
  if (!supabase) return [];
  const { data, error } = await supabase.from(table).select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data || [];
}
async function insert(table: string, value: any) {
  if (!supabase) return { ...value, id: crypto.randomUUID(), created_at: new Date().toISOString() };
  const { data, error } = await supabase.from(table).insert(value).select('*').single();
  if (error) throw error;
  return data;
}
async function update(table: string, id: string, value: any) {
  if (!supabase) return { id, ...value };
  const { data, error } = await supabase.from(table).update(value).eq('id', id).select('*').single();
  if (error) throw error;
  return data;
}
async function remove(table: string, id: string) {
  if (!supabase) return true;
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) throw error;
  return true;
}
async function log(level: string, kind: string, message: string, meta: any = {}) {
  console.log(`[${level}] ${kind}: ${message}`);
  if (supabase) await supabase.from('logs').insert({ level, kind, message, meta });
}

const digits: Record<string, string> = { '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9','۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9' };
const norm = (s: string) => s.replace(/[٠-٩۰-۹]/g, c => digits[c] || c).replace(/[٬،]/g, ',');
const cityRules: [RegExp,string][] = [
  [/سلێمانی|سليمانيه|السليمانية|sulaymaniyah|slemani/i,'SULAYMANIYAH'], [/هەولێر|اربيل|أربيل|erbil/i,'ERBIL'],
  [/بغداد|baghdad/i,'BAGHDAD'], [/مووسڵ|الموصل|نینەوا|نينوى|mosul|nineveh/i,'MOSUL'],
  [/بەسرە|البصرة|basra/i,'BASRA'], [/کەرکووک|كركوك|kirkuk/i,'KIRKUK'], [/ڕانیە|رانیە|رانية|ranya/i,'RANYA'], [/دهۆک|دهوك|duhok/i,'DUHOK']
];
const city = (s: string) => cityRules.find(([r]) => r.test(s))?.[1] || 'UNKNOWN';
const layer = (s: string) => /الكفاح|كفاح|الحارثية|حارثية|بورصة|بورص/i.test(s) ? 'BOURSE' : /صيرفات|صيرفة|مكاتب|صيرفي/i.test(s) ? 'EXCHANGE_OFFICES' : /كروبات|کروبات|trader/i.test(s) ? 'TRADER_GROUPS' : /بازار|بازاڕ|سوق|market/i.test(s) ? 'LOCAL_MARKET' : 'UNKNOWN';
const timeContext = (s: string) => /غد|غداً|tomorrow|forecast|پێشبینی/i.test(s) ? 'FORECAST' : /أمس|دوێنێ|yesterday/i.test(s) ? 'HISTORICAL' : /پێشوو|سابق|previous/i.test(s) ? 'PREVIOUS' : 'CURRENT';
const role = (s: string) => /(بيع|فرۆشتن|فروش|فرۆش|sell)/i.test(s) ? 'SELL' : /(شراء|کڕین|کڕ|buy)/i.test(s) ? 'BUY' : 'UNKNOWN';
function parseRate(raw: string) {
  const s = norm(raw).replace(/\s/g, '').replace(/\$/g, '');
  if (/^\d{1,3}\.\d{2,3}$/.test(s)) return Math.round(Number(s) * 1000);
  if (/^\d{1,3},\d{3}$/.test(s)) return Number(s.replace(',', ''));
  if (/^\d{6,7}$/.test(s)) return Number(s);
  if (/^\d{3,4}$/.test(s)) return Number(s) * 100;
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}
function extract(text: string) {
  const t = norm(text), out: any[] = [];
  let currentCity = 'UNKNOWN', currentLayer = 'UNKNOWN', offset = 0;
  for (const line0 of t.split(/\r?\n/)) {
    const line = line0.trim(); const c = city(line); if (c !== 'UNKNOWN') currentCity = c;
    const l = layer(line); if (l !== 'UNKNOWN') currentLayer = l;
    if (/\b(?:80|18|4)\b/.test(line) && /شین|شين|سپي|سپی|پێنجی|خمسات|ستاندارد/i.test(line) && !/(14\d|15\d|16\d)[,.\s]\d{3}/.test(line)) { offset += line0.length + 1; continue; }
    const m = /(?:100\s*\$|\$\s*100|دولار|دۆلار|USD|=|:|→|->)\D{0,20}([0-9][0-9,.\s]{3,})/i.exec(line) || /([0-9][0-9,.\s]{5,})/.exec(line);
    if (m) {
      const n = parseRate(m[1]);
      if (n) {
        const s = line.indexOf(m[1]);
        out.push({ city: currentCity, market_layer: currentLayer, currency: 'IQD', quote_currency: 'USD', rate: n, rate_role: role(line), numeric_role: 'RATE', time_context: timeContext(line), confidence: .9, evidence_text: line.slice(s, s + m[1].length), evidence_start: offset + s, evidence_end: offset + s + m[1].length, status: 'CANDIDATE', observed_at: new Date().toISOString(), dollar_category_normalized: 'STANDARD_MIX' });
      }
    }
    offset += line0.length + 1;
  }
  return out;
}
function extractCommodities(text: string) {
  const t = norm(text), out: any[] = [];
  const commodity = /silver|زیو|زیوە|فضة|فضه|سلفر/i.test(t) ? 'SILVER' : /gold|زێڕ|ذهب/i.test(t) ? 'GOLD' : /لیرە|ليرة|lira/i.test(t) ? 'LIRA' : null;
  if (!commodity) return out;
  const nums = [...t.matchAll(/([0-9][0-9,.]*)/g)];
  for (const m of nums) { const price = parseRate(m[1]); if (price && price >= 1000) out.push({ commodity, price, city: city(t), market_layer: layer(t), rate_role: role(t), currency: 'IQD', confidence: .75, evidence_text: m[0], status: 'VALID', observed_at: new Date().toISOString() }); }
  return out.slice(0, 5);
}
const fingerprint = (o: any) => crypto.createHash('sha256').update(JSON.stringify([o.source_id || null,o.city,o.market_layer,o.dollar_category_normalized,o.rate_role,o.rate,o.time_context,o.evidence_text])).digest('hex');

async function getCurrentObservations(cityFilter = 'ALL') {
  if (!supabase) return [];
  const v = await cfg('validation');
  const since = new Date(Date.now() - Number(v.freshnessMinutes || 180) * 60000).toISOString();
  const { data, error } = await supabase.from('observations').select('*').eq('status','VALID').eq('time_context','CURRENT').gte('observed_at', since).order('observed_at', { ascending: false }).limit(2000);
  if (error) throw error;
  return (data || []).filter((x: any) => cityFilter === 'ALL' || x.city === cityFilter);
}
function median(values: number[]) { const a = [...values].sort((x,y)=>x-y); return a.length ? a[Math.floor(a.length/2)] : null; }

async function callAI(prompt: string, system: string) {
  const c = await cfg('ai'); if (!c.enabled) throw new Error('AI disabled');
  const provider = String(c.provider || 'groq').toLowerCase();
  const key = provider === 'openrouter' ? process.env.OPENROUTER_API_KEY : process.env.GROQ_API_KEY;
  const endpoint = provider === 'openrouter' ? (process.env.OPENROUTER_ENDPOINT || 'https://openrouter.ai/api/v1/chat/completions') : (c.endpoint || 'https://api.groq.com/openai/v1/chat/completions');
  const model = provider === 'openrouter' ? (process.env.OPENROUTER_MODEL || c.model || 'openai/gpt-4o-mini') : (c.model || 'llama-3.3-70b-versatile');
  if (!key) throw new Error(`${provider} API key is not configured`);
  const r = await fetch(endpoint, { method:'POST', headers:{ 'content-type':'application/json', authorization:`Bearer ${key}`, ...(provider === 'openrouter' ? {'HTTP-Referer': process.env.APP_URL || 'https://nova-dollar.vercel.app', 'X-Title':'Nova Dollar'} : {}) }, body: JSON.stringify({ model, temperature: Number(c.temperature ?? 0), max_tokens: Number(c.maxTokens || 2200), messages:[{role:'system',content:system},{role:'user',content:prompt}] }) });
  if (!r.ok) throw new Error(`AI ${r.status}: ${await r.text()}`);
  const j:any = await r.json(); return String(j.choices?.[0]?.message?.content || '').trim();
}
async function editorial(reportType = 'LIVE', observations?: any[]) {
  const obs = observations || await getCurrentObservations();
  if (!obs.length) return 'هیچ زانیارییەکی نوێ و پشتڕاستکراو بۆ ئەم کاتە بەردەست نییە.';
  const grouped: any = {};
  for (const o of obs) { const k = `${o.city}|${o.market_layer}|${o.rate_role}`; (grouped[k] ||= []).push(Number(o.rate)); }
  const summary = Object.entries(grouped).map(([k,v]:any)=>({key:k,median:median(v),min:Math.min(...v),max:Math.max(...v),count:v.length}));
  const system = 'You are Nova Dollar editorial AI. Write natural Sorani Kurdish. Use ONLY verified values in the supplied JSON. Never invent numbers, sources, buy/sell roles, cities, movements, or facts. Do not convert عرض or طلب into BUY/SELL. Keep BOURSE and EXCHANGE_OFFICES separate. Return only publishable Kurdish text.';
  return callAI(`Report type: ${reportType}\nVerified market summary:\n${JSON.stringify(summary)}\nObservation evidence:\n${JSON.stringify(obs.slice(0,40))}`, system);
}

async function telegramSend(chat: string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN; if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({chat_id:chat,text,parse_mode:'HTML',disable_web_page_preview:true}) });
  if (!r.ok) throw new Error(`Telegram send ${r.status}: ${await r.text()}`);
  return await r.json() as any;
}
async function publish(type: string, channelOverride?: string) {
  const p = await cfg('publishing'); if (!p.enabled && type !== 'TEST') return { published:false, reason:'publishing disabled' };
  if (!supabase) throw new Error('Supabase is not configured');
  const channels = await rows('channels'); const ch:any = channelOverride ? channels.find((x:any)=>x.username === channelOverride || x.id === channelOverride) : channels.find((x:any)=>x.enabled);
  if (!ch) throw new Error('No enabled Telegram publishing channel');
  const text = await editorial(type);
  const result = await telegramSend(ch.username, text);
  await insert('published_posts',{channel_id:ch.id,telegram_message_id:result.result?.message_id,text,status:'PUBLISHED'});
  return { published:true, channel:ch.username, message_id:result.result?.message_id, text };
}

app.get('/api/health', async (_q,r) => r.json({ ok:true, supabase:!!supabase, telegramConfigured:!!process.env.TELEGRAM_SESSION, mtprotoConfigured:!!(process.env.TELEGRAM_API_ID&&process.env.TELEGRAM_API_HASH&&process.env.TELEGRAM_SESSION&&process.env.INGEST_SECRET), botConfigured:!!process.env.TELEGRAM_BOT_TOKEN, aiConfigured:!!(process.env.GROQ_API_KEY||process.env.OPENROUTER_API_KEY), timezone:'Asia/Baghdad', time:new Date().toISOString() }));
app.get('/api/config/:key', async (q,r)=>{try{r.json(await cfg(q.params.key))}catch(e:any){r.status(500).json({error:e.message})}});
app.put('/api/config/:key', async (q,r)=>{try{r.json(await setCfg(q.params.key,q.body))}catch(e:any){r.status(500).json({error:e.message})}});

for (const t of ['sources','channels','observations','quarantine','logs','terminology','templates','schedules','published_posts','commodity_observations']) app.get('/api/'+t, async (_q,r)=>{try{r.json(await rows(t))}catch(e:any){r.status(500).json({error:e.message})}});
for (const [route,table] of [['sources','sources'],['channels','channels'],['terminology','terminology'],['templates','templates'],['schedules','schedules']] as const) {
  app.post('/api/'+route, async(q,r)=>{try{r.status(201).json(await insert(table,q.body))}catch(e:any){r.status(500).json({error:e.message})}});
  app.put('/api/'+route+'/:id', async(q,r)=>{try{r.json(await update(table,q.params.id,q.body))}catch(e:any){r.status(500).json({error:e.message})}});
  app.delete('/api/'+route+'/:id', async(q,r)=>{try{await remove(table,q.params.id);r.json({ok:true})}catch(e:any){r.status(500).json({error:e.message})}});
}

app.post('/api/test/extract', async(q,r)=>r.json({items:extract(String(q.body?.text||'')),commodities:extractCommodities(String(q.body?.text||'')),normalized:norm(String(q.body?.text||''))}));
app.post('/api/test/pipeline', async(q,r)=>{try{const text=String(q.body?.text||'دۆلار 145250 سلێمانی');const items=extract(text);const v=await cfg('validation');const validated=items.map((o:any)=>({...o,status:(o.rate>=v.minRate&&o.rate<=v.maxRate&&o.time_context==='CURRENT')?'VALID':'QUARANTINED'}));r.json({ok:true,stage:'extract-validate',items:validated,telegramListener:!!process.env.TELEGRAM_SESSION,ingestSecretConfigured:!!process.env.INGEST_SECRET,supabase:!!supabase})}catch(e:any){r.status(500).json({error:e.message})}});

app.post('/api/collector/ingest', async(q,r)=>{
  try {
    if (process.env.INGEST_SECRET && q.headers['x-ingest-secret'] !== process.env.INGEST_SECRET) return r.status(401).json({error:'unauthorized'});
    const body:any=q.body||{}; const text=String(body.text||body.message?.text||body.message?.caption||''); if(!text)return r.status(400).json({error:'empty message'});
    const username=String(body.chat?.username||body.username||'').replace(/^@/,'');
    let source:any=null; if(supabase&&username) source=(await supabase.from('sources').select('*').eq('username','@'+username).maybeSingle()).data;
    let raw:any=null;
    if(supabase){
      const rawValue={source_id:source?.id||null,telegram_message_id:body.message?.message_id||body.telegram_message_id||null,message_text:text,telegram_url:body.telegram_url||null,posted_at:body.message?.date?new Date(Number(body.message.date)*1000).toISOString():new Date().toISOString(),raw_payload:body};
      const z=await supabase.from('raw_messages').insert(rawValue).select('*').single();
      if(z.error){
        if(z.error.code==='42703' && /message_text/i.test(z.error.message)){ const fallback={source_id:source?.id||null,telegram_message_id:body.message?.message_id||null,raw_payload:{...body,text},posted_at:new Date().toISOString()}; const z2=await supabase.from('raw_messages').insert(fallback).select('*').single(); if(z2.error)throw z2.error; raw=z2.data; }
        else throw z.error;
      } else raw=z.data;
    }
    const v=await cfg('validation'); const items=extract(text); const saved:any[]=[];
    for(const o of items){o.source_id=source?.id||null;o.raw_message_id=raw?.id||null;o.telegram_url=body.telegram_url||null;o.validation_reasons=[];if(Number(o.rate)<Number(v.minRate)||Number(o.rate)>Number(v.maxRate))o.validation_reasons.push('RATE_OUT_OF_RANGE');if(o.time_context!=='CURRENT')o.validation_reasons.push('NOT_CURRENT');o.status=o.validation_reasons.length?'QUARANTINED':'VALID';o.fingerprint=fingerprint(o);
      if(supabase){const exists=(await supabase.from('observations').select('id').eq('fingerprint',o.fingerprint).maybeSingle()).data;if(!exists){const row=(await supabase.from('observations').insert(o).select('*').single()).data;if(row)saved.push(row);if(o.status==='QUARANTINED'&&row)await supabase.from('quarantine').insert({observation_id:row.id,reason:o.validation_reasons.join(','),payload:o});}}
      else saved.push(o);
    }
    const commodities=extractCommodities(text); if(supabase&&commodities.length){for(const c of commodities){c.source_id=source?.id||null;c.raw_message_id=raw?.id||null;c.fingerprint=fingerprint(c);const exists=(await supabase.from('commodity_observations').select('id').eq('fingerprint',c.fingerprint).maybeSingle()).data;if(!exists)await supabase.from('commodity_observations').insert(c);}}
    await log('INFO','INGEST','Accepted Telegram message',{source:username,message_id:body.message?.message_id||null,observations:items.length,commodities:commodities.length});
    r.json({accepted:true,source:username,count:items.length,items,saved,commodities});
  }catch(e:any){await log('ERROR','INGEST',e.message,{stack:e.stack});r.status(500).json({error:e.message});}
});

app.get('/api/market/snapshot',async(q,r)=>{try{const data=await getCurrentObservations(String(q.query.city||'ALL'));const lf=String(q.query.layer||'ALL');const rr=data.filter((x:any)=>lf==='ALL'||x.market_layer===lf);const groups:any={};for(const x of rr){const k=[x.city,x.market_layer,x.dollar_category_normalized,x.rate_role].join('|');(groups[k]??=[]).push(Number(x.rate));}const result=Object.entries(groups).map(([key,v]:any)=>{v.sort((a:number,b:number)=>a-b);return{key,city:key.split('|')[0],market_layer:key.split('|')[1],category:key.split('|')[2],rate_role:key.split('|')[3],median:median(v),min:v[0],max:v[v.length-1],range:v[v.length-1]-v[0],count:v.length}});r.json({groups:result,observations:rr.slice(0,200)});}catch(e:any){r.status(500).json({error:e.message})}});
app.get('/api/market/radar',async(_q,r)=>{try{const p=await cfg('publishing');const now=await getCurrentObservations();const oldSince=new Date(Date.now()-Number(p.radarWindowMinutes||60)*60000);const old=now.filter((x:any)=>new Date(x.observed_at)<oldSince);const groups:any[]=[];for(const cityName of [...new Set(now.map((x:any)=>x.city))]){const cur=now.filter((x:any)=>x.city===cityName).map((x:any)=>Number(x.rate));const prev=old.filter((x:any)=>x.city===cityName).map((x:any)=>Number(x.rate));if(cur.length&&prev.length){const a=median(cur)!,b=median(prev)!,d=a-b;if(Math.abs(d)>=Number(p.radarDelta||250))groups.push({city:cityName,current:a,previous:b,movement:d,direction:d>0?'UP':'DOWN',sources:new Set(now.filter((x:any)=>x.city===cityName).map((x:any)=>x.source_id)).size});}}r.json({threshold:p.radarDelta||250,windowMinutes:p.radarWindowMinutes||60,alerts:groups});}catch(e:any){r.status(500).json({error:e.message})}});
app.get('/api/market/history',async(q,r)=>{try{if(!supabase)return r.json([]);const hours=Math.min(Number(q.query.hours||24),2160);const since=new Date(Date.now()-hours*3600000).toISOString();let query=supabase.from('observations').select('city,market_layer,dollar_category_normalized,rate_role,rate,observed_at,source_id').eq('status','VALID').eq('time_context','CURRENT').gte('observed_at',since).order('observed_at',{ascending:true});if(q.query.city)query=query.eq('city',String(q.query.city));const {data,error}=await query.limit(5000);if(error)throw error;r.json(data||[]);}catch(e:any){r.status(500).json({error:e.message})}});
app.get('/api/analytics',async(_q,r)=>{try{if(!supabase)return r.json({messageCount:0,observationCount:0,validCount:0,quarantineCount:0,publishedCount:0,sources:[]});const[o,q,raw,pub,s]=await Promise.all([supabase.from('observations').select('status,source_id,confidence,observed_at'),supabase.from('quarantine').select('id',{count:'exact',head:true}),supabase.from('raw_messages').select('id',{count:'exact',head:true}),supabase.from('published_posts').select('id',{count:'exact',head:true}),supabase.from('sources').select('*')]);const data=o.data||[];const sourceStats=(s.data||[]).map((x:any)=>{const a=data.filter((z:any)=>z.source_id===x.id);return{username:x.username,title:x.title,count:a.length,valid:a.filter((z:any)=>z.status==='VALID').length,quarantine:a.filter((z:any)=>z.status==='QUARANTINED').length,validity:a.length?100*a.filter((z:any)=>z.status==='VALID').length/a.length:0,confidence:a.length?a.reduce((n:number,z:any)=>n+Number(z.confidence||0),0)/a.length:0,last:a.sort((a:any,b:any)=>new Date(b.observed_at).getTime()-new Date(a.observed_at).getTime())[0]?.observed_at||null};});r.json({messageCount:raw.count||0,observationCount:data.length,validCount:data.filter((x:any)=>x.status==='VALID').length,quarantineCount:q.count||0,publishedCount:pub.count||0,sources:sourceStats});}catch(e:any){r.status(500).json({error:e.message})}});
app.get('/api/analytics/history',async(q,r)=>{try{if(!supabase)return r.json([]);const hours=Math.min(Number(q.query.hours||24),2160);const since=new Date(Date.now()-hours*3600000).toISOString();const {data,error}=await supabase.from('observations').select('city,market_layer,rate,rate_role,observed_at,source_id,confidence').eq('status','VALID').gte('observed_at',since).order('observed_at',{ascending:true}).limit(5000);if(error)throw error;r.json(data||[]);}catch(e:any){r.status(500).json({error:e.message})}});
app.get('/api/analytics/source-performance',async(_q,r)=>{try{const a=await rows('sources');const obs=await rows('observations',5000);r.json(a.map((s:any)=>{const x=obs.filter((o:any)=>o.source_id===s.id);return{...s,messages:x.length,valid:x.filter((o:any)=>o.status==='VALID').length,quarantine:x.filter((o:any)=>o.status==='QUARANTINED').length,validity:x.length?x.filter((o:any)=>o.status==='VALID').length/x.length:0,avgConfidence:x.length?x.reduce((n:number,o:any)=>n+Number(o.confidence||0),0)/x.length:0,lastObservation:x.sort((u:any,v:any)=>+new Date(v.observed_at)-+new Date(u.observed_at))[0]?.observed_at||null};}));}catch(e:any){r.status(500).json({error:e.message})}});

app.post('/api/ai/editorial',async(q,r)=>{try{const text=await editorial(String(q.body?.reportType||'LIVE'),q.body?.observations);r.json({ok:true,text});}catch(e:any){r.status(500).json({error:e.message})}});
app.post('/api/ai/extract',async(q,r)=>{try{const text=String(q.body?.text||'');const system='Extract Iraqi market observations as strict JSON array. Never guess. Preserve عرض/طلب as raw labels and never infer BUY/SELL. Normalize Arabic/Kurdish numerals and city names. Fields: city, market_layer, rate, rate_role, time_context, confidence, evidence_text.';const result=await callAI(text,system);let parsed:any;try{parsed=JSON.parse(result)}catch{parsed={raw:result}}r.json({ok:true,items:parsed});}catch(e:any){r.status(500).json({error:e.message})}});

app.get('/api/config/bot',async(_q,r)=>r.json({configured:!!process.env.TELEGRAM_BOT_TOKEN,connected:false,webhookConfigured:!!process.env.TELEGRAM_WEBHOOK_SECRET,lastCheck:null}));
app.post('/api/telegram/test',async(_q,r)=>{try{const token=process.env.TELEGRAM_BOT_TOKEN;if(!token)return r.status(400).json({configured:false,error:'TELEGRAM_BOT_TOKEN missing'});const x:any=await (await fetch(`https://api.telegram.org/bot${token}/getMe`)).json();r.json({configured:true,connected:!!x.ok,bot:x.result||null,lastCheck:new Date().toISOString()});}catch(e:any){r.status(500).json({error:e.message})}});
app.post('/api/telegram/set-webhook',async(q,r)=>{try{const token=process.env.TELEGRAM_BOT_TOKEN;if(!token)throw new Error('TELEGRAM_BOT_TOKEN missing');const url=String(q.body?.url||`${process.env.APP_URL||''}/api/telegram/webhook`);if(!url.startsWith('http'))throw new Error('APP_URL or webhook url is required');const body:any={url};if(process.env.TELEGRAM_WEBHOOK_SECRET)body.secret_token=process.env.TELEGRAM_WEBHOOK_SECRET;const x:any=await (await fetch(`https://api.telegram.org/bot${token}/setWebhook`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})).json();r.json(x);}catch(e:any){r.status(500).json({error:e.message})}});
app.post('/api/telegram/webhook',async(q,r)=>{try{if(process.env.TELEGRAM_WEBHOOK_SECRET&&q.headers['x-telegram-bot-api-secret-token']!==process.env.TELEGRAM_WEBHOOK_SECRET)return r.status(401).json({error:'unauthorized'});const u:any=q.body?.message||q.body?.channel_post;if(!u?.text)return r.json({ok:true});const chat=String(u.chat?.id||'');const cmd=String(u.text).trim().split(/\s+/)[0].toLowerCase();if(cmd==='/price'){const data=await getCurrentObservations();const m=median(data.map((x:any)=>Number(x.rate)));await telegramSend(chat,m?`💵 USD/IQD: ${m.toLocaleString('en-US')} IQD`:'No current verified price.');}else if(cmd==='/source'){const sources=await rows('sources');await telegramSend(chat,sources.map((x:any)=>`• ${x.username} — ${x.enabled?'ON':'OFF'}`).join('\n')||'No sources configured.');}else if(cmd==='/radar'){const rr:any=await (await fetch(`${process.env.APP_URL||'http://localhost:'+PORT}/api/market/radar`)).json();await telegramSend(chat,rr.alerts?.length?rr.alerts.map((x:any)=>`🚨 ${x.city}: ${x.current.toLocaleString()} (${x.movement>0?'+':''}${x.movement.toLocaleString()})`).join('\n'):'No significant movement.');}r.json({ok:true});}catch(e:any){await log('ERROR','TELEGRAM_WEBHOOK',e.message);r.status(500).json({error:e.message})}});

app.post('/api/publish/:type',async(q,r)=>{try{r.json(await publish(String(q.params.type||'LIVE').toUpperCase(),q.body?.channel))}catch(e:any){r.status(500).json({error:e.message})}});
app.post('/api/scheduler/run',async(q,r)=>{try{const type=String(q.body?.type||'LIVE').toUpperCase();const key=`manual:${type}:${new Date().toISOString().slice(0,16)}`;if(supabase){const {error}=await supabase.from('automation_runs').insert({run_key:key});if(error&&error.code==='23505')return r.json({ok:true,skipped:true,reason:'already ran'});}r.json(await publish(type));}catch(e:any){r.status(500).json({error:e.message})}});
app.get('/api/backup/config',async(_q,r)=>{const o:any={};for(const k of ['validation','polling','publishing','market','ai','commodities','commands'])o[k]=await cfg(k);r.setHeader('Content-Disposition','attachment; filename="nova-dollar-config.json"').json(o)});

async function scheduledTick(){
  if(process.env.NODE_ENV==='vercel' || process.env.DISABLE_SERVER_SCHEDULER==='true') return;
  const p=await cfg('publishing'); if(!p.enabled) return;
  const now=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Baghdad',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());
  for(const [type,time] of [['OPEN',p.openTime],['CLOSE',p.closeTime]] as const){ if(now===time){const key=`${type}:${new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Baghdad'})}`;try{if(supabase){const z=await supabase.from('automation_runs').insert({run_key:key});if(z.error?.code==='23505')continue;}await publish(type);}catch(e:any){await log('ERROR','SCHEDULER',e.message,{type});}}}
}
if(process.env.NODE_ENV!=='vercel'){app.listen(PORT,()=>console.log(`Nova Dollar API listening on ${PORT}`));setInterval(()=>scheduledTick().catch(e=>log('ERROR','SCHEDULER',e.message)),60000);}
export default app;
