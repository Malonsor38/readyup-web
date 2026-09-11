# Media bucket — SQL

Run once, in Supabase → SQL Editor → New query. Expect **"Success. No rows
returned."** Safe to re-run.

This adds one public bucket, `media`, split by who owns the file:

    media/u/<user-id>/…      profile art (avatars)
    media/p/<project-id>/…   project key art, and anything on a project's
                             public description later

The split is the point. Profile art belongs to a person; project art belongs to
the **project**, so it survives the uploader leaving the team. The two get
different policies, which is why they can't share a folder.

Nothing needs migrating. Existing art keeps working — files already in
`avatars` have paths like `<user-id>/123-art.png`, and the site resolves any
path *without* a `u/` or `p/` prefix from the old bucket. Leave `avatars` in
place.

---

## 1. The bucket

```sql
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do update set public = true;
```

Public, like `avatars`: project art appears on public project pages, so the
files have to be readable without a session. Nothing private goes here — CVs
stay in the private `cvs` bucket.

## 2. The helper the project policies use

This has to exist **before** the policies below, because creating a policy
resolves the function it references straight away.

```sql
create or replace function public.can_manage_project_media(p uuid)
returns boolean language sql security definer stable as $$
  select public.is_project_owner(p)
      or exists (
        select 1 from public.project_members m
        where m.project_id = p
          and m.profile_id = auth.uid()
          and m.state = 'active'
          and m.can_add_resources
      );
$$;

revoke all on function public.can_manage_project_media(uuid) from public, anon;
grant execute on function public.can_manage_project_media(uuid) to authenticated;
```

A uuid cast on a path segment would throw if someone uploaded to `p/not-a-uuid/`,
so the policy would reject it anyway — but the cast failing is an error rather
than a clean refusal. The site always builds the path from a real project id.

## 3. Policies

`storage.foldername(name)` splits the path, so for `u/<uid>/art.png` it gives
`{u, <uid>, art.png}` — index 1 is the prefix, index 2 is the owner id.

```sql
drop policy if exists "media is public"        on storage.objects;
drop policy if exists "own media insert"       on storage.objects;
drop policy if exists "own media update"       on storage.objects;
drop policy if exists "own media delete"       on storage.objects;
drop policy if exists "project media insert"   on storage.objects;
drop policy if exists "project media update"   on storage.objects;
drop policy if exists "project media delete"   on storage.objects;

-- anyone may read; the bucket is for public-facing imagery
create policy "media is public" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'media');

-- u/<user-id>/… : your own folder, same rule as avatars
create policy "own media insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'u'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "own media update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'u'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "own media delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'u'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- p/<project-id>/… : the project's team, not the uploader.
-- Same permission as adding a resource link: the owner, or an active member
-- the owner has trusted. Uses the helpers from PROJECT-SPACES-SQL.md.
create policy "project media insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'p'
    and public.can_manage_project_media(((storage.foldername(name))[2])::uuid)
  );

create policy "project media update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'p'
    and public.can_manage_project_media(((storage.foldername(name))[2])::uuid)
  );

create policy "project media delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'p'
    and public.can_manage_project_media(((storage.foldername(name))[2])::uuid)
  );
```

## 4. Check it worked

```sql
select 'bucket' as kind, id as name, public::text as detail
from storage.buckets where id = 'media'
union all
select 'policy', policyname, cmd || ' / ' || array_to_string(roles, ',')
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname like '%media%'
order by kind, name;
```

Expect the bucket with `public = true`, and seven policies: one SELECT and three
each for `own media` and `project media`.
