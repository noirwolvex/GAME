create extension if not exists pg_trgm;

do $$
begin
  create type game_category as enum ('human', 'animal', 'plant', 'object', 'country');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type validation_source as enum ('seed', 'wikidata', 'wordnet', 'admin', 'community', 'ai_review');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type validation_status as enum ('accepted', 'rejected', 'review');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.validation_words (
  id uuid primary key default gen_random_uuid(),
  word text not null,
  normalized_word text not null,
  category game_category not null,
  language text not null default 'ar',
  aliases text[] not null default '{}',
  status validation_status not null default 'review',
  confidence numeric(4,3) not null default 0.500 check (confidence >= 0 and confidence <= 1),
  source validation_source not null default 'seed',
  notes text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (normalized_word, category)
);

create index if not exists validation_words_normalized_idx
  on public.validation_words using gin (normalized_word gin_trgm_ops);

create index if not exists validation_words_category_idx
  on public.validation_words (category);

create index if not exists validation_words_status_idx
  on public.validation_words (status);

create table if not exists public.validation_queue (
  id uuid primary key default gen_random_uuid(),
  answer text not null,
  normalized_answer text not null,
  category game_category not null,
  letter text not null,
  player_id uuid,
  game_id uuid,
  decision validation_status not null default 'review',
  confidence numeric(4,3) not null default 0.500 check (confidence >= 0 and confidence <= 1),
  reason text not null,
  source validation_source not null default 'community',
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists validation_queue_review_idx
  on public.validation_queue (decision, created_at desc);

create or replace function public.validation_words_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists validation_words_updated_at on public.validation_words;
create trigger validation_words_updated_at
before update on public.validation_words
for each row execute function public.validation_words_touch_updated_at();

alter table public.validation_words enable row level security;
alter table public.validation_queue enable row level security;

create policy "validation words are readable"
on public.validation_words
for select
using (true);

create policy "validation queue is readable by authenticated users"
on public.validation_queue
for select
to authenticated
using (true);
