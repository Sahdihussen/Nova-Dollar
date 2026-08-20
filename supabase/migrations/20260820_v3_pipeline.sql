-- Nova Dollar V3 pipeline compatibility migration.
create extension if not exists pgcrypto;

alter table if exists raw_messages add column if not exists message_text text;
alter table if exists raw_messages add column if not exists telegram_url text;
alter table if exists raw_messages add column if not exists posted_at timestamptz;
alter table if exists raw_messages add column if not exists raw_payload jsonb not null default '{}'::jsonb;
alter table if exists raw_messages add column if not exists source_id uuid references sources(id) on delete set null;
alter table if exists raw_messages add column if not exists telegram_message_id bigint;

alter table if exists observations add column if not exists telegram_url text;
alter table if exists observations add column if not exists dollar_category_raw text;
alter table if exists observations add column if not exists quote_label_raw text;
alter table if exists observations add column if not exists quote_label_normalized text;
alter table if exists observations add column if not exists validation_reasons text[] default '{}';
alter table if exists observations add column if not exists evidence_start integer;
alter table if exists observations add column if not exists evidence_end integer;
alter table if exists observations add column if not exists fingerprint text;
create unique index if not exists observations_fingerprint_unique_idx on observations(fingerprint) where fingerprint is not null;

alter table if exists commodity_observations add column if not exists evidence_text text;
alter table if exists commodity_observations add column if not exists fingerprint text;
create unique index if not exists commodity_observations_fingerprint_unique_idx on commodity_observations(fingerprint) where fingerprint is not null;

alter table if exists published_posts add column if not exists text text;
alter table if exists published_posts add column if not exists status text not null default 'PUBLISHED';

insert into app_config(key,value) values
('commands','{"price":true,"source":true,"radar":true}')
on conflict(key) do nothing;
