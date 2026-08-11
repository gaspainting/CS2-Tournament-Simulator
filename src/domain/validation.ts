import type { BestOf, NameLanguage, Player, StageConfig, Team, TournamentTemplate } from "./types.js";
import { maximumSwissQualifiers } from "./stageConfig.js";

const CJK_PATTERN = /[\u3400-\u9fff]/u;
const LATIN_PATTERN = /[A-Za-z]/;
const PLAYER_ROLES = new Set(["IGL", "AWPer", "Rifler", "Entry", "Support", "Coach", "Unset"]);
const DATA_SOURCES = new Set(["professional", "custom", "fictional"]);

export function detectNameLanguage(value: string): NameLanguage {
  const hasChinese = CJK_PATTERN.test(value);
  const hasLatin = LATIN_PATTERN.test(value);
  if (hasChinese && hasLatin) return "mixed";
  if (hasChinese) return "zh";
  if (hasLatin) return "en";
  return "none";
}

export function validatePlayer(player: Player): string[] {
  const errors: string[] = [];
  if (!player || typeof player !== "object") return ["选手格式无效"];
  if (typeof player.id !== "string" || !player.id.trim()) errors.push("选手 ID 不能为空");
  if (typeof player.nickname !== "string" || !player.nickname.trim()) errors.push("选手 nickname（游戏 ID）不能为空");
  if (typeof player.realName !== "string" || !player.realName.trim()) errors.push("选手 realName（真实姓名）不能为空");
  if (typeof player.nationality !== "string" || !player.nationality.trim()) errors.push("选手 nationality（国籍）不能为空");
  if (!Number.isInteger(player.age) || player.age < 16 || player.age > 45) errors.push("选手 age（年龄）必须是 16 到 45 之间的整数");
  if (!PLAYER_ROLES.has(player.role)) errors.push("选手 role（位置）无效");
  if (!Number.isFinite(player.rating) || player.rating < 0.5 || player.rating > 2) errors.push("选手 rating（评分）必须是 0.5 到 2 之间的有限数字");
  if (!DATA_SOURCES.has(player.source)) errors.push("选手 source 无效");
  if (typeof player.updatedAt !== "string" || !player.updatedAt.trim()) errors.push("选手 updatedAt 不能为空");
  if (player.hltvId !== undefined && (!Number.isInteger(player.hltvId) || player.hltvId <= 0)) errors.push("选手 hltvId 无效");
  if (player.sampleStatus !== undefined && !["current", "fallback", "insufficient"].includes(player.sampleStatus)) errors.push("选手 sampleStatus 无效");
  return errors;
}

export function validateRoster(team: Team, players: Player[]): string[] {
  const errors: string[] = [];
  const { starters, substitutes, coachId } = team.roster;
  const known = new Set(players.map((player) => player.id));
  const playerById = new Map(players.map((player) => [player.id, player]));
  if (starters.length !== 5) errors.push("首发阵容必须恰好包含 5 名选手");
  if (new Set(starters).size !== starters.length) errors.push("首发阵容中存在重复选手");
  if (substitutes.length > 2) errors.push("替补阵容最多包含 2 名选手");
  if (new Set(substitutes).size !== substitutes.length) errors.push("替补阵容中存在重复选手");
  if (substitutes.some((id) => starters.includes(id))) errors.push("同一选手不能同时担任首发和替补");
  if (coachId && (starters.includes(coachId) || substitutes.includes(coachId))) errors.push("教练不能同时进入比赛阵容");
  if (starters.some((id) => playerById.get(id)?.role === "Coach")) errors.push("首发成员不能使用 Coach 位置");
  if (substitutes.some((id) => playerById.get(id)?.role === "Coach")) errors.push("替补成员不能使用 Coach 位置");
  if (coachId && playerById.get(coachId) && playerById.get(coachId)?.role !== "Coach") errors.push("教练成员的 role 必须是 Coach");
  for (const id of [...starters, ...substitutes, ...(coachId ? [coachId] : [])]) {
    if (!known.has(id)) errors.push(`阵容引用了不存在的成员：${id}`);
  }
  return errors;
}

