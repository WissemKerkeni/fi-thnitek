# Product Requirements (PRD) v3.1

> Concept and rules: [product-plan.md](product-plan.md). Requirement IDs (`R-xxx`) are referenced by tests and the roadmap.

## 1. Goals / non-goals

**Goals**
- G1: A passenger sees taxis, louages and buses live (with driver names) plus scheduled routines, and posts a taxi/louage request in ≤ 3 taps.
- G2: A sharing driver sees waiting passengers **and all other drivers** (including Full), so they can decide where it's worth going.
- G3: No assignment: the first to arrive picks the passenger up; the request closes itself.
- G4: Live driver features only while sharing; the cooldown for undeclared stops; declared breaks.
- G5: No location history visible to users; silent pick-up records for admins only.

**Non-goals**
Dispatch, offers, chat, phone sharing, seat booking on routines, fares, payments, ratings, bus requests, passenger tracking for bus.

## 2. Roles
| Role | How obtained | Capabilities |
|---|---|---|
| `PASSENGER` | Google sign-in | Map, finder, one taxi/louage request, report, block, own request history |
| `DRIVER_PENDING` | Submitted verification | Passenger capabilities + a verification status screen |
| `DRIVER` | Admin approval | **Driver-only:** routine routes/documents/profile anytime; the map and passengers only while sharing |
| `ADMIN` | Allow-listed Google account | Web admin |

## 3. Functional requirements

### 3.1 Sign-in & account
- **R-001** Sign in with Google (Android); iOS adds Sign in with Apple (App Store Guideline 4.8).
- **R-002** First run: language (AR/FR), Terms & Privacy, display name.
- **R-003** Drivers' public name = the first name from their verified identity; it cannot be hidden.
- **R-004** Device registration (install ID, push token). **R-005** Delete account; sign out.

### 3.2 Places
- **R-010** Curated places (cities, delegations, neighbourhoods, louage/bus stations, airports, landmarks), AR/FR + aliases.
- **R-011** Destination search with suggestions + pick on map.

### 3.3 Live map
- **R-020** The map shows, in the visible area (max ~20 km span, clustered beyond that): sharing drivers by type (🚕/🚐/🚌) and open passenger requests (🧍). Layer toggles per type.
- **R-021** Polling every 5 s while visible; markers animate between updates.
- **R-022** **Driver marker (seen by everyone):** a label with the **driver's name, always displayed**; type; a **Full** badge when full. Tap → photo, verified badge, vehicle model/colour, plate, heading to, bus line, the next routine departure, last update age.
- **R-023** **Passenger marker, seen by passengers and bus drivers:** approximate position (~100 m grid) + destination. Never a name or note.
- **R-024** **Passenger marker, seen by sharing taxi/louage drivers whose type is in the request:** exact position, destination, seats, waiting time, distance; **name and note only if the passenger enabled "Show my name and note"**.
- **R-025** **Drivers see all other sharing drivers** (same data as R-022), including Full badges, on the same map.
- **R-026** A driver who is not sharing (or on break) sees no live map and no passengers.
- **R-027** Blocked users (either direction) never appear on each other's maps.

