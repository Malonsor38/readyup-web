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
| `verify-email.html` | not a page | The verification email template — give this to whoever sends your mail, don't upload it as a page |

Supporting files, all required:

- `support.js` — the runtime every page loads. Must stay at the web root.
- `image-slot.js` — image placeholders.
- `styles.css` and `_ds/nocturne-…/` — the design system. Keep the folder name exactly as it is.
- `uploads/pasted-…jpg` — the hex artwork in the page margins.
- `uploads/you.jpg` — the avatar used on the landing card and the example profile.

Keep the folder structure exactly as it is. All links are relative, so the site works
in a subfolder or on a staging domain without changes.

## Clean URLs (dropping the .html)

The pages link to each other as `faq.html`, `profile.html` and so on, which works
anywhere with no configuration. If you'd rather the address bar read `readyup.quest/faq`,
add one of the following. Both keep the `.html` links working, so nothing breaks.

**Apache** — create a file called `.htaccess` at the web root:

    RewriteEngine On
    # serve /faq from faq.html
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteCond %{REQUEST_FILENAME}\.html -f
    RewriteRule ^(.+)$ $1.html [L]
    # send /faq.html to /faq, once, for search engines
    RewriteCond %{THE_REQUEST} \s/+(.+)\.html[\s?] [NC]
    RewriteRule ^ /%1 [R=301,L]

**Nginx** — inside your `server { }` block:

    location / {
      try_files $uri $uri.html $uri/ =404;
    }

**Netlify, Vercel, Cloudflare Pages, GitHub Pages** — this is the default behaviour.
Drop the folder in and `/faq` will resolve to `faq.html` on its own.

## Redirects worth adding

Point common guesses at the real pages so nobody lands on a 404:

| From | To |
| --- | --- |
| `/signup`, `/sign-up`, `/register`, `/login`, `/signin` | `/join` |
| `/account`, `/settings`, `/my-profile` | `/edit` |
| `/rules`, `/code-of-conduct` | `/guidelines` |
| `/help`, `/questions` | `/faq` |
| `/discord` | your Discord invite (see the note below) |

Apache, in the same `.htaccess`:

    Redirect 301 /signup /join
    Redirect 301 /login /join
    Redirect 301 /account /edit
    Redirect 301 /rules /guidelines

Nginx:

    location = /signup { return 301 /join; }
    location = /login  { return 301 /join; }
    location = /account { return 301 /edit; }
    location = /rules  { return 301 /guidelines; }

A note on `/discord`: the whole site deliberately gates the invite behind sign-up, so
a public `/discord` redirect would undo that. Only add it if you change your mind about
the gate.

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
build output and get overwritten. Ask for a re-export and this folder is rebuilt with the
deployment names and links.
