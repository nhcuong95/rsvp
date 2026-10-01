// Balanced team builder for 8v8. Each team's eight slots are one of every
// position (GK LB CB RB CM LW RW ST). Players are placed preferring their
// favourite positions and best per-position scores, then same-position
// players (and subs) are swapped between teams until team strength is even.
// Pure logic, no DOM: index.html uses window.TeamBuilder, the Node tests use
// module.exports. Scores are admin-only and never appear in the copy text.
(function (global) {
  const POSITIONS = ["GK", "LB", "CB", "RB", "CM", "LW", "RW", "ST"];
  // Slots left empty first when there are too few players for full eights,
  // so the GK–CB–CM–ST spine stays filled.
  const DROP_ORDER = ["RW", "LW", "RB", "LB", "CM", "ST", "CB", "GK"];
  const TEAMS = [
    { name: "Red", emoji: "🔴" },
    { name: "White", emoji: "⚪" },
    { name: "Black", emoji: "⚫" },
  ];
  const TEAM_SIZE = POSITIONS.length;
  const MIN_SCORE = 1;
  const MAX_SCORE = 10;
  const DEFAULT_SCORE = 5; // when nobody has been scored yet
  // Placement prefers favourite positions by this much (on the 1–10 scale);
  // team strength always uses the real score.
  const FAVORITE_BONUS = 1.5;
  // Random jitter in placement so restarts (and Reshuffle) explore different
  // but still sensible line-ups.
  const PLACEMENT_NOISE = 0.75;
  const RESTARTS = 60;
  // A split counts as "as balanced as the best" within this many rating
  // points (team ratings are averages on the 1–10 scale).
  const BALANCE_TOLERANCE = 0.25;
  const GUEST_APART_PENALTY = 100;

  // How many teams, which slots each has, and how many subs.
  //   23+ players -> 3 teams. 23 = two full eights plus one team of 7 with
  //                  no GK (they borrow the resting team's keeper); 25+ adds subs.
  //   16-22       -> two full eights plus subs, split as evenly as possible.
  //   2-15        -> two teams, wide slots left empty first.
  function planTeams(playerCount) {
    const n = Math.floor(Number(playerCount) || 0);
    if (n < 2) {
      return null;
    }
    const full = () => ({ positions: POSITIONS.slice(), subs: 0 });
    if (n >= 3 * TEAM_SIZE - 1) {
      const teams = [full(), full(), full()];
      if (n === 3 * TEAM_SIZE - 1) {
        teams[2].positions = POSITIONS.filter((position) => position !== "GK");
      } else {
        spreadSubs(teams, n - 3 * TEAM_SIZE);
      }
      return teams;
    }
    const teams = [full(), full()];
    if (n >= 2 * TEAM_SIZE) {
      spreadSubs(teams, n - 2 * TEAM_SIZE);
      return teams;
    }
    const sizes = [Math.ceil(n / 2), Math.floor(n / 2)];
    return sizes.map((size) => {
      const dropped = DROP_ORDER.slice(0, TEAM_SIZE - size);
      return {
        positions: POSITIONS.filter((position) => !dropped.includes(position)),
        subs: 0,
      };
    });
  }

  function spreadSubs(teams, extra) {
    teams.forEach((team, index) => {
      team.subs = Math.floor(extra / teams.length) + (index < extra % teams.length ? 1 : 0);
    });
  }

  function isScore(value) {
    return typeof value === "number" && value >= MIN_SCORE && value <= MAX_SCORE;
  }

  function ratedValues(player) {
    const scores = player.scores || {};
    return POSITIONS.map((position) => scores[position]).filter(isScore);
  }

  function mean(values) {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  }

  // Score of a player at a position. Unscored positions count as the
  // player's lowest score minus 1 (capped at the group average) so the
  // builder avoids putting them there; never-scored players and guests count
  // as the group average everywhere.
  function makeScorer(players) {
    const all = players.flatMap(ratedValues);
    const groupAverage = all.length ? mean(all) : DEFAULT_SCORE;
    return function scoreAt(player, position) {
      const own = (player.scores || {})[position];
      if (isScore(own)) {
        return own;
      }
      const rated = ratedValues(player);
      if (!rated.length) {
        return groupAverage;
      }
      return Math.max(MIN_SCORE, Math.min(Math.min(...rated) - 1, groupAverage));
    };
  }

  function isFavorite(player, position) {
    return Array.isArray(player.favorites) && player.favorites.includes(position);
  }

  function shuffle(list, random) {
    const copy = list.slice();
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapWith = Math.floor(random() * (index + 1));
      [copy[index], copy[swapWith]] = [copy[swapWith], copy[index]];
    }
    return copy;
  }

  // Fill every slot (across all teams) with the best-fitting players, with a
  // little noise; whoever is left over becomes a sub. Then improve by swapping
  // two players' positions (or a player with a sub) when that fits better.
  function placePlayers(players, plan, fit, random) {
    const capacity = {};
    POSITIONS.forEach((position) => {
      capacity[position] = plan.filter((team) => team.positions.includes(position)).length;
    });
    const pairs = [];
    players.forEach((player, index) => {
      POSITIONS.forEach((position) => {
        if (capacity[position]) {
          pairs.push({ index, position, value: fit(player, position) + random() * PLACEMENT_NOISE });
        }
      });
    });
    pairs.sort((first, second) => second.value - first.value);

    const slotOf = new Array(players.length).fill(null); // position, or null = sub
    pairs.forEach(({ index, position }) => {
      if (slotOf[index] === null && capacity[position] > 0) {
        slotOf[index] = position;
        capacity[position] -= 1;
      }
    });

    const fitOf = (index, position) => (position ? fit(players[index], position) : 0);
    let improved = true;
    for (let pass = 0; improved && pass < 20; pass += 1) {
      improved = false;
      for (let a = 0; a < players.length; a += 1) {
        for (let b = a + 1; b < players.length; b += 1) {
          const [pa, pb] = [slotOf[a], slotOf[b]];
          if (pa === pb) {
            continue;
          }
          const before = fitOf(a, pa) + fitOf(b, pb);
          const after = fitOf(a, pb) + fitOf(b, pa);
          if (after > before + 1e-9) {
            [slotOf[a], slotOf[b]] = [pb, pa];
            improved = true;
          }
        }
      }
    }
    return slotOf;
  }

  // Deal each position's players and the subs out to teams, then swap
  // same-position players (and subs) between teams while it evens out team
  // ratings. Guests must end up on their host's team.
  function balanceTeams(players, plan, slotOf, scoreAt, random) {
    const teamOf = new Array(players.length).fill(-1);
    POSITIONS.forEach((position) => {
      const teamsWithSlot = shuffle(
        plan.map((team, index) => (team.positions.includes(position) ? index : -1))
          .filter((index) => index !== -1),
        random,
      );
      shuffle(players.map((_, index) => index).filter((index) => slotOf[index] === position), random)
        .forEach((index, order) => {
          teamOf[index] = teamsWithSlot[order];
        });
    });
    const subSeats = plan.flatMap((team, index) => new Array(team.subs).fill(index));
    shuffle(players.map((_, index) => index).filter((index) => slotOf[index] === null), random)
      .forEach((index, order) => {
        teamOf[index] = subSeats[order];
      });

    const bestOutfield = players.map((player) =>
      Math.max(...POSITIONS.filter((position) => position !== "GK").map((position) => scoreAt(player, position))));
    const memberScore = (index) =>
      (slotOf[index] ? scoreAt(players[index], slotOf[index]) : bestOutfield[index]);
    const nameIndex = new Map(players.map((player, index) => [player.name, index]));

    function ratings() {
      const keeperScores = [];
      const groups = plan.map(() => []);
      players.forEach((_, index) => {
        groups[teamOf[index]].push(memberScore(index));
        if (slotOf[index] === "GK") {
          keeperScores.push(memberScore(index));
        }
      });
      // A team without a GK borrows a keeper, so count an average one.
      return groups.map((scores, team) =>
        mean(plan[team].positions.includes("GK") || !keeperScores.length
          ? scores
          : scores.concat(mean(keeperScores))));
    }

    function objective() {
      const values = ratings();
      const spread = Math.max(...values) - Math.min(...values);
      let apart = 0;
      players.forEach((player, index) => {
        const host = nameIndex.get(player.guestOf);
        if (host !== undefined && teamOf[host] !== teamOf[index]) {
          apart += 1;
        }
      });
      const average = mean(values);
      const variance = mean(values.map((value) => (value - average) ** 2));
      return spread + apart * GUEST_APART_PENALTY + variance * 0.001;
    }

    // Swappable groups: players sharing a position, and the subs.
    const groups = POSITIONS.map((position) =>
      players.map((_, index) => index).filter((index) => slotOf[index] === position))
      .concat([players.map((_, index) => index).filter((index) => slotOf[index] === null)])
      .filter((group) => group.length > 1);

    let current = objective();
    let improved = true;
    for (let pass = 0; improved && pass < 50; pass += 1) {
      improved = false;
      groups.forEach((group) => {
        for (let a = 0; a < group.length; a += 1) {
          for (let b = a + 1; b < group.length; b += 1) {
            const [i, j] = [group[a], group[b]];
            if (teamOf[i] === teamOf[j]) {
              continue;
            }
            [teamOf[i], teamOf[j]] = [teamOf[j], teamOf[i]];
            const next = objective();
            if (next < current - 1e-9) {
              current = next;
              improved = true;
            } else {
              [teamOf[i], teamOf[j]] = [teamOf[j], teamOf[i]];
            }
          }
        }
      });
    }

    const values = ratings();
    const teams = plan.map((team, index) => ({
      name: TEAMS[index].name,
      emoji: TEAMS[index].emoji,
      borrowsGoalkeeper: !team.positions.includes("GK"),
      lineup: POSITIONS.filter((position) => team.positions.includes(position)).map((position) => ({
        position,
        player: players[teamOf.findIndex((teamIndex, i) => teamIndex === index && slotOf[i] === position)],
      })),
      subs: players.filter((_, i) => teamOf[i] === index && slotOf[i] === null),
      rating: values[index],
    }));
    const fitTotal = players.reduce(
      (sum, player, index) => sum + (slotOf[index] ? scoreAt(player, slotOf[index]) + (isFavorite(player, slotOf[index]) ? FAVORITE_BONUS : 0) : 0),
      0,
    );
    return {
      teams,
      objective: current,
      spread: Math.max(...values) - Math.min(...values),
      fit: fitTotal,
      signature: teams
        .map((team) => team.lineup.map((slot) => slot.player.name).concat(team.subs.map((p) => p.name)).sort().join("|"))
        .sort()
        .join(" / "),
    };
  }

  // players: [{ name, favorites: ["CB", ...], scores: { CB: 8, ... }, guestOf? }]
  // options.random: () => [0, 1) (seedable for tests)
  // options.avoidSignature: a previous result's signature, so Reshuffle gives
  //   a different split when an equally balanced one exists.
  function buildTeams(players, options) {
    const random = (options && options.random) || Math.random;
    const plan = planTeams(players.length);
    if (!plan) {
      return null;
    }
    const scoreAt = makeScorer(players);
    const fit = (player, position) =>
      scoreAt(player, position) + (isFavorite(player, position) ? FAVORITE_BONUS : 0);

    const results = [];
    for (let restart = 0; restart < RESTARTS; restart += 1) {
      const slotOf = placePlayers(players, plan, fit, random);
      results.push(balanceTeams(players, plan, slotOf, scoreAt, random));
    }
    // As balanced as the best, then the best-fitting line-ups among those.
    const bestObjective = Math.min(...results.map((result) => result.objective));
    const balanced = results.filter((result) => result.objective <= bestObjective + BALANCE_TOLERANCE);
    const bestFit = Math.max(...balanced.map((result) => result.fit));
    let pool = balanced.filter((result) => result.fit >= bestFit - 2);
    const fresh = pool.filter((result) => result.signature !== (options && options.avoidSignature));
    if (fresh.length) {
      pool = fresh;
    }
    const chosen = pool[Math.floor(random() * pool.length)];
    return { teams: chosen.teams, spread: chosen.spread, signature: chosen.signature };
  }

  // Paste-ready Messenger text. Never includes scores or ratings.
  function formatTeams(result, title) {
    const sizes = result.teams.map((team) => team.lineup.length + (team.borrowsGoalkeeper ? 1 : 0));
    const format = sizes.every((size) => size === sizes[0]) ? ` · ${sizes[0]}v${sizes[0]}` : "";
    const lines = [`⚽ Teams${title ? ` · ${title}` : ""}${format}`];
    result.teams.forEach((team) => {
      const lineup = team.lineup.map((slot) => `${slot.position} ${slot.player.name}`).join(" · ");
      const keeper = team.borrowsGoalkeeper ? " (GK rotates)" : "";
      const subs = team.subs.length ? ` · Subs: ${team.subs.map((player) => player.name).join(", ")}` : "";
      lines.push(`${team.emoji} ${team.name}${keeper}: ${lineup}${subs}`);
    });
    return lines.join("\n");
  }

  // Small seedable PRNG (mulberry32) for repeatable tests.
  function seededRandom(seed) {
    let state = seed >>> 0;
    return function () {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const api = {
    POSITIONS,
    MIN_SCORE,
    MAX_SCORE,
    planTeams,
    buildTeams,
    formatTeams,
    seededRandom,
  };
  global.TeamBuilder = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
