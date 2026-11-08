# Moving extremeruha to Vercel

The repo is ready for Vercel. The frontend is served as static files, and the
Express API runs as one serverless function (`api/index.js` → `server/index.js`).
`npm start` still works the old way for local use.

## What changed for Vercel

- **MongoDB is required.** Vercel has no writable disk, so products and every
  admin setting live in MongoDB. Without `MONGO_URI` the site still shows the
  built-in demo dresses, but nothing can be saved, and the admin says so.
- **Images up to 4 MB.** Vercel caps uploads at 4.5 MB per request.
- **Times are always Budapest time.** The server clock on Vercel is UTC; the
  booking rules don't depend on it.

## 1. MongoDB Atlas (free)

If the current server already uses a cloud MongoDB (check its `MONGO_URI`),
reuse that connection string and skip to step 2. The products and admin
settings come along automatically.

Otherwise:

1. Sign up at <https://www.mongodb.com/cloud/atlas/register> and create a
   free **M0** cluster. Pick a region in Europe, e.g. Frankfurt.
2. **Database Access** → add a database user with a password.
3. **Network Access** → **Add IP Address** → **Allow access from anywhere**
   (`0.0.0.0/0`). Vercel's IP addresses change, so this is needed. The
   password still protects the database.
4. **Connect** → **Drivers** → copy the connection string. Put the password
   in it and add a database name before the `?`, e.g.
   `mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/extremeruha?retryWrites=true&w=majority`

If the old server ran a local MongoDB with real products in it, copy them over
once with `mongodump` / `mongorestore`, or re-create them in `/admin`.

## 2. Create the Vercel project

1. <https://vercel.com/new> → sign in with GitHub → import
   **bencewokk/extremeruha**.
2. Vercel reads `vercel.json`, so leave the build settings as they are
   (Vite, `npm run build`, output `dist`).
3. Open **Environment Variables** and add:

| Name | Value |
|---|---|
| `MONGO_URI` | the Atlas connection string from step 1 |
| `ADMIN_USERNAME` | from `npm run admin:password` |
| `ADMIN_PASSWORD_HASH` | from `npm run admin:password` (paste as is, `$` signs are fine here) |
| `JWT_SECRET` | from `npm run admin:password` |
| `PUBLIC_URL` | `https://extremeruha.hu` |
| `GOOGLE_PLACES_API_KEY`, `GOOGLE_PLACE_ID`, `GOOGLE_PLACE_REVIEW_LANGUAGE` | copy from the old server if the Google reviews are wanted |

   Cloudinary and Google Calendar keys are **optional** here. Copy the old
   `CLOUDINARY_*` / `GOOGLE_*` values if you want everything to work exactly
   like today, or leave them out and let the owner set his own in `/admin`.

4. **Deploy**.

## 3. Test on the `*.vercel.app` address

- The homepage loads, the dresses show, and the opening hours and booking types appear.
- `/admin` login works and **Foglalások** saves (this proves MongoDB works).
- Upload a dress image (proves Cloudinary works).
- In the booking form, closed days say "zárva vagyunk" and open days list slots.

## 4. Point the domain at Vercel

1. Vercel project → **Settings → Domains** → add `extremeruha.hu` and
   `www.extremeruha.hu`.
2. Vercel shows the DNS records to set (usually an `A` record for the bare
   domain and a `CNAME` for `www`). Enter exactly those at the domain registrar.
3. Wait for Vercel to show the domains as valid. The HTTPS certificate is
   automatic.

## 5. Google Calendar redirect URI

The Google "Connect" flow only works on the address registered in Google
Cloud Console. Use the URI shown in `/admin` → **Google Naptár** on the final
domain (`https://extremeruha.hu/api/admin/google/callback`). If you also want
to connect while testing on `*.vercel.app`, add that address's URI in Google
as well; a client can have several.

## 6. Switch off the old host

Once the domain serves from Vercel and a test booking works, shut down the old
server so there aren't two copies of the site running.
