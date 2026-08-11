import { FICTIONAL_PLAYERS, FICTIONAL_TEAMS } from "../data/fictionalTeams.js";
import { PROFESSIONAL_PLAYERS, PROFESSIONAL_SNAPSHOT_DATE, PROFESSIONAL_TEAMS } from "../data/proTeams.js";
import { BUILT_IN_TEMPLATES } from "../data/templates.js";
import { parseCustomTeamPackage, parseTemplatePackage } from "../domain/importValidation.js";
import { seededShuffle, stableId } from "../domain/random.js";
import type { AppDatabase, CustomTeamPackage, Player, SaveGame, Team, TeamSnapshot, TemplatePackage, TournamentState, TournamentTemplate } from "../domain/types.js";
import { validatePlayer, validateRoster, validateTemplate } from "../domain/validation.js";
import { createTournament } from "../engine/tournamentEngine.js";

export type ProfessionalUpdatePayload = { teams: Team[]; players: Player[]; sourceDate: string };

const PROFESSIONAL_SHRINK_RATIO = 0.5;
const PLAYER_ROLES = new Set(["IGL", "AWPer", "Rifler", "Entry", "Support", "Coach", "Unset"]);

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function assertUniqueIds(items: Array<{ id: string }>, label: string): void {
  const ids = new Set<string>();
  for (const item of items) {
    if (!hasText(item.id)) throw new Error(`${label} ID 不能为空`);
    if (ids.has(item.id)) throw new Error(`${label} ID 重复：${item.id}`);
    ids.add(item.id);
  }
}

function validateProfessionalPlayer(player: Player, index: number): void {
  const label = `职业选手 #${index + 1}`;
  if (!player || typeof player !== "object") throw new Error(`${label} 格式无效`);
  if (![player.id, player.nickname, player.realName, player.nationality, player.updatedAt].every(hasText)) throw new Error(`${label} 存在空白必填字段`);
  if (player.source !== "professional") throw new Error(`${label} source 必须是 professional`);
  if (!Number.isInteger(player.age) || player.age < 16 || player.age > 45) throw new Error(`${label} age 无效`);
  if (!PLAYER_ROLES.has(player.role)) throw new Error(`${label} role 无效`);
  if (!Number.isFinite(player.rating) || player.rating < 0.5 || player.rating > 2) throw new Error(`${label} rating 评分无效`);
  if (player.hltvId !== undefined && (!Number.isInteger(player.hltvId) || player.hltvId <= 0)) throw new Error(`${label} hltvId 无效`);
  if (player.sampleStatus !== undefined && !["current", "fallback", "insufficient"].includes(player.sampleStatus)) throw new Error(`${label} sampleStatus 无效`);
}

