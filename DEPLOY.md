# Ready Up — deploying to readyup.quest

Everything in this `dist/` folder is the site. Upload its **contents** (not the folder
itself) to your web root, so that `index.html` sits at the top level of the domain.

## What's in here

| File | Becomes | What it is |
| --- | --- | --- |
| `index.html` | `readyup.quest/` | Landing page |
| `faq.html` | `readyup.quest/faq` | Ten questions |
| `guidelines.html` | `readyup.quest/guidelines` | Community guidelines |
| `profile.html` | `readyup.quest/profile` | Example member profile |
| `join.html` | `readyup.quest/join` | Sign in, sign up, verification, password reset |
| `edit.html` | `readyup.quest/edit` | Edit your profile |
| `verify-email.html` | not a page | The verification email template — paste into Supabase's email settings, don't upload it as a page. Its links are absolute on purpose; emails have no base document, so relative links are dead on arrival. |

Supporting files, all required:

- `support.js` — the runtime every page loads. Must stay at the web root.
- `image-slot.js` — image placeholders.
- `styles.css` and `_ds/nocturne-…/` — the design system. Keep the folder name exactly as it is.
- `uploads/pasted-…jpg` — the hex artwork in the page margins.
- `uploads/you.jpg` — the avatar used on the landing card and the example profile.
- `readyup-api.js` — the Supabase wiring, holding the publishable keys. **Required**:
  every page loads it, and without it every form fails silently.
- `_redirects` — clean URLs and redirects (Cloudflare Pages / Netlify).
- `SUPABASE-SETUP.md` — backend setup notes. Harmless to upload, or leave it out.

Keep the folder structure exactly as it is. All links are relative, so the site works
in a subfolder or on a staging domain without changes.

## Clean URLs and redirects

`_redirects` in this folder handles both. It is the Cloudflare Pages / Netlify
format and needs no other configuration — upload it with everything else.

On **GitHub Pages** that file is ignored. Pages still serves `/faq` from
`faq.html`, but the redirect lines do nothing, and it cannot serve profile pages
at `/handle` at all — see below.

On **Apache**, translate it to `.htaccess`:

    RewriteEngine On
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteCond %{REQUEST_FILENAME}\.html -f
    RewriteRule ^(.+)$ $1.html [L]
    Redirect 301 /signup /join
    Redirect 301 /login /join
    Redirect 301 /account /edit
    Redirect 301 /rules /guidelines

On **Nginx**, inside `server { }`:

    location / { try_files $uri $uri.html $uri/ =404; }

### Profile URLs

Members share `readyup.quest/their-handle`. That needs a catch-all rewrite to a
handle-driven profile page. The rule is written in `_redirects`, commented out,
because that page does not exist yet — uncomment the last line once it does.

This is the one capability GitHub Pages lacks. If the site stays on Pages, profile
links will have to look like `/profile.html?u=their-handle` instead.

## DNS

At your registrar, point the domain at your host:

- Apex (`readyup.quest`): an `A` record to your host's IP, or `ALIAS`/`ANAME` if they offer it.
- `www`: a `CNAME` to `readyup.quest`, then redirect `www` to the apex (or the other way
  round — pick one and be consistent, so you don't split search rankings).
- Turn on HTTPS. Most hosts issue a free certificate automatically once DNS resolves.

Allow up to 24 hours for DNS to propagate, though it's usually minutes.

## What still needs a backend

The pages are the front end. These parts currently run in the browser and need real
server support before launch:

1. **Accounts.** Sign up, sign in and password reset don't create or check anything yet.
2. **Verification email.** `verify-email.html` is the design. Your mail service needs to
   send it with a real one-time token, and the button should point at
   `https://readyup.quest/join?screen=verified`. The six-digit code in the email is
   currently the fixed demo value `402913`.
3. **Handles.** The reserved list in `join.html` covers brand terms and route collisions.
   Uniqueness and a slur filter must be enforced server-side — the browser list is
   readable by anyone.
4. **Uploads.** Avatar and CV buttons don't send files anywhere yet.
5. **Delete account.** The password step is a length check only. It must verify the real
   password, and ideally hold the account for a grace period rather than erasing at once.
6. **The signed-in state** is remembered in browser storage so the nav can show
   "My profile". Replace it with a real session.

## Making changes later

Edit the `.dc.html` files in the project root, not the files in `dist/` — those are the
build output and get overwritten. One exception to the build step: `verify-email.html`
is copied verbatim, never link-rewritten, because its URLs must stay absolute. Ask for a re-export and this folder is rebuilt with the
deployment names and links.
