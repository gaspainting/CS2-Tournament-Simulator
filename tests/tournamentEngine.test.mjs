import assert from "node:assert/strict";
import test from "node:test";
import { FICTIONAL_PLAYERS, FICTIONAL_TEAMS } from "../.test-dist/src/data/fictionalTeams.js";
import { TEMPLATE_BY_ID } from "../.test-dist/src/data/templates.js";
import {
  advanceUntilControlledOrComplete,
  createTournament,
  findControlledMatch,
  rankRoundRobin,
  simulateCurrentBatch,
  submitControlledScore,
} from "../.test-dist/src/engine/tournamentEngine.js";

function snapshots(count) {
  return FICTIONAL_TEAMS.slice(0, count).map((team) => ({
    ...team,
    players: FICTIONAL_PLAYERS.filter((player) => team.roster.starters.includes(player.id)),
  }));
}

function playToEnd(initial, controlledTeamId) {
  let state = initial;
  for (let guard = 0; guard < 500 && !state.championTeamId && state.currentMatches.length; guard += 1) {
    const match = findControlledMatch(state, controlledTeamId);
    if (match) {
      const score = match.bestOf === 1 ? [13, 8] : match.bestOf === 3 ? [2, 1] : [3, 1];
      state = submitControlledScore(state, controlledTeamId, score[0], score[1]);
    } else {
      state = simulateCurrentBatch(state, controlledTeamId);
    }
  }
  return state;
}

function scoreFor(bestOf) {
  return bestOf === 1 ? [13, 8] : bestOf === 3 ? [2, 1] : [3, 1];
}

function playUntil(initial, controlledTeamId, predicate) {
  let state = initial;
  for (let guard = 0; guard < 500 && state.currentMatches.length && !predicate(state); guard += 1) {
    const match = findControlledMatch(state, controlledTeamId);
    if (match) {
      const score = scoreFor(match.bestOf);
      state = submitControlledScore(state, controlledTeamId, score[0], score[1]);
    } else {
      state = simulateCurrentBatch(state, controlledTeamId);
    }
  }
  return state;
}

function playDoubleEliminationByPhase(initial, controlledTeamId) {
  let state = initial;
  const phases = [];
  let finalists;
  for (let guard = 0; guard < 100 && state.currentMatches.length && !state.championTeamId; guard += 1) {
    const brackets = [...new Set(state.currentMatches.map((match) => match.bracket))];
    assert.equal(brackets.length, 1, `round ${state.round} mixed brackets: ${brackets.join(", ")}`);
    const bracket = brackets[0];
    phases.push([bracket, state.currentMatches.length]);
    if (bracket === "upper") {
      assert.ok(state.currentMatches.every((match) => state.standings[match.teamAId].losses === 0 && state.standings[match.teamBId].losses === 0));
    } else if (bracket === "lower") {
      assert.ok(state.currentMatches.every((match) => state.standings[match.teamAId].losses === 1 && state.standings[match.teamBId].losses === 1));
    } else if (bracket === "final") {
      const upperFinal = state.matches.filter((match) => match.bracket === "upper").at(-1);
      const lowerFinal = state.matches.filter((match) => match.bracket === "lower").at(-1);
      assert.ok(upperFinal?.winnerTeamId);
      assert.ok(lowerFinal?.winnerTeamId);
      finalists = [upperFinal.winnerTeamId, lowerFinal.winnerTeamId];
      assert.deepEqual([...state.currentMatches.flatMap((match) => [match.teamAId, match.teamBId])].sort(), [...finalists].sort());
      assert.deepEqual(state.currentMatches.flatMap((match) => [state.standings[match.teamAId].losses, state.standings[match.teamBId].losses]).sort(), [0, 1]);
    }
    const controlledMatch = findControlledMatch(state, controlledTeamId);
    state = controlledMatch
      ? submitControlledScore(state, controlledTeamId, ...scoreFor(controlledMatch.bestOf))
      : simulateCurrentBatch(state, controlledTeamId);
  }
  return { state, phases, finalists };
}

test("Swiss advances eight teams after three wins and eliminates three-loss teams", () => {
  const teams = snapshots(16);
  const completed = playToEnd(createTournament(TEMPLATE_BY_ID["swiss-16"], teams, teams[0].id, 7), teams[0].id);
  assert.equal(completed.currentMatches.length, 0);
  assert.equal(completed.stageResults[0].qualifiedTeamIds.length, 8);
  assert.equal(completed.stageResults[0].eliminatedTeamIds.length, 8);
});

