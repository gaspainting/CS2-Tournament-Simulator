import { stableId } from "../domain/random.js";
import type { AppDatabase, BestOf, Match, Player, SaveGame, Standing, TeamSnapshot, TournamentState } from "../domain/types.js";

type LegacyMatch = {
  id: string;
  stage: "stage1" | "stage2" | "stage3" | "playoffs";
  round: number;
  teamA: string;
  teamB: string;
  bestOf: number;
  winner?: string;
  scoreA?: number;
  scoreB?: number;
};

type LegacyTournament = {
  seed: number;
  phase: "stage1" | "stage2" | "stage3" | "playoffs";
  round: number;
  activeTeams: string[];
  records: Record<string, { wins: number; losses: number }>;
  currentMatches: LegacyMatch[];
  matches: LegacyMatch[];
  qualifiers?: Record<string, string[]>;
  champion?: string;
};

type LegacySave = {
  id: string;
  name: string;
  controlledTeam: string;
  tournament: LegacyTournament;
  createdAt: number;
  updatedAt: number;
};

type LegacyLibrary = { activeId?: string | null; saves: LegacySave[] };

const STAGE_INDEX = { stage1: 0, stage2: 1, stage3: 2, playoffs: 3 } as const;
const NUMBER_WORDS = ["One", "Two", "Three", "Four", "Five"];

function isLegacyLibrary(value: unknown): value is LegacyLibrary {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { saves?: unknown };
  return Array.isArray(candidate.saves);
}

function placeholderSnapshot(name: string, updatedAt: number): TeamSnapshot {
  const teamId = stableId("legacy-team", name);
  const players: Player[] = NUMBER_WORDS.map((word, index) => ({
    id: `${teamId}-player-${index + 1}`,
    nickname: `Standin${word}`,
    realName: `Legacy Standin ${word}`,
    nationality: "Unknown",
    age: 20 + index,
    role: index === 0 ? "IGL" : index === 1 ? "AWPer" : index === 2 ? "Entry" : index === 3 ? "Rifler" : "Support",
    rating: 1,
    source: "custom",
    sampleStatus: "insufficient",
    updatedAt: new Date(updatedAt || Date.now()).toISOString().slice(0, 10),
  }));
  return {
    id: teamId,
    name,
    shortName: name.replace(/[^A-Za-z0-9]/g, "").slice(0, 4).toUpperCase() || "LEG",
    region: "Unknown",
    color: "#667085",
    source: "custom",
    language: "en",
    roster: { starters: players.map((player) => player.id), substitutes: [] },
    rating: 1000,
    stability: 0.5,
    updatedAt: players[0].updatedAt,
    players,
  };
}

function knownSnapshot(database: AppDatabase, name: string): TeamSnapshot | undefined {
  const team = database.teams.find((item) => item.name.toLowerCase() === name.toLowerCase());
  if (!team) return undefined;
  const memberIds = new Set([...team.roster.starters, ...team.roster.substitutes, ...(team.roster.coachId ? [team.roster.coachId] : [])]);
  return { ...structuredClone(team), players: structuredClone(database.players.filter((player) => memberIds.has(player.id))) };
}

function legacyTeamNames(save: LegacySave): string[] {
  const tournament = save.tournament;
  const names = new Set<string>([save.controlledTeam, ...tournament.activeTeams, ...(tournament.champion ? [tournament.champion] : [])]);
  for (const match of [...tournament.matches, ...tournament.currentMatches]) {
    names.add(match.teamA);
    names.add(match.teamB);
    if (match.winner) names.add(match.winner);
  }
  Object.values(tournament.qualifiers ?? {}).flat().forEach((name) => names.add(name));
  return [...names];
}

function convertMatch(match: LegacyMatch, teamId: (name: string) => string): Match {
  return {
    id: match.id,
    stageIndex: STAGE_INDEX[match.stage],
    round: match.round,
    bracket: match.stage === "playoffs" ? "upper" : "swiss",
    teamAId: teamId(match.teamA),
    teamBId: teamId(match.teamB),
    bestOf: ([1, 3, 5].includes(match.bestOf) ? match.bestOf : 3) as BestOf,
    winnerTeamId: match.winner ? teamId(match.winner) : undefined,
    scoreA: match.scoreA,
    scoreB: match.scoreB,
    completed: Boolean(match.winner),
  };
}

function convertSave(save: LegacySave, database: AppDatabase): SaveGame {
  const teamSnapshots = legacyTeamNames(save).map((name) => knownSnapshot(database, name) ?? placeholderSnapshot(name, save.updatedAt));
  const idByName = new Map(teamSnapshots.map((team) => [team.name.toLowerCase(), team.id]));
  const teamId = (name: string) => idByName.get(name.toLowerCase()) ?? stableId("legacy-team", name);
  const standings = Object.fromEntries(Object.entries(save.tournament.records).map(([name, record]) => {
    const id = teamId(name);
    const row: Standing = { teamId: id, wins: record.wins, losses: record.losses, scoreFor: 0, scoreAgainst: 0, opponents: [] };
    return [id, row];
  }));
  const template = structuredClone(database.templates.find((item) => item.id === "major-32") ?? database.templates[0]);
  const currentMatches = save.tournament.currentMatches.map((match) => convertMatch(match, teamId));
  const matches = save.tournament.matches.map((match) => convertMatch(match, teamId));
  const tournament: TournamentState = {
    version: 3,
    id: `legacy-${save.id}`,
    name: save.name,
    template,
    controlledTeamId: teamId(save.controlledTeam),
    teamSnapshots,
    seed: save.tournament.seed,
    stageIndex: STAGE_INDEX[save.tournament.phase],
    round: save.tournament.round,
    activeTeamIds: save.tournament.activeTeams.map(teamId),
    currentMatches,
    matches,
    standings,
    stageResults: [],
    championTeamId: save.tournament.champion ? teamId(save.tournament.champion) : undefined,
    createdAt: save.createdAt,
    updatedAt: save.updatedAt,
    legacyFormat: true,
  };
  return { id: save.id, name: save.name, tournament, createdAt: save.createdAt, updatedAt: save.updatedAt };
}

export function migrateLegacyLibrary(value: unknown, database: AppDatabase): AppDatabase {
  if (!isLegacyLibrary(value)) return database;
  const existing = new Set(database.saves.map((save) => save.id));
  const imported = value.saves.filter((save) => !existing.has(save.id)).map((save) => convertSave(save, database));
  if (!imported.length) return database;
  return {
    ...database,
    saves: [...database.saves, ...imported],
    migration: {
      ...database.migration,
      legacyV2ImportedAt: Date.now(),
      legacyBackup: JSON.stringify(value),
    },
  };
}
