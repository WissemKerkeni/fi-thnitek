# Product Plan v2: "Say where you're going"

> Version 2 (2026-09-29). It replaces the first plan (archived in [archive/product-plan-v1-2026-09-29.md](archive/product-plan-v1-2026-09-29.md)).
> Background research is still valid: [research-tunisia.md](research-tunisia.md), [competitors.md](competitors.md).

## 1. The idea in one sentence

**A passenger says where they want to go; drivers see where passengers need to go, and passengers see which drivers are heading that way, so both sides find each other.**

- Free, non-commercial: the app never handles money and takes no commission.
- For **taxi, louage and bus** operators.
- **Simple** above everything else.

## 2. What the app is, and what it is not

| It is | It is not |
|---|---|
| A **meeting point** for passenger demand and driver direction | A booking/dispatch system like Uber |
| Posts that **expire automatically** | A tool that tracks people who didn't ask for it |
| **Live location only when chosen**: a driver's switch, or a passenger actively looking for a taxi/louage | Always-on tracking |
| Verified drivers only (admin-reviewed) | A marketplace for private cars |
| In-app contact once both sides agree | A payment or fare-setting tool |

Explicitly **out of scope**: live seat boards, fare estimator, mandatory availability toggle, automatic dispatch, payments, any live location for bus.

## 3. The core loop

```
PASSENGER                                   DRIVER (verified)
─────────                                   ─────────────────
"Where are you going?" → Sousse             Home: "Passengers looking for rides"
   │                                           · 7 → Sousse (near Moncef Bey)
   ├─ sees drivers heading to Sousse ◄──────── · 3 → Nabeul (near Bab Alioua)
   │   (posted routes)                         · 2 → Airport (near La Marsa)
   │                                           │
   └─ posts request (1 tap) ─────────────────► sees the request, taps "Offer a ride"
                                               │
   gets notification "A driver offered" ◄──────┘
   accepts ──► connection: chat unlocked, pickup details shared, optional phone sharing
   after the trip: "Did you travel together?" 👍/👎 · report if needed
```

Either side can start:
- **Passenger → driver:** the passenger sees a driver's route and taps **"Ask to join"**.
- **Driver → passenger:** the driver sees a passenger's request and taps **"Offer a ride"**.

The other side accepts or declines. That's the whole product.

## 4. Posts

| Post | Who | Content | Expiry |
|---|---|---|---|
| **Passenger request** | Any signed-in user | From (current location, shown to drivers as an **area**, not an exact point), To (place), transport types (any / taxi / louage / bus), when (now or a time today/tomorrow), seats (1–8), optional note | "Now": 60 min · scheduled: departure + 30 min · renewable in one tap · **taxi/louage "now" requests also close automatically when the passenger moves away (see §4.1)** |
| **Driver route** | Verified driver | From (place/area), To (place), departure (now or a time), free seats (optional), optional note | Departure + 60 min |

### 4.1 Live location (taxi & louage only; never bus)

| Who | Starts when | What others see | Stops when |
|---|---|---|---|
| **Driver** | The driver turns on **"Share my live location"** (optional, never required) | Passengers looking for a taxi/louage see the driver's **live position** on the map, with photo, vehicle and type | The driver turns it off · after 12 h (safety net for a forgotten switch) · verification suspended |
| **Passenger** | The passenger posts a **taxi or louage** request for **now** | Unmatched verified drivers see the **area** and distance; the **matched** driver sees the live position | The passenger **moves more than 20 m** from where they asked → the request closes automatically · the phone stops sending location for 5 min (app killed/phone off) → closes too · the request expires, is cancelled or matched (see below) |

- **Why 20 m:** someone who walks away has found a ride, changed plans or forgotten the request. Closing it keeps drivers from chasing ghosts. The passenger gets "You moved away, so your request to Sousse was closed. [Post again]".
- **After a driver is matched**, walking toward the car is normal, so the 20 m rule no longer closes anything. The passenger's live position is shared **only with the matched driver** until they meet (the connection is completed/cancelled) or for 30 min at most.
- **Bus:** requests and routes work by time only; there is no live location on either side.
- The driver's switch **is** the optional availability status: a driver sharing their location is visible as available; there is nothing else to set.

## 5. How each transport type uses it

| Type | Typical use | Most useful direction |
|---|---|---|
| 🚕 **Taxi** | Urban trips; drivers look for where passengers are waiting and where they want to go | **Drivers browse demand** ("5 people near Ariana want to go to downtown") and offer. Optional live location, so passengers can see taxis nearby. |
| 🚐 **Louage** | Intercity lines between stations | **Both directions.** Drivers post "Tunis → Sousse, leaving ~15:00". Passengers see it and ask to join. Drivers also see how many people want to go to Sousse. |
| 🚌 **Bus** | Operators running regular or occasional routes (private/intercity coaches, company or school shuttles, rural transport) | **Drivers/operators post routes**; passengers see "a bus is heading to X". Note: public-company bus drivers (TRANSTU/SNTRI) are unlikely to post, so bus value depends on which operators join. |