export function validateSeriesScore(bestOf: BestOf, scoreA: number, scoreB: number): string | null {
  if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB) || scoreA < 0 || scoreB < 0) return "比分必须是非负整数";
  if (scoreA === scoreB) return "比赛不能以平局结束";
  const winner = Math.max(scoreA, scoreB);
  const loser = Math.min(scoreA, scoreB);
  if (bestOf === 1) return winner >= 13 ? null : "BO1 胜方至少需要 13 分";
  const required = bestOf === 3 ? 2 : 3;
  if (winner !== required || loser >= required) return `BO${bestOf} 的合法系列赛比分必须由胜方取得 ${required} 张地图`;
  return null;
}

export function validateTemplate(template: TournamentTemplate): string[] {
  const errors: string[] = [];
  if (!template || typeof template !== "object") return ["赛事模板格式无效"];
  const candidate = template as Partial<TournamentTemplate>;
  if (typeof candidate.name !== "string" || !candidate.name.trim()) errors.push("赛事模板需要名称");
  if (!Number.isInteger(candidate.teamCount) || (candidate.teamCount as number) < 4 || (candidate.teamCount as number) > 64 || (candidate.teamCount as number) % 2 !== 0) {
    errors.push("参赛队伍数必须是 4 到 64 之间的偶数");
  }
  if (!Array.isArray(candidate.stages)) return [...errors, "赛事模板阶段配置格式无效"];
  const stages = candidate.stages;
  if (stages.length === 0) errors.push("赛事模板至少需要一个阶段");
  const teamCount = Number.isInteger(candidate.teamCount) ? candidate.teamCount as number : 0;
  let usedTeamCount = 0;
  stages.forEach((rawStage, index) => {
    const label = `第 ${index + 1} 阶段`;
    if (!rawStage || typeof rawStage !== "object") {
      errors.push(`${label}配置格式无效`);
      return;
    }
    const partialStage = rawStage as Partial<StageConfig>;
    const validType = ["swiss", "single_elimination", "double_elimination", "round_robin", "groups"].includes(partialStage.type ?? "");
    const validBestOf = partialStage.bestOf
      && (partialStage.bestOf.default === 1 || partialStage.bestOf.default === 3 || partialStage.bestOf.default === 5);
    if (typeof partialStage.id !== "string"
      || typeof partialStage.name !== "string"
      || !validType
      || !Number.isInteger(partialStage.advanceCount)
      || !validBestOf) {
      errors.push(`${label}配置格式无效`);
      return;
    }
    const stage = partialStage as StageConfig;
    const inviteCount = stage.inviteCount ?? 0;
    const previousStage = index > 0 && stages[index - 1] && typeof stages[index - 1] === "object"
      ? stages[index - 1] as Partial<StageConfig>
      : undefined;
    const previousAdvanceCount = Number.isInteger(previousStage?.advanceCount) ? previousStage?.advanceCount as number : 0;
    const expectedEntrants = index === 0
      ? teamCount
      : previousAdvanceCount + inviteCount;
    const effectiveEntrants = stage.entrantCount ?? expectedEntrants;
    if (!stage.name.trim()) errors.push(`${label}需要名称`);
    if (stage.advanceCount < 1 || stage.advanceCount > teamCount) errors.push(`${label}晋级数量无效`);
    if (stage.entrantCount !== undefined && (!Number.isInteger(stage.entrantCount) || stage.entrantCount < 2 || stage.entrantCount > teamCount)) {
      errors.push(`${label}参赛队数必须是 2 到 ${teamCount} 之间的整数`);
    }
    if (stage.inviteCount !== undefined && (!Number.isInteger(stage.inviteCount) || stage.inviteCount < 0 || stage.inviteCount > teamCount)) {
      errors.push(`${label}邀请名额必须是 0 到 ${teamCount} 之间的整数`);
    }
    if (stage.advanceCount > effectiveEntrants) errors.push(`${label}晋级数量不能超过阶段参赛队数`);
    if (stage.entrantCount !== undefined && (stage.inviteCount ?? 0) > stage.entrantCount) errors.push(`${label}邀请名额不能超过阶段参赛队数`);
    if (index === 0 && inviteCount !== 0) errors.push(`${label}邀请名额必须为 0`);
    if (index > 0 && stage.entrantCount !== undefined && stage.entrantCount !== expectedEntrants) {
      errors.push(`${label}参赛队数必须与上一阶段晋级队伍和邀请名额之和相等`);
    }
    if (index === 0) {
      usedTeamCount = effectiveEntrants;
    } else if (Number.isInteger(inviteCount) && inviteCount >= 0) {
      if (usedTeamCount + inviteCount > teamCount) errors.push(`${label}邀请名额超过剩余未参赛队伍`);
      usedTeamCount += inviteCount;
    }
    if (stage.type === "swiss") {
      if (!stage.winsToAdvance || !stage.lossesToEliminate) errors.push(`${label}缺少瑞士轮胜负阈值`);
      if (effectiveEntrants % 2 !== 0) errors.push(`${label}瑞士轮参赛队数必须为偶数`);
      if (stage.winsToAdvance && stage.lossesToEliminate) {
        if (effectiveEntrants < stage.winsToAdvance + stage.lossesToEliminate) {
          errors.push(`${label}瑞士轮参赛队数不能少于晋级胜场与淘汰负场之和`);
        }
        const maximumQualifiers = maximumSwissQualifiers(effectiveEntrants, stage.winsToAdvance, stage.lossesToEliminate);
        if (stage.advanceCount > maximumQualifiers) errors.push(`${label}瑞士轮最多只能晋级 ${maximumQualifiers} 支队伍`);
      }
    }
    if (stage.type === "round_robin" && stage.cycles !== 1 && stage.cycles !== 2) errors.push(`${label}循环次数必须为 1 或 2`);
    if (stage.type === "double_elimination" && (effectiveEntrants < 4 || (effectiveEntrants & (effectiveEntrants - 1)) !== 0)) {
      errors.push(`${label}双败淘汰参赛队数必须是 2 的幂（4、8、16、32、64）`);
    }
    if (stage.type === "groups") {
      const groupCount = stage.groupCount ?? 0;
      if (!Number.isInteger(groupCount) || groupCount < 2) {
        errors.push(`${label}至少需要两个小组`);
      } else if (effectiveEntrants % groupCount !== 0) {
        errors.push(`${label}${effectiveEntrants} 支队伍无法平均分配到 ${groupCount} 个小组`);
      } else {
        const groupSize = effectiveEntrants / groupCount;
        if (groupSize < 2) errors.push(`${label}每个小组至少需要 2 支队伍`);
        if (stage.advanceCount % groupCount !== 0) errors.push(`${label}晋级数量必须能平均分配到每个小组`);
        if (stage.groupFormat === "swiss") {
          const wins = stage.winsToAdvance ?? Math.max(2, Math.ceil(Math.log2(groupSize)));
          const losses = stage.lossesToEliminate ?? Math.max(2, Math.ceil(Math.log2(groupSize)));
          if (groupSize % 2 !== 0) errors.push(`${label}瑞士轮小组必须包含偶数支队伍`);
          if (groupSize < wins + losses) errors.push(`${label}瑞士轮小组队数不能少于晋级胜场与淘汰负场之和`);
          const perGroup = stage.advanceCount / groupCount;
          const maximumQualifiers = maximumSwissQualifiers(groupSize, wins, losses);
          if (Number.isInteger(perGroup) && perGroup > maximumQualifiers) {
            errors.push(`${label}瑞士轮每组最多只能晋级 ${maximumQualifiers} 支队伍`);
          }
          if (stage.cycles !== undefined) errors.push(`${label}瑞士轮小组不能设置循环次数`);
        } else if (stage.cycles !== 1 && stage.cycles !== 2) {
          errors.push(`${label}循环次数必须为 1 或 2`);
        }
      }
    }
  });
  return errors;
}
