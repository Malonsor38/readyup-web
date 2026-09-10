# Ready Up — Supabase setup

> **The site will not work until steps 2, 3 and 4 have been run.** The keys are in
> place, which means the pages now make real calls to your project — and your project
> currently has no `profiles` table, so sign-up, sign-in, the handle check and profile
> saving all fail. Run the SQL below before deploying `dist/` anywhere public.

Everything the front end expects, in the order you should create it. Nothing here
requires a server of your own: the site is static, the browser talks to Supabase
directly with the publishable key, and the one privileged operation (account
deletion) runs in an Edge Function.

## 1. Keys

Project Settings → API. Copy two values into the top of `readyup-api.js`:

    SUPABASE_URL:      https://<your-project>.supabase.co
    SUPABASE_ANON_KEY: <the "anon / public" key>

Both are publishable and safe in the browser. **Never** put the `service_role`
key in that file, or in any file under `dist/` — it bypasses every security rule
below. It belongs only in the Edge Function in step 6.

Until those two values are filled in, every page still works: the API layer
detects the blank config and resolves calls locally so you can click through the
flow. It switches to the real backend the moment keys are present.

## 2. The profiles table

SQL Editor → new query → run:

```sql
create table public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  handle       text not null,
  display_name text,
  discipline   text,
  headline     text,
  location     text,
  timezone     text,
  availability text,
  bio          text,
  skills       text[] default '{}',
  links        text[] default '{}',
  visibility   text not null default 'members'
               check (visibility in ('public','members','hidden')),
  avatar_path  text,
  cv_path      text,
  updated_at   timestamptz default now()
);

-- handles are case-insensitive and unique
create unique index profiles_handle_key on public.profiles (lower(handle));

-- reject handles that collide with a route or a brand term
create table public.reserved_handles (handle text primary key);
insert into public.reserved_handles (handle) values
  ('p'), ('project'), ('projects'),   -- project routes live at /p/<slug>
  ('example'), ('demo'),             -- 'sample' is the demo profile's own handle
  ('readyup'),('ready-up'),('readyupquest'),('official'),('staff'),('team'),
  ('admin'),('administrator'),('moderator'),('mod'),('mods'),('support'),
  ('help'),('contact'),('info'),('hello'),('noreply'),('no-reply'),
  ('postmaster'),('webmaster'),('abuse'),('security'),('legal'),('billing'),
  ('about'),('api'),('auth'),('blog'),('careers'),('dashboard'),('discord'),
  ('docs'),('edit'),('faq'),('guidelines'),('home'),('index'),('join'),
  ('jobs'),('login'),('logout'),('me'),('new'),('news'),('password'),
  ('press'),('privacy'),('profile'),('profiles'),('projects'),('register'),
  ('reset'),('search'),('settings'),('signin'),('signup'),('terms'),
  ('u'),('user'),('users'),('verify'),('www'),
  ('null'),('undefined'),('anonymous'),('deleted');

alter table public.profiles add constraint handle_shape
  check (handle ~ '^[a-z0-9][a-z0-9-]{1,23}$');

-- reserved handles can't be a CHECK constraint (Postgres forbids subqueries
-- there), so it's a trigger
create or replace function public.check_handle_reserved()
returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.reserved_handles where handle = lower(new.handle)) then
    raise exception 'That handle is reserved.';
  end if;
  return new;
end;
$$;

create trigger profiles_handle_not_reserved
  before insert or update of handle on public.profiles
  for each row execute function public.check_handle_reserved();
```

The browser also holds a copy of that reserved list for the live "is it free?"
message, but the constraint above is what actually enforces it. A slur filter
belongs here too — add it as another table and constraint, not in the front end,
where anyone can read and bypass it.

## 3. Row-level security

Without this, the anon key can read and write everyone's rows. Run it.

```sql
alter table public.profiles enable row level security;

-- you can always see and edit your own
create policy "own profile: read"   on public.profiles
  for select using (auth.uid() = id);
create policy "own profile: insert" on public.profiles
  for insert with check (auth.uid() = id);
create policy "own profile: update" on public.profiles
  for update using (auth.uid() = id);

-- public profiles are readable by anyone, signed in or not
create policy "public profiles" on public.profiles
  for select using (visibility = 'public');

-- members-only profiles are readable by anyone signed in
create policy "member profiles" on public.profiles
  for select using (visibility = 'members' and auth.role() = 'authenticated');
```

Note what this gives you: `hidden` profiles are readable only by their owner,
`members` needs a session, `public` is open — which is exactly what the three
radio buttons on the edit page promise.

The handle-availability check needs to see whether a handle exists without
exposing the row. Add a narrow function for it:

