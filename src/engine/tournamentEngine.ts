import { nextRandom } from "../domain/random.js";
import type {
  BestOf,
  Match,
  StageConfig,
  Standing,
  TeamSnapshot,
  TournamentState,
  TournamentTemplate,
} from "../domain/types.js";
import { validateSeriesScore, validateTemplate } from "../domain/validation.js";

type ManualScore = { scoreA: number; scoreB: number };

export const SWISS_BYE_TEAM_ID = "__swiss_bye__";

export function isSwissBye(match: Match): boolean {
  return match.bracket === "swiss" && match.teamBId === SWISS_BYE_TEAM_ID;
}

function emptyStandings(teamIds: string[]): Record<string, Standing> {
  return Object.fromEntries(teamIds.map((teamId) => [teamId, { teamId, wins: 0, losses: 0, scoreFor: 0, scoreAgainst: 0, opponents: [] }]));
}

function buildMatch(
  stageIndex: number,
  round: number,
  index: number,
  teamAId: string,
  teamBId: string,
  bestOf: BestOf,
  bracket: Match["bracket"],
  groupId?: string,
): Match {
  return {
    id: `s${stageIndex}-r${round}-${groupId ?? bracket ?? "match"}-${index}-${teamAId}-${teamBId}`,
    stageIndex,
    groupId,
    round,
    bracket,
    teamAId,
    teamBId,
    bestOf,
    completed: false,
  };
}

function teamStrength(state: TournamentState, teamId: string): number {
  const team = state.teamSnapshots.find((item) => item.id === teamId);
  if (!team) return 1000;
  const starterSet = new Set(team.roster.starters);
  const starters = team.players.filter((player) => starterSet.has(player.id));
  const playerRating = starters.length ? starters.reduce((sum, player) => sum + player.rating, 0) / starters.length : 1;
  return team.rating + playerRating * 220 + team.stability * 80;
}

function sortedByStrength(state: TournamentState, teamIds: string[]): string[] {
  return [...teamIds].sort((a, b) => teamStrength(state, b) - teamStrength(state, a) || a.localeCompare(b));
}

function bestOfForSwiss(stage: StageConfig, a: Standing, b: Standing): BestOf {
  const decisive = a.wins + 1 >= (stage.winsToAdvance ?? 3)
    || b.wins + 1 >= (stage.winsToAdvance ?? 3)
    || a.losses + 1 >= (stage.lossesToEliminate ?? 3)
    || b.losses + 1 >= (stage.lossesToEliminate ?? 3);
  return decisive ? (stage.bestOf.decisive ?? stage.bestOf.default) : stage.bestOf.default;
}

function selectSwissBye(state: TournamentState, teamIds: string[]): string {
  const byeCounts = new Map<string, number>();
  for (const match of state.matches) {
    if (match.stageIndex === state.stageIndex && isSwissBye(match)) {
      byeCounts.set(match.teamAId, (byeCounts.get(match.teamAId) ?? 0) + 1);
    }
  }
  return [...teamIds].sort((a, b) => {
    const standingA = state.standings[a];
    const standingB = state.standings[b];
    const diffA = standingA.scoreFor - standingA.scoreAgainst;
    const diffB = standingB.scoreFor - standingB.scoreAgainst;
    return (byeCounts.get(a) ?? 0) - (byeCounts.get(b) ?? 0)
      || standingA.wins - standingB.wins
      || standingB.losses - standingA.losses
      || diffA - diffB
      || teamStrength(state, a) - teamStrength(state, b)
      || a.localeCompare(b);
  })[0];
}

