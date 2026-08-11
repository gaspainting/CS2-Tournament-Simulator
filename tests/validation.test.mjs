import assert from "node:assert/strict";
import test from "node:test";
import { filterPlayers } from "../.test-dist/src/domain/playerFilters.js";
import { normalizeStageConfig } from "../.test-dist/src/domain/stageConfig.js";
import {
  detectNameLanguage,
  validatePlayer,
  validateRoster,
  validateSeriesScore,
  validateTemplate,
} from "../.test-dist/src/domain/validation.js";

const players = Array.from({ length: 6 }, (_, index) => ({
  id: `player-${index + 1}`,
  nickname: `Player${index + 1}`,
  realName: `Player ${index + 1}`,
  nationality: "China",
  age: 20 + index,
  role: index === 0 ? "IGL" : index === 1 ? "AWPer" : "Rifler",
  rating: 1,
  source: "custom",
  updatedAt: "2026-08-10",
}));

const validTeam = {
  id: "team-1",
  name: "Northwind",
  shortName: "NW",
  region: "Asia",
  color: "#d84b3e",
  source: "custom",
  language: "en",
  roster: {
    starters: players.slice(0, 5).map((player) => player.id),
    substitutes: [players[5].id],
  },
  rating: 1000,
  stability: 0.7,
  updatedAt: "2026-08-10",
};

test("a playable roster has exactly five unique starters", () => {
  assert.deepEqual(validateRoster(validTeam, players), []);

  const duplicate = {
    ...validTeam,
    roster: { ...validTeam.roster, starters: ["player-1", "player-1", "player-2", "player-3", "player-4"] },
  };
  assert.match(validateRoster(duplicate, players).join(" "), /重复/);
});

test("roster slots enforce Coach role semantics without requiring five distinct starter roles", () => {
  const tacticalPlayers = players.map((player) => ({ ...player, role: "Rifler" }));
  assert.deepEqual(validateRoster(validTeam, tacticalPlayers), []);

  const starterCoach = tacticalPlayers.map((player, index) => index === 0 ? { ...player, role: "Coach" } : player);
  assert.match(validateRoster(validTeam, starterCoach).join(" "), /首发.*Coach|Coach.*首发/i);

  const substituteCoach = tacticalPlayers.map((player, index) => index === 5 ? { ...player, role: "Coach" } : player);
  assert.match(validateRoster(validTeam, substituteCoach).join(" "), /替补.*Coach|Coach.*替补/i);

  const coachTeam = { ...validTeam, roster: { starters: validTeam.roster.starters, substitutes: [], coachId: players[5].id } };
  assert.match(validateRoster(coachTeam, tacticalPlayers).join(" "), /教练.*Coach|Coach.*教练/i);
  assert.deepEqual(validateRoster(coachTeam, substituteCoach), []);

  const extraPlayers = [
    ...tacticalPlayers,
    { ...tacticalPlayers[5], id: "player-7", nickname: "Player7" },
    { ...tacticalPlayers[5], id: "player-8", nickname: "Player8" },
  ];
  const tooManySubstitutes = { ...validTeam, roster: { ...validTeam.roster, substitutes: ["player-6", "player-7", "player-8"] } };
  assert.match(validateRoster(tooManySubstitutes, extraPlayers).join(" "), /替补.*2|2.*替补/i);
});

test("players require complete identity and bounded member fields", () => {
  assert.deepEqual(validatePlayer(players[0]), []);
  assert.match(validatePlayer({ ...players[0], nationality: " " }).join(" "), /国籍|nationality|空白/i);
  assert.match(validatePlayer({ ...players[0], age: 15 }).join(" "), /年龄|age/i);
  assert.match(validatePlayer({ ...players[0], age: 46 }).join(" "), /年龄|age/i);
  assert.match(validatePlayer({ ...players[0], role: "Sniper" }).join(" "), /位置|role/i);
  assert.match(validatePlayer({ ...players[0], rating: 0.49 }).join(" "), /评分|rating/i);
  assert.match(validatePlayer({ ...players[0], rating: 2.01 }).join(" "), /评分|rating/i);
});

test("fictional names stay in their selected language", () => {
  assert.equal(detectNameLanguage("霜火竞技"), "zh");
  assert.equal(detectNameLanguage("Northwind"), "en");
  assert.equal(detectNameLanguage("霜火 Northwind"), "mixed");
});

test("series scores match best-of rules", () => {
  assert.equal(validateSeriesScore(1, 13, 8), null);
  assert.equal(validateSeriesScore(3, 2, 1), null);
  assert.equal(validateSeriesScore(5, 3, 2), null);
  assert.match(validateSeriesScore(3, 3, 1) ?? "", /BO3/);
});