```sql
create or replace function public.handle_available(candidate text)
returns boolean language sql security definer stable as $$
  select not exists (select 1 from public.profiles where lower(handle) = lower(candidate));
$$;
grant execute on function public.handle_available(text) to anon, authenticated;
```

## 4. Storage buckets

Storage → create two buckets:

- **`avatars`** — public. Profile pictures are shown on public profiles.
- **`cvs`** — private. A CV should only be downloadable via a signed URL.

Then restrict writes to the owner's own folder (files are stored as
`<user-id>/<timestamp>-<name>`):

```sql
create policy "own avatar upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "own cv upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "own cv read" on storage.objects
  for select to authenticated
  using (bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "own file delete" on storage.objects
  for delete to authenticated
  using (bucket_id in ('avatars','cvs') and (storage.foldername(name))[1] = auth.uid()::text);
```

## 5. Email

**Custom SMTP first — Supabase will not let you edit templates without it.** The
Templates tab shows "Set up custom SMTP to edit templates" and the subject and body
fields stay read-only until a provider is connected. Until then Supabase sends its
own plain default emails, which work fine for testing the flow — you're only blocked
from the design, not from signing up.

### 5a. Connect a sender

Authentication → Emails → **SMTP Settings**. Any provider works; Resend and Postmark
are the least painful to set up. You'll verify a sending domain with DNS records (SPF
and DKIM) at your registrar — the provider hands you the exact records to paste.
Sender address: something like `hello@readyup.quest`.

Most providers also give you a sandbox sender that can only mail your own address,
which is enough to unlock the templates while DNS propagates.

### 5b. The templates

Once SMTP is connected the fields unlock. Authentication → Emails → Templates.

Authentication → Email Templates → **Confirm signup**. The design is in
`verify-email.html`; paste its HTML in and make two substitutions:

- the button's `href` becomes `{{ .ConfirmationURL }}`
- the plain-text fallback link below it: both its `href` **and** its visible text become
  `{{ .ConfirmationURL }}`, so the address people read is the one they'd land on
- the six-digit number (currently the demo value `402913`) becomes `{{ .Token }}`

Code length is set under Authentication → Providers → Email → **Email OTP Length**
(6–10, default 6). The site accepts anything in that range, so you don't have to
match it — but whatever you pick, the email panel and the field agree automatically.

Every other link in the file is already absolute (`https://readyup.quest/faq`,
`https://readyup.quest/guidelines`). They must stay absolute: an email has no base
document, so a relative href is dead on arrival in every mail client. If you change
the domain, change them here too.

