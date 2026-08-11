import type { StageConfig, TournamentTemplate } from "../domain/types.js";

const swiss = (id: string, name: string, advanceCount: number, entrantCount?: number, inviteCount?: number): StageConfig => ({
  id,
  name,
  type: "swiss",
  advanceCount,
  entrantCount,
  inviteCount,
  winsToAdvance: 3,
  lossesToEliminate: 3,
  avoidRematches: true,
  bestOf: { default: 1, decisive: 3 },
});

const singleElimination = (id: string, name: string, advanceCount = 1): StageConfig => ({
  id,
  name,
  type: "single_elimination",
  advanceCount,
  bestOf: { default: 3, final: 5 },
});

export const BUILT_IN_TEMPLATES: TournamentTemplate[] = [
  { id: "major-32", name: "Major 32 队", description: "三阶段瑞士轮与八强单败淘汰", builtIn: true, teamCount: 32, stages: [swiss("major-s1", "第一阶段", 8, 16, 0), swiss("major-s2", "第二阶段", 8, 16, 8), swiss("major-s3", "第三阶段", 8, 16, 8), singleElimination("major-po", "淘汰赛")] },
  { id: "swiss-16", name: "16 队瑞士轮", builtIn: true, teamCount: 16, stages: [swiss("swiss16", "瑞士轮", 8, 16)] },
  { id: "swiss-32", name: "32 队瑞士轮", builtIn: true, teamCount: 32, stages: [{ ...swiss("swiss32", "瑞士轮", 16, 32), winsToAdvance: 4, lossesToEliminate: 4 }] },
  { id: "single-8", name: "8 队单败淘汰", builtIn: true, teamCount: 8, stages: [singleElimination("single8", "淘汰赛")] },
  { id: "single-16", name: "16 队单败淘汰", builtIn: true, teamCount: 16, stages: [singleElimination("single16", "淘汰赛")] },
  { id: "single-32", name: "32 队单败淘汰", builtIn: true, teamCount: 32, stages: [singleElimination("single32", "淘汰赛")] },
  { id: "double-8", name: "8 队双败淘汰", builtIn: true, teamCount: 8, stages: [{ id: "double8", name: "双败淘汰", type: "double_elimination", advanceCount: 1, bestOf: { default: 3, final: 5 }, grandFinalReset: false }] },
  { id: "double-16", name: "16 队双败淘汰", builtIn: true, teamCount: 16, stages: [{ id: "double16", name: "双败淘汰", type: "double_elimination", advanceCount: 1, bestOf: { default: 3, final: 5 }, grandFinalReset: false }] },
  { id: "league-single-16", name: "16 队单循环联赛", builtIn: true, teamCount: 16, stages: [{ id: "league16", name: "单循环", type: "round_robin", advanceCount: 1, cycles: 1, bestOf: { default: 3 } }] },
  { id: "league-double-8", name: "8 队双循环联赛", builtIn: true, teamCount: 8, stages: [{ id: "league8", name: "双循环", type: "round_robin", advanceCount: 1, cycles: 2, bestOf: { default: 3 } }] },
  { id: "groups-16", name: "16 队分组淘汰赛", builtIn: true, teamCount: 16, stages: [{ id: "groups16", name: "四组循环赛", type: "groups", advanceCount: 8, groupCount: 4, groupFormat: "round_robin", cycles: 1, bestOf: { default: 1 } }, singleElimination("groups16-po", "八强淘汰赛")] },
  { id: "groups-32", name: "32 队分组淘汰赛", builtIn: true, teamCount: 32, stages: [{ id: "groups32", name: "八组循环赛", type: "groups", advanceCount: 16, groupCount: 8, groupFormat: "round_robin", cycles: 1, bestOf: { default: 1 } }, singleElimination("groups32-po", "十六强淘汰赛")] },
];

export const TEMPLATE_BY_ID = Object.fromEntries(BUILT_IN_TEMPLATES.map((template) => [template.id, template]));
