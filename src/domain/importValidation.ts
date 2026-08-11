import type {
  AppDatabase,
  AppSettings,
  CustomTeamPackage,
  DataSnapshotInfo,
  Match,
  Player,
  SaveGame,
  StageResult,
  Standing,
  Team,
  TeamSnapshot,
  TournamentState,
  TournamentTemplate,
  TemplatePackage,
} from "./types.js";
import { validatePlayer, validateRoster, validateStoredRoster, validateTemplate } from "./validation.js";
import { createTournament, SWISS_BYE_TEAM_ID } from "../engine/tournamentEngine.js";

type UnknownRecord = Record<string, unknown>;

const DATA_SOURCES = ["professional", "custom", "fictional"] as const;
const PLAYER_ROLES = ["IGL", "AWPer", "Rifler", "Entry", "Support", "Coach", "Unset"] as const;
const SAMPLE_STATUSES = ["current", "fallback", "insufficient"] as const;
const STAGE_TYPES = ["swiss", "single_elimination", "double_elimination", "round_robin", "groups"] as const;
const BRACKETS = ["swiss", "upper", "lower", "final", "third_place", "league"] as const;

function invalid(path: string, message: string): never {
  throw new Error(`${path}：${message}`);
}

function record(value: unknown, path: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(path, "必须是对象");
  return value as UnknownRecord;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) invalid(path, "必须是数组");
  return value;
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) invalid(path, "必须是非空字符串");
  return value;
}

function optionalText(value: unknown, path: string): string | undefined {
  return value === undefined ? undefined : text(value, path);
}

function bool(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") invalid(path, "必须是布尔值");
  return value;
}

function finiteNumber(value: unknown, path: string, minimum?: number, maximum?: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) invalid(path, "必须是有限数字");
  if (minimum !== undefined && value < minimum) invalid(path, `不能小于 ${minimum}`);
  if (maximum !== undefined && value > maximum) invalid(path, `不能大于 ${maximum}`);
  return value;
}

function integer(value: unknown, path: string, minimum?: number, maximum?: number): number {
  const result = finiteNumber(value, path, minimum, maximum);
  if (!Number.isInteger(result)) invalid(path, "必须是整数");
  return result;
}

function enumValue<T extends string | number>(value: unknown, values: readonly T[], path: string): T {
  if (!values.includes(value as T)) invalid(path, `值无效：${String(value)}`);
  return value as T;
}

function stringArray(value: unknown, path: string): string[] {
  return array(value, path).map((item, index) => text(item, `${path}[${index}]`));
}

function assertUnique(values: string[], path: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) invalid(path, `存在重复 ID：${value}`);
    seen.add(value);
  }
}

function optionalPositiveId(value: unknown, path: string): number | undefined {
  return value === undefined ? undefined : integer(value, path, 1);
}

function parsePlayer(value: unknown, path: string): Player {
  const candidate = record(value, path);
  const player: Player = {
    id: text(candidate.id, `${path}.id`),
    nickname: text(candidate.nickname, `${path}.nickname`),
    realName: text(candidate.realName, `${path}.realName`),
    nationality: text(candidate.nationality, `${path}.nationality`),
    age: integer(candidate.age, `${path}.age`, 15, 80),
    role: enumValue(candidate.role, PLAYER_ROLES, `${path}.role`),
    rating: finiteNumber(candidate.rating, `${path}.rating`, 0.01, 3),
    source: enumValue(candidate.source, DATA_SOURCES, `${path}.source`),
    updatedAt: text(candidate.updatedAt, `${path}.updatedAt`),
  };
  const hltvId = optionalPositiveId(candidate.hltvId, `${path}.hltvId`);
  const sampleStatus = candidate.sampleStatus === undefined ? undefined : enumValue(candidate.sampleStatus, SAMPLE_STATUSES, `${path}.sampleStatus`);
  if (hltvId !== undefined) player.hltvId = hltvId;
  if (sampleStatus !== undefined) player.sampleStatus = sampleStatus;
  const errors = validatePlayer(player);
  if (errors.length) invalid(path, errors.join("；"));
  return player;
}