function pairSwiss(state: TournamentState, stage: StageConfig, teamIds = state.activeTeamIds, groupId?: string): Match[] {
  const byeTeamId = teamIds.length % 2 !== 0 ? selectSwissBye(state, teamIds) : undefined;
  const pairingTeamIds = byeTeamId ? teamIds.filter((teamId) => teamId !== byeTeamId) : teamIds;
  const matches = byeTeamId
    ? [buildMatch(state.stageIndex, state.round, 0, byeTeamId, SWISS_BYE_TEAM_ID, stage.bestOf.default, "swiss", groupId)]
    : [];
  if (state.round === 1) {
    const seeded = sortedByStrength(state, pairingTeamIds);
    const half = seeded.length / 2;
    matches.push(...seeded.slice(0, half).map((teamId, index) => buildMatch(
      state.stageIndex,
      state.round,
      matches.length + index,
      teamId,
      seeded[index + half],
      bestOfForSwiss(stage, state.standings[teamId], state.standings[seeded[index + half]]),
      "swiss",
      groupId,
    )));
    return matches;
  }

  const buckets = new Map<string, string[]>();
  for (const teamId of pairingTeamIds) {
    const standing = state.standings[teamId];
    const key = `${standing.wins}-${standing.losses}`;
    buckets.set(key, [...(buckets.get(key) ?? []), teamId]);
  }
  const ordered = [...buckets.entries()].sort(([a], [b]) => {
    const [aw, al] = a.split("-").map(Number);
    const [bw, bl] = b.split("-").map(Number);
    return bw - aw || al - bl;
  });
  let carry: string | undefined;
  for (const [, bucket] of ordered) {
    const pool = sortedByStrength(state, carry ? [carry, ...bucket] : bucket);
    carry = undefined;
    while (pool.length > 1) {
      const teamAId = pool.shift() as string;
      const opponents = new Set(state.standings[teamAId].opponents);
      let opponentIndex = stage.avoidRematches ? pool.findIndex((candidate) => !opponents.has(candidate)) : 0;
      if (opponentIndex < 0) opponentIndex = 0;
      const [teamBId] = pool.splice(opponentIndex, 1);
      matches.push(buildMatch(state.stageIndex, state.round, matches.length, teamAId, teamBId, bestOfForSwiss(stage, state.standings[teamAId], state.standings[teamBId]), "swiss", groupId));
    }
    if (pool.length) carry = pool[0];
  }
  if (carry) throw new Error("瑞士轮配对状态异常");
  return matches;
}

function pairElimination(state: TournamentState, stage: StageConfig, bracket: Match["bracket"]): Match[] {
  const seeded = state.round === 1 ? sortedByStrength(state, state.activeTeamIds) : [...state.activeTeamIds];
  const matches: Match[] = [];
  if (state.round === 1 && stage.type === "single_elimination" && seeded.length > 2) {
    for (let index = 0; index < seeded.length / 2; index += 1) {
      matches.push(buildMatch(state.stageIndex, state.round, matches.length, seeded[index], seeded[seeded.length - 1 - index], stage.bestOf.default, bracket));
    }
    return matches;
  }
  const ordered = stage.type === "double_elimination"
    ? [...seeded].sort((a, b) => state.standings[a].losses - state.standings[b].losses || teamStrength(state, b) - teamStrength(state, a))
    : seeded;
  for (let index = 0; index + 1 < ordered.length; index += 2) {
    const isFinal = ordered.length === 2;
    const bestOf = isFinal ? (stage.bestOf.final ?? stage.bestOf.default) : stage.bestOf.default;
    const matchBracket = stage.type === "double_elimination"
      ? (isFinal ? "final" : state.standings[ordered[index]].losses > 0 || state.standings[ordered[index + 1]].losses > 0 ? "lower" : "upper")
      : (isFinal ? "final" : bracket);
    matches.push(buildMatch(state.stageIndex, state.round, matches.length, ordered[index], ordered[index + 1], bestOf, matchBracket));
  }
  if (stage.type === "single_elimination" && ordered.length === 2 && stage.thirdPlace) {
    const semifinalLosers = state.matches
      .filter((match) => match.stageIndex === state.stageIndex && match.round === state.round - 1 && match.completed)
      .map((match) => match.winnerTeamId === match.teamAId ? match.teamBId : match.teamAId);
    if (semifinalLosers.length === 2) {
      matches.push(buildMatch(state.stageIndex, state.round, matches.length, semifinalLosers[0], semifinalLosers[1], stage.bestOf.default, "third_place"));
    }
  }
  return matches;
}

type DoubleEliminationPhase = {
  bracket: "upper" | "lower" | "final";
  kind: "upper" | "lower_initial" | "lower_drop" | "lower_consolidate" | "grand_final";
};

