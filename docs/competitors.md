# Competitor Landscape

> **Note (v2):** written for the first plan; the landscape is unchanged. The v2 concept is a free "say where you're going" board for verified taxi, louage and bus operators, not a booking app. See [product-plan.md](product-plan.md).

> Research date: 2026-09-29. "Evidence" = what public sources say. We **do not claim a feature is
> absent** unless a source says so; "not found" means we did not find evidence either way.
> Re-verify statuses in Phase 0: this market changed a lot in 2025.

## 1. Tunisian taxi / ride-hailing

| Service | What it does | Target users | Business model (if known) | Key functionality | Evidence of likes / dislikes | Potential gap for us |
|---|---|---|---|---|---|---|
| **Yassir** (Algerian super-app) | Taxi ride-hailing (plus delivery and wallet in some markets) | Urban riders, mainly Greater Tunis | Commission (10% reported in 2022, [Meshkal](https://meshkal.org/a-bolt-to-the-tunis-taxi-market/)) | Booking, vehicle and driver details shown after confirm, upfront/fixed pricing, scheduled bookings; driver doc check + training session ([Yassir](https://yassir.com/en/tunisia/ride-hailing), [Kosupa](https://en.kosupatravel.com/entry/2025/09/08/no-uber-or-bolt-in-tunisia-how-to-use-yassir-the-local-taxi-app-full-guide-review)) | Liked: fixed price vs inflated late-night fares ([Kosupa](https://en.kosupatravel.com/entry/2025/09/08/no-uber-or-bolt-in-tunisia-how-to-use-yassir-the-local-taxi-app-full-guide-review)). Coverage mostly Greater Tunis. | Coverage outside Tunis; louage/intercity-station info not found |
| **inDrive** | Taxi hailing with **price negotiation**; city-to-city | Tunis and Sousse riders; intercity | **No service fees in Tunisia** (2023 claim) ([Tekiano](https://www.tekiano.com/2023/09/12/indrive-celebre-ses-10-ans-en-tunisie-une-application-taxi-qui-se-veut-orientee-personne/)) | Bidding, licensed taxis only, **intercity since Nov 2022** ([ilBoursa](https://www.ilboursa.com/marches/indrive-fete-ses-10-ans-en-tunisie_42597)) | Claims ~40% of taxi drivers in Tunis/Sousse. Negotiation adds friction and conflicts with the meter principle ([Carthage Mag.](https://carthagemagazine.com/taxis-in-tunisia/)) | We **cannot** out-free it. We can differ on meter-first pricing, stations and louage. |
| **Bolt** | Taxi ride-hailing | Urban riders | 15% commission (2022) | Surge pricing; fares higher than meter ([Meshkal](https://meshkal.org/a-bolt-to-the-tunis-taxi-market/)) | Liked: reliability and fast matching. Disliked: price. **Suspended March 2025** ([Fintech News Africa](https://fintechnews.africa/44955/fintech-tunisia/tunisia-suspends-bolt-ride-hailing-app/)) | Shows the regulatory risk |
| **Heetch** | Taxi hailing | Urban riders | Commission (15–25% cited for Bolt/Heetch, [Technext](https://technext24.com/2025/03/26/tunisia-shut-down-bolt-heetch-govt-app/)) | Standard booking | Reported as targeted in 2025 ([African Manager](https://africanmanager.com/fin-de-course-pour-bolt-et-consorts-une-nouvelle-plateforme-publique-dici-fin-juin/)); a travel site still lists it mid-2026. **Status unclear.** | Re-verify |
| **IntiGo** | Taxi hailing | Urban riders | Unknown | Unknown | Reported as targeted in 2025 | Re-verify |
| **Amigo** (Tunisian) | Taxi hailing with **ride sharing** | Price-sensitive urban riders | Subscriptions and prepaid packs mentioned | Two clients within 2 km sharing a route pay half each; claims 500+ vehicles, 10k trips ([Tuniscope](https://www.tuniscope.com/article/348579/business/services/amigo-1ere-application-taxi-en-tunisie-partage-de-courses-584810), [amigo.tn](https://www.amigo.tn/)) | Not found | Shared taxi already exists, so it is not a differentiator |
| **Beem Smart Taxi** (taxi union) | Taxi booking built by the individual-taxi union | Greater Tunis | Unknown | ~600 taxis at launch (2022) ([Tuniscope](https://www.tuniscope.com/article/345432/tech/high-tech/syndicat-des-taxis-individuels-une-nouvelle-application-operationnelle-232411)) | Not found | **Potential partner**, not only a competitor: the union has legitimacy |
| **E-Taxi Tunisia** | Phone and web booking plus fare content | Tourists, business | Unknown | Phone line, online booking, fare calculator/blog ([etaxi.tn](https://www.etaxi.tn/en/pricing)) | Not found | Shows demand for **fare transparency** content |
| **State national taxi app** | Announced by the Ministry of Transport | All | Meter-based, cap 1.5× meter | Tunisian-hosted | **Not launched** per mid-2026 travel sources ([Carthage Mag.](https://carthagemagazine.com/taxis-in-tunisia/)) | Could crowd out private taxi apps, **or** make them need to integrate. Watch closely. |
| Others seen but not analysed | e-Wassalni ([site](https://ewassali.com/)), Taxi 216 (2020), Yango Ride (mentioned by etaxi.tn) | — | — | — | Insufficient evidence | Check in Phase 0 |

## 2. Louage / intercity

| Service | What it does | Evidence | Gap |
|---|---|---|---|
| **Gabès Louages** (station website, built by Wings Solutions) | Shows **vacant seats per destination in real time** from the Gabès station | [gabeslouages.tn](https://gabeslouages.tn/index_ar.html) | Single station, web only. **Proves station staff will keep a live board updated.** This is the model to scale. |
| Station management software (e.g. einfo.tn) | Queue and ticket management for louage stations | [einfo.tn](https://einfo.tn/developpement/gestion-station-louage/) | Back-office tool; no public passenger app found |
| TunisMapper, travel guides | Static info on stations, destinations and fares | [TunisMapper](https://www.tunismapper.com/louages-tunisie.php) | No live data, no station coordinates confirmed |
| inDrive city-to-city | Intercity rides with negotiated price | [ilBoursa](https://www.ilboursa.com/marches/indrive-fete-ses-10-ans-en-tunisie_42597) | Different product (whole car, negotiated). **Not the louage seat model.** |
| Facebook groups | Informal "louage/covoiturage" posts | Common knowledge; not measured | Unstructured, no trust layer |

**Conclusion:** we found **no mainstream national app for live louage seat availability**. This is the clearest gap.

## 3. Bus / public transport discovery

| Service | What it does | Evidence | Gap |
|---|---|---|---|
| **SNTRI** website | Intercity schedules, fares, online reservation | [sntri.com.tn](http://www.sntri.com.tn/html/index.php/en/horaires-et-tarifs); open data on [data.transport.tn](http://data.transport.tn/dataset/sations-lignes-d-exploitation-et-horaires-des-bus-de-la-sntri) | Aggregating SNTRI + louage in one "how do I get to Sfax?" answer |
| **TRANSTU** | Tunis bus, metro, TGM operator; tariffs online | [transtu.tn](https://www.transtu.tn/fr/tarifs) | Real-time data availability unknown |
| **Moovit / Google Maps transit** | Global transit apps | **Tunis coverage not confirmed by our search**; do not assume | Check in Phase 0 |

## 4. International reference apps (for mechanisms, not competition)

| App | Tunisia presence | Mechanisms worth studying |
|---|---|---|
| Uber | Never operated in Tunisia ([Carthage Mag.](https://carthagemagazine.com/taxis-in-tunisia/)) | Dispatch, Real-Time ID check, share trip, safety toolkit |
| Careem | No evidence of Tunisian operations found | Local-language UX, cash-first |
| BlaBlaCar | No evidence of Tunisian operations found | Verified-profile levels, reliability, seat model, reviews after trip |
| Moovit | Not confirmed | Crowd-sourced reports, line-based discovery |
| Waze | Global | Community reports with decay, upvote/downvote, auto-expiry |

## 5. Strategic takeaways

1. **Taxi hailing in Greater Tunis is crowded** (Yassir, inDrive, Amigo, Beem, possibly a state app) and **regulator-sensitive**. Entering head-on as "another taxi app" is the weakest position.
2. **"Free" doesn't differentiate**: inDrive already charges drivers nothing in Tunisia.
3. **Louage and intercity station information** is the clearest unmet need, and a real station (Gabès) already proves the board concept.
4. **Unions and stations are distribution channels.** Beem (union) and station managers could be partners.
5. Pricing must be **meter- and official-tariff-first**. That is the direction regulators are signalling.
