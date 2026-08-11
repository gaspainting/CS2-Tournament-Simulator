import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [, , databasePath, outputDirectory] = process.argv;
if (!databasePath || !outputDirectory) {
  throw new Error("Usage: node scripts/export-rosters.mjs <database.json> <output-directory>");
}

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");
const snapshotPath = path.join(projectDirectory, "src", "data", "hltvProfessionalSnapshot.json");
const database = JSON.parse(await fs.readFile(path.resolve(databasePath), "utf8"));
const professionalSnapshot = JSON.parse(await fs.readFile(snapshotPath, "utf8"));

const SOURCE_LABELS = {
  professional: "职业",
  fictional: "虚构",
  custom: "自建",
};

const rankByTeamHltvId = new Map(professionalSnapshot.teams.map((team) => [team.hltvId, team.rank]));
const playerById = new Map(database.players.map((player) => [player.id, player]));

function teamOrder(team) {
  if (team.source === "professional") return [0, rankByTeamHltvId.get(team.hltvId) ?? 9999, team.name];
  if (team.source === "fictional") return [1, 0, team.name];
  return [2, 0, team.name];
}

function compareTeams(left, right) {
  const leftOrder = teamOrder(left);
  const rightOrder = teamOrder(right);
  return leftOrder[0] - rightOrder[0]
    || leftOrder[1] - rightOrder[1]
    || leftOrder[2].localeCompare(rightOrder[2], "zh-CN");
}

function rosterEntries(team) {
  return [
    ...team.roster.starters.map((id) => ({ id, slot: "首发" })),
    ...team.roster.substitutes.map((id) => ({ id, slot: "替补" })),
    ...(team.roster.coachId ? [{ id: team.roster.coachId, slot: "教练" }] : []),
  ];
}

function isPlayable(team) {
  return team.roster.starters.length === 5
    && new Set(team.roster.starters).size === 5
    && team.roster.starters.every((id) => playerById.has(id));
}

