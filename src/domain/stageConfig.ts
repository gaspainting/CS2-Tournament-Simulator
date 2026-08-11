import type { StageConfig, StageType } from "./types.js";

function clampInteger(value: number | undefined, minimum: number, maximum: number, fallback: number): number {
  if (!Number.isInteger(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, value as number));
}

export function qualifiersPerGroup(stage: StageConfig): number {
  const groupCount = stage.groupCount ?? 2;
  return Math.max(1, Math.floor(stage.advanceCount / groupCount));
}

export function maximumSwissQualifiers(teamCount: number, winsToAdvance: number, lossesToEliminate: number): number {
  if (teamCount < 1 || winsToAdvance < 1 || lossesToEliminate < 1) return 0;
  return Math.floor(teamCount * lossesToEliminate / (winsToAdvance + lossesToEliminate));
}

function nearestValidGroupCount(teamCount: number, requested: number | undefined): number {
  const candidates = Array.from({ length: Math.max(0, Math.floor(teamCount / 2) - 1) }, (_, index) => index + 2)
    .filter((count) => teamCount % count === 0);
  if (!candidates.length) return 2;
  const target = Number.isInteger(requested) ? requested as number : candidates[0];
  return candidates.reduce((nearest, count) => (
    Math.abs(count - target) < Math.abs(nearest - target) ? count : nearest
  ));
}

export function normalizeStageConfig(stage: StageConfig, type: StageType, teamCount: number): StageConfig {
  const templateTeamCount = Math.max(1, teamCount);
  const entrantCount = stage.entrantCount === undefined
    ? undefined
    : clampInteger(stage.entrantCount, 2, templateTeamCount, templateTeamCount);
  const maximumTeams = entrantCount ?? templateTeamCount;
  const inviteCount = stage.inviteCount === undefined
    ? undefined
    : clampInteger(stage.inviteCount, 0, maximumTeams, 0);
  const common = {
    id: stage.id,
    name: stage.name,
    type,
    advanceCount: clampInteger(stage.advanceCount, 1, maximumTeams, 1),
    entrantCount,
    inviteCount,
  };

  if (type === "swiss") {
    return {
      ...common,
      bestOf: { default: stage.bestOf.default, decisive: stage.bestOf.decisive ?? 3 },
      winsToAdvance: clampInteger(stage.winsToAdvance, 1, maximumTeams, 3),
      lossesToEliminate: clampInteger(stage.lossesToEliminate, 1, maximumTeams, 3),
      avoidRematches: stage.avoidRematches ?? true,
    };
  }

  if (type === "round_robin") {
    return {
      ...common,
      bestOf: { default: stage.bestOf.default },
      cycles: stage.cycles === 2 ? 2 : 1,
    };
  }

  if (type === "groups") {
    const groupCount = nearestValidGroupCount(maximumTeams, stage.groupCount);
    const maximumQualifiers = Math.max(1, Math.floor(maximumTeams / groupCount));
    const groupFormat = stage.groupFormat ?? "round_robin";
    const perGroup = clampInteger(
      stage.type === "groups" ? qualifiersPerGroup(stage) : undefined,
      1,
      maximumQualifiers,
      1,
    );
    return {
      ...common,
      advanceCount: groupCount * perGroup,
      bestOf: {
        default: stage.bestOf.default,
        ...(groupFormat === "swiss" ? { decisive: stage.bestOf.decisive ?? 3 } : {}),
      },
      groupCount,
      groupFormat,
      ...(groupFormat === "round_robin" ? { cycles: stage.cycles === 2 ? 2 as const : 1 as const } : {}),
    };
  }

  const elimination = {
    ...common,
    bestOf: { default: stage.bestOf.default, final: stage.bestOf.final ?? 5 },
    thirdPlace: stage.thirdPlace ?? false,
  };
  return type === "double_elimination"
    ? { ...elimination, grandFinalReset: stage.grandFinalReset ?? false }
    : elimination;
}

export function createStageConfig(id: string, type: StageType, teamCount: number): StageConfig {
  return normalizeStageConfig({
    id,
    name: "新阶段",
    type: "single_elimination",
    advanceCount: 1,
    bestOf: { default: 3, final: 5 },
  }, type, teamCount);
}
