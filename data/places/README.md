# Places dataset

`tn-places.json`: places in Tunisia used for destination search and pick-on-map (R-010, R-011, ADR-217).

- **Source:** [OpenStreetMap](https://www.openstreetmap.org/), extracted with the Overpass API by
  `pnpm --filter @fi-thnitek/api places:fetch` (`apps/api/scripts/places-fetch-osm.ts`).
- **Licence:** [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
  © OpenStreetMap contributors. Keep this attribution wherever the data or the map is shown.
- **Load:** `pnpm --filter @fi-thnitek/api db:seed` upserts by `source` (`osm:<type>/<id>`). Places an admin
  edited are locked and kept as they are.
- **Refresh:** re-run the fetch, review the diff (renamed or missing stations especially), commit, seed.

Each record: `source`, `kind`, `nameAr`, `nameFr`, `aliases`, `lat`, `lng`, `governorateCode`, `popularity`.
When OSM has a name in only one language, it is used for both until an admin adds the translation.
