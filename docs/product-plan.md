# Product Plan v3.1: the live transport map

> Version 3.1 (2026-09-29). Earlier versions: [archive/](archive/).
> Background research is still valid: [research-tunisia.md](research-tunisia.md), [competitors.md](competitors.md).

## 1. The idea

**One shared live map.**
- Verified **taxi, louage and bus drivers** appear on it while they share their location.
- **Passengers looking for a taxi or louage** appear on it with their destination.
- Drivers can also publish **routine routes** in advance (e.g. "Tunis → Sousse, weekdays 07:00").
- Nobody assigns anybody. **The first driver to arrive picks the passenger up.** Drivers see each other and can mark themselves **Full**, so they sort out who goes where respectfully.
- Free and non-commercial: no money, no fares, no commission, no booking.

## 2. Rules of the system

| # | Rule |
|---|---|
| 1 | **No assignment.** A passenger request is open to every driver. There are no offers, no acceptance and no chat. Whoever arrives first takes the passenger. Several drivers heading to the same passenger is normal. |
| 2 | **One request per passenger** at a time. |
| 3 | **Requests are for taxi or louage only.** Bus passengers don't request and don't share their position; they see buses and bus routes. |
| 4 | **Passenger tracking = request lifetime.** Posting a request starts live location. It closes automatically when the passenger **moves more than 20 m** from where they asked, when the phone stops sending location for 5 min, when there's no accurate GPS fix within 60 s, after 30 min (no renewal, ADR-225), or on cancel. |
| 5 | **Live driver features require sharing.** Without sharing, a driver sees no map and no passengers. Sharing is open to taxi, louage **and bus** drivers. *(Managing routine routes and documents doesn't require sharing.)* |
| 6 | **1-hour cooldown after an undeclared stop.** Stop button, GPS off, killed app → no restart for 1 hour. |
| 7 | **Declared breaks: 30 min, 1 h or 2 h.** The driver disappears from the map for the chosen time, with no cooldown, and resumes with one tap when the break ends. |
| 8 | **"I'm full"** switch while sharing. The driver stays on the map marked *Full*, so passengers and other drivers know. |
| 9 | **Everyone sees the map**: all drivers (with their **name always displayed**) and the waiting passengers. **Passengers are anonymous by default**; they can choose to show their first name and a note. |
| 10 | **Silent pick-up records.** When a request closes because the passenger moved away, every sharing driver who was within 50 m in the last 2 min is recorded automatically. **Only admins** see this history (for reports and safety). Users are never asked "who picked you up?". |
| 11 | **Verified drivers only.** Google sign-in → verification form → **Under review** → the admin approves in the web admin → push notification. |

## 3. How it looks

```
PASSENGER                                       DRIVER (verified)
─────────                                       ─────────────────
Map: 🚕 Hédi  🚐 Sami→Sousse  🚌 L20 Ali  🧍 🧍   Routine routes (no sharing needed):
"Where are you going?" → Sousse                   "Tunis → Sousse · Mon–Fri 07:00 · 8 seats"
  → Heading to Sousse now: 🚐 Sami (2 km)       Start sharing (heading to: prefilled from the routine route)
  → Scheduled: 🚐 Hédi · weekdays 07:00         Map: 🧍 passengers (destinations) + all other drivers
  → Full: 🚐 Karim (Full)                        · sees 🚕 Ali already 100 m from that passenger → goes elsewhere
"Request taxi/louage" (1 tap; name hidden        [I'm full]  [Break ▾ 30 min · 1 h · 2 h]  [Stop]
  unless I choose to show it)
Moves > 20 m in a vehicle → request closes      (the admin quietly records drivers within 50 m)
```

## 4. Participants

| | Can do | Needs |
|---|---|---|
| **Passenger** | See the map and routine routes; search a destination; post **1** taxi *or* louage request (anonymous by default); cancel; report a problem with a request; block | Google sign-in |
| **Driver (taxi/louage/bus)** | **Without sharing:** manage routine routes, documents, profile. **While sharing:** appear on the map (name, type, vehicle, heading to, Full), see passengers and all other drivers, take breaks | Google sign-in + admin verification |
| **Admin** | Verify drivers; see reports with the **pick-up history**; suspend/ban; clear cooldowns; manage places, documents and thresholds | Allow-listed Google account (web admin) |

A verified driver account is **driver-only** (no passenger mode), so a driver can't view the passenger map without sharing.

## 5. Who sees what on the map

| Marker | Seen by passengers | Seen by sharing drivers |
|---|---|---|
| 🚕 🚐 🚌 Sharing drivers | Exact live position, **name (always)**, type, vehicle model/colour, plate, heading to, bus line, **Full** badge | Same: drivers see each other to judge whether a passenger is worth going for |
| Drivers on break / not sharing | Not on the map | Not on the map |
| Routine routes | In the destination finder ("Scheduled departures") and the driver card | Same |
| 🧍 Passenger requests | **Approximate** position (~100 m), destination; **no name/note** unless the passenger chose to show them | **Exact** position, destination, seats, waiting time (taxi/louage drivers whose type is in the request); name + note **only if the passenger chose to show them**. Bus drivers see the passenger view. |

No location history is visible to users. Only the latest positions are served.

## 6. Passenger request lifecycle

```
OPEN (hidden until the first accurate GPS fix, then visible)
  ├─ moved > 20 m from where they asked  → MOVED_AWAY     (picked up or left; drivers within 50 m silently recorded)
  ├─ no location for 5 min               → LOCATION_LOST
  ├─ no accurate fix within 60 s         → NO_GPS_FIX
  ├─ 30 min (no renewal)                 → EXPIRED
  └─ cancel                              → CANCELLED
```
The passenger sees the closure reason with **Post again**. There are no follow-up questions.

## 7. Driver lifecycle

```
NOT SHARING ── Start sharing (verified, not in cooldown) ──► SHARING (available | FULL)
SHARING ── "I'm full" / "Available again" ──► SHARING (toggle, no penalty)
SHARING ── Break 30 min / 1 h / 2 h ──► ON BREAK (hidden, no tracking)
ON BREAK ── break ends → "Resume?" push ── Resume (1 tap) ──► SHARING
ON BREAK ── not resumed within 15 min after the break ends ──► NOT SHARING (no cooldown)
SHARING ── Stop / GPS off / killed app (uncovered gap) / spoof ──► NOT SHARING + 1 h COOLDOWN
SHARING ── 12 h, "Still working?" unanswered ──► NOT SHARING (no cooldown)
```
- A break **cannot be cut short**. Resuming happens when it ends. This keeps breaks from becoming a hide-and-reappear trick.
- Network drops covered by the phone's offline buffer don't count as a stop.
- An admin can clear a cooldown (e.g. the battery died).

### Routine routes
- One-off (date + time) or weekly (days + time); from, to, optional seats and note.
- Up to 5 per driver. Visible in the destination finder as "Scheduled departures", showing the next occurrence in the coming 7 days.
- Starting to share within ±60 min of a routine departure pre-fills "heading to".
- Routines are informational. Passengers can't book them; they come to the place or post a request when the time comes.

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Troll/fake requests | 1 open request; 20 m / 5 min / 30 min auto-closure; daily and device limits; "Nobody there" reports → a 24 h request pause at 3 distinct reports; admin review |
| Racing to the same passenger | Accepted by design; drivers see each other and the Full badges |
| Passenger privacy | Anonymous by default; exact position only for verified sharing drivers of the right type; nothing after closure |
| Driver privacy | Visible only while sharing (their choice); breaks hide them; no history shown to users; report/block |
| Gaming visibility | Live features only while sharing; a 1 h cooldown for undeclared stops; breaks can't be cut short; driver-only accounts |
| GPS spoofing | Mock flag + impossible jumps → sharing ended + cooldown + flag |
| Accountability without assignment | Silent pick-up records (drivers within 50 m) available to admins when a report comes in |
| Stale routine routes | Routes the driver hasn't shared on for 30 days get a "Still running this route?" prompt; unanswered → hidden |
| Legal | Free, no fares, verified operators only; short legal check + the INPDP declaration ([research-tunisia.md §6](research-tunisia.md)) |

## 9. Out of scope
Assignment/dispatch, offers/acceptance, chat, phone sharing, booking seats on routines, fares, payments, ratings, bus requests, passenger tracking for bus, user-visible location/pick-up history.