test("asymmetric Swiss thresholds award a bye and still complete", () => {
  const teams = snapshots(4);
  const template = {
    id: "swiss-asymmetric-4",
    name: "Asymmetric Swiss",
    builtIn: false,
    teamCount: 4,
    stages: [{
      id: "swiss",
      name: "Swiss",
      type: "swiss",
      advanceCount: 1,
      winsToAdvance: 3,
      lossesToEliminate: 1,
      avoidRematches: true,
      bestOf: { default: 1, decisive: 3 },
    }],
  };
  const completed = playToEnd(createTournament(template, teams, teams[0].id, 110), teams[0].id);
  const byes = completed.matches.filter((match) => match.teamBId === "__swiss_bye__");
  assert.ok(completed.championTeamId);
  assert.equal(completed.stageResults[0].qualifiedTeamIds.length, 1);
  assert.equal(byes.length, 1);
  assert.ok(byes.every((match) => match.completed && match.winnerTeamId === match.teamAId));
  assert.ok(completed.matches.every((match) => typeof match.teamAId === "string" && typeof match.teamBId === "string"));
});

test("asymmetric Swiss rotates byes and completes a terminal underfilled field", () => {
  const teams = snapshots(12);
  const template = {
    id: "swiss-asymmetric-12",
    name: "Long asymmetric Swiss",
    builtIn: false,
    teamCount: 12,
    stages: [{
      id: "swiss",
      name: "Swiss",
      type: "swiss",
      advanceCount: 4,
      winsToAdvance: 4,
      lossesToEliminate: 2,
      avoidRematches: true,
      bestOf: { default: 1, decisive: 3 },
    }],
  };
  const completed = playToEnd(createTournament(template, teams, teams[0].id, 112), teams[0].id);
  const byeRecipients = completed.matches.filter((match) => match.teamBId === "__swiss_bye__").map((match) => match.teamAId);
  assert.equal(completed.stageResults[0].qualifiedTeamIds.length, 4);
  assert.ok(byeRecipients.length > 1);
  assert.equal(new Set(byeRecipients).size, byeRecipients.length);
});

test("single elimination produces one champion in seven matches", () => {
  const teams = snapshots(8);
  const completed = playToEnd(createTournament(TEMPLATE_BY_ID["single-8"], teams, teams[0].id, 9), teams[0].id);
  assert.ok(completed.championTeamId);
  assert.equal(completed.matches.filter((match) => match.completed).length, 7);
});

test("double elimination requires two losses before removal", () => {
  const teams = snapshots(8);
  const completed = playToEnd(createTournament(TEMPLATE_BY_ID["double-8"], teams, teams[0].id, 11), teams[0].id);
  assert.ok(completed.championTeamId);
  for (const result of completed.stageResults) assert.equal(result.qualifiedTeamIds.length, 1);
  const loserCounts = new Map();
  for (const match of completed.matches) {
    const loser = match.winnerTeamId === match.teamAId ? match.teamBId : match.teamAId;
    loserCounts.set(loser, (loserCounts.get(loser) ?? 0) + 1);
  }
  for (const [teamId, losses] of loserCounts) {
    if (teamId !== completed.championTeamId) assert.ok(losses >= 2);
  }
});

test("built-in 8 and 16 team double elimination follow deterministic legal bracket phases", () => {
  const cases = [
    ["double-8", 8, [["upper", 4], ["lower", 2], ["upper", 2], ["lower", 2], ["lower", 1], ["upper", 1], ["lower", 1], ["final", 1]]],
    ["double-16", 16, [["upper", 8], ["lower", 4], ["upper", 4], ["lower", 4], ["lower", 2], ["upper", 2], ["lower", 2], ["lower", 1], ["upper", 1], ["lower", 1], ["final", 1]]],
  ];
  for (const [templateId, teamCount, expectedPhases] of cases) {
    const teams = snapshots(teamCount);
    const seed = 200 + teamCount;
    const { state, phases, finalists } = playDoubleEliminationByPhase(createTournament(TEMPLATE_BY_ID[templateId], teams, teams[0].id, seed), teams[0].id);
    const replay = playDoubleEliminationByPhase(createTournament(TEMPLATE_BY_ID[templateId], teams, teams[0].id, seed), teams[0].id).state;
    assert.deepEqual(phases, expectedPhases);
    assert.deepEqual(state.matches, replay.matches);
    assert.ok(finalists);
    assert.equal(state.championTeamId, finalists[0]);
    assert.equal(state.currentMatches.length, 0);
    assert.equal(state.matches.length, teamCount * 2 - 2);
    assert.ok(Object.values(state.standings).every((standing) => standing.teamId === state.championTeamId || standing.losses === 2));
  }
});

