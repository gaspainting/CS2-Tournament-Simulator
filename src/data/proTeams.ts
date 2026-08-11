import type { Player, Team } from "../domain/types.js";
import { PROFESSIONAL_SNAPSHOT, PROFESSIONAL_SNAPSHOT_INFO } from "./professionalSnapshot.js";

export const PROFESSIONAL_SNAPSHOT_DATE = PROFESSIONAL_SNAPSHOT.sourceDate;
export { PROFESSIONAL_SNAPSHOT_INFO };

function deriveShortName(name: string, hltvId: number): string {
  const words = name.match(/[A-Za-z0-9]+/g) ?? [];
  if (words.length > 1) return words.map((word) => word[0]).join("").slice(0, 5).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 5).toUpperCase();
  return `T${hltvId}`.slice(0, 5);
}

function hueToRgb(p: number, q: number, value: number): number {
  let hue = value;
  if (hue < 0) hue += 1;
  if (hue > 1) hue -= 1;
  if (hue < 1 / 6) return p + (q - p) * 6 * hue;
  if (hue < 1 / 2) return q;
  if (hue < 2 / 3) return p + (q - p) * (2 / 3 - hue) * 6;
  return p;
}

function deterministicTeamColor(hltvId: number): string {
  const hue = ((hltvId * 137.508) % 360) / 360;
  const saturation = 0.58;
  const lightness = 0.48;
  const q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  const channels = [hueToRgb(p, q, hue + 1 / 3), hueToRgb(p, q, hue), hueToRgb(p, q, hue - 1 / 3)];
  return `#${channels.map((channel) => Math.round(channel * 255).toString(16).padStart(2, "0")).join("")}`;
}

export const PROFESSIONAL_PLAYERS: Player[] = PROFESSIONAL_SNAPSHOT.players.map((player) => ({
  id: `hltv-player-${player.hltvId}`,
  nickname: player.nickname,
  realName: player.realName,
  nationality: player.nationality,
  age: 24,
  role: "Unset",
  rating: player.rating,
  source: "professional",
  hltvId: player.hltvId,
  sampleStatus: player.sampleStatus,
  updatedAt: PROFESSIONAL_SNAPSHOT_DATE,
}));

const playerByHltvId = new Map(PROFESSIONAL_PLAYERS.map((player) => [player.hltvId, player]));

export const PROFESSIONAL_TEAMS: Team[] = PROFESSIONAL_SNAPSHOT.teams.map((team) => {
  const rosterPlayers = team.playerHltvIds.map((hltvId) => {
    const player = playerByHltvId.get(hltvId);
    if (!player) throw new Error(`Professional snapshot team ${team.hltvId} references missing player ${hltvId}`);
    return player;
  });
  const averageRating = rosterPlayers.reduce((sum, player) => sum + player.rating, 0) / rosterPlayers.length;
  return {
    id: `hltv-team-${team.hltvId}`,
    name: team.name,
    shortName: deriveShortName(team.name, team.hltvId),
    region: "International",
    color: deterministicTeamColor(team.hltvId),
    source: "professional",
    language: "en",
    roster: { starters: rosterPlayers.map((player) => player.id), substitutes: [] },
    rating: Math.round(1000 + averageRating * 600),
    stability: 0.72,
    hltvId: team.hltvId,
    updatedAt: PROFESSIONAL_SNAPSHOT_DATE,
  };
});
