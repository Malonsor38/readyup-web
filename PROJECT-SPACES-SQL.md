# Project spaces — SQL

Run this once, in Supabase → SQL Editor → New query. Expect
**"Success. No rows returned."**

It is safe to re-run: every object is dropped first.

---

## 1. Tables

```sql
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null,
  name        text not null,
  pitch       text,
  status      text not null default 'forming'
              check (status in ('forming','active','paused','shipped','archived')),
  created_by  uuid not null references public.profiles(id) on delete restrict,
  created_at  timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);

create unique index if not exists projects_slug_key on public.projects (lower(slug));
alter table public.projects add constraint projects_slug_shape
  check (slug ~ '^[a-z0-9][a-z0-9-]{1,39}$');

create table if not exists public.project_members (
  project_id  uuid not null references public.projects(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  role_label  text,
  is_owner    boolean not null default false,
  state       text not null default 'invited'
              check (state in ('invited','active','past')),
  can_add_resources boolean not null default false,
  joined_at   timestamptz,
  left_at     timestamptz,
  primary key (project_id, profile_id)
);

create table if not exists public.project_resources (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  label       text not null,
  url         text not null,
  added_by    uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists project_members_profile_idx on public.project_members (profile_id);
create index if not exists project_resources_project_idx on public.project_resources (project_id);
```

## 2. Helpers

`security definer` matters: without it, a membership check inside a
`project_members` policy would recurse.

```sql
create or replace function public.is_active_member(p uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.project_members m
    where m.project_id = p and m.profile_id = auth.uid() and m.state = 'active'
  );
$$;

create or replace function public.is_project_owner(p uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.project_members m
    where m.project_id = p and m.profile_id = auth.uid()
      and m.is_owner and m.state = 'active'
  );
$$;

-- how many live projects this person already owns (the cap of three)
create or replace function public.owned_active_count(u uuid)
returns int language sql security definer stable as $$
  select count(*)::int
  from public.project_members m
  join public.projects p on p.id = m.project_id
  where m.profile_id = u and m.is_owner and m.state = 'active'
    and p.status in ('forming','active','paused');
$$;

-- touched whenever the team or the resource list changes, so the badge
-- can soften to "Quiet" on its own after 60 days
create or replace function public.touch_project()
returns trigger language plpgsql security definer as $$
begin
  update public.projects
     set last_activity_at = now()
   where id = coalesce(new.project_id, old.project_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists members_touch on public.project_members;
create trigger members_touch after insert or update or delete
  on public.project_members for each row execute function public.touch_project();

drop trigger if exists resources_touch on public.project_resources;
create trigger resources_touch after insert or update or delete
  on public.project_resources for each row execute function public.touch_project();
```

## 3. The creator becomes the owner

Doing this in a trigger rather than in the browser means a project can never
exist without an owner, even if the page crashes mid-request.

```sql
create or replace function public.add_project_owner()
returns trigger language plpgsql security definer as $$
begin
  insert into public.project_members (project_id, profile_id, is_owner, state, can_add_resources, joined_at)
  values (new.id, new.created_by, true, 'active', true, now());
  return new;
end;
$$;

drop trigger if exists projects_add_owner on public.projects;
create trigger projects_add_owner after insert on public.projects
  for each row execute function public.add_project_owner();
```

## 4. Row-level security

```sql
alter table public.projects          enable row level security;
alter table public.project_members   enable row level security;
alter table public.project_resources enable row level security;

drop policy if exists "projects are public"      on public.projects;
drop policy if exists "members can create"       on public.projects;
drop policy if exists "owner can edit"           on public.projects;
drop policy if exists "owner can delete"         on public.projects;
drop policy if exists "credits are public"       on public.project_members;
drop policy if exists "see your own invites"     on public.project_members;
drop policy if exists "owner manages the team"   on public.project_members;
drop policy if exists "accept or leave yourself" on public.project_members;
drop policy if exists "team reads resources"     on public.project_resources;
drop policy if exists "permitted members add"    on public.project_resources;
drop policy if exists "remove resources"         on public.project_resources;

-- projects: existence is public; the cap of three is enforced on insert
create policy "projects are public" on public.projects
  for select to anon, authenticated using (true);

create policy "members can create" on public.projects
  for insert to authenticated
  with check (created_by = auth.uid() and public.owned_active_count(auth.uid()) < 3);

create policy "owner can edit" on public.projects
  for update to authenticated
  using (public.is_project_owner(id)) with check (public.is_project_owner(id));

create policy "owner can delete" on public.projects
  for delete to authenticated using (public.is_project_owner(id));

-- membership: active and past rows are the public credit;
-- a pending invite is visible only to the invitee and the owner
create policy "credits are public" on public.project_members
  for select to anon, authenticated
  using (state in ('active','past') or profile_id = auth.uid() or public.is_project_owner(project_id));

create policy "owner manages the team" on public.project_members
  for all to authenticated
  using (public.is_project_owner(project_id)) with check (public.is_project_owner(project_id));

create policy "accept or leave yourself" on public.project_members
  for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- resources: the active team only
create policy "team reads resources" on public.project_resources
  for select to authenticated using (public.is_active_member(project_id));

create policy "permitted members add" on public.project_resources
  for insert to authenticated
  with check (
    added_by = auth.uid() and (
      public.is_project_owner(project_id)
      or exists (
        select 1 from public.project_members m
        where m.project_id = project_resources.project_id
          and m.profile_id = auth.uid()
          and m.state = 'active' and m.can_add_resources
      )
    )
  );

create policy "remove resources" on public.project_resources
  for delete to authenticated
  using (added_by = auth.uid() or public.is_project_owner(project_id));
```

## 5. Inviting by handle

The browser cannot look up another member's id — that would mean reading rows it
has no business reading. So invitation goes through a function that takes a
handle, checks the caller owns the project, and inserts the row itself.

```sql
create or replace function public.invite_by_handle(p_project uuid, p_handle text, p_role text)
returns text language plpgsql security definer as $$
declare target uuid;
begin
  if not public.is_project_owner(p_project) then
    return 'not_owner';
  end if;

  select id into target from public.profiles where lower(handle) = lower(trim(p_handle));
  if target is null then
    return 'no_such_member';
  end if;

  if exists (select 1 from public.project_members
             where project_id = p_project and profile_id = target and state <> 'past') then
    return 'already_invited';
  end if;

  insert into public.project_members (project_id, profile_id, role_label, state)
  values (p_project, target, nullif(trim(p_role), ''), 'invited')
  on conflict (project_id, profile_id)
  do update set state = 'invited', role_label = nullif(trim(p_role), ''), left_at = null;

  return 'ok';
end;
$$;

revoke all on function public.invite_by_handle(uuid, text, text) from public, anon;
grant execute on function public.invite_by_handle(uuid, text, text) to authenticated;
```

It returns a short code rather than raising, so the page can phrase the message:
`ok`, `no_such_member`, `already_invited`, `not_owner`.

## 6. Check it worked

```sql
select tablename, policyname, cmd
from pg_policies
where tablename in ('projects','project_members','project_resources')
order by tablename, policyname;
```

Expect nine rows: four on `projects`, three on `project_members`, three on
`project_resources` (the `for all` policy counts once, as `ALL`).