test("double elimination pauses when the controlled team drops into the lower bracket", () => {
  const teams = snapshots(8);
  const initial = createTournament(TEMPLATE_BY_ID["double-8"], teams, teams[0].id, 208);
  const afterUpperLoss = submitControlledScore(initial, teams[0].id, 0, 2);
  const paused = advanceUntilControlledOrComplete(afterUpperLoss, teams[0].id);
  const controlledMatch = findControlledMatch(paused, teams[0].id);
  assert.ok(controlledMatch);
  assert.equal(controlledMatch.bracket, "lower");
  assert.equal(paused.standings[teams[0].id].losses, 1);
});

test("legacy mixed-bracket saves preserve completed results and continue safely", () => {
  const teams = snapshots(8);
  const afterUpperRound = submitControlledScore(createTournament(TEMPLATE_BY_ID["double-8"], teams, teams[0].id, 210), teams[0].id, 2, 0);
  const upperWinners = afterUpperRound.matches.map((match) => match.winnerTeamId);
  const upperLosers = afterUpperRound.matches.map((match) => match.winnerTeamId === match.teamAId ? match.teamBId : match.teamAId);
  const legacyMatches = [
    ["upper", upperWinners[0], upperWinners[1]],
    ["upper", upperWinners[2], upperWinners[3]],
    ["lower", upperLosers[0], upperLosers[1]],
    ["lower", upperLosers[2], upperLosers[3]],
  ].map(([bracket, teamAId, teamBId], index) => ({
    id: `legacy-round-2-${index}`,
    stageIndex: 0,
    round: 2,
    bracket,
    teamAId,
    teamBId,
    bestOf: 3,
    completed: false,
  }));
  const advanced = simulateCurrentBatch({ ...afterUpperRound, round: 2, currentMatches: legacyMatches }, "__auto__");
  const preserved = advanced.matches.filter((match) => match.id.startsWith("legacy-round-2-"));
  assert.equal(preserved.length, 4);
  assert.ok(preserved.every((match) => match.completed && match.winnerTeamId));
  assert.ok(advanced.currentMatches.length > 0);

  const completed = playToEnd(advanced, teams[0].id);
  assert.ok(completed.championTeamId);
  assert.deepEqual(completed.matches.filter((match) => match.id.startsWith("legacy-round-2-")), preserved);
});

test("a lower-bracket champion triggers exactly one configured grand-final reset", () => {
  const teams = snapshots(8);
  const template = {
    ...TEMPLATE_BY_ID["double-8"],
    stages: [{ ...TEMPLATE_BY_ID["double-8"].stages[0], grandFinalReset: true }],
  };
  const grandFinal = playUntil(createTournament(template, teams, teams[0].id, 209), "__auto__", (state) => state.currentMatches.some((match) => match.bracket === "final"));
  const final = grandFinal.currentMatches[0];
  const lowerChampionId = grandFinal.standings[final.teamAId].losses === 1 ? final.teamAId : final.teamBId;
  const afterResetTrigger = submitControlledScore(grandFinal, lowerChampionId, ...scoreFor(final.bestOf));
  assert.equal(afterResetTrigger.championTeamId, undefined);
  assert.equal(afterResetTrigger.currentMatches.length, 1);
  assert.equal(afterResetTrigger.currentMatches[0].bracket, "final");
  assert.deepEqual([afterResetTrigger.currentMatches[0].teamAId, afterResetTrigger.currentMatches[0].teamBId].sort(), [final.teamAId, final.teamBId].sort());
  assert.equal(afterResetTrigger.matches.filter((match) => match.bracket === "final").length, 1);

  const completed = submitControlledScore(afterResetTrigger, lowerChampionId, ...scoreFor(afterResetTrigger.currentMatches[0].bestOf));
  assert.equal(completed.championTeamId, lowerChampionId);
  assert.equal(completed.matches.filter((match) => match.bracket === "final").length, 2);
  assert.equal(completed.currentMatches.length, 0);
});