function doubleEliminationPhases(teamCount: number): DoubleEliminationPhase[] {
  const upperRoundCount = Math.log2(teamCount);
  if (!Number.isInteger(upperRoundCount) || upperRoundCount < 2) return [];
  const phases: DoubleEliminationPhase[] = [
    { bracket: "upper", kind: "upper" },
    { bracket: "lower", kind: "lower_initial" },
  ];
  for (let upperRound = 2; upperRound <= upperRoundCount; upperRound += 1) {
    phases.push({ bracket: "upper", kind: "upper" });
    phases.push({ bracket: "lower", kind: "lower_drop" });
    if (upperRound < upperRoundCount) phases.push({ bracket: "lower", kind: "lower_consolidate" });
  }
  phases.push({ bracket: "final", kind: "grand_final" });
  return phases;
}

function stageMatches(state: TournamentState): Match[] {
  return state.matches.filter((match) => match.stageIndex === state.stageIndex);
}

function hasLegacyDoubleEliminationHistory(state: TournamentState): boolean {
  const bracketsByRound = new Map<number, Set<Match["bracket"]>>();
  for (const match of stageMatches(state)) {
    if (match.bracket === "final") continue;
    const brackets = bracketsByRound.get(match.round) ?? new Set<Match["bracket"]>();
    brackets.add(match.bracket);
    bracketsByRound.set(match.round, brackets);
  }
  return [...bracketsByRound.values()].some((brackets) => brackets.size > 1);
}

function completedPhaseMatches(state: TournamentState, phaseIndex: number): Match[] {
  return stageMatches(state).filter((match) => match.round === phaseIndex + 1 && match.completed);
}

function matchLoser(match: Match): string {
  return match.winnerTeamId === match.teamAId ? match.teamBId : match.teamAId;
}

function previousPhaseIndex(phases: DoubleEliminationPhase[], currentIndex: number, bracket: "upper" | "lower"): number {
  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    if (phases[index].bracket === bracket) return index;
  }
  return -1;
}

function pairCrossBracketPools(state: TournamentState, lowerSurvivors: string[], upperDrops: string[]): [string, string][] {
  const availableDrops = [...upperDrops];
  return lowerSurvivors.map((lowerTeamId) => {
    const opponents = new Set(stageMatches(state)
      .filter((match) => match.teamAId === lowerTeamId || match.teamBId === lowerTeamId)
      .map((match) => match.teamAId === lowerTeamId ? match.teamBId : match.teamAId));
    let opponentIndex = availableDrops.findIndex((teamId) => !opponents.has(teamId));
    if (opponentIndex < 0) opponentIndex = 0;
    const [upperTeamId] = availableDrops.splice(opponentIndex, 1);
    return [lowerTeamId, upperTeamId];
  });
}

function pairDoubleElimination(state: TournamentState, stage: StageConfig): Match[] {
  const phases = doubleEliminationPhases(Object.keys(state.standings).length);
  const completedFinals = stageMatches(state).filter((match) => match.bracket === "final" && match.completed);
  if (completedFinals.length === 1 && state.activeTeamIds.length === 2) {
    return [buildMatch(state.stageIndex, state.round, 0, state.activeTeamIds[0], state.activeTeamIds[1], stage.bestOf.final ?? stage.bestOf.default, "final")];
  }
  const phaseIndex = state.round - 1;
  const phase = phases[phaseIndex];
  if (!phase) return [];

  let pairs: [string, string][];
  if (phaseIndex === 0) {
    const seeded = sortedByStrength(state, state.activeTeamIds);
    pairs = seeded.slice(0, seeded.length / 2).map((teamId, index) => [teamId, seeded[seeded.length - 1 - index]]);
  } else if (phase.kind === "upper") {
    const previousUpper = previousPhaseIndex(phases, phaseIndex, "upper");
    const teams = completedPhaseMatches(state, previousUpper).map((match) => match.winnerTeamId as string);
    pairs = Array.from({ length: teams.length / 2 }, (_, index) => [teams[index * 2], teams[index * 2 + 1]]);
  } else if (phase.kind === "lower_initial") {
    const firstUpperLosers = completedPhaseMatches(state, 0).map(matchLoser);
    pairs = Array.from({ length: firstUpperLosers.length / 2 }, (_, index) => [firstUpperLosers[index * 2], firstUpperLosers[index * 2 + 1]]);
  } else if (phase.kind === "lower_drop") {
    const previousLower = previousPhaseIndex(phases, phaseIndex, "lower");
    const previousUpper = previousPhaseIndex(phases, phaseIndex, "upper");
    const lowerSurvivors = completedPhaseMatches(state, previousLower).map((match) => match.winnerTeamId as string);
    const upperDrops = completedPhaseMatches(state, previousUpper).map(matchLoser);
    pairs = pairCrossBracketPools(state, lowerSurvivors, upperDrops);
  } else if (phase.kind === "lower_consolidate") {
    const previousLower = previousPhaseIndex(phases, phaseIndex, "lower");
    const teams = completedPhaseMatches(state, previousLower).map((match) => match.winnerTeamId as string);
    pairs = Array.from({ length: teams.length / 2 }, (_, index) => [teams[index * 2], teams[index * 2 + 1]]);
  } else {
    const upperFinal = previousPhaseIndex(phases, phaseIndex, "upper");
    const lowerFinal = previousPhaseIndex(phases, phaseIndex, "lower");
    pairs = [[
      completedPhaseMatches(state, upperFinal)[0]?.winnerTeamId as string,
      completedPhaseMatches(state, lowerFinal)[0]?.winnerTeamId as string,
    ]];
  }

  if (pairs.some(([teamAId, teamBId]) => !teamAId || !teamBId)) {
    throw new Error("Double-elimination bracket history is incomplete");
  }
  const bestOf = phase.bracket === "final" ? (stage.bestOf.final ?? stage.bestOf.default) : stage.bestOf.default;
  return pairs.map(([teamAId, teamBId], index) => buildMatch(state.stageIndex, state.round, index, teamAId, teamBId, bestOf, phase.bracket));
}

