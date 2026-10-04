# Field test: 4 phones in a real street (Phase 9)

> Goal: check on real phones, real GPS and real mobile data what the automated tests cannot: drift
> indoors and outdoors, battery, the 20 m rule, the map from a moving car, pushes, and how it feels.
> Thresholds are then tuned from **Admin → Mesures terrain** (no positions are ever shown there).

## 1. Setup (before going out)
| Who | Phone | Account | Role |
|---|---|---|---|
| D1 | Android, mid-range | verified **taxi** driver | drives |
| D2 | Android, low-end (2 GB RAM if possible, NFR-01) | verified **louage** driver | drives |
| P1 | Android | passenger | waits, walks away |
| P2 | Android | passenger | waits, troll/edge cases |

- Same build on all phones (EAS dev build or a preview APK). Note each phone's model and Android version.
- The API reachable from mobile data (not only the home Wi-Fi): a test server or a tunnel. Admin open on a laptop.
- Mark a start time in a shared note; every step below gets its clock time, so the admin views can be read against it.
- Battery at 100% on D1/D2 at the start; screen brightness fixed.
- Places: a street with a pavement where a car can stop, plus a building entrance (for the indoor case).

## 2. Runs
Tick each line; write what you saw when it differs.

### A. Passenger rules (R-030…R-042)
1. P1 posts a taxi request outdoors, stands still **20 min** → stays open, "Visible" within 60 s. *(no false closure)*
2. P1 repeats **indoors** near a window, 20 min → stays open (or closes `NO_GPS_FIX` within 60 s if no fix at all: note which).
3. P1 walks **25 m** away → closes `MOVED_AWAY` within ~20 s; closure screen says why.
4. P2 posts, turns location off → `LOCATION_LOST` after 5 min; push received.
5. P2 posts, waits 50 min → "Renew?" push at ~50 min; renew works; cancel works.
6. P2 posts a second request while one is open → refused.

### B. Driver sharing (R-050…R-059)
7. D1 starts sharing with "heading to" set → visible on P1/P2 maps within 5–10 s; name and plate shown.
8. D1 drives 2 km in town → the marker moves smoothly, no jumps; D2 sees D1 too.
9. D1 sets "Full" → badge on maps, last in the finder; unset → back.
10. D1 takes a 30 min break → disappears; "Resume?" push at the end; resume within 15 min works.
11. D2 kills the app (swipe away) for 5 min, reopens → session ended `PING_GAP`, 1 h cooldown shown.
12. D2 drives through a tunnel or a dead zone (if available) → session continues afterwards.
13. D1 battery after 1 h of sharing: ____ % used (target ≤ ~8 %/h, NFR-07).

### C. Matching on the map (R-020…R-027, R-045)
14. P1 waits on the pavement; D1 (taxi) sees P1 **exactly**; D2 (louage, request is taxi-only) sees only the ~100 m circle.
15. P1 turns "show my name" on → D1 sees name and note; off → anonymous.
16. D1 and D2 both near P1 → the farther one sees "1 driver closer".
17. D1 taps P1 → Google Maps / Waze open with the right spot.
18. P1 opens the finder for D1's "heading to" place → D1 listed under "Heading there now".
19. D1 drives to P1, P1 gets in and leaves → request closes `MOVED_AWAY`; in Admin → Prises en charge (by request) D1 is listed with a distance ≤ 50 m.

### D. Safety (R-070…R-073)
20. D2 reports P2's marker "Nobody there" → report in the admin queue.
21. P1 blocks D2 from the card → each disappears from the other's map.
22. Admin suspends P2 for 1 day → P2's next action shows the reason and end date; P2 sends the contact form; it appears in Contestations; admin lifts it.

### E. Robustness
23. Switch language to Arabic on one phone → every screen right-to-left, arrows pointing the reading way.
24. Largest system font size on one phone → no clipped buttons on the map, request and sharing screens.
25. Airplane mode for 2 min during sharing and during a request → the app recovers on its own.
26. After the session: Admin → Erreurs shows no crash from the run (or note which).

## 3. After the run
- Admin → **Mesures terrain** for the run's time window; copy the numbers below.
- Compare each with its threshold and decide (change values only in `packages/domain/src/config/thresholds.ts`, with a note in `docs/decisions.md`):

| Measurement | Value | Threshold | Change? |
|---|---|---|---|
| Delay before visible (p90) | | `anchor_timeout_s` = 60 | |
| Anchor accuracy (p90) | | `anchor_max_accuracy_m` = 30 | |
| False closures while standing still | | `move_away_m` = 20, `move_away_confirm_s` = 10 | |
| Pick-up distance (p90) | | `pickup_radius_m` = 50 | |
| Sessions ended `PING_GAP` without killing the app | | `ping_gap_s` = 120 | |
| Battery per hour (D1 / D2) | | NFR-07 ≤ ~8 %/h | |

- Write the findings (and any bug) as issues; keep this sheet with the date and phone models.
