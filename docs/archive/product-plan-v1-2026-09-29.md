# Product Plan — codename "Mechwar" (مشوار)

> Working codename only (Tunisian Derja for "a trip/errand"); check trademark and app-store availability before use.
> Status: pre-validation. Research date 2026-09-29. Evidence and sources: [research-tunisia.md](research-tunisia.md), [competitors.md](competitors.md).

---

## 0. Executive summary: what changed after research

The original idea was "a free app where clients find nearby taxis, louages and buses, and drivers find clients". After challenging it against the Tunisian context:

1. **Taxi hailing is the most crowded and most regulated part of the idea.**
   - Yassir, inDrive, Amigo and the union's Beem app already operate.
   - Bolt was **suspended in March 2025**.
   - The ministry is still drafting a framework for taxi apps (April 2026) and has announced a state app.
2. **"Free" is not a moat.** inDrive already charges drivers no service fee in Tunisia.
3. **Bus doesn't fit the driver model.** Bus drivers are public-company employees.
4. **Louage and station information is the clearest gap.** No national app shows live seats; one station (Gabès) already runs a live vacant-seat board, which proves the model.
5. **The product must be useful with few users.** Static-but-reliable information (stations, official fares) is useful from day one; a taxi map with 3 cars is not.

**Recommended direction: "E-first, D-ready".**
- **Public launch:** a transport companion.
  - Louage stations and lines with **official fares**.
  - **Live louage seat boards** maintained by partner stations and verified louage drivers.
  - An official taxi-meter fare estimator.
  - SNTRI schedules from open data.
  - Community disruption reports.
- **In parallel:** build a licensed-only, meter-based, commission-free **taxi request** system (Model D: reverse request + fuzzed availability).
  - Run it as a **closed pilot** in one zone.
  - Open it publicly **only after a legal opinion** (or the published framework) confirms how to operate.
- The architecture supports both from day one: same identity, verification, trust, presence and admin systems.

This keeps what you wanted (client ↔ driver matching, verification, working/not-working GPS, anti-troll) while reducing the two biggest risks: **regulation** and **cold start**.

---

## A. Product vision

> "In Tunisia, know how to get there, right now, and reach a trustworthy licensed driver without being tracked, overcharged or spammed."

Principles:
1. **Useful at zero users.** Every release has value even if no driver is online.
2. **Licensed operators only.** No private cars carrying paying passengers.
3. **Official prices first.** Meter and official louage fares; no bidding or surge.
4. **Privacy by construction.** Drivers are tracked only while working; exact positions only between matched parties.
5. **Trust is earned progressively.** Low friction for honest users, rising cost for abusers, no permanent ban from one report.
6. **Boring, portable tech.** Docker + PostgreSQL that can move to Tunisian hosting.

## B. Problems being solved

