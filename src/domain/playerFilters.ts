import type { Player, Team } from "./types.js";

export type PlayerFilters = {
  source: "all" | Player["source"];
  role: "all" | Player["role"];
  teamId: "all" | "unassigned" | string;
  query: string;
  minRating: number;
  maxRating: number;
};

export function filterPlayers(players: Player[], teams: Team[], filters: PlayerFilters): Player[] {
  const teamByPlayer = new Map<string, string>();
  const teamNameById = new Map(teams.map((team) => [team.id, team.name]));
  for (const team of teams) {
    const memberIds = [...team.roster.starters, ...team.roster.substitutes, ...(team.roster.coachId ? [team.roster.coachId] : [])];
    for (const playerId of memberIds) teamByPlayer.set(playerId, team.id);
  }
  const query = filters.query.trim().toLowerCase();

  return players.filter((player) => {
    const playerTeamId = teamByPlayer.get(player.id);
    if (filters.source !== "all" && player.source !== filters.source) return false;
    if (filters.role !== "all" && player.role !== filters.role) return false;
    if (filters.teamId === "unassigned" && playerTeamId) return false;
    if (filters.teamId !== "all" && filters.teamId !== "unassigned" && playerTeamId !== filters.teamId) return false;
    if (player.rating < filters.minRating || player.rating > filters.maxRating) return false;
    if (!query) return true;
    const teamName = playerTeamId ? teamNameById.get(playerTeamId) ?? "" : "";
    return `${player.nickname} ${player.realName} ${player.nationality} ${teamName}`.toLowerCase().includes(query);
  });
}