function rotateRoundRobin(teamIds: string[], round: number, cycle: number): [string, string][] {
  const values = [...teamIds];
  if (values.length % 2) values.push("__bye__");
  const roundsPerCycle = values.length - 1;
  const targetRound = round % roundsPerCycle;
  for (let step = 0; step < targetRound; step += 1) values.splice(1, 0, values.pop() as string);
  const pairs: [string, string][] = [];
  for (let index = 0; index < values.length / 2; index += 1) {
    const a = values[index];
    const b = values[values.length - 1 - index];
    if (a !== "__bye__" && b !== "__bye__") pairs.push(cycle % 2 === 0 ? [a, b] : [b, a]);
  }
  return pairs;
}

function roundRobinMatches(state: TournamentState, stage: StageConfig, teamIds: string[], groupId?: string): Match[] {
  const roundsPerCycle = teamIds.length % 2 === 0 ? teamIds.length - 1 : teamIds.length;
  const zeroBased = state.round - 1;
  const cycle = Math.floor(zeroBased / roundsPerCycle);
  return rotateRoundRobin(teamIds, zeroBased, cycle).map(([a, b], index) => buildMatch(
    state.stageIndex,
    state.round,
    index,
    a,
    b,
    stage.bestOf.default,
    "league",
    groupId,
  ));
}

function groupsFor(state: TournamentState, stage: StageConfig, teamIds = state.activeTeamIds): string[][] {
  const count = stage.groupCount ?? 2;
  const groups = Array.from({ length: count }, () => [] as string[]);
  sortedByStrength(state, teamIds).forEach((teamId, index) => {
    const block = Math.floor(index / count);
    const offset = index % count;
    const groupIndex = block % 2 === 0 ? offset : count - 1 - offset;
    groups[groupIndex].push(teamId);
  });
  return groups;
}

function groupSwissThreshold(stage: StageConfig, groupSize: number): { wins: number; losses: number } {
  const fallback = Math.max(2, Math.ceil(Math.log2(groupSize)));
  return { wins: stage.winsToAdvance ?? fallback, losses: stage.lossesToEliminate ?? fallback };
}

function groupSwissTeams(state: TournamentState, stage: StageConfig, group: string[]): { qualified: string[]; eliminated: string[]; active: string[] } {
  const threshold = groupSwissThreshold(stage, group.length);
  const qualified = group.filter((teamId) => state.standings[teamId].wins >= threshold.wins)
    .sort((a, b) => state.standings[a].losses - state.standings[b].losses || teamStrength(state, b) - teamStrength(state, a));
  const eliminated = group.filter((teamId) => state.standings[teamId].losses >= threshold.losses);
  const active = group.filter((teamId) => !qualified.includes(teamId) && !eliminated.includes(teamId));
  return { qualified, eliminated, active };
}

