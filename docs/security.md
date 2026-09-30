# Security & Privacy v3.1

> **[LEGAL]** legal requirement with a source · **[LEGAL?]** needs legal verification · **[BP]** best practice.
> Sources: [research-tunisia.md §3](research-tunisia.md).

## 1. Authentication
| User | Method |
|---|---|
| Passenger | Sign in with Google (Android); + Sign in with Apple on iOS (App Store Guideline 4.8) |
| Driver | Same Google account → verification → `UNDER_REVIEW` → admin decision (push). Driver-only account once verified. |
| Admin | Google sign-in on the web admin + `is_admin` allow-list (2-step verification recommended on those Google accounts) |

Tokens **[BP]**: server-side Google ID-token verification; own 15-min JWT + rotating 60-day refresh token (hashed, reuse detection); all sessions revoked on suspension/ban; `expo-secure-store` on device.

## 2. Location privacy model

| Data | Collected | Visible to | Precision |
|---|---|---|---|
| Driver position (taxi, louage, bus) | Only while the driver is sharing | All signed-in users on the map (not blocked) | Exact, live |
| Driver position when not sharing | **Not collected** | — | — |
| Passenger position | Only while their single taxi/louage request is open | Sharing taxi/louage drivers of a matching type: **exact** · passengers & bus drivers: **approximate (~100 m grid)** | — |
| Passenger name & note | Only if the passenger turns on "Show my name and note" (off by default) | Sharing taxi/louage drivers of a matching type | — |
| Driver name | Always | Everyone (while sharing) | — |
| Pick-up records (drivers within 50 m when a passenger left) | Automatically at closure | **Admins only** (audited) | Distance only, no trajectories |
| Bus passengers | **Never collected** | — | — |
| Location history | **Not stored** (latest point; drivers also keep a ~2-min rolling window used only to create pick-up records) | — | — |
| Driver on break | Not collected | — | — |

Controls **[BP]**:
- Tracking only inside user-started foreground services with a visible notification and a Stop action; no background-location permission.
- The server rejects pings outside an active mode.
- The passenger request auto-closes (20 m / 5 min / 60 min); driver sharing has a 12 h cap.
- Block hides users from each other's maps.
- A one-time explainer before the first request and before the first sharing session.

Privacy risks accepted by design (to explain in the privacy policy):
- Drivers' live positions are visible to all users while they share. They choose to share, and they are professional operators.
- Waiting passengers are visible **exactly** to verified sharing drivers, for the lifetime of the request only.

## 3. Personal data inventory
| Data | Purpose | Shown to others? |
|---|---|---|
| Google `sub`, email | Identity, admin contact | No |
| Display name | Markers/cards | Passengers: only if opted in, to matching sharing drivers. Drivers: always, to everyone. |
| Driver legal identity & documents | Verification | No (admins; audited) |
| Driver photo, vehicle model/colour, plate | Recognise the vehicle, safety | Yes, while sharing |
| Request destination, seats, note | Matching by drivers | Destination to all (approx for passengers); seats/note to matching drivers |
| Pick-up records | Safety/reports | **No**: admin-only, audited, 90 days |
| Routine routes | Informing passengers | Yes: from, to, schedule, driver name |
| Device install ID, push token | Limits, notifications | No |

## 4. Legal vs best practice
| Topic | Status | Action |
|---|---|---|
| Declare the processing to the INPDP before starting | **[LEGAL]** Law 2004-63 | Before public launch / real driver documents |
| Transfers abroad (EU hosting, Google Sign-In, FCM) | **[LEGAL]** INPDP authorisation (Art. 51–52) | Lawyer to map each flow; hosting region accordingly |
| Real-time location of passengers and drivers | **[LEGAL?]** Consent wording and lawful basis | Explicit in-app consent screens; lawyer review |
| CIN copies, selfies | **[LEGAL?]** | Declaration category, retention |
| Criminal records | **[LEGAL]** sensitive | Not collected |
| Users' rights | **[LEGAL]** | In-app deletion + contact |
| Minimisation, no history, encryption, audit | **[BP]** | Built in |

## 5. Documents **[BP]**
Private bucket; pre-signed uploads; type/size checks; EXIF stripped; SHA-256 duplicates; 60-second signed admin URLs with a watermark; every view audited; purge after the decision + grace period (pending legal).

## 6. Application & infra security **[BP]**
- Role + state checks on every endpoint (`SHARING_REQUIRED`, `VERIFIED`, one-open-request).
- Per-viewer serialisation tests for map markers.
- Zod validation; rate limits (pings: ≤ 1 upload/3 s per device; map: ≤ 1 poll/2 s).
- No PII or coordinates in logs/push payloads/URLs.
- CSP/HSTS on the admin; dependency/image scans.
- SSH keys, firewall, private Postgres, encrypted off-site backups + a monthly restore test.