test("templates reject invalid team counts and stages", () => {
  const template = {
    id: "template-1",
    name: "Broken",
    builtIn: false,
    teamCount: 7,
    stages: [],
  };
  const errors = validateTemplate(template);
  assert.ok(errors.some((error) => error.includes("阶段")));
  assert.ok(errors.some((error) => error.includes("队伍")));
});

test("stage type normalization supplies valid defaults for every format", () => {
  const base = {
    id: "stage-1",
    name: "Stage",
    type: "single_elimination",
    advanceCount: 1,
    bestOf: { default: 3, final: 5 },
  };
  const swiss = normalizeStageConfig(base, "swiss", 16);
  assert.equal(swiss.winsToAdvance, 3);
  assert.equal(swiss.lossesToEliminate, 3);
  assert.equal(swiss.bestOf.decisive, 3);
  assert.equal(swiss.avoidRematches, true);

  const roundRobin = normalizeStageConfig(base, "round_robin", 16);
  assert.equal(roundRobin.cycles, 1);

  const groups = normalizeStageConfig(base, "groups", 16);
  assert.equal(groups.groupCount, 2);
  assert.equal(groups.advanceCount, 2);
  assert.equal(groups.groupFormat, "round_robin");
  assert.equal(groups.cycles, 1);

  const single = normalizeStageConfig(base, "single_elimination", 16);
  assert.equal(single.bestOf.final, 5);
  assert.equal(single.thirdPlace, false);

  const double = normalizeStageConfig(base, "double_elimination", 16);
  assert.equal(double.bestOf.final, 5);
  assert.equal(double.thirdPlace, false);
  assert.equal(double.grandFinalReset, false);

  for (const stage of [swiss, roundRobin, groups, single, double]) {
    assert.deepEqual(validateTemplate({ id: "template", name: "Template", builtIn: false, teamCount: 16, stages: [stage] }), []);
  }
});

test("double elimination requires a power-of-two field", () => {
  for (const teamCount of [6, 10, 12]) {
    const errors = validateTemplate({
      id: `double-${teamCount}`,
      name: "Invalid double elimination",
      builtIn: false,
      teamCount,
      stages: [{
        id: "double",
        name: "Double elimination",
        type: "double_elimination",
        advanceCount: 1,
        bestOf: { default: 3, final: 5 },
        grandFinalReset: false,
      }],
    });
    assert.match(errors.join(" "), /2 的幂|4、8、16、32、64/);
  }
  for (const teamCount of [4, 8, 16, 32, 64]) {
    assert.deepEqual(validateTemplate({
      id: `double-${teamCount}`,
      name: "Valid double elimination",
      builtIn: false,
      teamCount,
      stages: [{
        id: "double",
        name: "Double elimination",
        type: "double_elimination",
        advanceCount: 1,
        bestOf: { default: 3, final: 5 },
        grandFinalReset: false,
      }],
    }), []);
  }
});

test("stage normalization preserves valid values and removes fields from the previous format", () => {
  const groups = normalizeStageConfig({
    id: "groups",
    name: "Groups",
    type: "groups",
    advanceCount: 8,
    bestOf: { default: 1 },
    groupCount: 4,
    groupFormat: "round_robin",
    cycles: 2,
  }, "groups", 16);
  assert.equal(groups.groupCount, 4);
  assert.equal(groups.advanceCount, 8);
  assert.equal(groups.cycles, 2);

  const swiss = normalizeStageConfig(groups, "swiss", 16);
  assert.equal(swiss.groupCount, undefined);
  assert.equal(swiss.groupFormat, undefined);
  assert.equal(swiss.cycles, undefined);
});

test("group stage normalization keeps valid group sizes and clears Swiss cycles", () => {
  const base = {
    id: "groups",
    name: "Groups",
    type: "groups",
    advanceCount: 4,
    bestOf: { default: 1 },
    groupCount: 3,
    groupFormat: "round_robin",
    cycles: 2,
  };
  const normalized = normalizeStageConfig(base, "groups", 10);
  assert.equal(10 % normalized.groupCount, 0);

  const swiss = normalizeStageConfig({ ...normalized, groupFormat: "swiss" }, "groups", 10);
  assert.equal(swiss.groupFormat, "swiss");
  assert.equal(swiss.cycles, undefined);
});

test("player filters combine source, role, team, search, and rating range", () => {
  const candidates = [
    { ...players[0], id: "alpha", nickname: "Alpha", source: "professional", role: "AWPer", rating: 1.24 },
    { ...players[1], id: "beta", nickname: "Beta", source: "professional", role: "Rifler", rating: 1.08 },
    { ...players[2], id: "gamma", nickname: "Gamma", source: "custom", role: "AWPer", rating: 1.3 },
  ];
  const teams = [{ ...validTeam, id: "team-alpha", roster: { starters: ["alpha"], substitutes: [] } }];
  const result = filterPlayers(candidates, teams, {
    source: "professional",
    role: "AWPer",
    teamId: "team-alpha",
    query: "alp",
    minRating: 1.2,
    maxRating: 1.3,
  });
  assert.deepEqual(result.map((player) => player.id), ["alpha"]);
});