function rankSwiss(state: TournamentState, teamIds = Object.keys(state.standings)): string[] {
  return [...teamIds].sort((a, b) => {
    const standingA = state.standings[a];
    const standingB = state.standings[b];
    const diffA = standingA.scoreFor - standingA.scoreAgainst;
    const diffB = standingB.scoreFor - standingB.scoreAgainst;
    return standingB.wins - standingA.wins
      || standingA.losses - standingB.losses
      || diffB - diffA
      || teamStrength(state, b) - teamStrength(state, a)
      || a.localeCompare(b);
  });
}

function currentMatchesFor(state: TournamentState): Match[] {
  const stage = state.template.stages[state.stageIndex];
  if (stage.type === "swiss") return pairSwiss(state, stage);
  if (stage.type === "single_elimination") return pairElimination(state, stage, "upper");
  if (stage.type === "double_elimination") {
    const phases = doubleEliminationPhases(Object.keys(state.standings).length);
    return phases.length && !hasLegacyDoubleEliminationHistory(state)
      ? pairDoubleElimination(state, stage)
      : pairElimination(state, stage, "upper");
  }
  if (stage.type === "round_robin") return roundRobinMatches(state, stage, state.activeTeamIds);
  if (stage.groupFormat === "swiss") {
    const groups = groupsFor(state, stage, Object.keys(state.standings));
    const perGroup = Math.floor(stage.advanceCount / groups.length);
    return groups.flatMap((group, index) => {
      const status = groupSwissTeams(state, stage, group);
      if (status.qualified.length >= perGroup) return [];
      const threshold = groupSwissThreshold(stage, group.length);
      return pairSwiss(state, { ...stage, winsToAdvance: threshold.wins, lossesToEliminate: threshold.losses }, status.active, `group-${index + 1}`);
    });
  }
  return groupsFor(state, stage).flatMap((group, index) => roundRobinMatches(state, stage, group, `group-${index + 1}`));
}

export function createTournament(
  template: TournamentTemplate,
  teamSnapshots: TeamSnapshot[],
  controlledTeamId: string,
  seed = Date.now() >>> 0,
  name?: string,
): TournamentState {
  const templateErrors = validateTemplate(template);
  if (templateErrors.length) throw new Error(`赛事模板无效：${templateErrors.join("；")}`);
  const tournamentName = name ?? template.name;
  if (teamSnapshots.length !== template.teamCount) throw new Error(`模板需要 ${template.teamCount} 支队伍`);
  if (!teamSnapshots.some((team) => team.id === controlledTeamId)) throw new Error("操纵队不在参赛名单中");
  const firstStage = template.stages[0];
  const activeTeamIds = teamSnapshots.slice(0, firstStage.entrantCount ?? template.teamCount).map((team) => team.id);
  const now = Date.now();
  const base: TournamentState = {
    version: 3,
    id: `tournament-${template.id}-${seed}`,
    name: tournamentName,
    template: structuredClone(template),
    controlledTeamId,
    teamSnapshots: structuredClone(teamSnapshots),
    seed,
    stageIndex: 0,
    round: 1,
    activeTeamIds,
    currentMatches: [],
    matches: [],
    standings: emptyStandings(activeTeamIds),
    stageResults: [],
    createdAt: now,
    updatedAt: now,
  };
  return { ...base, currentMatches: currentMatchesFor(base) };
}

function chooseWinner(state: TournamentState, match: Match, seed: number): [string, number] {
  const [roll, nextSeed] = nextRandom(seed);
  const strengthA = teamStrength(state, match.teamAId);
  const strengthB = teamStrength(state, match.teamBId);
  const chanceA = 1 / (1 + 10 ** ((strengthB - strengthA) / 360));
  return [roll < chanceA ? match.teamAId : match.teamBId, nextSeed];
}

function simulatedScore(match: Match, winnerTeamId: string, seed: number): [ManualScore, number] {
  const [roll, nextSeed] = nextRandom(seed);
  let winner: number;
  let loser: number;
  if (match.bestOf === 1) {
    winner = 13;
    loser = 5 + Math.floor(roll * 8);
  } else if (match.bestOf === 3) {
    winner = 2;
    loser = roll < 0.5 ? 0 : 1;
  } else {
    winner = 3;
    loser = roll < 0.28 ? 0 : roll < 0.65 ? 1 : 2;
  }
  return [winnerTeamId === match.teamAId ? { scoreA: winner, scoreB: loser } : { scoreA: loser, scoreB: winner }, nextSeed];
}

