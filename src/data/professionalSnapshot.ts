import snapshotJson from "./hltvProfessionalSnapshot.json" with { type: "json" };

type SnapshotPlayer = {
  hltvId: number;
  nickname: string;
  realName: string;
  nationality: string;
  rating: number;
  sampleStatus: "current" | "insufficient";
};

type SnapshotTeam = {
  rank: number;
  hltvId: number;
  name: string;
  playerHltvIds: number[];
};

export type ProfessionalSnapshot = {
  version: 2;
  sourceDate: string;
  rankingUrl: string;
  statsUrl: string;
  completeTeamCount: number;
  incompleteTeamCount: number;
  missingRosterSlotCount: number;
  unmatchedStatsPlayerCount: number;
  players: SnapshotPlayer[];
  teams: SnapshotTeam[];
};

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path} must be an object`);
  return value as Record<string, unknown>;
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${path} must be a non-empty string`);
  return value;
}

function integer(value: unknown, path: string, minimum = 0): number {
  if (!Number.isInteger(value) || (value as number) < minimum) throw new Error(`${path} must be an integer >= ${minimum}`);
  return value as number;
}

function finiteNumber(value: unknown, path: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${path} must be between ${minimum} and ${maximum}`);
  }
  return value;
}

function parsePlayer(value: unknown, index: number): SnapshotPlayer {
  const path = `snapshot.players[${index}]`;
  const candidate = record(value, path);
  const sampleStatus = candidate.sampleStatus;
  if (sampleStatus !== "current" && sampleStatus !== "insufficient") throw new Error(`${path}.sampleStatus is invalid`);
  return {
    hltvId: integer(candidate.hltvId, `${path}.hltvId`, 1),
    nickname: text(candidate.nickname, `${path}.nickname`),
    realName: text(candidate.realName, `${path}.realName`),
    nationality: text(candidate.nationality, `${path}.nationality`),
    rating: finiteNumber(candidate.rating, `${path}.rating`, 0.5, 2),
    sampleStatus,
  };
}

function parseTeam(value: unknown, index: number): SnapshotTeam {
  const path = `snapshot.teams[${index}]`;
  const candidate = record(value, path);
  if (!Array.isArray(candidate.playerHltvIds)) throw new Error(`${path}.playerHltvIds must be an array`);
  const playerHltvIds = candidate.playerHltvIds.map((id, playerIndex) => integer(id, `${path}.playerHltvIds[${playerIndex}]`, 1));
  if (playerHltvIds.length < 1 || playerHltvIds.length > 5) throw new Error(`${path} must contain between one and five players`);
  if (new Set(playerHltvIds).size !== playerHltvIds.length) throw new Error(`${path} contains duplicate players`);
  return {
    rank: integer(candidate.rank, `${path}.rank`, 1),
    hltvId: integer(candidate.hltvId, `${path}.hltvId`, 1),
    name: text(candidate.name, `${path}.name`),
    playerHltvIds,
  };
}

export function parseProfessionalSnapshot(value: unknown): ProfessionalSnapshot {
  const candidate = record(value, "snapshot");
  if (candidate.version !== 2) throw new Error("snapshot.version must be 2");
  if (!Array.isArray(candidate.players)) throw new Error("snapshot.players must be an array");
  if (!Array.isArray(candidate.teams)) throw new Error("snapshot.teams must be an array");

  const players = candidate.players.map(parsePlayer);
  const teams = candidate.teams.map(parseTeam);
  const playerIds = players.map((player) => player.hltvId);
  const teamIds = teams.map((team) => team.hltvId);
  if (new Set(playerIds).size !== playerIds.length) throw new Error("snapshot contains duplicate player IDs");
  if (new Set(teamIds).size !== teamIds.length) throw new Error("snapshot contains duplicate team IDs");

  const knownPlayerIds = new Set(playerIds);
  const rosterReferences = teams.flatMap((team) => team.playerHltvIds);
  for (const playerId of rosterReferences) {
    if (!knownPlayerIds.has(playerId)) throw new Error(`snapshot team references missing player ${playerId}`);
  }
  if (new Set(rosterReferences).size !== rosterReferences.length) throw new Error("snapshot reuses a player across ranked teams");

  const expectedRanks = teams.map((_, index) => index + 1);
  if (teams.some((team, index) => team.rank !== expectedRanks[index])) throw new Error("snapshot ranks must be continuous from 1");

  const completeTeamCount = integer(candidate.completeTeamCount, "snapshot.completeTeamCount");
  const incompleteTeamCount = integer(candidate.incompleteTeamCount, "snapshot.incompleteTeamCount");
  const missingRosterSlotCount = integer(candidate.missingRosterSlotCount, "snapshot.missingRosterSlotCount");
  const unmatchedStatsPlayerCount = integer(candidate.unmatchedStatsPlayerCount, "snapshot.unmatchedStatsPlayerCount");
  if (teams.filter((team) => team.playerHltvIds.length === 5).length !== completeTeamCount) throw new Error("snapshot complete team count does not match");
  if (teams.filter((team) => team.playerHltvIds.length < 5).length !== incompleteTeamCount) throw new Error("snapshot incomplete team count does not match");
  if (teams.reduce((sum, team) => sum + 5 - team.playerHltvIds.length, 0) !== missingRosterSlotCount) throw new Error("snapshot missing roster slot count does not match");
  if (players.filter((player) => player.sampleStatus === "insufficient").length !== unmatchedStatsPlayerCount) throw new Error("snapshot unmatched Stats count does not match");

  return {
    version: 2,
    sourceDate: text(candidate.sourceDate, "snapshot.sourceDate"),
    rankingUrl: text(candidate.rankingUrl, "snapshot.rankingUrl"),
    statsUrl: text(candidate.statsUrl, "snapshot.statsUrl"),
    completeTeamCount,
    incompleteTeamCount,
    missingRosterSlotCount,
    unmatchedStatsPlayerCount,
    players,
    teams,
  };
}

export const PROFESSIONAL_SNAPSHOT = parseProfessionalSnapshot(snapshotJson);

export const PROFESSIONAL_SNAPSHOT_INFO = {
  version: PROFESSIONAL_SNAPSHOT.version,
  sourceDate: PROFESSIONAL_SNAPSHOT.sourceDate,
  rankingUrl: PROFESSIONAL_SNAPSHOT.rankingUrl,
  statsUrl: PROFESSIONAL_SNAPSHOT.statsUrl,
  completeTeamCount: PROFESSIONAL_SNAPSHOT.completeTeamCount,
  incompleteTeamCount: PROFESSIONAL_SNAPSHOT.incompleteTeamCount,
  missingRosterSlotCount: PROFESSIONAL_SNAPSHOT.missingRosterSlotCount,
  unmatchedStatsPlayerCount: PROFESSIONAL_SNAPSHOT.unmatchedStatsPlayerCount,
  ranks: PROFESSIONAL_SNAPSHOT.teams.map((team) => team.rank),
} as const;