test("stage entry and invite counts normalize optional values and reject impossible relationships", () => {
  const base = {
    id: "stage-entry",
    name: "Stage",
    type: "single_elimination",
    advanceCount: 8,
    entrantCount: 100,
    inviteCount: 100,
    bestOf: { default: 3, final: 5 },
  };
  const normalized = normalizeStageConfig(base, "single_elimination", 16);
  assert.equal(normalized.entrantCount, 16);
  assert.equal(normalized.inviteCount, 16);
  assert.equal(normalizeStageConfig({ ...normalized, entrantCount: undefined, inviteCount: undefined }, "single_elimination", 16).entrantCount, undefined);

  const invalid = {
    id: "invalid-entry",
    name: "Invalid",
    builtIn: false,
    teamCount: 16,
    stages: [
      { ...normalized, id: "first", entrantCount: 1, inviteCount: -1 },
      { ...normalized, id: "second", entrantCount: 8, inviteCount: 4 },
    ],
  };
  const errors = validateTemplate(invalid).join(" ");
  assert.match(errors, /参赛队数/);
  assert.match(errors, /邀请名额/);
  assert.match(errors, /上一阶段/);
});

test("templates reject first-stage invites and require exact later-stage entrant totals", () => {
  const template = {
    id: "invite-progression",
    name: "Invite progression",
    builtIn: false,
    teamCount: 12,
    stages: [
      {
        id: "opening",
        name: "Opening",
        type: "single_elimination",
        entrantCount: 8,
        inviteCount: 1,
        advanceCount: 4,
        bestOf: { default: 1, final: 3 },
      },
      {
        id: "finals",
        name: "Finals",
        type: "single_elimination",
        entrantCount: 8,
        inviteCount: 2,
        advanceCount: 1,
        bestOf: { default: 3, final: 5 },
      },
    ],
  };
  const errors = validateTemplate(template).join(" ");
  assert.match(errors, /第 1 阶段.*邀请名额.*0/);
  assert.match(errors, /第 2 阶段.*参赛队数.*上一阶段.*邀请名额.*相等/);
});

test("templates reject invites that exceed the remaining unused team pool", () => {
  const template = {
    id: "exhausted-invites",
    name: "Exhausted invites",
    builtIn: false,
    teamCount: 8,
    stages: [
      { id: "opening", name: "Opening", type: "single_elimination", advanceCount: 4, bestOf: { default: 1, final: 3 } },
      { id: "finals", name: "Finals", type: "single_elimination", entrantCount: 6, inviteCount: 2, advanceCount: 1, bestOf: { default: 3, final: 5 } },
    ],
  };
  assert.match(validateTemplate(template).join(" "), /第 2 阶段.*邀请名额.*剩余未参赛队伍/);
});

test("malformed legacy templates return domain errors instead of throwing TypeError", () => {
  assert.doesNotThrow(() => validateTemplate(null));
  assert.match(validateTemplate(null).join(" "), /赛事模板格式无效/);
  assert.match(validateTemplate({ name: "Legacy", teamCount: 8, stages: [{}] }).join(" "), /第 1 阶段.*配置格式无效/);
  const malformedChain = {
    name: "Legacy chain",
    teamCount: 8,
    stages: [null, { id: "finals", name: "Finals", type: "single_elimination", advanceCount: 1, bestOf: { default: 3, final: 5 } }],
  };
  assert.doesNotThrow(() => validateTemplate(malformedChain));
});

test("grouped Swiss stages reject uneven groups and impossible qualifier counts", () => {
  const stage = {
    id: "groups",
    name: "Groups",
    type: "groups",
    advanceCount: 3,
    groupCount: 3,
    groupFormat: "swiss",
    winsToAdvance: 2,
    lossesToEliminate: 2,
    bestOf: { default: 1, decisive: 3 },
  };
  const unevenErrors = validateTemplate({
    id: "uneven-groups",
    name: "Uneven groups",
    builtIn: false,
    teamCount: 10,
    stages: [stage],
  }).join(" ");
  assert.match(unevenErrors, /10 支队伍.*平均分配到 3 个小组/);

  const impossibleErrors = validateTemplate({
    id: "impossible-qualifiers",
    name: "Impossible qualifiers",
    builtIn: false,
    teamCount: 8,
    stages: [{ ...stage, groupCount: 2, advanceCount: 6 }],
  }).join(" ");
  assert.match(impossibleErrors, /每组最多只能晋级 2 支队伍/);
});