function applyCompletedMatches(standings: Record<string, Standing>, completed: Match[]): Record<string, Standing> {
  const next = Object.fromEntries(Object.entries(standings).map(([id, row]) => [id, { ...row, opponents: [...row.opponents] }])) as Record<string, Standing>;
  for (const match of completed) {
    if (isSwissBye(match)) {
      next[match.teamAId].wins += 1;
      continue;
    }
    const winner = match.winnerTeamId as string;
    const loser = winner === match.teamAId ? match.teamBId : match.teamAId;
    for (const teamId of [match.teamAId, match.teamBId]) {
      if (!next[teamId]) next[teamId] = { teamId, wins: 0, losses: 0, scoreFor: 0, scoreAgainst: 0, opponents: [] };
    }
    next[winner].wins += 1;
    next[loser].losses += 1;
    next[match.teamAId].scoreFor += match.scoreA ?? 0;
    next[match.teamAId].scoreAgainst += match.scoreB ?? 0;
    next[match.teamBId].scoreFor += match.scoreB ?? 0;
    next[match.teamBId].scoreAgainst += match.scoreA ?? 0;
    next[match.teamAId].opponents.push(match.teamBId);
    next[match.teamBId].opponents.push(match.teamAId);
  }
  return next;
}

export function rankRoundRobin(state: TournamentState, teamIds = Object.keys(state.standings), groupId?: string): string[] {
  const relevantMatches = state.matches.filter((match) => match.completed
    && match.stageIndex === state.stageIndex
    && (groupId === undefined || match.groupId === groupId));
  return [...teamIds].sort((a, b) => {
    const rowA = state.standings[a];
    const rowB = state.standings[b];
    const diffA = rowA.scoreFor - rowA.scoreAgainst;
    const diffB = rowB.scoreFor - rowB.scoreAgainst;
    if (rowB.wins !== rowA.wins) return rowB.wins - rowA.wins;
    if (diffB !== diffA) return diffB - diffA;
    const headToHead = relevantMatches.find((match) => (match.teamAId === a && match.teamBId === b) || (match.teamAId === b && match.teamBId === a));
    if (headToHead?.winnerTeamId === a) return -1;
    if (headToHead?.winnerTeamId === b) return 1;
    return teamStrength(state, b) - teamStrength(state, a);
  });
}

function completeStage(state: TournamentState, qualifiedTeamIds: string[], eliminatedTeamIds: string[]): TournamentState {
  const stage = state.template.stages[state.stageIndex];
  const stageResults = [...state.stageResults, { stageId: stage.id, qualifiedTeamIds, eliminatedTeamIds }];
  const nextIndex = state.stageIndex + 1;
  if (nextIndex >= state.template.stages.length) {
    return {
      ...state,
      activeTeamIds: qualifiedTeamIds,
      currentMatches: [],
      stageResults,
      championTeamId: qualifiedTeamIds.length === 1 ? qualifiedTeamIds[0] : undefined,
      updatedAt: Date.now(),
    };
  }

  const nextStage = state.template.stages[nextIndex];
  const used = new Set(stageResults.flatMap((result) => [...result.qualifiedTeamIds, ...result.eliminatedTeamIds]));
  const inviteCount = nextStage.inviteCount ?? 0;
  const invites = state.teamSnapshots.map((team) => team.id).filter((teamId) => !used.has(teamId)).slice(0, inviteCount);
  if (invites.length !== inviteCount) throw new Error(`第 ${nextIndex + 1} 阶段邀请名额超过剩余未参赛队伍`);
  const activeTeamIds = [...qualifiedTeamIds, ...invites];
  const expectedEntrantCount = nextStage.entrantCount ?? stage.advanceCount + inviteCount;
  if (activeTeamIds.length !== expectedEntrantCount) {
    throw new Error(`第 ${nextIndex + 1} 阶段参赛队数应为 ${expectedEntrantCount}，实际为 ${activeTeamIds.length}`);
  }
  const next: TournamentState = {
    ...state,
    stageIndex: nextIndex,
    round: 1,
    activeTeamIds,
    currentMatches: [],
    standings: emptyStandings(activeTeamIds),
    stageResults,
    updatedAt: Date.now(),
  };
  return { ...next, currentMatches: currentMatchesFor(next) };
}