| # | Problem (Tunisia) | Who | Evidence | Solved by |
|---|---|---|---|---|
| P1 | "Is there a louage to X now? How full is it? What's the official fare?" requires going to the station | Intercity travellers | Louages leave when full, no timetable; evening departures hard to fill ([research §2.5](research-tunisia.md)) | Live seat boards + line directory |
| P2 | Louage drivers wait long to fill the last seats, especially in the evening | Louage drivers | Same | Boards push "3 seats left to Sousse" to nearby interested travellers |
| P3 | Fare uncertainty and overcharging (night, airport) | Taxi clients | [Carthage Mag.](https://carthagemagazine.com/taxis-in-tunisia/) | Official fare estimator + "meter on" norm + reports |
| P4 | Taxi refusals by destination; hard to find a free taxi at peak/rain | Taxi clients | Same | Destination-aware reverse requests (pilot) |
| P5 | Idle taxis cruising empty | Taxi drivers | Common knowledge; not measured | Requests + demand hints (later) |
| P6 | Safety and trust with strangers | Everyone | — | Verified licensed drivers, trip sharing, reports |
| P7 | Fragmented info (SNTRI, louage, taxi) | Travellers | [competitors.md](competitors.md) | One "How do I get to…" answer |

## C. Target users

| Segment | Description | Priority |
|---|---|---|
| **Intercity travellers** | Students, workers going home at weekends, people visiting family (Tunis ↔ Sousse/Sfax/Nabeul/Bizerte/Kairouan…) | **Primary (launch)** |
| **Louage drivers + station agents** | Drivers waiting to fill; station staff managing queues | **Primary (supply)** |
| **Urban taxi clients** in one pilot zone | Commuters, people without cars, night returns | Secondary (pilot) |
| **Licensed taxi drivers** in the pilot zone | Owner-drivers and hired drivers | Secondary (pilot) |
| Tourists / diaspora | Need fare transparency and louage explanations | Tertiary (FR/EN content) |
| Admins/moderators | You, then 1–2 trusted helpers | Internal |

Persona anchors:
- **Amel, 21, student in Tunis, from Kairouan.** Goes home most Fridays. Wants to know if Moncef Bey has a louage filling for Kairouan and the fare before leaving her dorm.
- **Hédi, 48, louage driver Tunis–Sousse.** Low-end Android, speaks Arabic/Derja, reads some French. Wants to fill faster, hates complicated apps.
- **Sami, 35, taxi owner-driver in La Marsa.** Already on inDrive/Yassir. Will only add an app if it brings clients without costing money or hassle.

## D. User journeys

**J1: Louage traveller (no account needed to read)**
Open app → "Louage" tab → search "Sousse" → sees Moncef Bey station: "Sousse: 5/8 seats, updated 2 min ago · official fare X DT" → taps "Directions to station" (opens Google Maps / Waze via deep link) → optional: "Notify me when a louage to Sousse is filling" (needs phone login).

**J2: Louage driver / station agent**
Phone login → apply as louage driver (docs) or be invited as station agent by admin → approved → "My board": pick line → tap **+/−** per passenger → "Departed" → next run.

**J3: Taxi client (pilot zone)**
Phone login → map shows "≈6 taxis nearby" (fuzzed) → "I need a taxi" → confirm pickup pin + landmark note + destination area → searching (up to ~2 min) → matched: driver photo, first name, car, plate, live position → arrived → on board → completed → rate (thumbs + tags).

**J4: Taxi driver (pilot)**
Phone login → verification wizard (CIN, licence, professional card, selfie, vehicle docs) → "Under review" → approved → big **Start working** button (explains the tracking notification) → request card: pickup area, distance, destination area, client reliability → Accept → navigate → Arrived → Client on board → Finish → rate client → Stop working (tracking stops).

**J5: Something went wrong**
Any party → trip screen → "Report a problem" → category → optional text → submitted with the trip evidence attached automatically → user sees the case status → sanctions (if any) come with a reason code and an appeal button.

## E. Product models considered

| Criterion | A · Uber-like | B · Discovery | C · Reverse request | D · Hybrid (C + fuzzed B) | E · Community transport map (+ louage boards) |
|---|---|---|---|---|---|
| **User adoption** | High *if* dense; users already know it from Yassir/inDrive, so you compete head-on | Medium; empty map kills it | Medium–high; matches the "tell the driver your destination" habit | High in the pilot zone | High for info seekers; low commitment |
| **Product complexity** | High | Low | Medium | Medium–high | Low–medium |
| **Legal/operational risk** | **Highest**: exactly what is being regulated | Medium–high (still facilitates taxi trips; exposes positions) | High (taxi platform) | High (taxi platform) | **Lowest** (information), still needs legal check |
| **GPS requirements** | Continuous driver + trip | Continuous driver, publicly visible | Continuous driver, one-shot client | As C, plus aggregated density | Minimal: stations are static; boards need no GPS |
| **Abuse surface** | Medium (system assigns) | **High**: stalking, fake availability, ghost drivers | Spam requests, cherry-picking | Manageable with trust tiers | Misinformation and spam reports (moderation) |
| **Monetisation later** | Commission (politically toxic now; inDrive at 0%) | "Featured drivers" (distorting) | Driver subscription, B2B | Same as C | Station SaaS, B2B, contextual ads, data partnerships (aggregated) |
| **Technical complexity** | High (dispatch, ETAs, edge cases) | Low–medium | Medium | Medium–high | Low |
| **Network effects** | Strong, but needs critical mass | Weak–medium | Medium | Medium–strong | Content effects (more stations = more value); weak cross-side |
| **Useful with few users** | Very poor | Poor | Moderate (3 drivers can serve a request) | Moderate | **Best**: static data is useful at zero users; one partner station is useful |

**Tradeoffs, not a single winner:**
- E alone is safe and useful, but monetises weakly and may feel like a "guide app" without transactions.
- D is where engagement and daily habits come from, but it carries the regulatory and density risk.
- A is the most expensive way to reach the same place as D, and B has the worst privacy/abuse profile.

**Recommendation:** ship **E publicly** and pilot **D privately**, on a shared core. Decide D's public launch with evidence: legal opinion, pilot metrics (match rate > 60%, median pickup < 8 min, no-show < 10%) and driver willingness.

## F. Core functionality

**Louage and transport information (public)**
- Station directory: name AR/FR, map pin, lines served, official fare per line (versioned, with source).
- Live boards: per line, `FILLING n/8 · updated x min ago`, `FULL`, `DEPARTED`; updated by a verified louage driver or station agent; auto-expire stale boards.
- "Notify me" per line (push when a board for that line is FILLING).
- SNTRI schedules (open data) on the same destination page.
- Official taxi fare estimator (day/night, configurable tariffs).
- Community reports (strike, station moved, road blocked) with expiry and upvotes.

**Taxi requests (pilot, feature-flagged per zone)**
- Fuzzed availability density.
- "I need a taxi" reverse request with destination area.
- Broadcast in rings; first accept wins (atomic).
- Live tracking between matched parties only.
- Arrived geofence, on-board, complete.
- Templated chat.
- Blind mutual ratings (thumbs + tags).
- Reliability metrics.
- Share-trip link, emergency numbers.

**Identity and trust (everyone)**
- Phone OTP, device binding, progressive trust tiers, reports, blocks, sanctions, appeals.

**Admin**
- Verification queue, cases, sanctions, appeals, content (stations/lines/tariffs/zones), risk signals, stats, audit log.

## G. Anti-abuse / trust system (summary; full design in [anti-abuse.md](anti-abuse.md))

- **Progressive trust tiers**: `NEW → STANDARD → TRUSTED`, plus `WATCH` (flags pending) and `RESTRICTED` (active sanction). Tiers unlock capacity (active requests, daily requests, going online at peak) rather than blocking access.
- **Reliability metrics with Bayesian smoothing**, so one no-show (or one false no-show) cannot sink a new user.
- **Evidence-first**: every lifecycle transition stores time + GPS + actor, and reports must attach to a trip for most categories.
- **Report credibility weighting**: reporter tier, verified co-location, reporter's past dismissal rate, retaliation detection.
- **Sanction ladder**: nudge → warning → cooldown → temporary suspension → long suspension → permanent ban.
  - Automation may only apply up to **cooldowns** plus a time-boxed **safety hold** pending review.
  - Anything longer is decided by a human; permanent bans need **two reviewers** and are always appealable once.
- **No permanent ban from a single report**, ever. A single *severe, credible* report can trigger at most a ≤ 24–48 h safety hold with priority human review.

## H. Safety and conflict resolution (summary; 14 scenarios in [anti-abuse.md §6](anti-abuse.md))

- Safety toolkit: share-trip link (expires at trip end), one-tap emergency numbers (**197 police, 190 SAMU, 198 Protection Civile** — verify the list before launch), trip evidence log, block, report.
- We **do not arbitrate money**. We do not handle payments, so fare disputes become reputation signals and pattern detection, backed by official-tariff display.
- We **do not record audio/video** (privacy and legal risk).

## I. GPS / privacy model (summary; full design in [security.md §3](security.md))

| Who sees what | Driver OFFLINE | Driver WORKING, available | Driver matched to client X | After trip |
|---|---|---|---|---|
| Server collects | **Nothing** (server rejects pings without an active work session) | Exact position every 10–30 s | Exact every 3–5 s | Stops trip sampling |
| Other clients | Nothing | **Count/density only** per ~0.7 km² hex cell, delayed ≥ 30 s; no individual dots at MVP | Nothing | Nothing |
| Client X | Nothing | Nothing | **Exact live position** | Nothing (history shows areas, not coordinates) |
| Admin | Nothing | Exact (audited access) | Exact (audited) | Trip samples until retention expiry |

- Client location is collected **only in the foreground**, only when the map is open or a request is created, and is shared only with the matched driver.
- Driver tracking runs inside an **Android foreground service with a persistent notification**. The notification is the privacy contract: visible means tracking; no notification means no tracking. Because the service starts in the foreground, we can **avoid `ACCESS_BACKGROUND_LOCATION`** entirely (see [architecture.md §6](architecture.md)).
- Retention (proposed, pending legal): live presence is overwritten (no history); trip samples 90 days; trip event log 12 months; work-session metadata 12 months.

## J. Authentication / verification (summary; see [security.md §2](security.md))

| | Client | Driver | Station agent | Admin |
|---|---|---|---|---|
| Login | Phone OTP (+216 only) | Phone OTP | Phone OTP | Email + password + TOTP |
| Reading public info | No account | — | — | — |
| Identity docs | **None** | CIN front/back, selfie, driving licence, professional card | Invited by admin (+ CIN) | — |
| Vehicle docs | — | Registration (carte grise), insurance, operating card/authorisation, plate photo | — | — |
| Device | Integrity check + device binding | Same + one active driver device | Same | — |
| Ongoing | Progressive trust | Random selfie re-check before going online; document expiry reminders | Activity audit | Audit log |

No email, password, Google or Apple sign-in for mobile users at MVP: phone is the universal identifier in Tunisia and keeps one account per SIM. Apple's rules require Sign in with Apple only if you offer other third-party social logins, so a phone-only login avoids it.

## K. Admin system (summary; see [product-requirements.md §7](product-requirements.md))

| Area | Automated | Human |
|---|---|---|
| OTP/rate limits, device binding | ✅ | — |
| Document completeness (all required types present, image quality/size) | ✅ | — |
| Document authenticity, face vs CIN, plate vs registration | — | ✅ (always, MVP) |
| Document expiry → hide driver | ✅ | Renewal review ✅ |
| No-show/cancel metrics, tier changes | ✅ | — |
| Cooldowns (≤ 24 h) | ✅ | Appeal ✅ |
| Safety hold (≤ 48 h) on severe credible report | ✅ trigger | Decision ✅ (SLA 24 h) |
| Suspension > 24 h, bans | — | ✅ (bans: two reviewers) |
| GPS spoofing | ✅ flag + soft restrict | Confirm ✅ |
| Content: stations, lines, tariffs, zones | — | ✅ |
| Community reports | ✅ auto-expire, auto-hide at N downvotes | Spot-check ✅ |

## L. UX / screens (summary; full spec in [ux.md](ux.md))

Client: **9 screens + 2 sheets**. Driver: **8 screens**. Louage board: **1 screen** (reused by drivers and station agents). Admin: web console. The UI is Arabic-first with French, Derja-friendly copy, big touch targets and one primary action per screen.

## M. Technical architecture (summary; see [architecture.md](architecture.md))

- **Mobile**: React Native + Expo (dev builds via EAS), TypeScript, one app with client/driver/agent modes, MapLibre with OSM tiles.
- **API**: NestJS modular monolith (REST + Socket.IO + pg-boss jobs), TypeScript, Drizzle ORM + raw SQL for PostGIS.
- **DB**: PostgreSQL 16 + PostGIS.
- **Infra**: Docker Compose on one VPS behind Caddy; region is chosen after legal advice (Tunisian hosting vs EU with INPDP authorisation).
- **Admin**: React + Vite + Refine.
- **Contracts**: shared Zod schemas in a pnpm/Turborepo monorepo.

## N. Database / domain model (summary; see [domain-model.md](domain-model.md))

Core aggregates:
- `User` (one identity, many roles) with `Device`
- `DriverProfile` → `DriverDocument`s
- `Vehicle` ↔ `VehicleDriver` (owner or authorised driver)
- `WorkSession` → `DriverPresence` (hot, overwritten)
- `RideRequest` → `DispatchOffer`s → `Trip` → `TripEvent`s / `TripLocationSample`s
- `Rating`, `Report` → `ModerationCase` → `Sanction` → `Appeal`
- `Station` → `LouageLine` → `LouageRun` (the board)
- `Tariff`, `ServiceZone`, `RiskSignal`, `TrustSnapshot`, `AuditLog`

## O. Realtime architecture (summary; see [architecture.md §5](architecture.md))

- Socket.IO rooms: `driver:{id}`, `client:{id}`, `trip:{id}`, `zone:{id}` (density), `line:{id}` (louage board).
- Commands (accept, arrive, etc.) go through **REST** (idempotent, auditable). Sockets only **push** state and receive location pings.
- FCM high-priority push for offers when the app is backgrounded.
- A single API instance at MVP; add the Redis adapter when scaling horizontally.

## P. Matching algorithm (summary; see [architecture.md §7](architecture.md))

v1 is plain code, not ML:
1. **Filter** eligible drivers: working, fresh heartbeat, right transport type, approved vehicle, no sanction, no block in either direction, inside radius.
2. **Rank** by distance bucket, then reliability tier, then idle time (fairness).
3. **Broadcast** to the top 3 for 20 s; expand the ring (1.5 → 3 → 5 km) and send to the next 5, up to 4 rounds (about 2 min).
4. **First accept wins** via an atomic conditional UPDATE.

A favourite driver gets a 15 s exclusive first look. Later evolution: road ETA (OSRM), acceptance-probability, heading, batch assignment.

## Q. AI opportunities (summary; see [architecture.md §10](architecture.md))

Not in the MVP. Rules beat AI for spam, spoofing and matching at this scale. Later, in order: report triage and summarisation for moderators (v1.0+), FAQ support assistant (later), louage-tariff PDF extraction as a one-off data task (Phase 0, offline). Avoid AI face or document verification until the legal position on biometrics is clear.

## R. n8n evaluation (summary; see [architecture.md §9](architecture.md))

**Not in the core.** The request lifecycle, trust, notifications and moderation belong in the API: they need transactions, tests and low latency. n8n is fine as an optional **back-office sidecar** from v1.0 (daily admin digest, Telegram alert on new driver applications, weekly KPI email, support-inbox routing). It only reads a restricted reporting view, gets no PII, and is self-hosted in the same region.

## S. MVP roadmap (summary; see [roadmap.md](roadmap.md))

| Release | Theme | Key content |
|---|---|---|
| **v0.1** | Prove the core loop | Phone OTP, roles, louage directory + official fares, louage board (driver/agent), driver verification + admin approval, work toggle + presence, taxi reverse request in one pilot zone (closed), minimal reports, minimal admin |
| **v0.2** | Make it safe and pleasant | Trust tiers + cooldowns, blind ratings, templated chat, geofenced arrive/no-show, spoof checks, share trip, "notify me" for lines, full AR/FR + RTL, audit log, appeals |
| **v1.0** | Real public users | Legal compliance done, SNTRI schedules, fare estimator polish, favourites, accessibility flags, document expiry, re-verification selfie, analytics, backups/monitoring, store releases |
| **Later** | Grow | In-app voice, airport mode, demand hints, station SaaS, shared taxi/collectif, AI triage, B2B |

## T. Cost estimate (summary; see [architecture.md §11](architecture.md))

About **€30–80/month** in infrastructure at MVP, plus SMS OTP (the main variable cost; get quotes), plus one-off store fees (Google €25-ish once, Apple $99/year) and **legal fees** (get quotes). The biggest real cost is **your time on verification and moderation**.

## U. Tunisia-specific legal / regulatory considerations

See [research-tunisia.md](research-tunisia.md). The five that shape the product:
1. Taxi-app framework is pending (April 2026) and Bolt was suspended in 2025 → **legal gate** before public taxi requests.
2. Licensed operators only (Law 2004-33 as interpreted).
3. Official tariffs (meter, louage per line) → no bidding/surge.
4. INPDP declaration; authorisation for transfers abroad → portable, self-hostable stack; minimal third-party data flows.
5. Professional card + operating card → the verification document set.

## V. Competitor landscape

See [competitors.md](competitors.md). Crowded urban taxi market (Yassir, inDrive at 0% fees, Amigo, Beem); **no mainstream live-louage app**; SNTRI data open; a potential state app.

## W. Risks and unknowns

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Regulatory action against taxi-matching features | Medium–high | High | E-first; taxi as closed pilot; legal opinion; Tunisian hosting option; meter-only pricing; no commission |
| No differentiation vs Yassir/inDrive for taxis | High | High | Don't lead with taxi; lead with louage/intercity; partner with the union rather than compete |
| Louage board data goes stale | High | High | Station-agent partners (one agent updates many cars); "updated x min ago" + auto-expire; incentives (priority listing) |
| Cold start in the taxi pilot | High | Medium | Tiny zone, recruit 40–80 drivers in person, WhatsApp concierge test first |
| Safety incident involving a "verified" driver | Low–medium | Very high | Careful wording, safety toolkit, fast response process, insurance/legal advice |
| Solo moderation overload | Medium | Medium | Automation for low-severity cases, strict scope, 1–2 trusted moderators, SLA-based queues |
| Data breach of CIN/licence scans | Low–medium | Very high | Encrypted private storage, short-lived URLs, delete raw scans after verification (retain hashes + metadata), admin 2FA, audit |
| OTP SMS pumping fraud | Medium | Medium (cost) | +216 only, per-phone/IP/device limits, daily budget cap, alerting |
| State app launches and mandates integration | Medium | Medium–high | Keep the taxi module isolated; be ready to integrate or drop it |
| App store rejection (location policies) | Low–medium | Medium | No background-location permission; clear disclosure; foreground service type declared |

## X. Recommended implementation sequence

Phase 0 validation (2–3 weeks, no code) → Foundation → Auth → Driver verification (with a minimal admin) → Maps/stations/GPS → Louage boards + taxi requests → Realtime tracking → Trust/moderation → Admin completion → Testing → Launch (louage public, taxi closed pilot). Detailed tasks: [roadmap.md](roadmap.md).

---

## Appendix 1: challenged assumptions

| Original assumption | Verdict | Replacement |
|---|---|---|
| Taxi, louage and bus are three transport types with drivers | ❌ Bus doesn't fit | Taxi (pilot), Louage (core), Bus (info only) |
| Free is the differentiator | ❌ inDrive is 0% in Tunisia | Differentiators: louage/intercity, official prices, privacy, trust, local UX |
| Clients should see nearby drivers | ⚠️ Privacy and dead-map risk | Density only before match; exact only after match |
| Documents make drivers trustworthy | ⚠️ Photos can be forged; licences can be rented | Vehicle ≠ driver model; selfie re-checks; in-person verification days |
| Mandatory auth stops trolls | ⚠️ SIMs are cheap | OTP + device binding + progressive trust + rate limits |
| Uber-style booking is the goal | ⚠️ The most regulated and crowded path | E-first, D-ready |
| Off-platform deals hurt the business | ❌ Not for a free app | Favourites are a feature; we only lose safety coverage, so encourage in-app trips via safety value |
| Taxi app legal because drivers are licensed | ⚠️ Platform itself may need authorisation | Legal opinion before public launch |

## Appendix 2: feature classification

🔴 Essential · 🟠 Useful later · 🟢 Interesting experiment · ⚫ Avoid

| Feature | Class | Why |
|---|---|---|
| Louage station and line directory with official fares | 🔴 | Useful at zero users; clear gap; low legal risk |
| Live louage seat board (driver/agent-updated) | 🔴 | Our core differentiator; proven by the Gabès station |
| Official taxi fare estimator (day/night) | 🔴 | Zero-user value; reduces disputes; tariffs configurable |
| Phone OTP + device binding | 🔴 | Minimum anti-abuse |
| Driver/vehicle verification + admin approval | 🔴 | Trust promise; licensed-only |
| Work toggle with foreground-service tracking | 🔴 | Privacy contract |
| Reverse taxi request (pilot zone) | 🔴 (pilot) | Core of your original idea; gated by legal |
| Live tracking after match only | 🔴 | Safety + pickup coordination |
| Pickup pin + landmark note | 🔴 | Tunisian addressing is landmark-based |
| Report + block | 🔴 | Safety |
| Emergency numbers + share trip | 🔴 | Cheap, high trust |
| Arabic/French, RTL, low-end Android performance | 🔴 | Market fit |
| Templated chat (no phone numbers) | 🔴 (v0.2) | Coordination without harassment |
| Blind mutual ratings + reliability | 🔴 (v0.2) | Trust without retaliation |
| "Notify me when a louage to X is filling" | 🟠 | Very useful, needs boards first |
| SNTRI schedules (open data) | 🟠 | Completes the intercity answer; check the licence |
| Favourite drivers | 🟠 | Retention; bypass is harmless for a free app |
| Accessibility flags (wheelchair, luggage, child seat need) | 🟠 | Real need, small effort |
| Community disruption reports | 🟠 | Useful but needs moderation |
| Airport mode (official fares, pickup points) | 🟠 | High pain, but airports have their own dynamics |
| Lost & found via trip history | 🟠 | Cheap once trips exist |
| In-app voice call (WebRTC) | 🟠 | Older drivers prefer voice; complexity moderate |
| Demand hints for drivers (aggregated) | 🟠 | Driver value once client volume exists |
| Popular destinations / rush-hour insights | 🟢 | Data by-product |
| Shared taxi / taxi collectif requests | 🟢 | Amigo does it; regulation per city unclear |
| Group requests (6 people → 2 taxis) | 🟢 | Niche |
| Louage seat hold (15 min, trusted users only) | 🟢 | No-show risk; legal unclear |
| Female-driver preference | 🟢 | Sensitive; low supply |
| Scheduled rides (general) | ⚫ (now) | No-show magnet; complex enforcement |
| Price bidding for taxis | ⚫ | Conflicts with meter and regulator direction |
| Surge pricing | ⚫ | Regulator hostile; PR risk |
| In-app payments/wallet | ⚫ | Cash economy; regulation; fraud |
| Private cars for paid rides / paid carpool | ⚫ | Illegal-transport and union risk |
| Crowd-sourced real-time bus tracking | ⚫ | Not enough density; unreliable |
| Public exact driver positions | ⚫ | Stalking risk |
| Showing phone numbers | ⚫ | Harassment |
| Audio/video recording in trips | ⚫ | Privacy/legal risk |

## Appendix 3: business model (later; free at launch)

| Model | Fit | Conflicts / regulatory notes | Verdict |
|---|---|---|---|
| **Commission on rides** | Poor | inDrive charges 0% in Tunisia; the ministry criticised commissions and money leaving the country; conflicts with meter pricing; needs payments | ⚫ Avoid |
| **Station SaaS** (board + queue tickets + stats for louage stations) | Good | Stations already buy software (Gabès site, einfo.tn); B2B contract, no consumer money | 🟢 **Best first revenue** |
| **Business accounts** (companies, hotels, clinics booking taxis/louage info for staff/guests; monthly invoice for the service, the fare stays the meter) | Good | Must not look like reselling rides; legal check | 🟠 v1.0+ |
| **Driver premium subscription** (flat, small: advanced stats, priority for favourites, document reminders) | Medium | Must not buy dispatch priority over reliability/distance (fairness + regulator optics) | 🟠 Later, careful |
| **Featured drivers** | Poor | Distorts trust; pay-to-win | ⚫ |
| **Contextual advertising** (e.g. at the station page: cafés, bus companies, phone operators) | Medium | Ads must not use location history; consent; keep them out of the trip flow | 🟢 Experiment |
| **Partnerships** (telecom operators for SMS/zero-rating, the taxi union, municipalities) | Medium | Union partnership = legitimacy; the state app may prefer integration | 🟠 |
| **Aggregated analytics** (anonymised demand by line/hour for transport authorities) | Medium | Strict anonymisation/aggregation; INPDP view | 🟢 Later |
| **Public API** (louage boards for travel sites) | Low early | Data ownership with stations | 🟢 Later |

Principle: **never charge travellers for information**, and never sell priority that overrides safety or distance.
