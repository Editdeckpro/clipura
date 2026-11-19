# Running the Clipura demo from your PC (free)

For the demo, the website lives on **Vercel** (free) and the **engine runs on your
PC**, reached through a free **Cloudflare tunnel**. No Render bill yet. The Render
setup files are kept, so you can switch to always-on hosting later with one change.

## One-time setup

1. In `backend\.env`, make sure you have these lines (your API keys are already there):

   ```
   ACCESS_CODE=pick-any-code          # the code you give testers
   DAILY_PROCESSING_MINUTES=180       # safety cap on minutes/day
   FRONTEND_URL=http://localhost:3000,https://YOUR-SITE.vercel.app
   ```

   Put BOTH addresses in `FRONTEND_URL`, comma-separated (local for you, the Vercel
   site for testers). Replace `YOUR-SITE.vercel.app` with your real Vercel address.

2. Deploy the website on Vercel (see "Vercel steps" below).

## Each time you want the demo online

1. **Double-click `start-clipura.bat`.** Two windows open: the backend and the tunnel.
   (The first run also downloads the tunnel tool and installs dependencies.)
2. In the **tunnel** window, copy the address that looks like
   `https://something.trycloudflare.com`.
3. If that address is the **same** as last time, you're done.
   If it **changed**, update it in Vercel (see "When the address changes").
4. Leave both windows open while testers use the site. To stop, close both windows.

## When the tunnel address changes

The Cloudflare address changes every time you restart the tunnel (for example after
a reboot). When it changes:

1. Vercel → your project → **Settings → Environment Variables**.
2. Edit `NEXT_PUBLIC_API_URL` → paste the new `https://...trycloudflare.com` address → Save.
3. Vercel → **Deployments** → click the latest → **Redeploy**. (~1 minute.)

Tip: to avoid doing this daily, keep your PC awake and leave the two windows open —
the address stays the same for as long as the tunnel keeps running.

## What testers see if your PC is off or asleep

The site shows a friendly **"We're offline right now"** screen with a Try again
button — not a broken error. When your PC and the tunnel are back up, Try again
(or a refresh) lets them in.

## Switching to always-on hosting (Render) later

Everything for Render is already in the repo (`render.yaml`, `backend/Dockerfile`,
`DEPLOY.md`). To switch: deploy on Render, then in Vercel change
`NEXT_PUBLIC_API_URL` to the Render address and redeploy. Stop running the PC
tunnel. That's the whole switch.
