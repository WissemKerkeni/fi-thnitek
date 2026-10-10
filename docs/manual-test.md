# Manual test: two real accounts + the Teboulba simulation

> Before the street test ([field-test.md](field-test.md)): check every screen at home with two phones
> (or one phone, signing out between roles) and a simulated town full of drivers and passengers.

## 0. Setup (on the PC)
- Servers: API, Metro and admin running (ask Claude "start the servers").
- Simulation: `pnpm --filter @fi-thnitek/api sim:demo` — 9 drivers driving Teboulba's main roads (5 taxis, 3 louages, 1 bus line L23), 1 driver on a break, 6 waiting passengers in the centre (4 taxi, 2 louage), 2 regular louage trips from the Teboulba station (→ Tunis 07:30, → Sousse 17:00). Ctrl+C ends it cleanly. `--around <lat>,<lng>` puts the same scene elsewhere. `--clean` deletes all fake accounts.
- Accounts: **A = passenger** (any test Google account), **B = driver** (the other one). A verified driver account cannot make passenger requests, so keep the roles apart. The admin console (http://localhost:5173) uses the allow-listed account.
- Only fake documents for the driver file (INPDP).

## 1. First run (A and B)
- [ ] Sign-in with Google → language (try English) → terms → first name → **Passenger or Driver** (once, final) → **Location** screen → map opens where you are, blue dot visible.
- [ ] Refuse location once: the explanation stays, "Allow" asks again; refuse "don't ask again": **Open settings** appears.
- [ ] Turn the phone's GPS off, come back to the app → back on the Location screen.
- [ ] Language switch in the header (عربي | FR | EN): Arabic is right-to-left, arrows point the reading way; app restarts when switching.

## 2. Passenger A: the map and search
- [ ] Search "Teboulba" → the map flies there: moving taxis/louages/bus, a **Full** badge on Sonia, Walid (on a break) absent, passengers shown as ~100 m circles (no names).
- [ ] Layer chips (taxi / louage / bus / passengers) hide and show markers; zoom far out → count bubbles; tap one → zooms in.
- [ ] Tap a driver → card: name, plate, heading to, next regular trip (Ridha, Fathi); **Report** and **Block** buttons.
- [ ] "My location" button brings you back.
- [ ] Search chips **Station louage / Gare routière / Station taxi**: nearest first, each with a distance. Type "taxi", "محطة اللواج", "bus station", "louage Sousse".
- [ ] Choose a destination → "Who is going to …?" lists (with `--around` near you: heading there now, taxis nearby, regular departures).

## 3. Driver B: verification
- [ ] Choose **Driver** at first run → form (you, licences, vehicle, review) with fake photos → submit → "Under review". (A passenger account has no driver sign-up.)
- [ ] Admin → Vérifications → open B → approve → B gets a push, status "Verified", B now opens on the sharing screen.

## 4. Driver B: sharing
- [ ] Start sharing (heading to optional) → foreground notification "You are visible on the map".
- [ ] In Teboulba: every fake driver (taxi, louage, bus) is on the map; only passengers asking for **your** type appear (a taxi driver sees Amel, Sami, Hela, Ines — never Youssef or Omar who want a louage), as exact pins with seats; Amel and Ines show their name/note. No passenger screens, no "Ask for a taxi", no type filter. Queue under the map grouped by destination.
- [ ] Tap Amel → card: waiting time, distance, "N drivers closer", Google Maps / Waze open at the spot.
- [ ] "I'm full" on/off; take a 30 min break (cannot resume early); stop → 1 h cooldown message.
- [ ] Regular trips: add one, see it on your driver card (from A's phone).

## 5. Both phones together: a pick-up
- [ ] A posts a taxi request (B's type), with the name shown on → "Visible to drivers" within a minute.
- [ ] B (sharing, next to A) sees A exactly with name and note.
- [ ] A walks 25 m away → request closes "You moved away"; B no longer sees A.
- [ ] Admin → Prises en charge → by request → B is listed with a distance ≤ 50 m (and the read is in the audit log).
- [ ] A: post, stand still 5 min (no false closure); cancel; a request left alone closes by itself at 30 min (no countdown shown).

## 6. Safety
- [ ] B reports Amel "Nobody there"; A reports a fake driver "Unsafe" → both in Admin → Signalements (Unsafe first).
- [ ] A blocks a fake driver from the card → it disappears; Profile → Blocked people → unblock → it comes back.
- [ ] A: Profile → My requests → report a past request; B: My sharing → report with a time.
- [ ] Admin: suspend A for 1 day → A's next action shows the reason and date; A sends the contact form; Admin → Contestations; lift the suspension → A signs in again.

## 7. Admin
- [ ] Dashboard numbers move with the simulation; Mesures terrain for today; Erreurs (should be empty); Utilisateurs search.

Note what differs from the expected result (screen, steps, screenshot) and share it.
