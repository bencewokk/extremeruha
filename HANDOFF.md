# Handing the site over to the owner

The owner switches the site to **his own accounts** from the admin panel, so he
doesn't need to touch the code or the server.

## 0. Admin login (needs server access, done once)

The admin password is stored only as a bcrypt hash, so it can't be recovered.
Set a new one:

```bash
npm run admin:password -- <username> <new-password>
```

Copy the three lines it prints (`ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`,
`JWT_SECRET`) into `server/.env`, or into the hosting provider's environment
variables. Remove any `ADMIN_PASSWORD=` line, then restart the server. Give the
owner the username and password.

> If your host expands `$` in env values (e.g. docker-compose), wrap the hash
> in single quotes or write each `$` as `$$`.

Also set `PUBLIC_URL=https://extremeruha.hu` so the Google redirect URI is
always correct.

## 1. Images: `/admin` → **Képtárhely**

He enters his own Cloudinary Cloud name, API Key and API Secret. The keys are
checked before they're saved. The step-by-step guide is right next to the form.

## 2. Bookings: `/admin` → **Foglalások (Google Naptár)**

He creates an OAuth client in his own Google Cloud project, pastes the Client
ID and secret, and clicks **Google-fiók csatlakoztatása**. The refresh token is
fetched and saved automatically, so nobody has to copy tokens around. The
on-page guide covers every Google Console click, including putting the app
**In production** (in "Testing" mode Google expires the connection after 7
days).

## How it works

- Settings are stored in MongoDB (`settings` collection), or in
  `server/data/settings.json` if MongoDB isn't connected. That file is
  gitignored.
- Values saved in the admin **win over** `server/.env`. Until the owner saves
  his own, the old `.env` values keep the site working. A badge in each section
  shows which one is active.
- Secrets are never sent back to the browser, only masked.
- Deleting a product only removes its image from Cloudinary when the image is
  in the currently configured cloud. Old images in the previous account are
  left alone.

## 3. After he's switched over

Revoke your old access: delete your Google OAuth client / revoke the token,
rotate your Cloudinary API secret, and remove the old values from `server/.env`.
