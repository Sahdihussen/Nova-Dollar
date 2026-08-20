# Nova Dollar — USD/IQD Telegram Admin Center

Production-oriented Iraqi USD/IQD market collector and admin center.

## Architecture

- Vercel hosts the Vite admin UI and Express API.
- Supabase stores configuration, raw Telegram messages, observations, quarantine, logs, schedules, publishing state, and commodity observations.
- A persistent GramJS MTProto worker listens to the configured Telegram sources and forwards new posts to `/api/collector/ingest`.
- Live validated prices are independent of the opening/closing report schedule.

## MTProto authentication

Run `npm run collector:login` once on a trusted interactive machine with `TELEGRAM_API_ID` and `TELEGRAM_API_HASH`. Complete Telegram's phone/code/2FA prompts. The command prints a `TELEGRAM_SESSION` string. Store that value only as a server/worker secret; never commit it or paste it into chat.

Then run `npm run collector` under a persistent process manager/container. The worker must be the only MTProto listener for the configured source set.

## Deployment

See `DEPLOYMENT.md` for Supabase, Vercel, MTProto, and webhook setup. Apply `supabase/migrations/20260820_v2.sql` to an existing V1 database.

## Safety

Never commit `TELEGRAM_API_HASH`, `TELEGRAM_SESSION`, bot tokens, Supabase service-role keys, or AI API keys.
