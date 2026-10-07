# UX & Screens v3.1

> Map-first. One big button per screen, Arabic first, French one tap away. Target user: not comfortable with technology, low-end Android, slow network.

## 1. Navigation

```
Sign-in (Google) → Language → Terms → Name → Role (once, ADR-225) → Location (required, ADR-224)
│
├─ PASSENGER
│  P1 Map home ──► P2 Destination (now · nearby · scheduled · full) ──► P3 Request sheet
│        │                                                                  │
│        └──────────── P4 Active request (only one) ◄───────────────────────┘
│                          │ closes (moved away / lost / no fix / expired / cancelled)
│                          ▼
│                      P5 Request closed (reason + Post again)
│  P6 Me: my requests (Report a problem), "I'm a driver", language, safety, delete account
│
└─ DRIVER (verified, driver-only account)
   D1 Verification form ─► D2 Status
   D3 Start sharing (vehicle, heading to [pre-filled from routine], cooldown timer)
   D4 Driver live map (passengers + all drivers; Full · Break · Stop)
   D5 Routine routes (list + editor), available without sharing
   D6 Me: sessions (Report a problem), documents, vehicle
```
**6 passenger screens, 6 driver screens.**

## 2. Passenger

### P1 · Map home
```
┌──────────────────────────────┐
│ 🔍 وين ماشي؟ Where are you going?│
│ [🚕][🚐][🚌][🧍]  layer toggles │
│                               │
│   🚕 Hédi     🧍               │
│         📍you   🚐 Sami→Sousse │
│ 🚌 Ali · L20      🚐 Karim FULL│
└──────────────────────────────┘
```
Driver names are always on the markers. Passengers (🧍) show no name.

### P2 · Destination
```
Tunis → Sousse
Heading there now (2)      🚐 Sami · 2 km · 3 min ago
Scheduled departures (3)   🚐 Hédi · Mon–Fri 07:00 · Moncef Bey
Full (1)                   🚐 Karim · FULL
[ Request a taxi / louage ]
```
For bus: buses heading there + scheduled bus routes, with no request button.

### P3 · Request sheet
Types [Taxi] [Louage] · Seats (− 1 +) · Note (optional) · ☐ **Show my name and note to drivers** (off by default) · **Request**.
The first time only: "While you wait, drivers can see where you are so the first one to arrive can pick you up. Your name stays hidden unless you choose to show it. If you move more than 20 m, we'll close your request automatically."

### P4 · Active request
```
┌──────────────────────────────┐
│ Looking for a ride → Sousse   │
│ 🟢 Visible to drivers · 4 min │
│ 👤 Anonymous  (change)        │
│ Stay within 20 m of this spot │
│   [ map: you + drivers ]      │
│ 3 drivers within 2 km · 1 full│
│ Expires 15:40   [Renew]       │
│ [ Cancel request ]            │
└──────────────────────────────┘
```
A system notification shows the whole time: "Looking for a ride · Stop".

### P5 · Request closed
The reason in plain words ("You moved away, have a good trip!", "We lost your location", …) + **Post again**. No questions.

### P6 · Me
My requests (30 days; each with **Report a problem**), I'm a driver, language, safety & emergency numbers, sign out, delete account.

## 3. Driver

### D1/D2 · Verification form & status
As before: 4 short steps (you, licences, vehicle, review) → Under review → Verified / Changes requested / Rejected, with a push on each decision.

### D3 · Start sharing
```
┌──────────────────────────────┐
│ You're not visible            │
│ Vehicle: 🚐 Louage 123 TU 4567│
│ Heading to: Sousse  (from your │
│   routine 07:00)   [change]   │
│   [  ▶ START SHARING  ]       │
│ If you stop, you can restart  │
│ after 1 hour. Use Break instead│
└──────────────────────────────┘
```
In cooldown: "Available again at 15:42". Link: **My routine routes**.

### D4 · Driver live map (sharing only)
- The map shows 🧍 passengers (exact, destination, seats, waiting time; name/note if shown) **and every other driver** (name, heading to, Full).
- The bottom list shows passengers by distance, grouped by destination. Each shows "2 drivers closer than you" to help decide whether it's worth going.
- Tap a passenger: details + **Navigate** (Google Maps/Waze deep link) · **Nobody there** · Block.
- Header controls:
  - `[ I'm full ]` ⇄ `[ Available ]`
  - `[ Break ▾ ]` → 30 min / 1 h / 2 h (confirm: "You can't come back before 14:30")
  - `[ Stop ]` (warns about the 1 h cooldown and suggests Break)
- On break: a full-screen "On break until 14:30"; at the end, a push + a big **Resume sharing** button.

### D5 · Routine routes (no sharing needed)
The list of up to 5 routines, each with its next occurrence and an on/off switch. Editor: From · To · One-off (date + time) or Weekly (days chips + time) · Seats (optional) · Note (optional) · **Save**.

### D6 · Me
Sessions (start/end, breaks, reason; each with **Report a problem** + an approximate time), documents & expiry, vehicle, language, sign out.

## 4. Copy & design rules
- Always show freshness and state: "updated 5 s ago", "waiting 4 min", "FULL", "On break until 14:30".
- Warn before consequences (the 20 m auto-close, the 1 h cooldown, breaks can't be ended early).
- Say who sees what: "Anonymous to drivers" / "Drivers see your name".
- Touch targets ≥ 48 dp; body text ≥ 16 sp; RTL-correct; vehicle types have distinct shapes (not colour only).

## 5. Approved designs (Stitch)
Project **Fi Thnitek Transit Map**: https://stitch.withgoogle.com/projects/13099947558251856528 (approved 2026-10-02, ADR-212).

| Screen | Stitch screen |
|---|---|
| P1 Map home | Map home |
| P2 Destination | Tunis → Sousse |
| P3 Request sheet | Nouvelle demande |
| P4 Active request | Active Ride |
| P5 Request closed | Request closed |
| P6 Me | Profile |
| D1 / D2 | Vérification chauffeur · Statut de vérification |
| D3 Start sharing | Commencer le partage |
| D4 Driver live map | En partage · Visible |
| D4 Passenger details | Anonymous / Identified Passenger Details |
| D4 On break | On break |
| D5 Routine routes | Mes trajets habituels · Trajet habituel (editor) |
| D6 Me | Driver profile |

**Palette:** ignore Stitch's green. Implement deep blue (primary) + sunny yellow (accent); green / amber / red only for status.
**Open:** the confirmations after "Nobody there" and "Block" are not designed yet; the Block label should read "Bloquer ce passager".
