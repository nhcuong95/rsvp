// Balanced team builder (team-builder.js). Run: node --test "tests/**/*.test.js"
const { test } = require("node:test");
const assert = require("node:assert");
const TeamBuilder = require("../team-builder.js");

const { POSITIONS, planTeams, buildTeams, formatTeams, seededRandom } = TeamBuilder;

// n players; player i is a natural at POSITIONS[i % 8] with a spread of skill.
function squad(n, skill = (i) => 4 + (i % 6)) {
  return Array.from({ length: n }, (_, i) => {
    const position = POSITIONS[i % POSITIONS.length];
    return {
      name: `P${String(i + 1).padStart(2, "0")}`,
      favorites: [position],
      scores: { [position]: skill(i) },
    };
  });
}
const build = (players, seed = 1, extra = {}) =>
  buildTeams(players, { random: seededRandom(seed), ...extra });
const everyone = (result) =>
  result.teams.flatMap((team) => team.lineup.map((slot) => slot.player.name).concat(team.subs.map((p) => p.name)));

test("plan: 24 -> three full 8s", () => {
  const plan = planTeams(24);
  assert.strictEqual(plan.length, 3);
  plan.forEach((team) => {
    assert.deepStrictEqual(team.positions, POSITIONS);
    assert.strictEqual(team.subs, 0);
  });
});

test("plan: 23 -> three teams, one of 7 with no GK", () => {
  const plan = planTeams(23);
  assert.strictEqual(plan.length, 3);
  assert.deepStrictEqual(plan.map((team) => team.positions.length), [8, 8, 7]);
  assert.ok(!plan[2].positions.includes("GK"));
});

test("plan: 16-22 -> two full 8s plus subs split evenly", () => {
  assert.deepStrictEqual(planTeams(16).map((t) => t.subs), [0, 0]);
  assert.deepStrictEqual(planTeams(19).map((t) => t.subs), [2, 1]);
  assert.deepStrictEqual(planTeams(22).map((t) => t.subs), [3, 3]);
  planTeams(22).forEach((team) => assert.strictEqual(team.positions.length, 8));
});

test("plan: under 16 -> two teams, wide slots dropped first", () => {
  const plan = planTeams(14);
  plan.forEach((team) => {
    assert.strictEqual(team.positions.length, 7);
    assert.ok(!team.positions.includes("RW"));
  });
  assert.deepStrictEqual(planTeams(15).map((t) => t.positions.length), [8, 7]);
  assert.deepStrictEqual(planTeams(4).map((t) => t.positions), [["GK", "CB"], ["GK", "CB"]]);
});

test("plan: 25+ -> three 8s plus subs; under 2 -> nothing", () => {
  assert.deepStrictEqual(planTeams(26).map((t) => t.subs), [1, 1, 0]);
  assert.strictEqual(planTeams(1), null);
});

test("24 players: one of each position per team, everyone placed once, in a favourite", () => {
  const result = build(squad(24));
  assert.strictEqual(result.teams.length, 3);
  result.teams.forEach((team) => {
    assert.deepStrictEqual(team.lineup.map((slot) => slot.position), POSITIONS);
    team.lineup.forEach((slot) => assert.ok(slot.player.favorites.includes(slot.position)));
  });
  assert.strictEqual(new Set(everyone(result)).size, 24);
});

test("balance: team ratings end up close", () => {
  const result = build(squad(24, (i) => 1 + ((i * 7) % 10)));
  assert.ok(result.spread <= 0.5, `spread ${result.spread}`);
});

test("three star strikers are spread one per team", () => {
  const players = squad(24, (i) => (POSITIONS[i % 8] === "ST" ? 10 : 5));
  const result = build(players);
  result.teams.forEach((team) => {
    const striker = team.lineup.find((slot) => slot.position === "ST").player;
    assert.strictEqual(striker.scores.ST, 10);
  });
});

test("23 players: the 7-a-side team borrows a GK, and the copy text says so", () => {
  const result = build(squad(23));
  const borrowing = result.teams.filter((team) => team.borrowsGoalkeeper);
  assert.strictEqual(borrowing.length, 1);
  assert.strictEqual(borrowing[0].lineup.length, 7);
  const text = formatTeams(result, "Thu, Oct 2");
  assert.match(text, /^⚽ Teams · Thu, Oct 2 · 8v8$/m);
  assert.match(text, /\(GK rotates\)/);
  assert.strictEqual(new Set(everyone(result)).size, 23);
});

test("20 players: two 8s with two subs each", () => {
  const result = build(squad(20));
  assert.deepStrictEqual(result.teams.map((team) => team.subs.length), [2, 2]);
  assert.match(formatTeams(result), /Subs: /);
});

test("guests (Me + 1) stay on their host's team", () => {
  const players = squad(18);
  players.push({ name: "P01's guest", guestOf: "P01" }, { name: "P09's guest", guestOf: "P09" });
  for (let seed = 1; seed <= 5; seed += 1) {
    const result = build(players, seed);
    const teamOf = (name) => result.teams.findIndex((team) =>
      team.lineup.some((slot) => slot.player.name === name) || team.subs.some((p) => p.name === name));
    assert.strictEqual(teamOf("P01's guest"), teamOf("P01"));
    assert.strictEqual(teamOf("P09's guest"), teamOf("P09"));
  }
});

test("nobody scored yet: still builds valid teams from favourite positions", () => {
  const players = squad(16).map((player) => ({ name: player.name, favorites: player.favorites }));
  const result = build(players);
  result.teams.forEach((team) => {
    assert.strictEqual(team.lineup.length, 8);
    team.lineup.forEach((slot) => assert.ok(slot.player.favorites.includes(slot.position)));
  });
});

test("Reshuffle gives a different split that is still balanced", () => {
  const players = squad(24, (i) => 3 + (i % 5));
  const first = build(players, 7);
  const second = build(players, 8, { avoidSignature: first.signature });
  assert.notStrictEqual(second.signature, first.signature);
  assert.ok(second.spread <= first.spread + 0.25 + 1e-9);
});

test("same seed, same teams (repeatable)", () => {
  assert.strictEqual(build(squad(24), 42).signature, build(squad(24), 42).signature);
});

test("copy text lists every player once and never shows scores", () => {
  const players = squad(24, () => 9);
  const result = build(players);
  const text = formatTeams(result, "Thu, Oct 2");
  players.forEach((player) => {
    assert.strictEqual(text.split(player.name).length - 1, 1, player.name);
  });
  assert.doesNotMatch(text, /\b9(\.\d+)?\b/); // no score digits
  assert.doesNotMatch(text, /rating|avg|score/i);
  assert.match(text, /^🔴 Red: GK P/m);
});
