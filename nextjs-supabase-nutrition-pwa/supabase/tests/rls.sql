-- STAGING ONLY: authorization regression test. All fixtures are rolled back.
-- Execute after the migration with a database admin in Supabase SQL Editor.
begin;
insert into auth.users(id,email,instance_id,aud,role,created_at,updated_at) values
 ('11111111-1111-4111-a111-111111111111','rls-alice@example.invalid','00000000-0000-0000-0000-000000000000','authenticated','authenticated',now(),now()),
 ('22222222-2222-4222-a222-222222222222','rls-bob@example.invalid','00000000-0000-0000-0000-000000000000','authenticated','authenticated',now(),now());
insert into public.food_logs(id,user_id,date,meal,name,serving,grams,calories,protein,carbs,fat) values
 ('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa','11111111-1111-4111-a111-111111111111','2026-10-01','Breakfast','Alice food','100 g',100,100,10,10,2),
 ('bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb','22222222-2222-4222-a222-222222222222','2026-10-01','Breakfast','Bob food','100 g',100,100,10,10,2);
insert into public.chat_rooms(id,user_id,name) values('cccccccc-cccc-4ccc-accc-cccccccccccc','11111111-1111-4111-a111-111111111111','Alice only');
insert into public.chat_members(room_id,user_id) values('cccccccc-cccc-4ccc-accc-cccccccccccc','11111111-1111-4111-a111-111111111111');
insert into public.messages(room_id,user_id,content) values('cccccccc-cccc-4ccc-accc-cccccccccccc','11111111-1111-4111-a111-111111111111','Private message');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-a222-222222222222","role":"authenticated"}',true);
do $$ declare n int; begin
 select count(*) into n from public.food_logs; if n<>1 then raise exception 'FAIL: food read ownership';end if;
 update public.food_logs set name='unauthorized' where id='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';get diagnostics n=row_count;if n<>0 then raise exception 'FAIL: update IDOR';end if;
 delete from public.food_logs where id='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';get diagnostics n=row_count;if n<>0 then raise exception 'FAIL: delete IDOR';end if;
 select count(*) into n from public.messages;if n<>0 then raise exception 'FAIL: private messages visible';end if;
 begin
 insert into public.messages(room_id,user_id,content) values('cccccccc-cccc-4ccc-accc-cccccccccccc','22222222-2222-4222-a222-222222222222','intrusion');
 raise exception 'FAIL: nonmember message insert allowed';
 exception when insufficient_privilege then null; when raise_exception then if sqlerrm='Not a member' then null;else raise;end if;end;
 begin
 update public.food_logs set user_id='11111111-1111-4111-a111-111111111111' where id='bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb';
 raise exception 'FAIL: ownership reassignment allowed';exception when insufficient_privilege then null;end;
 raise notice 'PASS: reads, writes, IDOR, private chat and ownership checks';
end $$;
reset role;
rollback;