### 3.4 Passenger request (taxi/louage only)
- **R-030** Request after choosing a destination: types (taxi, louage or both), seats (1–8), optional note (≤ 80 chars), and a toggle **"Show my name and note to drivers"** (**off by default**; the last choice is remembered). The origin is always the current location.
- **R-031** **One open request per passenger** (DB-enforced).
- **R-032** Posting starts live location (foreground service + notification "Looking for a ride · stay within 20 m · Stop").
- **R-033** The first fix with accuracy ≤ 30 m = the **anchor**; the request is visible only after anchoring; no accurate fix within 60 s → `NO_GPS_FIX`.
- **R-034** **Moved-away:** 2 consecutive fixes ≥ 10 s apart, accuracy ≤ 25 m, > 20 m from the anchor → `MOVED_AWAY`.
- **R-035** **Location-lost:** no location for 5 min → `LOCATION_LOST`.
- **R-036** **Expiry:** 60 min → `EXPIRED`; a push 10 min before with **Renew** (+60 min, max 3).
- **R-037** Cancel anytime → `CANCELLED`.
- **R-038** On closure: tracking stops (`stop: true`), the marker disappears, and the passenger sees the reason + **Post again**. **No follow-up questions.**
- **R-039** **Silent pick-up record:** on `MOVED_AWAY`, the server records every sharing driver whose position was ≤ 50 m from the anchor during the last 2 min before closure (all of them when several qualify). Visible **only in the admin web app**.
- **R-040** Limits: 5 requests/day (account < 3 days), 15/day otherwise; 3 `NOBODY_THERE` reports from distinct drivers within 7 days → requesting paused 24 h + an admin flag.
- **R-041** No requests and no passenger location for bus.
- **R-042** Passenger history (own requests, 30 days): destination, time, closure reason, and **Report a problem** (the admin uses the pick-up record to identify the driver(s)).

### 3.5 Destination finder
- **R-045** For a destination, list:
  - (a) **Heading there now:** sharing drivers whose "heading to" is near the destination or whose position→heading-to line passes near it in the right order, within 5 km (taxi) / 15 km (louage, bus).
  - (b) **Taxis nearby** without a "heading to" (5 km).
  - (c) **Scheduled departures:** routine routes matching the destination with an occurrence in the next 7 days, sorted by next time.
  - (d) Full drivers are shown last, greyed, with a Full badge.
- **R-046** (a) and (b) refresh every 5 s while open.

### 3.6 Driver sharing (taxi, louage, bus)
- **R-050** **Start sharing** requires `VERIFIED`, an approved vehicle, location permission + GPS on, a fresh fix, no cooldown, no suspension.
- **R-051** Start options (editable while sharing): vehicle/type; **heading to** (optional; **pre-filled from a routine route** departing within ±60 min); bus line label (bus).
- **R-052** A foreground service with a notification ("You're visible on the map · Stop"); pings every 10 s moving / 30 s stationary; an offline buffer ≤ 60 min, uploaded in order.
- **R-053** Live driver features (map with passengers, driver list) only with an active session, not on break, with a fix < 2 min old → otherwise 403 `SHARING_REQUIRED`.
- **R-054** **"I'm full" / "Available"** toggle while sharing. Full → the marker shows a Full badge, the driver is sorted last in the finder, and they still see the map. No cooldown or penalty.
- **R-055** **Break:** 30 min, 1 h or 2 h. During the break the driver is hidden, location tracking stops (the notification changes to "On break until 14:30"), and live features are unavailable. The break **cannot be ended early**. At the end, a push "Break over · Resume sharing" → one tap resumes (no cooldown). Not resumed within 15 min → the session ends **without** cooldown.
- **R-056** **Stop sharing** (manual) confirms "You won't be able to start again for 1 hour. Take a break instead?" with break shortcuts.
- **R-057** **Cooldown (1 h):** after a manual stop, GPS/permission off, an **uncovered ping gap ≥ 2 min** (killed app, phone off) or suspected spoofing. A network gap covered by buffered fixes is not a stop.
- **R-058** 12 h after the start (including breaks): "Still working?"; no answer in 10 min → the session ends without cooldown.
- **R-059** Mock location or an implied speed > 180 km/h → the session ends + cooldown + an admin flag.

### 3.7 Routine routes
- **R-065** A verified driver can create up to **5** routine routes without sharing: from (place), to (place), schedule = one-off (date + time) **or** weekly (days of week + time), optional seats, optional note (≤ 80), active on/off.
- **R-066** Routines appear in the finder (R-045c) and on the driver card with the next occurrence (next 7 days).
- **R-067** Routines not used (no sharing session with the matching heading within ±60 min of an occurrence) for 30 days → "Still running this route?" push; no answer in 7 days → hidden until reactivated.
- **R-068** Routines never create bookings or obligations.

