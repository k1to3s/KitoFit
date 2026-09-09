-- Bloom: run once in a fresh Supabase project. DATABASE_URL must point to this same project.
-- Drizzle is used on the trusted server. Supabase JWTs are independently verified on every request.
begin;
create extension if not exists pgcrypto;
create table public.food_logs (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 date text not null check (date ~ '^\d{4}-\d{2}-\d{2}$'), meal text not null check(meal in ('Breakfast','Lunch','Dinner','Snacks')),
 name text not null check(length(name) between 1 and 150), serving text not null, grams real not null default 100 check(grams>0 and grams<=10000),
 calories real not null check(calories>=0 and calories<=20000),protein real not null check(protein>=0 and protein<=2000),carbs real not null check(carbs>=0 and carbs<=2000),fat real not null check(fat>=0 and fat<=2000),image text,created_at timestamptz not null default now()
);
-- Versioned JSON entities keep workout sets/templates and supplement details atomic.
-- API Zod schemas define payload contracts; identity and date remain indexed relational fields.
do $$ declare t text; begin
 foreach t in array array['profiles','custom_foods','supplements','supplement_logs','supplement_schedules','workouts','workout_sessions','exercises','workout_sets','tracker_records','push_subscriptions','audit_logs','reports'] loop
 execute format('create table public.%I (id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,date text not null,data jsonb not null check(jsonb_typeof(data)=''object''),created_at timestamptz not null default now())',t);
 end loop;
end $$;
create unique index profiles_one_per_user on public.profiles(user_id);
create table public.foods_cache(key text primary key,data jsonb not null,expires_at timestamptz not null);
create table public.rate_limits(key text primary key,count integer not null default 1,expires_at timestamptz not null);
create index rate_limits_expiry on public.rate_limits(expires_at);
create index foods_cache_expiry on public.foods_cache(expires_at);
create table public.chat_rooms(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,name text not null check(length(name) between 1 and 80));
create table public.chat_members(room_id uuid not null references public.chat_rooms(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,primary key(room_id,user_id));
create index chat_members_user on public.chat_members(user_id,room_id);
create table public.messages(id uuid primary key default gen_random_uuid(),room_id uuid not null references public.chat_rooms(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,content text not null check(length(trim(content)) between 1 and 2000),created_at timestamptz not null default now());
create index messages_room_time on public.messages(room_id,created_at);
create table public.blocks(user_id uuid not null references auth.users(id) on delete cascade,blocked_id uuid not null references auth.users(id) on delete cascade,primary key(user_id,blocked_id),check(user_id<>blocked_id));
-- SECURITY DEFINER avoids recursive RLS on membership. No caller-controlled user ID.
create function public.is_room_member(room uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.chat_members where room_id=room and user_id=(select auth.uid())); $$;
create function public.is_room_owner(room uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.chat_rooms where id=room and user_id=(select auth.uid())); $$;
create function public.is_blocked(other uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.blocks where (user_id=(select auth.uid()) and blocked_id=other) or (blocked_id=(select auth.uid()) and user_id=other)); $$;
revoke all on function public.is_room_member(uuid),public.is_room_owner(uuid),public.is_blocked(uuid) from public;
grant execute on function public.is_room_member(uuid),public.is_room_owner(uuid),public.is_blocked(uuid) to authenticated;
-- User data: all reads and writes are tied to auth.uid(). Audit and push have stricter server-only writes.
do $$ declare t text; begin
 foreach t in array array['food_logs','profiles','custom_foods','supplements','supplement_logs','supplement_schedules','workouts','workout_sessions','exercises','workout_sets','tracker_records','push_subscriptions','audit_logs','reports'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create index %I on public.%I(user_id,date)',t||'_owner_date',t);
 execute format('create policy own_read on public.%I for select to authenticated using (user_id=(select auth.uid()))',t);
 if t not in ('audit_logs','push_subscriptions','reports') then
 execute format('create policy own_insert on public.%I for insert to authenticated with check(user_id=(select auth.uid()))',t);
 execute format('create policy own_update on public.%I for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()))',t);
 execute format('create policy own_delete on public.%I for delete to authenticated using(user_id=(select auth.uid()))',t);
 elsif t='push_subscriptions' then
 execute format('create policy own_delete on public.%I for delete to authenticated using(user_id=(select auth.uid()))',t);
 end if;
 end loop;
end $$;
alter table public.chat_rooms enable row level security;
alter table public.chat_members enable row level security;
alter table public.messages enable row level security;
alter table public.blocks enable row level security;
alter table public.foods_cache enable row level security;
alter table public.rate_limits enable row level security;
-- Caches may contain image-derived health data. No browser policies; server only.
revoke all on public.foods_cache,public.rate_limits from anon,authenticated;
create policy room_read on public.chat_rooms for select to authenticated using(public.is_room_member(id) or user_id=(select auth.uid()));
create policy room_create on public.chat_rooms for insert to authenticated with check(user_id=(select auth.uid()));
create policy room_update on public.chat_rooms for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy room_delete on public.chat_rooms for delete to authenticated using(user_id=(select auth.uid()));
create policy member_read on public.chat_members for select to authenticated using(public.is_room_member(room_id) or public.is_room_owner(room_id));
create policy member_invite on public.chat_members for insert to authenticated with check(public.is_room_owner(room_id) and not public.is_blocked(user_id));
create policy member_leave on public.chat_members for delete to authenticated using(user_id=(select auth.uid()) or public.is_room_owner(room_id));
create policy message_read on public.messages for select to authenticated using(public.is_room_member(room_id) and not public.is_blocked(user_id));
create policy message_send on public.messages for insert to authenticated with check(user_id=(select auth.uid()) and public.is_room_member(room_id));
create policy message_delete on public.messages for delete to authenticated using(user_id=(select auth.uid()) and public.is_room_member(room_id));
create policy blocks_read on public.blocks for select to authenticated using(user_id=(select auth.uid()));
create policy blocks_create on public.blocks for insert to authenticated with check(user_id=(select auth.uid()));
create policy blocks_delete on public.blocks for delete to authenticated using(user_id=(select auth.uid()));
-- Database trigger prevents bypassing the per-user message limiter via direct Supabase REST.
create function public.guard_message() returns trigger language plpgsql security definer set search_path='' as $$
declare n integer; k text; begin
 if not exists(select 1 from public.chat_members where room_id=new.room_id and user_id=new.user_id) then raise exception 'Not a member'; end if;
 k:='db-message:'||new.user_id::text||':'||floor(extract(epoch from now())/60)::text;
 insert into public.rate_limits(key,count,expires_at) values(k,1,now()+interval '2 minutes') on conflict(key) do update set count=public.rate_limits.count+1 returning count into n;
 if n>15 then raise exception 'Message rate limit exceeded'; end if;
 new.created_at:=now();return new;
end $$;
revoke all on function public.guard_message() from public;
create trigger messages_guard before insert on public.messages for each row execute function public.guard_message();
-- Private storage. Only the trusted upload route can INSERT/UPDATE, after normalization.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('meal-photos','meal-photos',false,4194304,array['image/jpeg']) on conflict(id) do update set public=false,file_size_limit=4194304,allowed_mime_types=array['image/jpeg'];
create policy meal_photo_read on storage.objects for select to authenticated using(bucket_id='meal-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy meal_photo_delete on storage.objects for delete to authenticated using(bucket_id='meal-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
-- Realtime obeys message SELECT RLS; clients still fetch their authorized history on events.
alter publication supabase_realtime add table public.messages;
commit;