function csvCell(value) {
  const text = value === undefined || value === null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function markdownCell(value) {
  return String(value ?? "").replaceAll("\\", "\\\\").replaceAll("|", "\\|").replaceAll("\r", " ").replaceAll("\n", " ");
}

function sourceTeams(source) {
  return database.teams.filter((team) => !source || team.source === source).sort(compareTeams);
}

function sourcePlayers(source) {
  return database.players.filter((player) => !source || player.source === source);
}

function buildCsv(source) {
  const header = [
    "来源", "排名", "队伍 ID", "战队", "简称", "地区", "参赛状态", "首发人数", "队伍评分", "稳定度",
    "阵容位置", "选手 ID", "游戏 ID", "真实姓名", "国籍", "年龄", "位置", "Rating", "样本状态",
    "数据日期", "Team HLTV ID", "Player HLTV ID",
  ];
  const rows = [header];
  const assignedPlayerIds = new Set();
  for (const team of sourceTeams(source)) {
    const status = isPlayable(team) ? "可参赛" : "阵容不完整/不可参赛";
    const rank = team.source === "professional" ? rankByTeamHltvId.get(team.hltvId) ?? "" : "";
    for (const member of rosterEntries(team)) {
      const player = playerById.get(member.id);
      if (!player) throw new Error(`${team.name} references missing player ${member.id}`);
      assignedPlayerIds.add(player.id);
      rows.push([
        SOURCE_LABELS[team.source], rank, team.id, team.name, team.shortName, team.region, status,
        team.roster.starters.length, team.rating, team.stability, member.slot, player.id, player.nickname,
        player.realName, player.nationality, player.age, player.role, player.rating.toFixed(2),
        player.sampleStatus ?? "", player.updatedAt, team.hltvId ?? "", player.hltvId ?? "",
      ]);
    }
  }
  for (const player of sourcePlayers(source).filter((candidate) => !assignedPlayerIds.has(candidate.id))) {
    rows.push([
      SOURCE_LABELS[player.source], "", "", "自由选手", "", "", "未分配", "", "", "", "自由选手",
      player.id, player.nickname, player.realName, player.nationality, player.age, player.role,
      player.rating.toFixed(2), player.sampleStatus ?? "", player.updatedAt, "", player.hltvId ?? "",
    ]);
  }
  return "\ufeff" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

function buildMarkdown(title, source) {
  const teams = sourceTeams(source);
  const players = sourcePlayers(source);
  const assignedPlayerIds = new Set(teams.flatMap((team) => rosterEntries(team).map((entry) => entry.id)));
  const freePlayers = players.filter((player) => !assignedPlayerIds.has(player.id));
  const completeTeams = teams.filter(isPlayable).length;
  const incompleteTeams = teams.length - completeTeams;
  const lines = [
    `# ${title}`,
    "",
    `- 战队数: ${teams.length}`,
    `- 队员数: ${players.length}`,
    `- 可参赛战队: ${completeTeams}`,
    `- 阵容不完整/不可参赛战队: ${incompleteTeams}`,
    `- 自由选手: ${freePlayers.length}`,
    "",
  ];
  if (!source || source === "professional") {
    lines.push(
      `- HLTV 排名日期: ${professionalSnapshot.sourceDate}`,
      `- HLTV 排名来源: ${professionalSnapshot.rankingUrl}`,
      `- HLTV Rating 来源: ${professionalSnapshot.statsUrl}`,
      "",
    );
  }
  for (const [index, team] of teams.entries()) {
    const rank = team.source === "professional" ? rankByTeamHltvId.get(team.hltvId) : undefined;
    const headingNumber = rank ?? index + 1;
    const status = isPlayable(team) ? "可参赛" : "阵容不完整/不可参赛";
    lines.push(
      `## ${headingNumber}. ${team.name} (${team.shortName})`,
      "",
      `来源: ${SOURCE_LABELS[team.source]}  地区: ${team.region}  队伍评分: ${team.rating}  稳定度: ${team.stability}  状态: ${status}  首发人数: ${team.roster.starters.length}  HLTV ID: ${team.hltvId ?? "-"}`,
      "",
      "| 阵容位置 | 游戏 ID | 真实姓名 | 国籍 | 年龄 | 位置 | Rating | 样本状态 | HLTV ID |",
      "|---|---|---|---|---:|---|---:|---|---:|",
    );
    for (const member of rosterEntries(team)) {
      const player = playerById.get(member.id);
      if (!player) throw new Error(`${team.name} references missing player ${member.id}`);
      lines.push(`| ${member.slot} | ${markdownCell(player.nickname)} | ${markdownCell(player.realName)} | ${markdownCell(player.nationality)} | ${player.age} | ${player.role} | ${player.rating.toFixed(2)} | ${player.sampleStatus ?? ""} | ${player.hltvId ?? ""} |`);
    }
    lines.push("");
  }
  if (freePlayers.length) {
    lines.push("## 自由选手", "", "| 游戏 ID | 真实姓名 | 国籍 | 年龄 | 位置 | Rating | 来源 |", "|---|---|---|---:|---|---:|---|");
    for (const player of freePlayers) {
      lines.push(`| ${markdownCell(player.nickname)} | ${markdownCell(player.realName)} | ${markdownCell(player.nationality)} | ${player.age} | ${player.role} | ${player.rating.toFixed(2)} | ${SOURCE_LABELS[player.source]} |`);
    }
    lines.push("");
  }
  while (lines.at(-1) === "") lines.pop();
  return lines.join("\r\n") + "\r\n";
}

await fs.mkdir(path.resolve(outputDirectory), { recursive: true });
const exports = [
  ["职业战队与队员名单", "professional", "CS2 职业战队与队员名单"],
  ["虚构战队与队员名单", "fictional", "CS2 虚构战队与队员名单"],
  ["自建战队与队员名单", "custom", "CS2 自建战队与队员名单"],
  ["全部战队与队员名单", undefined, "CS2 全部战队与队员名单"],
];
for (const [fileName, source, title] of exports) {
  await fs.writeFile(path.join(path.resolve(outputDirectory), `${fileName}.csv`), buildCsv(source), "utf8");
  await fs.writeFile(path.join(path.resolve(outputDirectory), `${fileName}.md`), buildMarkdown(title, source), "utf8");
}

const summary = {
  teams: database.teams.length,
  players: database.players.length,
  professionalTeams: sourceTeams("professional").length,
  professionalPlayers: sourcePlayers("professional").length,
  playableProfessionalTeams: sourceTeams("professional").filter(isPlayable).length,
  incompleteProfessionalTeams: sourceTeams("professional").filter((team) => !isPlayable(team)).length,
  fictionalTeams: sourceTeams("fictional").length,
  fictionalPlayers: sourcePlayers("fictional").length,
  customTeams: sourceTeams("custom").length,
  customPlayers: sourcePlayers("custom").length,
};
process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