### 3.8 Driver verification
- **R-060** Form: legal name, CIN + photos, selfie, driving licence, professional card (taxi/louage), type (taxi/louage/bus), vehicle (plate, model/colour, seats, registration, insurance, operating/operator authorisation, photo with the plate). The document list per type is admin-configurable (pending legal confirmation).
- **R-061** Submit → **`UNDER_REVIEW`**. **R-062** Admin approve / request changes / reject with reasons. **R-063** A push + in-app status on each decision. **R-064** CIN/plate uniqueness; duplicate document hashes flagged. Document expiry reminders; at expiry, no sharing until re-approved.

### 3.9 Safety
- **R-070** Report from a marker (driver or passenger), from the passenger's request history, or from the driver's session history ("Report a problem during this session" + an approximate time). Categories: `NOBODY_THERE`, `FAKE_PROFILE`, `HARASSMENT`, `UNSAFE`, `SPAM`, `OTHER`.
- **R-071** Block from a marker or a report.
- **R-072** Safety page + emergency numbers (verify the official list before launch).
- **R-073** Suspensions/bans are admin-only, with a reason + a contact form.

### 3.10 Notifications (push)
Verification decision · request closed (reason) · request expiring ("Renew?") · break over ("Resume?") · 12 h "Still working?" · sharing ended (reason + cooldown time) · routine "Still running?" · sanctions.

## 4. Non-functional requirements
| ID | Requirement |
|---|---|
| NFR-01 | Low-end Android (2 GB RAM): ≤ 300 markers at 30+ fps |
| NFR-02 | Map endpoint p95 < 300 ms server-side for a 20 km viewport |
| NFR-03 | Location only inside user-started foreground services with a visible notification; no `ACCESS_BACKGROUND_LOCATION` |
| NFR-04 | Users can never retrieve historical positions; the DB stores latest points + the 2-min driver window + pick-up records |
| NFR-05 | AR (RTL) + FR |
| NFR-06 | All admin actions and admin views of pick-up records are audited |
| NFR-07 | Battery: driver sharing ≤ ~8%/h on a mid device |

## 5. Releases
| Release | Content |
|---|---|
| **v0.1** closed beta | Google sign-in; places; verification + admin + push; sharing with Full, breaks, cooldown, gap detection; routine routes; passenger request with the auto-closure rules and the anonymous-by-default toggle; the live map with visibility rules; the finder; report/block; admin suspend/ban/clear cooldown |
| **v0.2** | Silent pick-up records + the admin report view, the "nobody there" pause, mock checks, routine staleness prompts, stats |
| **v1.0** public | Legal pack (INPDP, Terms/Privacy), iOS + Sign in with Apple, monitoring/backups, store release |
| Later | SSE/websocket map updates, OSRM corridors, English |

## 6. Admin web app
| Area | Functions |
|---|---|
| Sign-in | Google + allow-list |
| **Driver verification** | Queue → documents + checklist → approve / request changes / reject (reasons) → push; duplicate warnings |
| Drivers | Status, documents & expiry, **sessions** (start/end, breaks, full toggles, end reasons), routine routes, **clear cooldown**, suspend |
| **Pick-up history** | Per closed request: time, destination, anchor area, **all drivers recorded within 50 m** (distance); per driver: the list of their recorded pick-ups. Search by user/driver/time. Every view audited. |
| Reports | Queue by severity; each report is linked to the request/session and its pick-up record; decisions |
| Users | Search, request metadata, reports, suspend/ban/reinstate |
| Live ops | Counts of sharing/full/on-break drivers by type and open requests per area (map optional, audited) |
| Content | Places, transport types, required documents, emergency numbers, **thresholds** (20 m, 5 min, 1 h cooldown, break options, 12 h…) |
| Audit log | Everything |
