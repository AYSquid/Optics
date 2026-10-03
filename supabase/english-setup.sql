-- English only: run once in Supabase SQL Editor. Safe to run again.
begin;
create table if not exists public.english_progress (
 user_id uuid not null references auth.users(id) on delete cascade,
 record_key text not null check (length(record_key) between 3 and 240),
 value jsonb not null,
 revision bigint not null default 1 check (revision > 0),
 last_op uuid not null,
 updated_at timestamptz not null default now(),
 primary key (user_id, record_key)
);
alter table public.english_progress enable row level security;
revoke all on public.english_progress from anon, authenticated;
grant select on public.english_progress to authenticated;
drop policy if exists english_read_own on public.english_progress;
create policy english_read_own on public.english_progress for select to authenticated
 using ((select auth.uid()) = user_id);
-- Only this function may write. Identity is taken from the signed-in JWT, never from input.
create or replace function public.english_sync(changes jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 uid uuid := auth.uid(); c jsonb; k text; val jsonb; base bigint; op uuid;
 row_value public.english_progress%rowtype; conflicts jsonb := '[]'::jsonb;
 acknowledged jsonb := '[]'::jsonb; all_rows jsonb;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 if jsonb_typeof(changes) <> 'array' or jsonb_array_length(changes) > 250 then
  raise exception 'Invalid changes';
 end if;
 perform pg_advisory_xact_lock(pg_catalog.hashtextextended('english:' || uid::text, 0));
 for c in select value from jsonb_array_elements(changes) loop
  k := c->>'key'; val := c->'value'; base := (c->>'base')::bigint; op := (c->>'op')::uuid;
  if k is null or length(k) > 240 or k !~ '^((choice|draft|version|position|scroll|submission|settings):[A-Za-z0-9_.:-]+|last)$'
     or val is null or base is null or base < 0 or op is null then raise exception 'Invalid record'; end if;
  if jsonb_typeof(val) not in ('string','null') or length(val::text) > 300000 then raise exception 'Invalid value'; end if;
  select * into row_value from public.english_progress where user_id = uid and record_key = k;
  if found then
   if row_value.last_op = op then
    acknowledged := acknowledged || jsonb_build_array(jsonb_build_object('key',k,'op',op,'revision',row_value.revision));
   elsif row_value.revision = base then
    update public.english_progress set value = val, revision = revision + 1, last_op = op, updated_at = now()
     where user_id = uid and record_key = k returning * into row_value;
    acknowledged := acknowledged || jsonb_build_array(jsonb_build_object('key',k,'op',op,'revision',row_value.revision));
   else conflicts := conflicts || jsonb_build_array(k);
   end if;
  elsif base = 0 then
   insert into public.english_progress(user_id,record_key,value,last_op) values(uid,k,val,op);
   acknowledged := acknowledged || jsonb_build_array(jsonb_build_object('key',k,'op',op,'revision',1));
  else conflicts := conflicts || jsonb_build_array(k);
  end if;
 end loop;
 select coalesce(jsonb_agg(jsonb_build_object('key',record_key,'value',value,'revision',revision,'op',last_op)), '[]'::jsonb)
  into all_rows from public.english_progress where user_id = uid;
 return jsonb_build_object('rows',all_rows,'acknowledged',acknowledged,'conflicts',conflicts);
end;
$$;
revoke all on function public.english_sync(jsonb) from public, anon;
grant execute on function public.english_sync(jsonb) to authenticated;
commit;