function advanceAfterBatch(state: TournamentState): TournamentState {
  const stage = state.template.stages[state.stageIndex];
  if (stage.type === "swiss") {
    const qualified = Object.values(state.standings).filter((row) => row.wins >= (stage.winsToAdvance ?? 3)).map((row) => row.teamId);
    const eliminated = Object.values(state.standings).filter((row) => row.losses >= (stage.lossesToEliminate ?? 3)).map((row) => row.teamId);
    if (qualified.length >= stage.advanceCount) {
      const ranked = [...qualified].sort((a, b) => state.standings[a].losses - state.standings[b].losses || teamStrength(state, b) - teamStrength(state, a)).slice(0, stage.advanceCount);
      const removed = Object.keys(state.standings).filter((id) => !ranked.includes(id));
      return completeStage(state, ranked, removed);
    }
    const activeTeamIds = Object.values(state.standings).filter((row) => !qualified.includes(row.teamId) && !eliminated.includes(row.teamId)).map((row) => row.teamId);
    if (activeTeamIds.length === 0) {
      const ranked = rankSwiss(state).slice(0, stage.advanceCount);
      return completeStage(state, ranked, Object.keys(state.standings).filter((id) => !ranked.includes(id)));
    }
    const next = { ...state, round: state.round + 1, activeTeamIds, currentMatches: [] };
    return { ...next, currentMatches: currentMatchesFor(next) };
  }

  if (stage.type === "single_elimination") {
    const final = state.currentMatches.find((match) => match.bracket === "final");
    if (final?.winnerTeamId) {
      const champion = final.winnerTeamId;
      return completeStage(state, [champion], Object.keys(state.standings).filter((id) => id !== champion));
    }
    const played = new Set(state.currentMatches.flatMap((match) => [match.teamAId, match.teamBId]));
    const byes = state.activeTeamIds.filter((id) => !played.has(id));
    const activeTeamIds = [...state.currentMatches.map((match) => match.winnerTeamId as string), ...byes];
    if (activeTeamIds.length <= stage.advanceCount) return completeStage(state, activeTeamIds, Object.keys(state.standings).filter((id) => !activeTeamIds.includes(id)));
    const next = { ...state, round: state.round + 1, activeTeamIds, currentMatches: [] };
    return { ...next, currentMatches: currentMatchesFor(next) };
  }

  if (stage.type === "double_elimination") {
    const final = state.currentMatches.find((match) => match.bracket === "final");
    if (final?.winnerTeamId) {
      const winner = final.winnerTeamId;
      const loser = winner === final.teamAId ? final.teamBId : final.teamAId;
      const completedFinals = state.matches.filter((match) => match.stageIndex === state.stageIndex && match.bracket === "final").length;
      const lowerPathWinner = state.standings[winner].losses > 0;
      const previouslyUnbeatenLoser = state.standings[loser].losses - 1 === 0;
      if (stage.grandFinalReset && completedFinals === 1 && lowerPathWinner && previouslyUnbeatenLoser) {
        const next = { ...state, round: state.round + 1, activeTeamIds: [winner, loser], currentMatches: [] };
        return { ...next, currentMatches: currentMatchesFor(next) };
      }
      return completeStage(state, [winner], Object.keys(state.standings).filter((id) => id !== winner));
    }
    const activeTeamIds = Object.values(state.standings).filter((row) => row.losses < 2).map((row) => row.teamId);
    if (activeTeamIds.length <= stage.advanceCount) return completeStage(state, activeTeamIds, Object.keys(state.standings).filter((id) => !activeTeamIds.includes(id)));
    const next = { ...state, round: state.round + 1, activeTeamIds, currentMatches: [] };
    return { ...next, currentMatches: currentMatchesFor(next) };
  }

  if (stage.type === "round_robin") {
    const roundsPerCycle = state.activeTeamIds.length % 2 === 0 ? state.activeTeamIds.length - 1 : state.activeTeamIds.length;
    const totalRounds = roundsPerCycle * (stage.cycles ?? 1);
    if (state.round >= totalRounds) {
      const ranked = rankRoundRobin(state, state.activeTeamIds);
      return completeStage(state, ranked.slice(0, stage.advanceCount), ranked.slice(stage.advanceCount));
    }
    const next = { ...state, round: state.round + 1, currentMatches: [] };
    return { ...next, currentMatches: currentMatchesFor(next) };
  }

  const groups = groupsFor(state, stage, Object.keys(state.standings));
  if (stage.groupFormat === "swiss") {
    const perGroup = Math.floor(stage.advanceCount / groups.length);
    const statuses = groups.map((group) => groupSwissTeams(state, stage, group));
    if (statuses.every((status) => status.qualified.length >= perGroup)) {
      const qualified = statuses.flatMap((status) => status.qualified.slice(0, perGroup));
      return completeStage(state, qualified, Object.keys(state.standings).filter((id) => !qualified.includes(id)));
    }
    const activeTeamIds = statuses.flatMap((status) => status.active);
    if (activeTeamIds.length === 0) {
      const qualified = groups.flatMap((group) => rankSwiss(state, group).slice(0, perGroup));
      return completeStage(state, qualified, Object.keys(state.standings).filter((id) => !qualified.includes(id)));
    }
    const next = { ...state, round: state.round + 1, activeTeamIds, currentMatches: [] };
    return { ...next, currentMatches: currentMatchesFor(next) };
  }
  const groupSize = Math.max(...groups.map((group) => group.length));
  const totalRounds = (groupSize % 2 === 0 ? groupSize - 1 : groupSize) * (stage.cycles ?? 1);
  if (state.round >= totalRounds) {
    const perGroup = Math.floor(stage.advanceCount / groups.length);
    const qualified = groups.flatMap((group, index) => rankRoundRobin(state, group, `group-${index + 1}`).slice(0, perGroup));
    return completeStage(state, qualified, state.activeTeamIds.filter((id) => !qualified.includes(id)));
  }
  const next = { ...state, round: state.round + 1, currentMatches: [] };
  return { ...next, currentMatches: currentMatchesFor(next) };
}

