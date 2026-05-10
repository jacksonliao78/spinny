import test from "node:test";
import assert from "node:assert/strict";

import { buildPlayerStatsViewModel, formatDuration, formatPlaytime, type SavedRunRow } from "../../app/playerStats";

const run = (overrides: Partial<SavedRunRow>): SavedRunRow => ({
  mode: "timed",
  score: 0,
  lines: 0,
  level: 1,
  duration_ms: 0,
  board_type: "rectangular",
  pieces: 0,
  holds: 0,
  hard_drop_cells: 0,
  soft_drop_cells: 0,
  max_combo: 0,
  quads: 0,
  tspin_minis: 0,
  tspin_singles: 0,
  tspin_doubles: 0,
  tspin_triples: 0,
  allspins: 0,
  ...overrides,
});

const account = {
  username: "player_one",
  email: "player@example.com",
  createdAt: "2026-01-15T12:00:00.000Z",
};

test("buildPlayerStatsViewModel renders account info with an empty saved run state", () => {
  const view = buildPlayerStatsViewModel(account, []);

  assert.equal(view.hasRuns, false);
  assert.deepEqual(view.account, [
    { label: "Username", value: "player_one" },
    { label: "Email", value: "player@example.com" },
    { label: "Joined", value: "Jan 15, 2026" },
  ]);
  assert.equal(view.headline.find((stat) => stat.label === "Runs")?.value, "0");
  assert.equal(view.bests.find((best) => best.label === "Best Timed Score")?.value, "None");
});

test("buildPlayerStatsViewModel aggregates saved run totals", () => {
  const view = buildPlayerStatsViewModel(account, [
    run({
      score: 1_200,
      lines: 10,
      duration_ms: 90_000,
      pieces: 40,
      holds: 3,
      hard_drop_cells: 80,
      soft_drop_cells: 15,
      max_combo: 2,
      quads: 1,
      tspin_minis: 1,
      tspin_singles: 1,
      allspins: 2,
    }),
    run({
      mode: "marathon",
      score: 900,
      lines: 25,
      duration_ms: 130_000,
      pieces: 70,
      holds: 7,
      hard_drop_cells: 100,
      soft_drop_cells: 20,
      max_combo: 5,
      quads: 2,
      tspin_doubles: 1,
      tspin_triples: 1,
      allspins: 3,
    }),
  ]);

  assert.equal(view.hasRuns, true);
  assert.equal(view.headline.find((stat) => stat.label === "Runs")?.value, "2");
  assert.equal(view.headline.find((stat) => stat.label === "Playtime")?.value, "3m 40s");
  assert.equal(view.headline.find((stat) => stat.label === "Lines")?.value, "35");
  assert.equal(view.headline.find((stat) => stat.label === "Pieces")?.value, "110");
  assert.equal(view.activity.find((stat) => stat.label === "Max Combo")?.value, "5");
  assert.equal(view.activity.find((stat) => stat.label === "T-Spins")?.value, "4");
  assert.equal(view.activity.find((stat) => stat.label === "All-Spins")?.value, "5");
});

test("buildPlayerStatsViewModel chooses best mode-specific results", () => {
  const view = buildPlayerStatsViewModel(account, [
    run({ mode: "timed", score: 1_000, board_type: "rectangular" }),
    run({ mode: "timed", score: 1_500, board_type: "ring" }),
    run({ mode: "sprint", duration_ms: 75_000, board_type: "rectangular" }),
    run({ mode: "sprint", duration_ms: 64_321, board_type: "ring" }),
    run({ mode: "marathon", duration_ms: 180_000, lines: 30 }),
    run({ mode: "marathon", duration_ms: 160_000, lines: 48, board_type: "ring" }),
  ]);

  assert.equal(view.bests.find((best) => best.label === "Best Timed Score")?.value, "1,500");
  assert.equal(view.bests.find((best) => best.label === "Best Timed Score")?.detail, "Spinny");
  assert.equal(view.bests.find((best) => best.label === "Best Sprint Time")?.value, "1:04.32");
  assert.equal(view.bests.find((best) => best.label === "Best Marathon Time")?.value, "3:00.00");
  assert.equal(view.bests.find((best) => best.label === "Best Marathon Lines")?.value, "48");
  assert.equal(view.bests.find((best) => best.label === "Best Overall Score")?.value, "1,500");
});

test("stats formatters clamp unsafe values", () => {
  assert.equal(formatPlaytime(-1), "0s");
  assert.equal(formatDuration(-1), "0:00.00");

  const view = buildPlayerStatsViewModel({ username: null, email: null, createdAt: "nope" }, [
    run({ score: null, lines: null, duration_ms: null, pieces: null, max_combo: null }),
  ]);

  assert.deepEqual(view.account, [
    { label: "Username", value: "Unknown" },
    { label: "Email", value: "Unknown" },
    { label: "Joined", value: "Unknown" },
  ]);
  assert.equal(view.headline.find((stat) => stat.label === "Playtime")?.value, "0s");
});