## 6. Roles and sign-in

- **Everyone signs in with Google.**
  - On iOS, Apple's App Store Guideline 4.8 requires an equivalent privacy-focused login next to Google, e.g. **Sign in with Apple**. This matters when the iOS version ships.
- **Passenger**: the default role right after sign-in.
- **Driver**: sign in with Google → "I'm a driver" → verification form → status **Under review** → admin approves in the web admin → **push notification "You're verified"** → driver features unlock. Until approved, the person can use the app as a passenger.
- **Admin**: signs in to the web admin with Google; only allow-listed accounts get the admin role.

## 7. Principles

1. **Three taps to post, one tap to respond.**
2. **Everything expires**, so the board is never full of stale posts.
3. **Privacy by default.**
   - Live location only when the person chose it (driver switch) or while actively looking (passenger taxi/louage request), and only the latest position is kept (no location history).
   - Passenger locations are shown as areas, and only to verified drivers.
   - Exact pickup and contact details are shared only after both sides agree.
4. **Verified drivers only.** Unverified people can't see passenger requests.
5. **No money, no ranking games.** No paid visibility or boosting.

## 8. Risks of this model and how the design handles them

| Risk | Why it matters | Mitigation in the design |
|---|---|---|
| **Passenger location exposure** | A list of "people waiting at X" could be misused | Only **verified drivers** see requests. Origins are shown as an area (~500 m cell or neighbourhood name). Passengers show first name/initial only, no photo. Exact pickup only after acceptance. |
| **Stale posts** | Without an availability toggle, old posts would mislead | Taxi/louage requests close when the passenger moves > 20 m or stops sending location for 5 min; every post also has a hard expiry, one-tap renew and a "still need it?" push 10 min before expiry |
| **GPS drift closes a request by mistake** | City GPS is often off by 10–30 m, especially indoors | Only fixes with accuracy ≤ 25 m count; it takes **2 consecutive fixes ≥ 10 s apart** beyond 20 m; the anchor is the first good fix. The passenger can re-post in one tap. Thresholds are configurable. |
| **Driver live location misuse** (stalking a driver) | The live position is visible to many | Opt-in only, a persistent "sharing" notification, visible only to signed-in users looking for a taxi/louage within the radius, auto-off after 12 h, no history kept, report/block |
| **Battery** | Tracking drains phones | Drivers: adaptive interval (10–30 s); passengers: tracking only lasts while a "now" request is open (≤ 60 min) |
| **Google accounts are free** → fake/multiple accounts | Spam requests, trolling drivers | Per-device account limits, posting limits for new accounts, report/auto-hide, admin bans (see [anti-abuse.md](anti-abuse.md)). Add phone verification later **only if** abuse appears. |
| **Empty results when few users** | The first users see nothing | The passenger's search always leads to posting a request ("No drivers heading to Sousse yet. Your request is visible to drivers, and we'll notify you."). Launch city by city, starting with a couple of louage stations and taxi areas where drivers were recruited in person. |
| **Legal status of a matching app** | Taxi apps were targeted by regulators in 2025; a framework is being drafted | Non-commercial, no fares, **licensed/verified operators only**. Still get a short legal check (see [research-tunisia.md §6](research-tunisia.md)) and file the INPDP data-protection declaration. |
| **Off-app contact** | People exchange phone numbers | Fine. The app's goal is to connect people. Phone sharing is an explicit, optional button. |
| **Safety** | Strangers meeting | Verified drivers with photo and vehicle shown before acceptance; report and block; admin review |

## 9. Success = people actually meet

| Metric | Early target |
|---|---|
| Passenger requests that receive ≥ 1 driver response | ≥ 40% in launch areas |
| Accepted connections that end with "we travelled together" | ≥ 60% |
| Median time from request to first driver response | ≤ 10 min (taxi), ≤ 60 min (louage/bus, scheduled) |
| Verified drivers active weekly | Grows week over week |
| Reports per 100 connections | < 3 |

## 10. Open questions to validate (before or during Phase 0)

1. Will taxi drivers open an app to browse demand between trips? (Interview 10–15.)
2. Will louage drivers post routes at the station? Who in the station would do it?
3. Which bus operators could post routes (private coaches, shuttles, rural transport)?
4. Legal: does a free, non-commercial request board for licensed operators need any authorisation? Which INPDP formalities apply?
5. Which areas/stations to launch first (one city, 2–3 louage stations, 2 taxi neighbourhoods)?