That second one is what makes the "enter the code" field work — without
`{{ .Token }}` in the template, there is no code to type, and you should turn the
field off (`showCodeEntry` in the page's tweaks).

Do the same for **Reset password**, pointing at `{{ .ConfirmationURL }}`.

Then Authentication → URL Configuration:

- Site URL: `https://readyup.quest`
- Redirect URLs: `https://readyup.quest/join.html?screen=verified` and
  `https://readyup.quest/join.html?screen=reset`

Supabase's built-in mail is rate-limited and not meant for production volume.
Before launch, set up a real SMTP provider under Project Settings → Auth → SMTP.

### 5c. Match the password rules server-side

The sign-up form requires 8+ characters with an uppercase letter, a lowercase
letter, a number and a symbol, shown as a live checklist under the field. That check
runs in the browser, so it is a courtesy, not a defence — anyone can call the API
directly. Mirror it in Supabase: **Authentication → Providers → Email**, set
*Minimum password length* to 8 and tick the "Lowercase, uppercase, digits and
symbols" requirement. If you change either side, change both, or people will pass one
check and fail the other with a confusing error.

## 6. Blocked handle terms

Step 2 gave you `reserved_handles`, which blocks whole words like `admin`. That
does nothing against `xx-slur-xx`, so this second table blocks handles that merely
*contain* a term.

```sql
create table public.blocked_handle_terms (term text primary key);

create or replace function public.check_handle_clean()
returns trigger language plpgsql as $$
declare bad text;
begin
  select term into bad
    from public.blocked_handle_terms
   where position(term in lower(new.handle)) > 0
   limit 1;
  if bad is not null then
    raise exception 'That handle contains a blocked word.';
  end if;
  return new;
end;
$$;

create trigger profiles_handle_clean
  before insert or update of handle on public.profiles
  for each row execute function public.check_handle_clean();
```

**Filling it is your call, and it should not come from me.** Use a maintained list
rather than anything hand-written: the widely used one is
`LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words` on GitHub, which
covers many languages. Download the English file and load it:

```sql
insert into public.blocked_handle_terms (term)
values ('term1'), ('term2'), ('term3')
on conflict do nothing;
```

Two things to know. Substring matching over-blocks — a list containing `ass` will
reject `cassandra`, and `cum` will reject `cumbria`. Trim the short entries, or
you will be answering support mail from people called Cassandra. And no list is
complete; treat it as a speed bump, with a way to report a handle after the fact.

The front end doesn't duplicate this list. A blocked handle is caught at save time
and surfaces as "That's already taken. Try another." If you'd rather it said
something more specific, tell me and I'll add the phrasing.

## 6d. Showreel and projects columns

The edit page collects a showreel link and a list of projects. Both need columns:

```sql
alter table public.profiles add column showreel_url text;
alter table public.profiles add column projects jsonb not null default '[]';
```

Projects are stored as a JSON array on the profile rather than in their own table.
Each entry looks like
`{"title": "...", "role": "...", "meta": "...", "blurb": "..."}`. That keeps them
under the same row-level security as the rest of the profile, with nothing extra to
configure.

The trade-off, worth knowing before this grows: JSON entries are private claims, not
shared credits. Two people on the same game each write their own version, and neither
confirms the other. If credits ever need to be mutual or verifiable, that wants a real
`projects` table with a join table for members — a bigger change, best made before
many people have filled these in.

## 6c. Let visitors download a CV from a public profile

The `cvs` bucket is private and step 4 only granted read access to the owner. A
recruiter opening `readyup.quest/jae-rivera` therefore sees the profile but cannot
fetch the CV. This policy opens exactly one door: CVs belonging to profiles their
owner has set to public.

```sql
create policy "cv readable on public profiles" on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'cvs'
    and exists (
      select 1 from public.profiles p
      where p.id::text = (storage.foldername(name))[1]
        and p.visibility = 'public'
        and p.deletion_scheduled_at is null
    )
  );
```

Members-only and hidden profiles keep their CVs locked to the owner, and a profile
awaiting deletion drops out immediately. The download link the page generates is
signed and expires after an hour, so it can't be passed around indefinitely.

## 7. The 24-hour deletion grace period

Deleting is not immediate. When someone confirms, the site stamps
`deletion_scheduled_at` on their row 24 hours out; a scheduled job does the
irreversible part. Until then they keep access and see a banner offering to cancel.

### 7a. The column, and hiding the profile straight away

```sql
alter table public.profiles add column deletion_scheduled_at timestamptz;

-- a profile awaiting deletion drops out of public and member views at once,
-- so it feels deleted to everyone else immediately
drop policy if exists "public profiles" on public.profiles;
drop policy if exists "member profiles" on public.profiles;

create policy "public profiles" on public.profiles
  for select using (visibility = 'public' and deletion_scheduled_at is null);

create policy "member profiles" on public.profiles
  for select using (visibility = 'members'
                    and auth.role() = 'authenticated'
                    and deletion_scheduled_at is null);
```

The owner's own read policy is untouched, which is what lets them come back and
cancel.

### 7b. The purge function

The code is in **`supabase-purge-accounts.ts`**. Deploy it the same way as the
last one: Edge Functions → Deploy a new function → Via editor, named exactly
`purge-accounts`.

It refuses any caller that doesn't present the secret key, so it can't be triggered
from a browser even by someone holding your publishable key.

### 7c. Run it hourly

Database → Extensions → enable **`pg_cron`** and **`pg_net`**. Then, replacing
both placeholders with your project ref and your service_role key:

```sql
select cron.schedule(
  'purge-deleted-accounts',
  '0 * * * *',
  $$
  select net.http_post(
    url     := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/purge-accounts',
    headers := '{"Authorization": "Bearer YOUR-SERVICE-ROLE-KEY", "Content-Type": "application/json"}'::jsonb
  );
  $$
);
```

This is the one place your service_role key gets written down. It lives in the
database, server-side, and never reaches a page — but treat the SQL editor
accordingly, and rotate the key if you ever paste it somewhere public.

**Check it worked:** `select * from cron.job;` should list the schedule.
To test without waiting, make a throwaway account, schedule its deletion, then run
`update profiles set deletion_scheduled_at = now() - interval '1 hour' where handle = '...';`
and invoke the function once by hand.

Runs are logged in `cron.job_run_details`.

## 7d. Checklist before going live

- [ ] Keys filled into `readyup-api.js`, `service_role` nowhere near `dist/`
- [ ] RLS enabled on `profiles` and verified (sign out, try to read a hidden profile)
- [ ] Storage policies applied; `cvs` bucket is private
- [ ] Email templates carry `{{ .ConfirmationURL }}` and `{{ .Token }}`
- [ ] Custom SMTP configured
- [ ] Redirect URLs allow-listed
- [ ] `purge-accounts` function deployed, Verify JWT off
- [ ] `pg_cron` + `pg_net` enabled and the hourly purge scheduled
- [ ] `deletion_scheduled_at` column added and the two RLS policies replaced
- [ ] `blocked_handle_terms` populated from a maintained word list
