# TODO

## Solar Production Redesign
_Plan: `docs/superpowers/plans/2026-03-24-solar-production-redesign.md`_

### Task 1: Create `src/utils/energyCalc.ts`
- [ ] Create file with `getDateRange` and display helpers
- [ ] Add aggregation helpers
- [ ] Build to verify
- [ ] Commit

### Task 2: Create `src/utils/svgChart.ts`
- [ ] Create file with shared types and `escSvg`/`toDataUri` helpers
- [ ] Add `areaChart`
- [ ] Add `barChart`
- [ ] Add `biChart`
- [ ] Build to verify
- [ ] Commit

### Task 3: Rewrite `src/view-solar-production.tsx`
- [ ] Write new command
- [ ] Build to verify
- [ ] Run in Raycast and verify charts render
- [ ] Commit

### Task 4: Delete `view-history` and update `package.json`
- [ ] Remove `src/view-history.tsx`
- [ ] Remove `view-history` command from `package.json`
- [ ] Update Solar Production description in `package.json`
- [ ] Build to verify
- [ ] Commit

### Task 5: Add period label to markdown heading
- [ ] Add period heading to chartsMarkdown
- [ ] Build and verify
- [ ] Commit

### Task 6: Inspect raw API response for vehicle fields
- [ ] Add temporary debug log to `fetchEnergyHistory`
- [ ] Run dev and inspect verbose logs for `vehicle_*` fields
- [ ] Document findings below ↓
- [ ] Remove debug log
- [ ] Commit

### Task 7: Update docs
- [ ] Update `CLAUDE.md` commands section
- [ ] Mark TODO items complete, add future work notes
- [ ] Commit

---

## Vehicle Field Investigation
_To be filled in after Task 6_

**Fields found in `calendar_history` response not currently in `EnergyHistoryEntry`:**
- TBD

**Conclusion:** TBD — does adding a Vehicle chart require scope expansion, or are the fields already available?

---

## Future Work

- [ ] **Vehicle charging chart** — confirm field availability via Task 6 first; if present under `energy_device_data`, add 5th chart panel with no scope changes needed
- [ ] **Caching / request deduplication** — all 3 commands make independent API calls on init; revisit when adding new commands or if rate limiting becomes an issue
- [ ] **Live data overlay** — show current wattage as a marker on the day-view area chart
- [ ] **Calendar-aligned date ranges** — true calendar week/month vs rolling windows
- [ ] **Multi-site support** — currently always uses `sites[0]`