test("without a reset the first grand final remains decisive for the lower champion", () => {
  const teams = snapshots(8);
  const grandFinal = playUntil(createTournament(TEMPLATE_BY_ID["double-8"], teams, teams[0].id, 211), "__auto__", (state) => state.currentMatches.some((match) => match.bracket === "final"));
  const final = grandFinal.currentMatches[0];
  const lowerChampionId = grandFinal.standings[final.teamAId].losses === 1 ? final.teamAId : final.teamBId;
  const upperChampionId = lowerChampionId === final.teamAId ? final.teamBId : final.teamAId;
  const completed = submitControlledScore(grandFinal, lowerChampionId, ...scoreFor(final.bestOf));
  assert.equal(completed.championTeamId, lowerChampionId);
  assert.equal(completed.currentMatches.length, 0);
  assert.equal(completed.matches.filter((match) => match.bracket === "final").length, 1);
  assert.equal(completed.standings[upperChampionId].losses, 1);
});

test("round robin schedules every pair once", () => {
  const teams = snapshots(8);
  const template = { ...TEMPLATE_BY_ID["league-double-8"], stages: [{ ...TEMPLATE_BY_ID["league-double-8"].stages[0], cycles: 1 }] };
  const completed = playToEnd(createTournament(template, teams, teams[0].id, 13), teams[0].id);
  assert.equal(completed.matches.length, 28);
  assert.ok(completed.championTeamId);
});

test("round-robin head-to-head ignores matches from previous stages", () => {
  const teams = snapshots(4);
  const state = createTournament(TEMPLATE_BY_ID["league-double-8"], snapshots(8), teams[0].id, 213);
  const [a, b] = teams.map((team) => team.id);
  const tiedStandings = {
    ...state.standings,
    [a]: { teamId: a, wins: 1, losses: 1, scoreFor: 2, scoreAgainst: 2, opponents: [b] },
    [b]: { teamId: b, wins: 1, losses: 1, scoreFor: 2, scoreAgainst: 2, opponents: [a] },
  };
  const historical = { id: "old-stage", stageIndex: 0, round: 1, bracket: "league", teamAId: a, teamBId: b, bestOf: 1, scoreA: 13, scoreB: 8, winnerTeamId: a, completed: true };
  const current = { id: "current-stage", stageIndex: 1, round: 1, bracket: "league", teamAId: a, teamBId: b, bestOf: 1, scoreA: 8, scoreB: 13, winnerTeamId: b, completed: true };
  assert.deepEqual(rankRoundRobin({ ...state, stageIndex: 1, standings: tiedStandings, matches: [historical, current] }, [a, b]), [b, a]);
});

test("group round-robin head-to-head uses only the requested group", () => {
  const teams = snapshots(8);
  const state = createTournament(TEMPLATE_BY_ID["groups-16"], snapshots(16), teams[0].id, 214);
  const [a, b] = teams.map((team) => team.id);
  const tiedStandings = {
    ...state.standings,
    [a]: { teamId: a, wins: 1, losses: 1, scoreFor: 2, scoreAgainst: 2, opponents: [b] },
    [b]: { teamId: b, wins: 1, losses: 1, scoreFor: 2, scoreAgainst: 2, opponents: [a] },
  };
  const otherGroup = { id: "other-group", stageIndex: 0, groupId: "group-2", round: 1, bracket: "league", teamAId: a, teamBId: b, bestOf: 1, scoreA: 13, scoreB: 8, winnerTeamId: a, completed: true };
  const currentGroup = { id: "current-group", stageIndex: 0, groupId: "group-1", round: 1, bracket: "league", teamAId: a, teamBId: b, bestOf: 1, scoreA: 8, scoreB: 13, winnerTeamId: b, completed: true };
  assert.deepEqual(rankRoundRobin({ ...state, standings: tiedStandings, matches: [otherGroup, currentGroup] }, [a, b], "group-1"), [b, a]);
});

test("group stage advances into the configured playoff", () => {
  const teams = snapshots(16);
  const completed = playToEnd(createTournament(TEMPLATE_BY_ID["groups-16"], teams, teams[0].id, 15), teams[0].id);
  assert.equal(completed.stageResults[0].qualifiedTeamIds.length, 8);
  assert.ok(completed.championTeamId);
});

