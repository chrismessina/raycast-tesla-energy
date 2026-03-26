# TODO

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
