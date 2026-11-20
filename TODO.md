# TODO

## Before the next Store update

`rx stale` (rx main, 2026-11-20) against the published copy. `ship`'s gates run the same check, so
each item below needs fixing or a recorded disposition before `rx gates` passes.

- [ ] **`stale-upstream` FAIL on `package.json` and `package-lock.json`.** Raycast's description
  rewrite (raycast/extensions#33590) arrived through the mirror sync (`e6c2fb5`), but on top of
  local commits that Raycast never saw: the `@ianvs/prettier-plugin-sort-imports` dev dependency
  (and its Babel packages in the lockfile) and the new logging preference copy ("Debug Logging",
  "Enable extra diagnostics in the console", "Show detailed logs in the console for debugging.").
  The published blob therefore never existed in this history. A diff on 2026-11-20 found nothing
  upstream that the local files lack, so the next update would not revert anyone's change. Re-run
  that diff against a fresh `rx stale` before shipping, then reconcile: either ship these edits
  deliberately (and say so in the PR body) or bring the files back to the published copy first.
- [ ] **`stale-deleted` WARN on `assets/menubar-extension.png`.** It moved to `media/` (`4575f0a`)
  because it is a README image, not a runtime asset. The update deletes the published copy; record
  a `remove-published` disposition for it in the audit.
- [ ] **`stale-check` WARN on six paths** (`.gitignore`, `.prettierrc`, `README.md`,
  `src/menu-bar-status.tsx`, `src/tesla.ts`, `src/view-solar-production.tsx`): the published copy
  equals an older commit of each. Read each diff and record `keep-local` only where every hunk since
  is yours.
- [ ] **`stale-new` WARN on eight paths.** Decide each:
  - `CONTRIBUTING.md`, `LICENSE`, `TODO.md`: mirror-only, listed in `.gitignore`, so they stay out
    of the PR.
  - `AGENTS.md`, `.claude/settings.local.json`: held out by `rx holdout` (the preset's
    `holdout.localOnly`).
  - `docs/superpowers/plans/…` and `docs/superpowers/specs/2026-03-24-solar-production-redesign.md`:
    planning docs, not contributor docs. Contributor `docs/` ships by policy, but `docs/planning/`
    does not; decide whether these ship or go in `.gitignore`.
  - `media/menubar-extension.png`: new, ships (the README embeds it).
- [ ] **Open issue #1**, "Tesla API error 421 – user out of region" for an EU user: unrelated to the
  items above, but still open on the mirror.

## Solar Production Redesign

_Plan: `docs/superpowers/plans/2026-03-24-solar-production-redesign.md`_

### Task 1: Create `src/utils/energyCalc.ts`

- [x] Create file with `getDateRange` and display helpers
- [x] Add aggregation helpers
- [x] Build to verify
- [x] Commit

### Task 2: Create `src/utils/svgChart.ts`

- [x] Create file with shared types and `escSvg`/`toDataUri` helpers
- [x] Add `areaChart`
- [x] Add `barChart`
- [x] Add `biChart`
- [x] Build to verify
- [x] Commit

### Task 3: Rewrite `src/view-solar-production.tsx`

- [x] Write new command
- [x] Build to verify
- [x] Run in Raycast and verify charts render
- [x] Commit

### Task 4: Delete `view-history` and update `package.json`

- [x] Remove `src/view-history.tsx`
- [x] Remove `view-history` command from `package.json`
- [x] Update Solar Production description in `package.json`
- [x] Build to verify
- [x] Commit

### Task 5: Add period label to markdown heading

- [x] Add period heading to chartsMarkdown
- [x] Build and verify
- [x] Commit

### Task 6: Inspect raw API response for vehicle fields

- [x] Add temporary debug log to `fetchEnergyHistory`
- [x] Run dev and inspect verbose logs for `vehicle_*` fields
- [x] Document findings below ↓
- [x] Remove debug log
- [x] Commit

### Task 7: Update docs

- [x] Update `CLAUDE.md` commands section
- [x] Mark TODO items complete, add future work notes
- [x] Commit

---

## Vehicle Field Investigation

_Completed 2026-03-25_

**Fields found in `calendar_history` response not currently in `EnergyHistoryEntry`:**

- `generator_energy_exported`
- `battery_energy_imported_from_generator`
- `consumer_energy_imported_from_generator`
- `grid_energy_exported_from_generator`
- `grid_services_energy_imported`
- `grid_services_energy_exported`
- `total_home_usage` _(pre-computed convenience total)_
- `total_battery_discharge` _(pre-computed convenience total)_
- `total_grid_energy_exported` _(pre-computed convenience total)_

**No `vehicle_*` fields present.**

**Conclusion:** Vehicle charging data is **not** available under `energy_device_data` scope. Adding a vehicle chart would require scope expansion (a separate OAuth scope). The pre-computed `total_*` fields could simplify aggregation math but are not needed given our existing helpers.

**Wall Connector investigation (2026-03-26):**

- `telemetry_history?kind=charge` → `{ charge_history: null }` — Wall Connector telemetry not available via energy site API even when a Wall Connector is installed
- `calendar_history?kind=charge` → 400 "kind not supported"
- `calendar_history?kind=self_consumption` → **200**, returns `{ time_series: [{ timestamp, solar: %, battery: % }] }` — solar/battery self-consumption percentages (useful but not vehicle-specific)
- Stacked Home/Vehicle chart (like NetZero) not feasible without `vehicle_device_data` scope + per-session timestamp correlation

---

## Future Work

- [ ] **Vehicle charging chart** — requires `vehicle_device_data` scope + per-session timestamp correlation against `energy_history`; Wall Connector `telemetry_history` returns null even when installed; stacked Home/Vehicle bar chart (NetZero style) not feasible without this scope
- [ ] **Generator support** — `generator_*` fields are present in the API response; could add generator chart panel if user has a generator
- [ ] **Grid services chart** — `grid_services_energy_imported/exported` fields present; relevant for users enrolled in demand response programs
- [ ] **Caching / request deduplication** — all commands make independent API calls on init; revisit when adding new commands or if rate limiting becomes an issue
- [ ] **Live data overlay** — show current wattage as a marker on the day-view area chart
- [ ] **Calendar-aligned date ranges** — true calendar week/month vs rolling windows
- [ ] **Multi-site support** — currently always uses `sites[0]`