test("group stages use Swiss pairing when configured and honor round-robin cycles", () => {
  const teams = snapshots(8);
  const swissTemplate = {
    id: "groups-swiss",
    name: "Group Swiss",
    builtIn: false,
    teamCount: 8,
    stages: [{
      id: "groups",
      name: "Groups",
      type: "groups",
      advanceCount: 4,
      groupCount: 2,
      groupFormat: "swiss",
      winsToAdvance: 2,
      lossesToEliminate: 2,
      avoidRematches: true,
      bestOf: { default: 1, decisive: 3 },
    }],
  };
  const initialSwiss = createTournament(swissTemplate, teams, teams[0].id, 101);
  assert.ok(initialSwiss.currentMatches.every((match) => match.bracket === "swiss" && match.groupId));
  const completedSwiss = playToEnd(initialSwiss, teams[0].id);
  assert.equal(completedSwiss.stageResults[0].qualifiedTeamIds.length, 4);
  assert.ok(completedSwiss.matches.every((match) => match.bracket === "swiss"));
  assert.ok(completedSwiss.matches.length < 12);
  assert.ok(completedSwiss.matches.some((match) => match.bestOf === 3));

  const roundRobinStage = {
    ...swissTemplate.stages[0],
    groupFormat: "round_robin",
    cycles: 1,
    bestOf: { default: 1 },
  };
  const singleCycle = playToEnd(createTournament({ ...swissTemplate, stages: [roundRobinStage] }, teams, teams[0].id, 102), teams[0].id);
  const doubleCycle = playToEnd(createTournament({ ...swissTemplate, stages: [{ ...roundRobinStage, cycles: 2 }] }, teams, teams[0].id, 102), teams[0].id);
  assert.equal(singleCycle.matches.length, 12);
  assert.equal(doubleCycle.matches.length, 24);
});

test("grouped Swiss supports deterministic byes with asymmetric thresholds", () => {
  const configurations = [
    { teamCount: 8, advanceCount: 2, winsToAdvance: 3, lossesToEliminate: 1 },
    { teamCount: 12, advanceCount: 4, winsToAdvance: 2, lossesToEliminate: 1 },
  ];
  for (const [index, configuration] of configurations.entries()) {
    const teams = snapshots(configuration.teamCount);
    const template = {
      id: `groups-asymmetric-${configuration.teamCount}`,
      name: "Asymmetric groups",
      builtIn: false,
      teamCount: configuration.teamCount,
      stages: [{
        id: "groups",
        name: "Groups",
        type: "groups",
        advanceCount: configuration.advanceCount,
        groupCount: 2,
        groupFormat: "swiss",
        winsToAdvance: configuration.winsToAdvance,
        lossesToEliminate: configuration.lossesToEliminate,
        avoidRematches: true,
        bestOf: { default: 1, decisive: 3 },
      }],
    };
    const first = playToEnd(createTournament(template, teams, teams[0].id, 111 + index), teams[0].id);
    const second = playToEnd(createTournament(template, teams, teams[0].id, 111 + index), teams[0].id);
    const byes = first.matches.filter((match) => match.teamBId === "__swiss_bye__");
    assert.equal(first.stageResults[0].qualifiedTeamIds.length, configuration.advanceCount);
    assert.deepEqual([...new Set(byes.map((match) => match.groupId))].sort(), ["group-1", "group-2"]);
    assert.deepEqual(
      byes.map((match) => [match.groupId, match.teamAId]),
      second.matches.filter((match) => match.teamBId === "__swiss_bye__").map((match) => [match.groupId, match.teamAId]),
    );
    assert.ok(first.matches.every((match) => typeof match.teamAId === "string" && typeof match.teamBId === "string"));
  }
});

test("tournament creation rejects invalid grouped Swiss templates before pairing", () => {
  const teams = snapshots(10);
  const template = {
    id: "invalid-grouped-swiss",
    name: "Invalid grouped Swiss",
    builtIn: false,
    teamCount: 10,
    stages: [{
      id: "groups",
      name: "Groups",
      type: "groups",
      advanceCount: 3,
      groupCount: 3,
      groupFormat: "swiss",
      winsToAdvance: 2,
      lossesToEliminate: 2,
      bestOf: { default: 1, decisive: 3 },
    }],
  };
  assert.throws(
    () => createTournament(template, teams, teams[0].id, 107),
    (error) => error instanceof Error && !(error instanceof TypeError) && /平均分配到 3 个小组/.test(error.message),
  );
});

