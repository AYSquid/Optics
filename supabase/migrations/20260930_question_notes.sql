-- Add personal question notes; does not touch question or progress data.
-- Current question IDs are text keys in JSON (e.g. geom-ch1-xuan1,
-- exam-2016-30efb5e2230290e0). There is no public.questions table to reference.
begin;
create table if not exists public.question_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id text not null check (length(question_id) between 1 and 240),
  content text not null check (length(btrim(content)) > 0 and length(content) <= 50000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint question_notes_user_question_unique unique (user_id, question_id)
);
create index if not exists question_notes_user_updated_idx
  on public.question_notes (user_id, updated_at desc, id);
alter table public.question_notes enable row level security;
-- Only note text may be edited; the ownership and question identity cannot change.
revoke all on public.question_notes from public, anon, authenticated;
grant select, delete on public.question_notes to authenticated;
grant insert (user_id, question_id, content) on public.question_notes to authenticated;
grant update (content) on public.question_notes to authenticated;
do $$
begin
 if not exists (select 1 from pg_policies where schemaname='public' and tablename='question_notes' and policyname='question_notes_read_own') then
  create policy question_notes_read_own on public.question_notes for select to authenticated using ((select auth.uid()) = user_id);
 end if;
 if not exists (select 1 from pg_policies where schemaname='public' and tablename='question_notes' and policyname='question_notes_insert_own') then
  create policy question_notes_insert_own on public.question_notes for insert to authenticated with check ((select auth.uid()) = user_id);
 end if;
 if not exists (select 1 from pg_policies where schemaname='public' and tablename='question_notes' and policyname='question_notes_update_own') then
  create policy question_notes_update_own on public.question_notes for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
 end if;
 if not exists (select 1 from pg_policies where schemaname='public' and tablename='question_notes' and policyname='question_notes_delete_own') then
  create policy question_notes_delete_own on public.question_notes for delete to authenticated using ((select auth.uid()) = user_id);
 end if;
end $$;
create or replace function public.question_notes_set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
 new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
 return new;
end;
$$;
revoke all on function public.question_notes_set_updated_at() from public, anon, authenticated;
do $$
begin
 if not exists (select 1 from pg_trigger where tgrelid='public.question_notes'::regclass and tgname='question_notes_updated_at' and not tgisinternal) then
  create trigger question_notes_updated_at before update on public.question_notes for each row execute function public.question_notes_set_updated_at();
 end if;
end $$;
notify pgrst, 'reload schema';
commit;
