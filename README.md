# Attendance

A lightweight employee clock-in/out system. Each employee gets a unique QR code — scanning it opens their personal clock page on their phone, they tap a button, and they're clocked in or out. The server verifies they're physically at the shop before accepting the record.

## The Problem

Tracking attendance at a small shop usually means one of a few painful options:

- **Paper sign-in sheets** — easy to fake, hard to audit, annoying to compile at month-end.
- **Biometric/fingerprint machines** — expensive hardware, breaks often, one point of failure, doesn't travel.
- **Heavy HR software** — overkill for a handful of employees, subscription costs, steep learning curve.
- **A shared "clock-in" tablet or phone** — still fakeable (anyone can tap in for anyone), and a single device can go missing or run out of battery.

What a small business actually needs: **a cheap, accurate way to verify "this specific person was at the shop at this specific time" — without buying hardware.**

## My Solution

Every employee's smartphone becomes their clock-in device, and their **unique QR code is their identity**. They can't accidentally clock anyone else in because only their own QR opens their own page.

But a QR alone isn't enough — someone could photograph another person's code and scan it from home. So the server enforces **physical presence** before accepting the record:

1. **Office WiFi check** — is the request coming from the shop's network?
2. **Geofence fallback** — if WiFi can't be verified (e.g. the employee's on mobile data), is their phone's GPS location within 100m of the shop?

If neither passes, the clock-in is rejected with a clear message. If WiFi fails but GPS succeeds, the record is still accepted but **flagged in the log** so the admin can see which clock-ins used the fallback — useful for spotting patterns.

### Why this works for a small shop

- **Zero hardware cost.** Everyone already has a phone.
- **Nothing to steal or lose.** The QR lives on the employee's own device (or a printed copy at their desk).
- **Impossible to clock in from home.** GPS + WiFi checks enforce physical presence.
- **Honest audit trail.** Every record stores timestamp, IP, GPS coords, and how it was verified.
- **Admin-friendly.** Web dashboard to add/remove employees, print QR codes, view daily attendance, see analytics, and manually correct records when needed.

## Tech Stack

- **Backend:** Node.js + Express, deployed as Vercel serverless functions
- **Database:** MongoDB Atlas (free tier)
- **Frontend:** Plain HTML/CSS/JS — no framework, no build step
- **Fonts:** Syne (display), Inter (body), JetBrains Mono (accents)
- **Charts:** Chart.js via CDN
- **QR codes:** Generated server-side with the `qrcode` package

## How It Works

### Employee flow

```
Scan QR on phone
      ↓
Opens /clock/{unique-token}
      ↓
Server checks:
  - Is this token valid?        → reject if no
  - Is current status "in"?     → next action is "out", else "in"
      ↓
Employee taps the button
      ↓
Browser grabs GPS coords (if allowed)
      ↓
POST /api/clock/{token}  with { lat, lng }
      ↓
Server verifies presence:
  - Is IP on office subnet?     → pass (verification: "wifi")
  - Is GPS within 100m of shop? → pass (verification: "geo-fallback")
  - Otherwise                   → 403 rejection
      ↓
Record saved → success shown on phone
```

### Admin flow

The `/admin` page (currently unauthenticated — the system lives behind geofence + WiFi checks, not login walls) provides:

- Add/delete employees
- Generate, view, download, and print each employee's QR code
- View attendance log (filter by date and employee)
- Delete individual records and add records manually
- Analytics: daily clock-in counts, hours worked per employee this week
- CSV import for backfilling historical data

## Data Model

```js
// Employee
{ _id, name, qrToken (UUID), createdAt }

// Attendance
{ _id, employeeId, type: "in" | "out", timestamp, location: { lat, lng }, ip, verification: "wifi" | "geo-fallback" }
```

## API

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/clock/:token` | Employee-facing clock page |
| `GET` | `/admin` | Admin dashboard |
| `GET` | `/api/status/:token` | Current clock-in status for an employee |
| `POST` | `/api/clock/:token` | Clock in/out (toggles) — enforces location checks |
| `GET` | `/api/employees` | List employees |
| `POST` | `/api/employees` | Create employee |
| `DELETE` | `/api/employees/:id` | Delete employee + their records |
| `GET` | `/api/qr/:token` | Generate QR code PNG (data URL) |
| `GET` | `/api/attendance` | Attendance log (filters: `?date=...&employeeId=...`) |
| `POST` | `/api/attendance/manual` | Admin-created record |
| `DELETE` | `/api/attendance/:id` | Delete a record |
| `GET` | `/api/analytics?days=14` | Daily counts + hours-per-employee |
| `POST` | `/api/import` | CSV bulk import (temporary — remove after backfill) |
| `GET` | `/api/health` | Health check (DB state, env presence) |

## Configuration

Environment variables (`.env` locally, Vercel project settings in prod):

```
MONGODB_URI        mongodb+srv://...
OFFICE_LAT         5.630259
OFFICE_LNG         -0.076336
GEOFENCE_RADIUS    100          # meters
OFFICE_SUBNET      192.168.100  # local WiFi subnet prefix
BASE_URL           https://your-deployment.vercel.app
```

## Running Locally

```bash
npm install
npm start
```

The server runs on `http://localhost:3000`. Make sure MongoDB is running locally, or set `MONGODB_URI` to your Atlas cluster.

## Deployment

Deployed on Vercel. Because Vercel sits in front of the app, the WiFi-subnet check effectively never passes in production — all clock-ins use the GPS fallback (which is still strong: the employee has to physically be within 100m of the shop).

If you want the WiFi check to actually work in prod, switch `OFFICE_SUBNET` to match your shop's **public IP** instead of the internal private subnet.

## Security Notes

- There is no user auth on the admin page. The system relies on the admin URL not being shared and the WiFi/geofence checks for the actual clock-in flow.
- QR tokens are UUIDs, so they can't be guessed.
- The `/api/import` endpoint is deliberately temporary — it lets anyone create records. **Remove it from `api/index.js` once historical data is loaded.**
- Employee IDs in URLs (`/clock/:token`) are the QR tokens, not database IDs, so deleting + re-adding an employee gives them a fresh token.

## Limitations

- GPS accuracy varies; indoor clock-ins sometimes report 30–50m off. If the 100m radius is too strict, bump `GEOFENCE_RADIUS` up.
- On Vercel, the WiFi-subnet check only helps if configured with the public IP. Otherwise it's effectively always GPS-only (which is fine for small shops).
- No auth means anyone who knows the admin URL can modify the employee list. Fine for a single-owner shop; add auth before scaling.