test("tournament creation rejects malformed legacy templates with a domain error", () => {
  const teams = snapshots(8);
  assert.throws(
    () => createTournament(null, teams, teams[0].id, 109),
    (error) => error instanceof Error && !(error instanceof TypeError) && /赛事模板无效.*赛事模板格式无效/.test(error.message),
  );
  assert.throws(
    () => createTournament({ name: "Legacy", teamCount: 8, stages: [{}] }, teams, teams[0].id, 109),
    (error) => error instanceof Error && !(error instanceof TypeError) && /赛事模板无效.*配置格式无效/.test(error.message),
  );
});

test("stage progression adds only explicitly invited teams", () => {
  const teams = snapshots(12);
  const opening = {
    id: "opening",
    name: "Opening",
    type: "single_elimination",
    entrantCount: 8,
    advanceCount: 4,
    bestOf: { default: 1, final: 3 },
  };
  const finals = {
    id: "finals",
    name: "Finals",
    type: "single_elimination",
    entrantCount: 6,
    inviteCount: 2,
    advanceCount: 1,
    bestOf: { default: 3, final: 5 },
  };
  const template = { id: "explicit-invites", name: "Explicit invites", builtIn: false, teamCount: 12, stages: [opening, finals] };
  assert.throws(
    () => createTournament({ ...template, stages: [opening, { ...finals, entrantCount: 8 }] }, teams, teams[0].id, 108),
    /第 2 阶段.*参赛队数.*相等/,
  );
  assert.throws(
    () => createTournament({ ...template, teamCount: 8, stages: [{ ...opening, entrantCount: undefined }, finals] }, teams.slice(0, 8), teams[0].id, 108),
    /第 2 阶段.*邀请名额.*剩余未参赛队伍/,
  );
  const initial = createTournament(template, teams, teams[0].id, 108);
  const validNextStage = submitControlledScore(initial, teams[0].id, 13, 8);
  assert.equal(validNextStage.stageIndex, 1);
  assert.equal(validNextStage.activeTeamIds.length, 6);
  assert.equal(validNextStage.activeTeamIds.filter((teamId) => !initial.activeTeamIds.includes(teamId)).length, 2);
  const legacyState = {
    ...initial,
    template: { ...initial.template, stages: [opening, { ...finals, entrantCount: 8 }] },
  };
  assert.throws(
    () => submitControlledScore(legacyState, teams[0].id, 13, 8),
    /第 2 阶段.*参赛队数.*8.*实际.*6/,
  );
});

test("single elimination schedules an optional third-place match without changing the champion", () => {
  const teams = snapshots(4);
  const stage = {
    id: "single",
    name: "Playoff",
    type: "single_elimination",
    advanceCount: 1,
    thirdPlace: true,
    bestOf: { default: 3, final: 5 },
  };
  const template = { id: "single-third", name: "Single", builtIn: false, teamCount: 4, stages: [stage] };
  const afterSemifinals = submitControlledScore(createTournament(template, teams, teams[0].id, 103), teams[0].id, 2, 0);
  const final = afterSemifinals.currentMatches.find((match) => match.bracket === "final");
  const thirdPlace = afterSemifinals.currentMatches.find((match) => match.bracket === "third_place");
  assert.ok(final);
  assert.ok(thirdPlace);
  assert.equal(final.bestOf, 5);
  const semifinalLosers = afterSemifinals.matches.map((match) => match.winnerTeamId === match.teamAId ? match.teamBId : match.teamAId).sort();
  assert.deepEqual([thirdPlace.teamAId, thirdPlace.teamBId].sort(), semifinalLosers);

  const completed = submitControlledScore(afterSemifinals, teams[0].id, 3, 1);
  assert.equal(completed.championTeamId, teams[0].id);
  assert.ok(completed.matches.some((match) => match.bracket === "third_place" && match.completed));

  const withoutThird = submitControlledScore(createTournament({ ...template, stages: [{ ...stage, thirdPlace: false }] }, teams, teams[0].id, 103), teams[0].id, 2, 0);
  assert.equal(withoutThird.currentMatches.filter((match) => match.bracket === "third_place").length, 0);
});