function parseRoster(candidate: UnknownRecord, path: string): Team["roster"] {
  const rosterRecord = record(candidate.roster, `${path}.roster`);
  const roster: Team["roster"] = {
    starters: stringArray(rosterRecord.starters, `${path}.roster.starters`),
    substitutes: stringArray(rosterRecord.substitutes, `${path}.roster.substitutes`),
  };
  const coachId = optionalText(rosterRecord.coachId, `${path}.roster.coachId`);
  if (coachId !== undefined) roster.coachId = coachId;
  return roster;
}

function parseTeamBase(value: unknown, path: string): Team {
  const candidate = record(value, path);
  const color = text(candidate.color, `${path}.color`);
  if (!/^#[0-9a-f]{6}$/i.test(color)) invalid(`${path}.color`, "必须是六位十六进制颜色");
  const team: Team = {
    id: text(candidate.id, `${path}.id`),
    name: text(candidate.name, `${path}.name`),
    shortName: text(candidate.shortName, `${path}.shortName`),
    region: text(candidate.region, `${path}.region`),
    color,
    source: enumValue(candidate.source, DATA_SOURCES, `${path}.source`),
    language: enumValue(candidate.language, ["zh", "en"] as const, `${path}.language`),
    roster: parseRoster(candidate, path),
    rating: finiteNumber(candidate.rating, `${path}.rating`, 1, 5000),
    stability: finiteNumber(candidate.stability, `${path}.stability`, 0, 1),
    updatedAt: text(candidate.updatedAt, `${path}.updatedAt`),
  };
  const hltvId = optionalPositiveId(candidate.hltvId, `${path}.hltvId`);
  if (hltvId !== undefined) team.hltvId = hltvId;
  return team;
}

function validateTeamRoster(team: Team, players: Player[], path: string): void {
  const errors = validateRoster(team, players);
  if (errors.length) invalid(path, errors.join("；"));
}

function validateStoredTeamRoster(team: Team, players: Player[], path: string): void {
  const errors = validateStoredRoster(team, players);
  if (errors.length) invalid(path, errors.join("；"));
}

function parseTemplate(value: unknown, path: string): TournamentTemplate {
  const candidate = record(value, path);
  text(candidate.id, `${path}.id`);
  text(candidate.name, `${path}.name`);
  optionalText(candidate.description, `${path}.description`);
  bool(candidate.builtIn, `${path}.builtIn`);
  integer(candidate.teamCount, `${path}.teamCount`, 4, 64);
  const stages = array(candidate.stages, `${path}.stages`);
  for (const [index, rawStage] of stages.entries()) {
    const stagePath = `${path}.stages[${index}]`;
    const stage = record(rawStage, stagePath);
    text(stage.id, `${stagePath}.id`);
    text(stage.name, `${stagePath}.name`);
    enumValue(stage.type, STAGE_TYPES, `${stagePath}.type`);
    integer(stage.advanceCount, `${stagePath}.advanceCount`, 1);
    if (stage.entrantCount !== undefined) integer(stage.entrantCount, `${stagePath}.entrantCount`, 2);
    if (stage.inviteCount !== undefined) integer(stage.inviteCount, `${stagePath}.inviteCount`, 0);
    const bestOf = record(stage.bestOf, `${stagePath}.bestOf`);
    enumValue(bestOf.default, [1, 3, 5] as const, `${stagePath}.bestOf.default`);
    if (bestOf.decisive !== undefined) enumValue(bestOf.decisive, [1, 3, 5] as const, `${stagePath}.bestOf.decisive`);
    if (bestOf.final !== undefined) enumValue(bestOf.final, [1, 3, 5] as const, `${stagePath}.bestOf.final`);
    if (stage.winsToAdvance !== undefined) integer(stage.winsToAdvance, `${stagePath}.winsToAdvance`, 1);
    if (stage.lossesToEliminate !== undefined) integer(stage.lossesToEliminate, `${stagePath}.lossesToEliminate`, 1);
    if (stage.avoidRematches !== undefined) bool(stage.avoidRematches, `${stagePath}.avoidRematches`);
    if (stage.cycles !== undefined) enumValue(stage.cycles, [1, 2] as const, `${stagePath}.cycles`);
    if (stage.groupCount !== undefined) integer(stage.groupCount, `${stagePath}.groupCount`, 2);
    if (stage.groupFormat !== undefined) enumValue(stage.groupFormat, ["round_robin", "swiss"] as const, `${stagePath}.groupFormat`);
    if (stage.thirdPlace !== undefined) bool(stage.thirdPlace, `${stagePath}.thirdPlace`);
    if (stage.grandFinalReset !== undefined) bool(stage.grandFinalReset, `${stagePath}.grandFinalReset`);
  }
  const template = value as TournamentTemplate;
  const errors = validateTemplate(template);
  if (errors.length) invalid(path, errors.join("；"));
  assertUnique(template.stages.map((stage) => stage.id), `${path}.stages`);
  return template;
}

export function parseTemplatePackage(value: unknown): TemplatePackage {
  const candidate = record(value, "模板包");
  if (candidate.kind !== "cs2-tournament-template") invalid("模板包.kind", "必须是 cs2-tournament-template");
  if (candidate.version !== 1) invalid("模板包.version", "仅支持 v1");
  const template = parseTemplate(candidate.template, "模板包.template");
  return {
    kind: "cs2-tournament-template",
    version: 1,
    template: { ...template, builtIn: false },
  };
}

export function parseCustomTeamPackage(value: unknown): CustomTeamPackage {
  const candidate = record(value, "自建队包");
  if (candidate.kind !== "cs2-custom-team") invalid("自建队包.kind", "必须是 cs2-custom-team");
  if (candidate.version !== 1) invalid("自建队包.version", "仅支持 v1");
  const parsedTeam = parseTeamBase(candidate.team, "自建队包.team");
  const parsedPlayers = array(candidate.players, "自建队包.players").map((player, index) => parsePlayer(player, `自建队包.players[${index}]`));
  assertUnique(parsedPlayers.map((player) => player.id), "自建队包.players");
  const { hltvId: _teamHltvId, ...teamFields } = parsedTeam;
  const team = { ...teamFields, source: "custom" as const };
  const players = parsedPlayers.map((player) => {
    const { hltvId: _hltvId, sampleStatus: _sampleStatus, ...playerFields } = player;
    return { ...playerFields, source: "custom" as const };
  });
  validateTeamRoster(team, players, "自建队包.team");
  const memberIds = new Set([...team.roster.starters, ...team.roster.substitutes, ...(team.roster.coachId ? [team.roster.coachId] : [])]);
  const unrelated = players.find((player) => !memberIds.has(player.id));
  if (unrelated) invalid("自建队包.players", `包含不属于阵容的无关成员：${unrelated.id}`);
  if (players.length !== memberIds.size) invalid("自建队包.players", "必须完整且仅包含队伍首发、替补和教练");
  return { kind: "cs2-custom-team", version: 1, team, players };
}

function parseMatch(value: unknown, path: string, teamIds: Set<string>, stageCount: number): Match {
  const candidate = record(value, path);
  const teamAId = text(candidate.teamAId, `${path}.teamAId`);
  const teamBId = text(candidate.teamBId, `${path}.teamBId`);
  if (!teamIds.has(teamAId)) invalid(`${path}.teamAId`, `引用了不存在的队伍：${teamAId}`);
  if (teamBId !== SWISS_BYE_TEAM_ID && !teamIds.has(teamBId)) invalid(`${path}.teamBId`, `引用了不存在的队伍：${teamBId}`);
  if (teamAId === teamBId) invalid(path, "比赛双方不能是同一队伍");
  const completed = bool(candidate.completed, `${path}.completed`);
  const match: Match = {
    id: text(candidate.id, `${path}.id`),
    stageIndex: integer(candidate.stageIndex, `${path}.stageIndex`, 0, stageCount - 1),
    round: integer(candidate.round, `${path}.round`, 1),
    teamAId,
    teamBId,
    bestOf: enumValue(candidate.bestOf, [1, 3, 5] as const, `${path}.bestOf`),
    completed,
  };
  const groupId = optionalText(candidate.groupId, `${path}.groupId`);
  const bracket = candidate.bracket === undefined ? undefined : enumValue(candidate.bracket, BRACKETS, `${path}.bracket`);
  if (groupId !== undefined) match.groupId = groupId;
  if (bracket !== undefined) match.bracket = bracket;
  if (candidate.scoreA !== undefined) match.scoreA = integer(candidate.scoreA, `${path}.scoreA`, 0);
  if (candidate.scoreB !== undefined) match.scoreB = integer(candidate.scoreB, `${path}.scoreB`, 0);
  const winnerTeamId = optionalText(candidate.winnerTeamId, `${path}.winnerTeamId`);
  if (completed) {
    if (match.scoreA === undefined || match.scoreB === undefined) invalid(path, "已完成比赛必须包含比分");
    if (winnerTeamId !== teamAId && winnerTeamId !== teamBId) invalid(`${path}.winnerTeamId`, "必须引用比赛一方");
    match.winnerTeamId = winnerTeamId;
  } else if (winnerTeamId !== undefined) {
    invalid(`${path}.winnerTeamId`, "未完成比赛不能已有胜者");
  }
  return match;
}

function parseStanding(value: unknown, path: string, expectedTeamId: string, teamIds: Set<string>): Standing {
  const candidate = record(value, path);
  const teamId = text(candidate.teamId, `${path}.teamId`);
  if (teamId !== expectedTeamId) invalid(`${path}.teamId`, `必须与键 ${expectedTeamId} 一致`);
  if (!teamIds.has(teamId)) invalid(`${path}.teamId`, `引用了不存在的队伍：${teamId}`);
  const opponents = stringArray(candidate.opponents, `${path}.opponents`);
  for (const opponent of opponents) if (!teamIds.has(opponent)) invalid(`${path}.opponents`, `引用了不存在的对手：${opponent}`);
  return {
    teamId,
    wins: integer(candidate.wins, `${path}.wins`, 0),
    losses: integer(candidate.losses, `${path}.losses`, 0),
    scoreFor: integer(candidate.scoreFor, `${path}.scoreFor`, 0),
    scoreAgainst: integer(candidate.scoreAgainst, `${path}.scoreAgainst`, 0),
    opponents,
  };
}

function parseStageResult(value: unknown, path: string, stageIds: Set<string>, teamIds: Set<string>): StageResult {
  const candidate = record(value, path);
  const stageId = text(candidate.stageId, `${path}.stageId`);
  if (!stageIds.has(stageId)) invalid(`${path}.stageId`, `引用了不存在的阶段：${stageId}`);
  const qualifiedTeamIds = stringArray(candidate.qualifiedTeamIds, `${path}.qualifiedTeamIds`);
  const eliminatedTeamIds = stringArray(candidate.eliminatedTeamIds, `${path}.eliminatedTeamIds`);
  assertUnique(qualifiedTeamIds, `${path}.qualifiedTeamIds`);
  assertUnique(eliminatedTeamIds, `${path}.eliminatedTeamIds`);
  for (const teamId of [...qualifiedTeamIds, ...eliminatedTeamIds]) {
    if (!teamIds.has(teamId)) invalid(path, `引用了不存在的队伍：${teamId}`);
  }
  if (qualifiedTeamIds.some((teamId) => eliminatedTeamIds.includes(teamId))) invalid(path, "同一队伍不能同时晋级和淘汰");
  return { stageId, qualifiedTeamIds, eliminatedTeamIds };
}

function parseTournament(value: unknown, path: string): TournamentState {
  const candidate = record(value, path);
  if (candidate.version !== 3) invalid(`${path}.version`, "仅支持 v3");
  const template = parseTemplate(candidate.template, `${path}.template`);
  const rawSnapshots = array(candidate.teamSnapshots, `${path}.teamSnapshots`);
  const teamSnapshots = rawSnapshots.map((rawTeam, index) => {
    const snapshotPath = `${path}.teamSnapshots[${index}]`;
    const team = parseTeamBase(rawTeam, snapshotPath);
    const snapshotRecord = record(rawTeam, snapshotPath);
    const players = array(snapshotRecord.players, `${snapshotPath}.players`).map((player, playerIndex) => parsePlayer(player, `${snapshotPath}.players[${playerIndex}]`));
    assertUnique(players.map((player) => player.id), `${snapshotPath}.players`);
    validateTeamRoster(team, players, snapshotPath);
    return { ...team, players } as TeamSnapshot;
  });
  if (teamSnapshots.length !== template.teamCount) invalid(`${path}.teamSnapshots`, `必须包含 ${template.teamCount} 支队伍`);
  assertUnique(teamSnapshots.map((team) => team.id), `${path}.teamSnapshots`);
  const allSnapshotPlayerIds = teamSnapshots.flatMap((team) => team.players.map((player) => player.id));
  assertUnique(allSnapshotPlayerIds, `${path}.teamSnapshots.players`);
  const teamIds = new Set(teamSnapshots.map((team) => team.id));
  const controlledTeamId = text(candidate.controlledTeamId, `${path}.controlledTeamId`);
  if (!teamIds.has(controlledTeamId)) invalid(`${path}.controlledTeamId`, "操纵队不在队伍快照中");
  const seed = integer(candidate.seed, `${path}.seed`, 0);
  try {
    createTournament(template, teamSnapshots, controlledTeamId, seed, text(candidate.name, `${path}.name`));
  } catch (caught) {
    invalid(path, `基础赛事不变量无效：${caught instanceof Error ? caught.message : String(caught)}`);
  }

  const stageIndex = integer(candidate.stageIndex, `${path}.stageIndex`, 0, template.stages.length - 1);
  const activeTeamIds = stringArray(candidate.activeTeamIds, `${path}.activeTeamIds`);
  assertUnique(activeTeamIds, `${path}.activeTeamIds`);
  for (const teamId of activeTeamIds) if (!teamIds.has(teamId)) invalid(`${path}.activeTeamIds`, `引用了不存在的队伍：${teamId}`);
  const currentMatches = array(candidate.currentMatches, `${path}.currentMatches`).map((match, index) => parseMatch(match, `${path}.currentMatches[${index}]`, teamIds, template.stages.length));
  const matches = array(candidate.matches, `${path}.matches`).map((match, index) => parseMatch(match, `${path}.matches[${index}]`, teamIds, template.stages.length));
  assertUnique([...currentMatches, ...matches].map((match) => match.id), `${path}.matches`);
  if (currentMatches.some((match) => match.stageIndex !== stageIndex)) invalid(`${path}.currentMatches`, "当前比赛的阶段索引不一致");

  const standingsRecord = record(candidate.standings, `${path}.standings`);
  const standings = Object.fromEntries(Object.entries(standingsRecord).map(([teamId, standing]) => [teamId, parseStanding(standing, `${path}.standings.${teamId}`, teamId, teamIds)]));
  for (const teamId of activeTeamIds) {
    if (!standings[teamId]) invalid(`${path}.standings`, `缺少 active team 的积分榜记录：${teamId}`);
  }
  const stageIds = new Set(template.stages.map((stage) => stage.id));
  const stageResults = array(candidate.stageResults, `${path}.stageResults`).map((result, index) => parseStageResult(result, `${path}.stageResults[${index}]`, stageIds, teamIds));
  assertUnique(stageResults.map((result) => result.stageId), `${path}.stageResults`);
  const championTeamId = optionalText(candidate.championTeamId, `${path}.championTeamId`);
  if (championTeamId !== undefined && !teamIds.has(championTeamId)) invalid(`${path}.championTeamId`, `引用了不存在的队伍：${championTeamId}`);

  const tournament: TournamentState = {
    version: 3,
    id: text(candidate.id, `${path}.id`),
    name: candidate.name as string,
    template,
    controlledTeamId,
    teamSnapshots,
    seed,
    stageIndex,
    round: integer(candidate.round, `${path}.round`, 1),
    activeTeamIds,
    currentMatches,
    matches,
    standings,
    stageResults,
    createdAt: finiteNumber(candidate.createdAt, `${path}.createdAt`, 0),
    updatedAt: finiteNumber(candidate.updatedAt, `${path}.updatedAt`, 0),
  };
  if (championTeamId !== undefined) tournament.championTeamId = championTeamId;
  if (candidate.legacyFormat !== undefined) tournament.legacyFormat = bool(candidate.legacyFormat, `${path}.legacyFormat`);
  return tournament;
}

function parseSettings(value: unknown, path: string): AppSettings {
  const candidate = record(value, path);
  return {
    language: enumValue(candidate.language, ["zh-CN", "en"] as const, `${path}.language`),
    defaultProfessionalPercent: finiteNumber(candidate.defaultProfessionalPercent, `${path}.defaultProfessionalPercent`, 0, 100),
    simulationSpeed: enumValue(candidate.simulationSpeed, ["instant", "normal"] as const, `${path}.simulationSpeed`),
    onlineAiEnabled: bool(candidate.onlineAiEnabled, `${path}.onlineAiEnabled`),
  };
}

function parseSnapshotInfo(value: unknown, path: string): DataSnapshotInfo {
  const candidate = record(value, path);
  return {
    source: text(candidate.source, `${path}.source`),
    sourceDate: text(candidate.sourceDate, `${path}.sourceDate`),
    updatedAt: text(candidate.updatedAt, `${path}.updatedAt`),
    teamCount: integer(candidate.teamCount, `${path}.teamCount`, 0),
    playerCount: integer(candidate.playerCount, `${path}.playerCount`, 0),
  };
}

export function parseSaveGame(value: unknown): SaveGame {
  const candidate = record(value, "存档");
  return {
    id: text(candidate.id, "存档.id"),
    name: text(candidate.name, "存档.name"),
    tournament: parseTournament(candidate.tournament, "存档.tournament"),
    createdAt: finiteNumber(candidate.createdAt, "存档.createdAt", 0),
    updatedAt: finiteNumber(candidate.updatedAt, "存档.updatedAt", 0),
  };
}

export function validateSaveGame(value: unknown): string[] {
  try {
    parseSaveGame(value);
    return [];
  } catch (caught) {
    return [caught instanceof Error ? caught.message : String(caught)];
  }
}

export function parseAppDatabaseV3(value: unknown): AppDatabase {
  const candidate = record(value, "数据库");
  if (candidate.version !== 3) invalid("数据库.version", "仅支持 v3");
  const players = array(candidate.players, "数据库.players").map((player, index) => parsePlayer(player, `数据库.players[${index}]`));
  const teams = array(candidate.teams, "数据库.teams").map((team, index) => parseTeamBase(team, `数据库.teams[${index}]`));
  const templates = array(candidate.templates, "数据库.templates").map((template, index) => parseTemplate(template, `数据库.templates[${index}]`));
  const saves = array(candidate.saves, "数据库.saves").map((save) => parseSaveGame(save));
  if (players.length === 0) invalid("数据库.players", "至少需要一名选手");
  if (teams.length === 0) invalid("数据库.teams", "至少需要一支队伍");
  if (templates.length === 0) invalid("数据库.templates", "至少需要一个赛事模板");
  assertUnique(players.map((player) => player.id), "数据库.players");
  assertUnique(teams.map((team) => team.id), "数据库.teams");
  assertUnique(templates.map((template) => template.id), "数据库.templates");
  assertUnique(saves.map((save) => save.id), "数据库.saves");
  for (const [index, team] of teams.entries()) validateStoredTeamRoster(team, players, `数据库.teams[${index}]`);
  const database: AppDatabase = {
    version: 3,
    players,
    teams,
    templates,
    saves,
    settings: parseSettings(candidate.settings, "数据库.settings"),
    professionalSnapshot: parseSnapshotInfo(candidate.professionalSnapshot, "数据库.professionalSnapshot"),
  };
  if (candidate.migration !== undefined) {
    const migration = record(candidate.migration, "数据库.migration");
    database.migration = {};
    if (migration.legacyV2ImportedAt !== undefined) database.migration.legacyV2ImportedAt = finiteNumber(migration.legacyV2ImportedAt, "数据库.migration.legacyV2ImportedAt", 0);
    if (migration.legacyBackup !== undefined) database.migration.legacyBackup = text(migration.legacyBackup, "数据库.migration.legacyBackup");
    if (migration.fictionalNicknameVersion !== undefined) database.migration.fictionalNicknameVersion = integer(migration.fictionalNicknameVersion, "数据库.migration.fictionalNicknameVersion", 0);
    if (migration.professionalSnapshotVersion !== undefined) database.migration.professionalSnapshotVersion = integer(migration.professionalSnapshotVersion, "数据库.migration.professionalSnapshotVersion", 0);
  }
  return database;
}

export function validateAppDatabaseV3(value: unknown): string[] {
  try {
    parseAppDatabaseV3(value);
    return [];
  } catch (caught) {
    return [caught instanceof Error ? caught.message : String(caught)];
  }
}
