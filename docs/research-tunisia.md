# Tunisia Context Research

> **Note (v2):** this research was done for the first plan. The facts and legal questions still apply. Recommendations about live seat boards, fare estimators and GPS work sessions belong to v1 and are no longer in scope. See [product-plan.md](product-plan.md).

> Research date: 2026-09-29. Every claim is labelled:
>
> - **[FACT]** confirmed by a cited source (still re-check the primary legal text before relying on it)
> - **[INTERPRETATION]** a source's (or our) reading of facts, not an official position
> - **[RECOMMENDATION]** what we should do about it
> - **[UNKNOWN]** not established; **requires legal advice or field validation**
>
> Nothing here is legal advice. Items marked [UNKNOWN] must be answered by a Tunisian lawyer
> (transport + data-protection) before public launch of any taxi-request feature.

---

## 1. Headline findings (read this first)

| # | Finding | Label | Impact on product |
|---|---|---|---|
| 1 | In **March 2025** Tunisian authorities suspended **Bolt**, citing tax evasion, money laundering and operating without the necessary licences; ~12M TND were reported seized from accounts linked to several ride-hailing platforms. Bolt denied the allegations. African Manager reported Heetch and IntiGo were also targeted. | [FACT] ([Fintech News Africa](https://fintechnews.africa/44955/fintech-tunisia/tunisia-suspends-bolt-ride-hailing-app/), [TechCabal](https://techcabal.com/2025/03/26/tunisia-to-suspend-bolt-for-alleged-tax-evasion-launch-state-backed-ride-hailing-app/), [African Manager](https://africanmanager.com/fin-de-course-pour-bolt-et-consorts-une-nouvelle-plateforme-publique-dici-fin-juin/)) | Taxi-booking platforms are a **politically and legally sensitive** category in Tunisia right now. |
| 2 | The Ministry of Transport announced a **state-backed national taxi app**, developed and hosted in Tunisia, with fares **capped at 1.5× the meter**, planned for end of H1 2025. | [FACT] ([Managers](https://managers.tn/2024/11/29/une-nouvelle-application-pour-organiser-le-transport-de-taxi-sera-lancee-en-2025/), [African Manager](https://africanmanager.com/fin-de-course-pour-bolt-et-consorts-une-nouvelle-plateforme-publique-dici-fin-juin/)) | A government competitor may appear at any time. |
| 3 | As of mid-2026, travel sources report the state app **had not launched / rollout unconfirmed**. | [FACT] per [Carthage Magazine, Jul 2026](https://carthagemagazine.com/taxis-in-tunisia/) — secondary source | Status must be re-checked in Phase 0. |
| 4 | In **May 2025** the ministry said it was preparing a **call for proposals** and a **regulatory framework** for taxi-booking apps, mentioning tariff harmonisation, cybersecurity, personal-data protection and a **Tunisian-hosted** application, alongside a revision of Law 2004-33. | [FACT] ([Tunisie Numérique](https://www.tunisienumerique.com/tunisie-le-ministere-des-transports-prepare-un-cadre-reglementaire-pour-encadrer-les-applications-de-reservation-de-taxis-individuels/), [Webdo](https://www.webdo.tn/fr/actualite/national/tunisie-bientot-un-cadre-legal-pour-les-applications-de-transport/222024/)) | Architecture must be **portable to Tunisian hosting**. |
| 5 | In **April 2026** the minister said the legal framework for taxi apps was **still being worked on**. | [FACT] ([La Presse, 2026-04-20](https://www.lapresse.tn/2026/04/20/transport-bientot-un-cadre-legal-pour-les-applications-de-taxi/)) | No published rulebook to comply with yet → **legal gate** before public taxi launch. |
| 6 | **inDrive** operates in Tunisia (Tunis 2021, Sousse 2022, **city-to-city since Nov 2022**), charged **no service fees in Tunisia** (2023) and claimed ~40% of Tunis/Sousse taxi drivers as partners. | [FACT] company claims reported by [Tekiano](https://www.tekiano.com/2023/09/12/indrive-celebre-ses-10-ans-en-tunisie-une-application-taxi-qui-se-veut-orientee-personne/), [ilBoursa](https://www.ilboursa.com/marches/indrive-fete-ses-10-ans-en-tunisie_42597) | **"Free for drivers" is NOT a differentiator.** |
| 7 | **Louages** have no timetable, depart when full, fixed per-seat fares; no mainstream booking app found. One station site (**Gabès Louages**) publishes **real-time vacant seats per destination**. | [FACT] ([TunisMapper](https://www.tunismapper.com/louages-tunisie.php), [Gabès Louages](https://gabeslouages.tn/index_ar.html)) | Validates a **station-board** model and that stations will maintain data. |

---

## 2. Land transport regulation

### 2.1 Legal base
- **[FACT]** Land transport is organised by **Law n° 2004-33 of 19 April 2004**, amended notably by Law n° 2006-55. ([IGPPP](https://igppp.tn/fr/node/472), [Portail du Transport – lois](https://www.transport.tn/fr/terrestre/reglement))
- **[INTERPRETATION]** (Meshkal, 2022) Law 2004-33 gives licensed taxis the exclusive right to individual paid rides; that is why Bolt could only recruit licensed taxi drivers, and taxi unions accepted apps *as long as* they used licensed taxis. ([Meshkal](https://meshkal.org/a-bolt-to-the-tunis-taxi-market/))
- **[INTERPRETATION]** Individual taxi, louage, collective taxi, rural transport and tourist taxi are distinct regulated categories of "non-regular public transport of persons", each with its own tariff decision. ([transport.tn tariffs page](https://www.transport.tn/ar/terrestre/article/217/t-ryf-lnql-l-mwmy-ll-shkhs-bwst-s))
- **[RECOMMENDATION]** Accept **licensed operators only**. Never onboard private cars for paid rides. This is both legally safer and politically aligned with taxi/louage unions.

### 2.2 Driver requirements
- **[FACT]** A **professional card (carte professionnelle)** is required to drive a taxi, louage or rural-transport vehicle. Listed conditions include Tunisian nationality, no conviction above certain thresholds, holding a **category D or D1 licence for ≥ 2 years**, and a **professional aptitude certificate** for individual taxis. ([Idaraty](https://idaraty.tn/fr/procedures/octroi-de-la-carte-professionnelle-pour-la-conduite-dune-voiture-taxi-de-louage-ou-de-transport-rural), [SICAD](http://www.sicad.gov.tn/Fr/imprimer.php?code=3&id=1779))
- **[UNKNOWN]** Exact current licence category requirements per vehicle type. Re-check the current texts: administrative procedure pages may be out of date.
- **[RECOMMENDATION]** Driver verification must collect: CIN, driving licence, **professional card**, selfie. Vehicle verification must collect: registration (carte grise), insurance, **operating card/authorisation (carte d'exploitation)** and a photo showing the plate.

### 2.3 Vehicle / operating authorisation
- **[FACT]** An **operating card (carte d'exploitation)** exists for taxi, louage and rural-transport vehicles, issued with an ATTT regional directorate certificate attesting that the vehicle is registered in the authorisation holder's name. ([SICAD](http://www.sicad.gov.tn/Fr/imprimer.php?code=3&id=1144))
- **[INTERPRETATION]** The authorisation holder and the person driving can be different people (a hired driver), so the model must separate **Vehicle/authorisation** from **Driver**.
- **[UNKNOWN]** Whether taxis may pick up outside their licensing governorate/zone. This matters for zone design.

### 2.4 Tariffs
- **[FACT]** The Ministry of Transport publishes **official louage tariffs per line, per governorate** (PDFs, decisions effective 15 Feb 2020 on the page consulted). ([transport.tn tariffs](https://www.transport.tn/ar/terrestre/article/217/t-ryf-lnql-l-mwmy-ll-shkhs-bwst-s), e.g. [Tunis PDF](https://www.transport.tn/uploads/tarif/2020/Tunis-2020.pdf))
- **[FACT]** Individual taxi fares are metered and regulated, with a **night surcharge (~50%)**. Secondary sources give different amounts for the pick-up charge and per-km rate (e.g. 900 millimes + 600 millimes/km; other sources report increases). ([Combien-coûte](https://www.combien-coute.net/taxi_priseencharge/tunisie/), [African Manager – hausse](https://africanmanager.com/hausse-des-tarifs-des-taxis-individuels-a-partir-du-15-decembre/))
- **[RECOMMENDATION]** Store all tariffs as **admin-editable, versioned data** (`effective_from`, `source_url`). Never hard-code them. Display estimates as "official meter estimate" and not as a price.
- **[UNKNOWN]** Whether 2020 louage tariffs have since been updated (very likely). The latest official decisions must be extracted in Phase 0.

### 2.5 Louage operations
- **[FACT]** Louages depart when full (~8 seats) and have no timetable. Main Tunis stations include **Moncef Bey** (south/Sahel), **Bab Alioua** and the **northern station**. Filling becomes hard in the evening; stations use queue tickets at peak. ([TunisMapper](https://www.tunismapper.com/louages-tunisie.php), [Destination Tunis](https://destination-tunis.fr/se-deplacer/principe-fonctionnement-louage-tunisie/))
- **[FACT]** Station-management software exists commercially (e.g. queue/ticket management for louage stations). ([einfo.tn](https://einfo.tn/developpement/gestion-station-louage/))
- **[INTERPRETATION]** A Radio Nationale item mentioned louages being allowed to circulate **outside designated zones** as an exceptional measure, which implies that louages are normally restricted to authorised lines/zones. ([Radio Nationale](https://www.radionationale.tn/article/6a10283e08d2abfa30c75b76/))
- **[UNKNOWN]** Legality of roadside louage pick-ups and of "seat holding" or reservations.
- **[RECOMMENDATION]** Build louage features **around stations**: no roadside pick-up features until clarified.

### 2.6 Public buses and rail
- **[FACT]** **TRANSTU** runs Greater Tunis buses, the light metro and the TGM. **SNTRI** runs intercity buses and offers online schedules and reservation. ([Wikipedia – Transtu](https://en.wikipedia.org/wiki/Soci%C3%A9t%C3%A9_des_transports_de_Tunis), [SNTRI](http://www.sntri.com.tn/html/index.php/en/horaires-et-tarifs))
- **[FACT]** SNTRI stations, lines and schedules are published as **open data** on the Tunisian transport open-data portal. ([data.transport.tn](http://data.transport.tn/dataset/sations-lignes-d-exploitation-et-horaires-des-bus-de-la-sntri))
- **[INTERPRETATION]** Bus drivers are employees of public companies and are not independent operators. **Bus does not fit the "driver" role.**
- **[RECOMMENDATION]** Bus is **information only** (SNTRI schedules from open data, later disruption reports). Check the open-data licence before reuse.

---

## 3. Data protection and location privacy

- **[FACT]** The governing law is **Organic Law n° 2004-63 of 27 July 2004**, overseen by the **INPDP** (Instance Nationale de Protection des Données Personnelles). ([Law text – INS](https://www.ins.tn/sites/default/files/2020-04/Loi%2063-2004%20Fr.pdf), [INPDP](https://www.inpdp.tn/textes.xhtml))
- **[FACT]** Controllers must complete **prior formalities (declaration)** with the INPDP before processing. ([Village de la Justice](https://www.village-justice.com/articles/decret-loi-face-loi-2004-sur-les-donnees-personnelles-une-perspective-critique,54276.html), [INPDP forms](https://www.inpdp.tn/Formulaires.html))
- **[FACT]** **Transfers of personal data abroad require INPDP authorisation** (Art. 51–52), and the destination must provide adequate protection. ([Jurisite – Ch. IV](https://www.jurisitetunisie.com/tunisie/codes/ce/pd1040.htm), [Data Protection Africa](https://dataprotection.africa/tunisia/))
- **[FACT]** The law restricts processing of certain sensitive categories, including **criminal records**. ([Data Protection Africa](https://dataprotection.africa/tunisia/))
- **[UNKNOWN]** A **2025 reform bill** (GDPR-like: DPO, DPIA, 72h breach notification) is reported by some sites with a 2026 effective date, but a Tunisian law firm source (updated Sep 2026) says it could **not** confirm adoption or publication in the JORT. **Treat it as unconfirmed.** ([regulations.ai](https://regulations.ai/news/tunisia-data-protection-law-2026-deadline-gdpr-like-rules) vs [Me. Guedhami](https://maitre-haifaguedhami.me/en/actualites/protection-donnees-personnelles-tunisie-2026))
- **[UNKNOWN] – legal advice needed:**
  1. Which INPDP declaration or authorisation regime applies to **continuous location data**, **CIN copies** and **selfies** (is a selfie treated as biometric data if we do automated face matching?).
  2. Whether hosting on an EU VPS, sending push notifications through Google FCM, or sending OTP SMS through a foreign provider counts as a "transfer abroad" that needs authorisation (very likely yes for hosting).
  3. Mandatory or maximum **retention periods** for trip and location data and verification documents.
  4. Whether driver **professional card / criminal-record-derived** status can be stored (we should store only "card valid until", not criminal data).
- **[RECOMMENDATION]** Design to **GDPR-level technical best practice** (minimisation, purpose limitation, retention limits, access control, audit, deletion). This is compatible with any outcome. Keep the stack **self-hostable in Tunisia** (Docker + PostgreSQL) so data residency can be satisfied without a rewrite. File the INPDP declaration **before** collecting driver documents from real users.

---

## 4. Platform landscape (summary; see [competitors.md](competitors.md))

- **[FACT]** Yassir operates in Tunisia, mainly Greater Tunis; drivers register documents and attend a training session. ([Yassir TN](https://yassir.com/en/tunisia/ride-hailing), [Kosupa Travel](https://en.kosupatravel.com/entry/2025/09/08/no-uber-or-bolt-in-tunisia-how-to-use-yassir-the-local-taxi-app-full-guide-review))
- **[FACT]** The individual-taxi union launched **Beem Smart Taxi** (2022, ~600 taxis, Greater Tunis). ([Tuniscope](https://www.tuniscope.com/article/345432/tech/high-tech/syndicat-des-taxis-individuels-une-nouvelle-application-operationnelle-232411))
- **[FACT]** **Amigo** is a Tunisian taxi app with ride sharing (2 clients within 2 km, half price each), subscriptions and prepaid packs; it claimed 500+ vehicles. ([Tuniscope](https://www.tuniscope.com/article/348579/business/services/amigo-1ere-application-taxi-en-tunisie-partage-de-courses-584810), [amigo.tn](https://www.amigo.tn/))
- **[FACT]** Bolt had a 15% commission and Yassir 10% (2022). Bolt fares were described as noticeably higher than the meter, with surge pricing. ([Meshkal](https://meshkal.org/a-bolt-to-the-tunis-taxi-market/))
- **[FACT]** Greater Tunis had roughly **17,000 taxis** across four governorates (2022). ([Meshkal](https://meshkal.org/a-bolt-to-the-tunis-taxi-market/))
- **[FACT]** Common passenger complaints: refusals of short trips at rush hour, in rain or late at night; the meter declared "broken" at airport kerbs. ([Carthage Magazine](https://carthagemagazine.com/taxis-in-tunisia/))

---

## 5. Technology facts relevant to Tunisia

- **[FACT]** Since March 2025, Google Maps **Maps SDK for Android/iOS** map display is free with unlimited usage, while web/Geocoding/Places SKUs have monthly free caps and then charge. ([Google – Android SDK billing](https://developers.google.com/maps/documentation/android-sdk/usage-and-billing), [pricing overview](https://developers.google.com/maps/billing-and-pricing/overview))
- **[UNKNOWN]** Android vs iOS share in Tunisia. Widely assumed Android-majority. Check [StatCounter Tunisia](https://gs.statcounter.com/os-market-share/mobile/tunisia) in Phase 0.
- **[UNKNOWN]** SMS OTP unit cost to +216 numbers from Tunisian aggregators vs international providers. Get quotes in Phase 0.

---

## 6. Open legal questions checklist (for the lawyer)

1. Does a **free, commission-less** app that relays taxi requests to licensed taxis fall under the forthcoming "electronic platforms for non-regular transport" framework? What authorisation is needed today, while the framework is pending?
2. Does an **information-only** app (station directory, official fares, live louage seat boards maintained by stations) need any transport authorisation?
3. Company form and tax registration requirements. Is the **Startup Act** label (Law 2018-20) useful?
4. INPDP: declaration vs authorisation for location data, CIN copies and selfies; data transfer abroad (hosting, FCM, SMS provider, error monitoring).
5. Retention periods for verification documents, trip logs and location samples.
6. Liability wording: "documents reviewed" vs "verified"; incident cooperation with authorities; lawful requests procedure.
7. Can we display driver photo, first name and **plate number** to matched clients? What consent form is needed?
8. Louage: seat holding/reservations; roadside pick-ups; partnership with station managers.
9. Taxi zone restrictions (governorate-bound licences).
10. Consumer-protection or advertising rules if we later show ads or sell subscriptions.