function validateProfessionalTeam(team: Team, players: Player[], index: number): void {
  const label = `职业队伍 #${index + 1}`;
  if (!team || typeof team !== "object") throw new Error(`${label} 格式无效`);
  if (![team.id, team.name, team.shortName, team.region, team.color, team.updatedAt].every(hasText)) throw new Error(`${label} 存在空白必填字段`);
  if (team.source !== "professional") throw new Error(`${label} source 必须是 professional`);
  if (team.language !== "zh" && team.language !== "en") throw new Error(`${label} language 无效`);
  if (!/^#[0-9a-f]{6}$/i.test(team.color)) throw new Error(`${label} color 无效`);
  if (!Number.isFinite(team.rating) || team.rating <= 0 || team.rating > 5000) throw new Error(`${label} rating 无效`);
  if (!Number.isFinite(team.stability) || team.stability < 0 || team.stability > 1) throw new Error(`${label} stability 无效`);
  if (team.hltvId !== undefined && (!Number.isInteger(team.hltvId) || team.hltvId <= 0)) throw new Error(`${label} hltvId 无效`);
  if (!team.roster || !Array.isArray(team.roster.starters) || !Array.isArray(team.roster.substitutes)) throw new Error(`${label} 阵容格式无效`);
  const errors = validateRoster(team, players);
  if (errors.length) throw new Error(`${team.name}：${errors.join("；")}`);
}

function validateProfessionalUpdate(database: AppDatabase, payload: ProfessionalUpdatePayload): void {
  if (!payload || typeof payload !== "object") throw new Error("职业更新 payload 格式无效");
  if (!Array.isArray(payload.players) || payload.players.length === 0) throw new Error("职业更新为空：没有选手");
  if (!Array.isArray(payload.teams) || payload.teams.length === 0) throw new Error("职业更新为空：没有可用队伍");
  if (!hasText(payload.sourceDate)) throw new Error("职业更新缺少 sourceDate");
  payload.players.forEach(validateProfessionalPlayer);
  assertUniqueIds(payload.players, "职业选手");
  payload.teams.forEach((team, index) => validateProfessionalTeam(team, payload.players, index));
  assertUniqueIds(payload.teams, "职业队伍");

  const retainedPlayerIds = new Set(database.players.filter((player) => player.source !== "professional").map((player) => player.id));
  const retainedTeamIds = new Set(database.teams.filter((team) => team.source !== "professional").map((team) => team.id));
  const playerCollision = payload.players.find((player) => retainedPlayerIds.has(player.id));
  const teamCollision = payload.teams.find((team) => retainedTeamIds.has(team.id));
  if (playerCollision) throw new Error(`职业选手 ID 与现有数据冲突：${playerCollision.id}`);
  if (teamCollision) throw new Error(`职业队伍 ID 与现有数据冲突：${teamCollision.id}`);

  const currentPlayers = database.players.filter((player) => player.source === "professional").length;
  const currentTeams = database.teams.filter((team) => team.source === "professional").length;
  const minimumPlayers = Math.max(1, Math.ceil(currentPlayers * PROFESSIONAL_SHRINK_RATIO));
  const minimumTeams = Math.max(1, Math.ceil(currentTeams * PROFESSIONAL_SHRINK_RATIO));
  if (currentPlayers > 0 && payload.players.length < minimumPlayers) {
    throw new Error(`职业选手数量异常下降：当前 ${currentPlayers}，更新仅 ${payload.players.length}，低于 50% 安全阈值`);
  }
  if (currentTeams > 0 && payload.teams.length < minimumTeams) {
    throw new Error(`职业队伍数量异常下降：当前 ${currentTeams}，更新仅 ${payload.teams.length}，低于 50% 安全阈值`);
  }
}

export function createDefaultDatabase(): AppDatabase {
  return {
    version: 3,
    players: structuredClone([...PROFESSIONAL_PLAYERS, ...FICTIONAL_PLAYERS]),
    teams: structuredClone([...PROFESSIONAL_TEAMS, ...FICTIONAL_TEAMS]),
    templates: structuredClone(BUILT_IN_TEMPLATES),
    saves: [],
    settings: { language: "zh-CN", defaultProfessionalPercent: 50, simulationSpeed: "instant", onlineAiEnabled: false },
    professionalSnapshot: {
      source: "HLTV Players / Stats",
      sourceDate: PROFESSIONAL_SNAPSHOT_DATE,
      updatedAt: PROFESSIONAL_SNAPSHOT_DATE,
      teamCount: PROFESSIONAL_TEAMS.length,
      playerCount: PROFESSIONAL_PLAYERS.length,
    },
  };
}

export function mergeMissingBuiltIns(database: AppDatabase): AppDatabase {
  const base = createDefaultDatabase();
  const playerIds = new Set(database.players.map((player) => player.id));
  const teamIds = new Set(database.teams.map((team) => team.id));
  const templateIds = new Set(database.templates.map((template) => template.id));
  return {
    ...database,
    players: [...database.players, ...base.players.filter((player) => player.source === "fictional" && !playerIds.has(player.id))],
    teams: [...database.teams, ...base.teams.filter((team) => team.source === "fictional" && !teamIds.has(team.id))],
    templates: [...database.templates, ...base.templates.filter((template) => !templateIds.has(template.id))],
  };
}

export function upsertPlayer(database: AppDatabase, player: Player): AppDatabase {
  const errors = validatePlayer(player);
  if (errors.length) throw new Error(errors.join("\n"));
  const exists = database.players.some((item) => item.id === player.id);
  const players = exists
    ? database.players.map((item) => item.id === player.id ? structuredClone(player) : item)
    : [...database.players, structuredClone(player)];
  for (const team of database.teams) {
    const memberIds = [...team.roster.starters, ...team.roster.substitutes, ...(team.roster.coachId ? [team.roster.coachId] : [])];
    if (!memberIds.includes(player.id)) continue;
    const rosterErrors = validateRoster(team, players);
    if (rosterErrors.length) throw new Error(`${team.name}：${rosterErrors.join("；")}`);
  }
  return { ...database, players };
}

export function deletePlayer(database: AppDatabase, playerId: string): AppDatabase {
  if (database.teams.some((team) => [...team.roster.starters, ...team.roster.substitutes, team.roster.coachId].includes(playerId))) {
    throw new Error("该成员仍属于队伍阵容，不能删除");
  }
  return { ...database, players: database.players.filter((player) => player.id !== playerId) };
}

export function upsertTeam(database: AppDatabase, team: Team): AppDatabase {
  const errors = validateRoster(team, database.players);
  if (errors.length) throw new Error(errors.join("\n"));
  const memberIds = new Set([...team.roster.starters, ...team.roster.substitutes, ...(team.roster.coachId ? [team.roster.coachId] : [])]);
  for (const player of database.players.filter((candidate) => memberIds.has(candidate.id))) {
    const playerErrors = validatePlayer(player);
    if (playerErrors.length) throw new Error(`${player.id}：${playerErrors.join("；")}`);
  }
  const exists = database.teams.some((item) => item.id === team.id);
  return { ...database, teams: exists ? database.teams.map((item) => item.id === team.id ? structuredClone(team) : item) : [...database.teams, structuredClone(team)] };
}

export function deleteTeam(database: AppDatabase, teamId: string): AppDatabase {
  return { ...database, teams: database.teams.filter((team) => team.id !== teamId) };
}

export function copyTeamToCustom(database: AppDatabase, teamId: string, name?: string): AppDatabase {
  const source = database.teams.find((team) => team.id === teamId);
  if (!source) throw new Error("找不到要复制的队伍");
  const memberIds = [...source.roster.starters, ...source.roster.substitutes, ...(source.roster.coachId ? [source.roster.coachId] : [])];
  const idMap = new Map<string, string>();
  const suffix = Date.now().toString(36);
  const copiedPlayers = database.players.filter((player) => memberIds.includes(player.id)).map((player) => {
    const id = `custom-player-${suffix}-${stableId("member", player.id)}`;
    idMap.set(player.id, id);
    return { ...structuredClone(player), id, source: "custom" as const, hltvId: undefined, updatedAt: new Date().toISOString().slice(0, 10) };
  });
  const copiedTeam: Team = {
    ...structuredClone(source),
    id: `custom-team-${suffix}`,
    name: name?.trim() || `${source.name} 副本`,
    source: "custom",
    hltvId: undefined,
    roster: {
      starters: source.roster.starters.map((id) => idMap.get(id) as string),
      substitutes: source.roster.substitutes.map((id) => idMap.get(id) as string),
      coachId: source.roster.coachId ? idMap.get(source.roster.coachId) : undefined,
    },
    updatedAt: new Date().toISOString().slice(0, 10),
  };
  return { ...database, players: [...database.players, ...copiedPlayers], teams: [...database.teams, copiedTeam] };
}

export function upsertTemplate(database: AppDatabase, template: TournamentTemplate): AppDatabase {
  const errors = validateTemplate(template);
  if (errors.length) throw new Error(errors.join("\n"));
  const exists = database.templates.some((item) => item.id === template.id);
  return { ...database, templates: exists ? database.templates.map((item) => item.id === template.id ? structuredClone(template) : item) : [...database.templates, structuredClone(template)] };
}

export function deleteTemplate(database: AppDatabase, templateId: string): AppDatabase {
  return { ...database, templates: database.templates.filter((template) => template.id !== templateId || template.builtIn) };
}

function uniquePortableId(used: Set<string>, prefix: string, originalId: string): string {
  let attempt = 0;
  let candidate = stableId(prefix, originalId);
  while (used.has(candidate)) {
    attempt += 1;
    candidate = stableId(prefix, `${originalId}:${attempt}`);
  }
  used.add(candidate);
  return candidate;
}

export function exportTemplatePackage(template: TournamentTemplate): TemplatePackage {
  const errors = validateTemplate(template);
  if (errors.length) throw new Error(errors.join("\n"));
  return { kind: "cs2-tournament-template", version: 1, template: structuredClone(template) };
}

export function importTemplatePackage(database: AppDatabase, value: unknown): AppDatabase {
  const parsed = parseTemplatePackage(value);
  const template = structuredClone(parsed.template);
  const usedIds = new Set(database.templates.map((item) => item.id));
  if (usedIds.has(template.id)) template.id = uniquePortableId(usedIds, "imported-template", template.id);
  return { ...database, templates: [...database.templates, template] };
}

export function exportCustomTeamPackage(database: AppDatabase, teamId: string): CustomTeamPackage {
  const team = database.teams.find((candidate) => candidate.id === teamId);
  if (!team) throw new Error("找不到要导出的队伍");
  if (team.source !== "custom") throw new Error("仅自建 custom 队伍可以单独导出");
  const memberIds = new Set([...team.roster.starters, ...team.roster.substitutes, ...(team.roster.coachId ? [team.roster.coachId] : [])]);
  const players = database.players.filter((player) => memberIds.has(player.id));
  return parseCustomTeamPackage({
    kind: "cs2-custom-team",
    version: 1,
    team: structuredClone(team),
    players: structuredClone(players),
  });
}

export function importCustomTeamPackage(database: AppDatabase, value: unknown): AppDatabase {
  const parsed = parseCustomTeamPackage(value);
  const team = structuredClone(parsed.team);
  const players = structuredClone(parsed.players);
  const usedPlayerIds = new Set(database.players.map((player) => player.id));
  const reservedPlayerIds = new Set([...usedPlayerIds, ...players.map((player) => player.id)]);
  const idMap = new Map<string, string>();
  for (const player of players) {
    if (usedPlayerIds.has(player.id)) idMap.set(player.id, uniquePortableId(reservedPlayerIds, "imported-player", player.id));
    else idMap.set(player.id, player.id);
  }
  for (const player of players) player.id = idMap.get(player.id) as string;
  team.roster = {
    starters: team.roster.starters.map((id) => idMap.get(id) as string),
    substitutes: team.roster.substitutes.map((id) => idMap.get(id) as string),
    coachId: team.roster.coachId ? idMap.get(team.roster.coachId) : undefined,
  };
  const usedTeamIds = new Set(database.teams.map((candidate) => candidate.id));
  if (usedTeamIds.has(team.id)) team.id = uniquePortableId(usedTeamIds, "imported-team", team.id);
  const next = { ...database, players: [...database.players, ...players] };
  return upsertTeam(next, team);
}

function snapshotTeam(database: AppDatabase, teamId: string): TeamSnapshot {
  const team = database.teams.find((item) => item.id === teamId);
  if (!team) throw new Error(`参赛队伍不存在：${teamId}`);
  const errors = validateRoster(team, database.players);
  if (errors.length) throw new Error(`${team.name}：${errors.join("；")}`);
  const ids = new Set([...team.roster.starters, ...team.roster.substitutes, ...(team.roster.coachId ? [team.roster.coachId] : [])]);
  return { ...structuredClone(team), players: structuredClone(database.players.filter((player) => ids.has(player.id))) };
}

export function autoFillParticipants(
  database: AppDatabase,
  template: TournamentTemplate,
  controlledTeamId: string,
  professionalPercent: number,
  seed: number,
  preselected: string[] = [],
): string[] {
  const selected = [...new Set([controlledTeamId, ...preselected])];
  const targetProfessional = Math.round(template.teamCount * Math.max(0, Math.min(100, professionalPercent)) / 100);
  const available = database.teams.filter((team) => !selected.includes(team.id) && validateRoster(team, database.players).length === 0);
  let nextSeed = seed;
  let professional: Team[];
  let fictional: Team[];
  [professional, nextSeed] = seededShuffle(available.filter((team) => team.source === "professional"), nextSeed);
  [fictional, nextSeed] = seededShuffle(available.filter((team) => team.source === "fictional"), nextSeed);
  let other: Team[];
  [other] = seededShuffle(available.filter((team) => team.source === "custom"), nextSeed);
  const selectedProfessional = selected.filter((id) => database.teams.find((team) => team.id === id)?.source === "professional").length;
  selected.push(...professional.slice(0, Math.max(0, targetProfessional - selectedProfessional)).map((team) => team.id));
  const remainingSlots = template.teamCount - selected.length;
  selected.push(...fictional.slice(0, remainingSlots).map((team) => team.id));
  if (selected.length < template.teamCount) {
    const fallback = [...professional, ...other].filter((team) => !selected.includes(team.id));
    selected.push(...fallback.slice(0, template.teamCount - selected.length).map((team) => team.id));
  }
  if (selected.length !== template.teamCount) throw new Error(`可用队伍不足，模板需要 ${template.teamCount} 支队伍`);
  return selected;
}

export function createTournamentSave(
  database: AppDatabase,
  name: string,
  template: TournamentTemplate,
  teamIds: string[],
  controlledTeamId: string,
  seed = Date.now() >>> 0,
): AppDatabase {
  if (new Set(teamIds).size !== teamIds.length) throw new Error("参赛名单中存在重复队伍");
  if (teamIds.length !== template.teamCount) throw new Error(`模板需要 ${template.teamCount} 支队伍`);
  const snapshots = teamIds.map((id) => snapshotTeam(database, id)).sort((a, b) => b.rating - a.rating);
  const tournament = createTournament(template, snapshots, controlledTeamId, seed, name);
  const now = Date.now();
  const save: SaveGame = { id: `save-${now}-${seed}`, name, tournament, createdAt: now, updatedAt: now };
  return { ...database, saves: [save, ...database.saves] };
}

export function updateSaveTournament(database: AppDatabase, saveId: string, tournament: TournamentState): AppDatabase {
  return { ...database, saves: database.saves.map((save) => save.id === saveId ? { ...save, tournament: structuredClone(tournament), updatedAt: Date.now() } : save) };
}

export function deleteSave(database: AppDatabase, saveId: string): AppDatabase {
  return { ...database, saves: database.saves.filter((save) => save.id !== saveId) };
}

export function mergeProfessionalUpdate(database: AppDatabase, payload: ProfessionalUpdatePayload): AppDatabase {
  validateProfessionalUpdate(database, payload);
  const customPlayers = database.players.filter((player) => player.source !== "professional");
  const customTeams = database.teams.filter((team) => team.source !== "professional");
  return {
    ...database,
    players: [...customPlayers, ...structuredClone(payload.players)],
    teams: [...customTeams, ...structuredClone(payload.teams)],
    professionalSnapshot: {
      source: "HLTV Players / Stats",
      sourceDate: payload.sourceDate,
      updatedAt: new Date().toISOString(),
      teamCount: payload.teams.length,
      playerCount: payload.players.length,
    },
  };
}

export function mergeGeneratedData(database: AppDatabase, teams: Team[], players: Player[]): AppDatabase {
  assertUniqueIds(players, "生成选手");
  assertUniqueIds(teams, "生成队伍");
  const nextPlayers = structuredClone(players);
  const nextTeams = structuredClone(teams);
  const usedPlayerIds = new Set(database.players.map((player) => player.id));
  const reservedPlayerIds = new Set([...usedPlayerIds, ...nextPlayers.map((player) => player.id)]);
  const idMap = new Map<string, string>();
  for (const player of nextPlayers) {
    if (usedPlayerIds.has(player.id)) idMap.set(player.id, uniquePortableId(reservedPlayerIds, "generated-player", player.id));
    else idMap.set(player.id, player.id);
  }
  for (const player of nextPlayers) {
    player.id = idMap.get(player.id) as string;
    const errors = validatePlayer(player);
    if (errors.length) throw new Error(`${player.id}：${errors.join("；")}`);
  }
  const usedTeamIds = new Set(database.teams.map((team) => team.id));
  const reservedTeamIds = new Set([...usedTeamIds, ...nextTeams.map((team) => team.id)]);
  for (const team of nextTeams) {
    team.roster = {
      starters: team.roster.starters.map((id) => idMap.get(id) ?? id),
      substitutes: team.roster.substitutes.map((id) => idMap.get(id) ?? id),
      coachId: team.roster.coachId ? (idMap.get(team.roster.coachId) ?? team.roster.coachId) : undefined,
    };
    if (usedTeamIds.has(team.id)) team.id = uniquePortableId(reservedTeamIds, "generated-team", team.id);
    const errors = validateRoster(team, nextPlayers);
    if (errors.length) throw new Error(`${team.name}：${errors.join("；")}`);
  }
  return { ...database, players: [...database.players, ...nextPlayers], teams: [...database.teams, ...nextTeams] };
}