export function findControlledMatch(state: TournamentState, controlledTeamId = state.controlledTeamId): Match | undefined {
  return state.currentMatches.find((match) => !isSwissBye(match) && (match.teamAId === controlledTeamId || match.teamBId === controlledTeamId));
}

export function simulateCurrentBatch(
  state: TournamentState,
  controlledTeamId = state.controlledTeamId,
  manualScore?: ManualScore,
): TournamentState {
  if (!state.currentMatches.length || state.championTeamId) return state;
  const controlledMatch = findControlledMatch(state, controlledTeamId);
  if (controlledMatch && !manualScore) return state;
  let seed = state.seed;
  const completed = state.currentMatches.map((match) => {
    let winnerTeamId: string;
    let score: ManualScore;
    if (isSwissBye(match)) {
      score = { scoreA: 1, scoreB: 0 };
      winnerTeamId = match.teamAId;
    } else if (controlledMatch?.id === match.id && manualScore) {
      score = manualScore;
      winnerTeamId = score.scoreA > score.scoreB ? match.teamAId : match.teamBId;
    } else {
      [winnerTeamId, seed] = chooseWinner(state, match, seed);
      [score, seed] = simulatedScore(match, winnerTeamId, seed);
    }
    return { ...match, ...score, winnerTeamId, completed: true };
  });
  const next: TournamentState = {
    ...state,
    seed,
    matches: [...state.matches, ...completed],
    currentMatches: completed,
    standings: applyCompletedMatches(state.standings, completed),
    updatedAt: Date.now(),
  };
  return advanceAfterBatch(next);
}

export function submitControlledScore(
  state: TournamentState,
  controlledTeamId: string,
  scoreFor: number,
  scoreAgainst: number,
): TournamentState {
  const match = findControlledMatch(state, controlledTeamId);
  if (!match) throw new Error("当前没有需要操纵的比赛");
  const error = validateSeriesScore(match.bestOf, scoreFor, scoreAgainst);
  if (error) throw new Error(error);
  const manualScore = match.teamAId === controlledTeamId
    ? { scoreA: scoreFor, scoreB: scoreAgainst }
    : { scoreA: scoreAgainst, scoreB: scoreFor };
  return simulateCurrentBatch(state, controlledTeamId, manualScore);
}

export function advanceUntilControlledOrComplete(state: TournamentState, controlledTeamId = state.controlledTeamId): TournamentState {
  let next = state;
  for (let guard = 0; guard < 500 && next.currentMatches.length && !next.championTeamId; guard += 1) {
    if (findControlledMatch(next, controlledTeamId)) break;
    const advanced = simulateCurrentBatch(next, controlledTeamId);
    if (advanced === next) break;
    next = advanced;
  }
  return next;
}