test("single and double elimination use the configured grand-final best-of", () => {
  const singleTeams = snapshots(4);
  const singleTemplate = {
    id: "single-final-bo",
    name: "Single",
    builtIn: false,
    teamCount: 4,
    stages: [{ id: "single", name: "Single", type: "single_elimination", advanceCount: 1, bestOf: { default: 1, final: 5 } }],
  };
  const singleFinal = submitControlledScore(createTournament(singleTemplate, singleTeams, singleTeams[0].id, 104), singleTeams[0].id, 13, 8);
  assert.equal(singleFinal.currentMatches.find((match) => match.bracket === "final")?.bestOf, 5);

  const doubleTeams = snapshots(8);
  const doubleTemplate = {
    ...TEMPLATE_BY_ID["double-8"],
    stages: [{ ...TEMPLATE_BY_ID["double-8"].stages[0], bestOf: { default: 1, final: 5 } }],
  };
  const beforeDoubleFinal = playUntil(createTournament(doubleTemplate, doubleTeams, doubleTeams[0].id, 105), doubleTeams[0].id, (state) => state.currentMatches.some((match) => match.bracket === "final"));
  assert.equal(beforeDoubleFinal.currentMatches.find((match) => match.bracket === "final")?.bestOf, 5);
});

test("double elimination resets only when enabled and the lower-path finalist wins first", () => {
  const teams = snapshots(4);
  const makeFinal = (grandFinalReset) => {
    const template = {
      id: `double-reset-${grandFinalReset}`,
      name: "Double",
      builtIn: false,
      teamCount: 4,
      stages: [{ id: "double", name: "Double", type: "double_elimination", advanceCount: 1, grandFinalReset, bestOf: { default: 3, final: 5 } }],
    };
    const base = createTournament(template, teams, teams[0].id, 106);
    return {
      ...base,
      round: 4,
      activeTeamIds: [teams[0].id, teams[1].id],
      currentMatches: [{ id: "grand-final", stageIndex: 0, round: 4, bracket: "final", teamAId: teams[0].id, teamBId: teams[1].id, bestOf: 5, completed: false }],
      matches: [],
      standings: {
        ...base.standings,
        [teams[0].id]: { ...base.standings[teams[0].id], losses: 1 },
        [teams[1].id]: { ...base.standings[teams[1].id], losses: 0 },
      },
    };
  };

  const noReset = submitControlledScore(makeFinal(false), teams[0].id, 3, 1);
  assert.equal(noReset.championTeamId, teams[0].id);
  assert.equal(noReset.currentMatches.length, 0);

  const resetRequired = submitControlledScore(makeFinal(true), teams[0].id, 3, 1);
  assert.equal(resetRequired.championTeamId, undefined);
  assert.equal(resetRequired.currentMatches.length, 1);
  assert.equal(resetRequired.currentMatches[0].bracket, "final");
  const resetCompleted = submitControlledScore(resetRequired, teams[0].id, 3, 1);
  assert.equal(resetCompleted.championTeamId, teams[0].id);
  assert.equal(resetCompleted.matches.filter((match) => match.bracket === "final").length, 2);

  const upperPathWins = submitControlledScore(makeFinal(true), teams[1].id, 3, 1);
  assert.equal(upperPathWins.championTeamId, teams[1].id);
  assert.equal(upperPathWins.currentMatches.length, 0);
});

test("controlled-team matches pause and reject invalid series scores", () => {
  const teams = snapshots(8);
  const initial = createTournament(TEMPLATE_BY_ID["single-8"], teams, teams[0].id, 17);
  const paused = advanceUntilControlledOrComplete(initial, teams[0].id);
  assert.ok(findControlledMatch(paused, teams[0].id));
  assert.throws(() => submitControlledScore(paused, teams[0].id, 3, 0), /BO3/);
  const advanced = submitControlledScore(paused, teams[0].id, 2, 0);
  assert.ok(advanced.matches.some((match) => match.teamAId === teams[0].id || match.teamBId === teams[0].id));
});

test("the same seed and manual decisions reproduce the same bracket", () => {
  const teams = snapshots(8);
  const first = playToEnd(createTournament(TEMPLATE_BY_ID["single-8"], teams, teams[0].id, 21), teams[0].id);
  const second = playToEnd(createTournament(TEMPLATE_BY_ID["single-8"], teams, teams[0].id, 21), teams[0].id);
  assert.deepEqual(first.matches, second.matches);
});
