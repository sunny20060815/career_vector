create extension if not exists pgcrypto;

create table if not exists public.skills (
  canonical_name text primary key,
  display_name text not null,
  normalized_name text not null unique,
  skill_type text,
  cluster_name text,
  is_ai_core boolean not null default false,
  demand_per_10k_2025 numeric,
  salary_median_2025 numeric,
  experience_mean_2025 numeric,
  bachelor_or_above_share_2025 numeric,
  graduate_share_2025 numeric,
  ai_exposure numeric,
  ai_group text,
  ai_cooccurrence_npmi numeric,
  ai_cooccurrence_share numeric,
  forecast_2026 jsonb not null default '{}'::jsonb,
  forecast_2027 jsonb not null default '{}'::jsonb,
  forecast_2028 jsonb not null default '{}'::jsonb,
  fact_summary text,
  data_version text
);

create table if not exists public.skill_aliases (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null references public.skills(canonical_name) on delete cascade,
  alias text not null,
  normalized_alias text not null,
  unique (canonical_name, normalized_alias)
);

create table if not exists public.skill_pairs (
  id text primary key,
  skill_a text not null references public.skills(canonical_name),
  skill_b text not null references public.skills(canonical_name),
  npmi numeric,
  wage_complement_pct numeric,
  wage_complement_p_value numeric,
  demand_rate_2025 numeric,
  demand_rate_2028 numeric,
  demand_growth_pct numeric,
  evidence_level text,
  check (skill_a < skill_b)
);

create table if not exists public.occupation_skill_stats (
  id text primary key,
  canonical_name text not null references public.skills(canonical_name),
  occupation_code text not null,
  occupation_name text not null,
  probability numeric not null,
  concentration numeric not null,
  forecast_demand_2026 numeric,
  forecast_demand_2027 numeric,
  forecast_demand_2028 numeric
);

create table if not exists public.city_skill_forecasts (
  id text primary key,
  canonical_name text not null references public.skills(canonical_name),
  city text not null,
  forecast_year smallint not null check (forecast_year between 2026 and 2028),
  demand_ratio numeric,
  demand_per_10k numeric,
  demand_volume_index numeric
);

create table if not exists public.pair_occupation_stats (
  id text primary key,
  pair_id text not null references public.skill_pairs(id) on delete cascade,
  occupation_code text not null,
  occupation_name text not null,
  probability numeric not null,
  concentration numeric not null
);

create table if not exists public.pair_city_stats (
  id text primary key,
  pair_id text not null references public.skill_pairs(id) on delete cascade,
  city text not null,
  probability numeric not null,
  concentration numeric not null
);

create table if not exists public.skill_yearly_trends (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null references public.skills(canonical_name),
  year smallint not null,
  demand_per_10k numeric,
  salary_median numeric,
  experience_mean numeric,
  is_forecast boolean not null default false,
  unique (canonical_name, year)
);

create table if not exists public.skill_monthly_trends (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null references public.skills(canonical_name),
  month date not null,
  demand_per_10k numeric,
  salary_median numeric,
  experience_mean numeric,
  is_forecast boolean not null default false,
  unique (canonical_name, month)
);

create table if not exists public.skill_ai_exposure (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null references public.skills(canonical_name),
  ai_group text not null,
  demand_share_2025 numeric,
  demand_share_2028 numeric,
  unique (canonical_name, ai_group)
);

create table if not exists public.major_programs (
  program_key text primary key,
  school text not null,
  cohort text not null,
  college text,
  major text not null,
  direction text,
  title text,
  major_code text,
  aliases text,
  training_objectives text,
  ability_requirements text,
  core_courses text,
  program_features text,
  degree_summary text
);

create table if not exists public.major_skills (
  program_key text not null references public.major_programs(program_key) on delete cascade,
  canonical_name text not null references public.skills(canonical_name),
  skill_type text,
  cluster_name text,
  supply_score numeric,
  distinctiveness_score numeric,
  rank integer,
  evidence_summary text,
  mapping_basis text,
  is_representative boolean not null default false,
  primary key (program_key, canonical_name)
);

create table if not exists public.occupation_catalog (
  occupation_code text primary key,
  occupation_name text not null,
  description text,
  subclass_code text not null,
  subclass_name text not null,
  major_code text,
  major_name text,
  middle_code text,
  middle_name text,
  is_displayable boolean not null default true,
  source text
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '新职业咨询',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  structured_query jsonb,
  evidence jsonb,
  created_at timestamptz not null default now()
);

create index if not exists occupation_skill_stats_skill_idx on public.occupation_skill_stats(canonical_name);
create index if not exists skill_aliases_normalized_idx on public.skill_aliases(normalized_alias);
create index if not exists city_skill_forecasts_skill_year_idx on public.city_skill_forecasts(canonical_name, forecast_year);
create index if not exists pair_occupation_stats_pair_idx on public.pair_occupation_stats(pair_id);
create index if not exists pair_city_stats_pair_idx on public.pair_city_stats(pair_id);
create index if not exists messages_conversation_created_idx on public.messages(conversation_id, created_at);
create index if not exists major_programs_school_cohort_major_idx on public.major_programs(school, cohort, major);
create index if not exists major_skills_program_rank_idx on public.major_skills(program_key, rank);
create index if not exists occupation_catalog_subclass_idx on public.occupation_catalog(subclass_code);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.skills enable row level security;
alter table public.skill_aliases enable row level security;
alter table public.skill_pairs enable row level security;
alter table public.occupation_skill_stats enable row level security;
alter table public.city_skill_forecasts enable row level security;
alter table public.pair_occupation_stats enable row level security;
alter table public.pair_city_stats enable row level security;
alter table public.skill_yearly_trends enable row level security;
alter table public.skill_monthly_trends enable row level security;
alter table public.skill_ai_exposure enable row level security;
alter table public.major_programs enable row level security;
alter table public.major_skills enable row level security;
alter table public.occupation_catalog enable row level security;

create policy "users manage own conversations" on public.conversations
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users manage own messages" on public.messages
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
