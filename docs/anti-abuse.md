# Anti-Abuse & Trust v3.1

> No assignment means no "connection" to hang trust on, so trust comes from: **verified drivers**, **tight passenger limits**, the **automatic request closure rules**, **silent pick-up records (admin-only)**, **reports** and **admin decisions**.

## 1. Principles
1. Verified drivers are the trust anchor.
2. Limits and automatic closure instead of suspicion.
3. Automation may **close requests, end sharing sessions, apply the cooldown, pause requesting for 24 h and hide content**, and nothing more. Suspensions and bans are admin decisions with a reason and a contact form.
4. One report never punishes anyone.

## 2. Built-in rules
| Rule | Value |
|---|---|
| Open requests per passenger | **1** (DB-enforced) |
| Requests per day | 5 (account < 3 days) · 15 (others) |
| Request auto-closure | > 20 m moved · 5 min without location · 60 min (renew, max 3) · no GPS fix within 60 s |
| Google accounts per device (30 days) | 2 active; a third is blocked from requesting and flagged |
| Driver features | Only while sharing (fresh fix < 2 min) |
| Driver restart after a stop | **1 h cooldown** (manual stop, GPS off, app killed/ping gap, spoof suspicion) |
| Driver session cap | 12 h ("still working?" confirmation) |
| Declared breaks | 30 min / 1 h / 2 h; **visible but frozen** ("on a break · not available") and not tracked; resume any time; resumes by itself at the end (no cooldown, ADR-227) |
| "I'm full" | Free toggle while sharing; no penalty |
| Passenger identity | Anonymous by default; name + note shown to matching drivers only if the passenger opts in |
| Verified driver account | Driver-only (no passenger mode), so drivers can't peek at the map without sharing |

## 3. Automatic actions
| Trigger | Action | Admin |
|---|---|---|
| 3 `NOBODY_THERE` reports from distinct drivers on a passenger within 7 days | `REQUEST_PAUSE` 24 h (limit) + flag | Review; warn/suspend if trolling |
| Mock-location flag or implied speed > 180 km/h | End sharing + cooldown + `risk_flag` | Review; repeat → suspension |
| 3rd account on one device | Requesting blocked on the new account + flag | Review |
| 3 reports from distinct users on the same driver within 7 days | Flag only | Review (warn / suspend / revoke verification) |
| `UNSAFE` / `HARASSMENT` report | High-priority flag (review target < 24 h) | Decide |

## 4. Scenarios

| # | Scenario | Detection | Immediate action | Evidence | Human review | Resolution | Appeal |
|---|---|---|---|---|---|---|---|
| 1 | **Troll request** (nobody is there) | Drivers tap "Nobody there"; the passenger never moves and eventually expires; patterns | Request auto-closes at 60 min at the latest; 3 distinct reports → 24 h request pause | Request metadata, reports, device | Admin on the flag | Warning → suspension → ban | Contact form |
| 2 | **Passenger takes another vehicle / walks away** | Moved > 20 m | Auto-close (`MOVED_AWAY`) | — | None (by design) | — | — |
| 3 | **Several drivers race to the same passenger** | By design | None; drivers see each other on the map | — | Only if drivers complain | Optional later: a non-binding "on my way" marker | — |
| 4 | **Driver hides, peeks, then reappears** | The session state machine | Features need sharing; any stop → 1 h cooldown; no passenger mode for drivers | Session log | — | — | Admin can clear a cooldown on request |
| 5 | **Driver kills the app to dodge the cooldown** | A ping gap with no buffered fixes | Session `PING_GAP` → cooldown from the last good fix | Session fixes timestamps | — | — | Contact form (e.g. dead battery → admin clears) |
| 6 | **Network loss (tunnel, weak signal)** | A gap covered by buffered fixes | None: the session continues (hidden while no fresh fix) | Uploaded fixes | — | — | — |
| 7 | **GPS spoofing** (driver fakes a position) | `isMock`, impossible jumps | End sharing + cooldown + flag | Fixes with flags | Admin | Warning → suspension | Contact form |
| 8 | **Passenger spoofs to dodge the 20 m rule** | Mock flag on passenger fixes | Request closed + flag | Fixes | Admin if repeated | Warning | Contact form |
| 9 | **Driver behaves badly with a passenger** | The passenger reports from their request history ("Report a problem") or from a marker | High-priority flag | **Pick-up record** (all drivers within 50 m, distances), the drivers' session events, other reports | Admin identifies the driver (asks the passenger for the plate/name if several were recorded) and contacts both | Warning / suspension / verification revoked | Contact form, another admin if possible |
| 10 | **Passenger abuses a driver** | The driver reports from their session history ("Report a problem" + approximate time) or from a marker | Flag | Pick-up records of that driver around that time → the passenger request(s) | Admin | Warning / suspension / ban | Contact form |
| 11 | **Stalking a passenger via the map** | Reports | Block hides the users from each other | Map exposure is limited to verified sharing drivers, only while the request is open | Admin | Verification revoked + ban | — |
| 12 | **Stalking a driver via the map** | Reports | Block | Driver shares by choice; no history | Admin | Ban the stalker | — |
| 13 | **Multiple driver accounts / fake documents** | CIN/plate uniqueness, document hashes, admin review | Rejected at submission / review | Documents | Admin | Reject + blocklist | Contact form |
| 14 | **Banned user returns with a new Google account** | Device install ID; CIN/plate for drivers | Requesting blocked on flagged devices | Match data | Admin | Ban extended | Contact form |
| 15 | **Legitimate driver falsely reported** | Needs ≥ 3 distinct reporters for even a flag | Nothing automatic | Pickup data contradicts the claim | Admin | Dismissed, no record | — |
| 16 | **Driver abuses breaks** (e.g. repeated breaks to hide from certain passengers) | Session events; a break no longer hides anyone (ADR-227) | None automatic (breaks are legitimate) | Break frequency per day | Admin if reported | Warning | Contact form |
| 17 | **Drivers argue over who takes a passenger** | Reports between drivers | None automatic | Session events, pick-up record | Admin | Warning; repeat → suspension | Contact form |

Every scenario above is an end-to-end test in `apps/api/test/scenarios.int.test.ts` (ADR-223).

## 5. If abuse grows (not before)
Optional phone OTP to request; Play Integrity device checks; stricter new-account limits in hot areas; a non-binding "on my way" marker if racing causes conflicts.
