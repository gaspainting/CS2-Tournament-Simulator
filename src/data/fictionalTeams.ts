import { nextRandom, stableId } from "../domain/random.js";
import type { Player, PlayerRole, Team } from "../domain/types.js";

const UPDATED_AT = "2026-08-10";
const ROLES: PlayerRole[] = ["IGL", "AWPer", "Entry", "Rifler", "Support"];
const COLORS = ["#e74c3c", "#2f80ed", "#27ae60", "#f2c94c", "#9b51e0", "#eb5757", "#00a6a6", "#f2994a", "#56ccf2", "#6fcf97"];

const CHINESE_TEAMS = [
  "霜火竞技", "玄甲战队", "长风电子竞技", "赤霄俱乐部", "星河竞技", "破晓战队", "天穹电子竞技", "墨影俱乐部", "昆仑竞技", "凌云战队",
  "苍狼电子竞技", "逐日俱乐部", "青锋竞技", "磐石战队", "龙渊电子竞技", "北斗俱乐部", "烽火竞技", "云海战队", "金乌电子竞技", "雷池俱乐部",
  "千帆竞技", "银翼战队", "山海电子竞技", "无界俱乐部", "曜石竞技",
];
const ENGLISH_TEAMS = [
  "Northwind", "Iron Harbor", "Crimson Vale", "Silent Circuit", "Solar Crown", "Glass Horizon", "Wild Meridian", "Black Summit", "Neon Forge", "Cold Frontier",
  "Rapid Echo", "Silver Current", "Last Beacon", "Zero Gravity", "Bright Ruin", "Royal Static", "Hidden Vector", "Prime Orbit", "Ashen Tide", "Golden Relay",
  "Night Signal", "Open Season", "Steel Bloom", "Final Chapter", "Clear Intent",
];
const CHINESE_SURNAMES = ["林", "周", "沈", "陆", "顾", "江", "叶", "唐", "苏", "秦", "韩", "许", "程", "宋", "魏", "陶", "白", "夏", "邵", "罗"];
const CHINESE_GIVEN = ["寒", "川", "岳", "舟", "辰", "曜", "岚", "澈", "野", "策", "鸣", "锋", "烬", "尘", "凛", "墨", "星", "远", "霄", "衡"];
const ENGLISH_FIRST = ["Alden", "Blake", "Caleb", "Damon", "Elias", "Felix", "Gavin", "Hayden", "Isaac", "Jonah", "Kai", "Liam", "Mason", "Nolan", "Owen", "Parker", "Quinn", "Reid", "Silas", "Theo"];
const ENGLISH_LAST = ["Archer", "Bennett", "Carter", "Dalton", "Ellis", "Foster", "Griffin", "Hayes", "Irwin", "Jensen", "Keller", "Lawson", "Mercer", "Nash", "Ortega", "Pierce", "Reeves", "Sawyer", "Turner", "Walker"];
const ENGLISH_CALLSIGNS = ["Apex", "Bolt", "Cipher", "Drift", "Ember", "Flux", "Ghost", "Havoc", "Ion", "Jolt", "Knox", "Lumen", "Mako", "Nova", "Onyx", "Pulse", "Quest", "Rift", "Shade", "Trace", "Vex", "Warden", "Xeno", "Yield", "Zenith"];

function buildFictionalData(): { players: Player[]; teams: Team[] } {
  const players: Player[] = [];
  const teams: Team[] = [];
  let seed = 20260810;
  const names = [...CHINESE_TEAMS, ...ENGLISH_TEAMS];

  names.forEach((teamName, teamIndex) => {
    const language = teamIndex < CHINESE_TEAMS.length ? "zh" : "en";
    const starterIds: string[] = [];
    for (let slot = 0; slot < 5; slot += 1) {
      let ageRoll: number;
      let ratingRoll: number;
      [ageRoll, seed] = nextRandom(seed);
      [ratingRoll, seed] = nextRandom(seed);
      const sequence = teamIndex * 5 + slot;
      const nickname = language === "zh"
        ? `${CHINESE_SURNAMES[(sequence + teamIndex) % CHINESE_SURNAMES.length]}${CHINESE_GIVEN[(sequence * 3 + slot) % CHINESE_GIVEN.length]}`
        : `${ENGLISH_CALLSIGNS[sequence % ENGLISH_CALLSIGNS.length]}${String(Math.floor(sequence / ENGLISH_CALLSIGNS.length) + 1)}`;
      const realName = language === "zh"
        ? `${CHINESE_SURNAMES[(sequence * 7) % CHINESE_SURNAMES.length]}${CHINESE_GIVEN[(sequence * 5) % CHINESE_GIVEN.length]}${CHINESE_GIVEN[(sequence * 5 + 7) % CHINESE_GIVEN.length]}`
        : `${ENGLISH_FIRST[sequence % ENGLISH_FIRST.length]} ${ENGLISH_LAST[(sequence * 3) % ENGLISH_LAST.length]}`;
      const id = stableId("fictional-player", `${teamName}-${slot}`);
      starterIds.push(id);
      players.push({
        id,
        nickname,
        realName,
        nationality: language === "zh" ? "中国" : ["United States", "Canada", "United Kingdom", "Australia", "Sweden"][sequence % 5],
        age: 17 + Math.floor(ageRoll * 15),
        role: ROLES[slot],
        rating: Number((0.88 + ratingRoll * 0.36).toFixed(2)),
        source: "fictional",
        updatedAt: UPDATED_AT,
      });
    }
    const average = players.filter((player) => starterIds.includes(player.id)).reduce((sum, player) => sum + player.rating, 0) / 5;
    teams.push({
      id: stableId("fictional-team", teamName),
      name: teamName,
      shortName: language === "zh" ? teamName.slice(0, 2) : teamName.split(" ").map((part) => part[0]).join("").slice(0, 4).toUpperCase(),
      region: language === "zh" ? "Asia" : ["Europe", "Americas", "Oceania"][teamIndex % 3],
      color: COLORS[teamIndex % COLORS.length],
      source: "fictional",
      language,
      roster: { starters: starterIds, substitutes: [] },
      rating: Math.round(900 + average * 650),
      stability: Number((0.48 + (teamIndex % 8) * 0.055).toFixed(2)),
      updatedAt: UPDATED_AT,
    });
  });
  return { players, teams };
}

const fictionalData = buildFictionalData();
export const FICTIONAL_PLAYERS = fictionalData.players;
export const FICTIONAL_TEAMS = fictionalData.teams;

export function generateFictionalTeams(seed: number, count: number, language: "zh" | "en"): { players: Player[]; teams: Team[] } {
  const players: Player[] = [];
  const teams: Team[] = [];
  const sourceNames = language === "zh" ? CHINESE_TEAMS : ENGLISH_TEAMS;
  let nextSeed = seed >>> 0;
  for (let teamIndex = 0; teamIndex < count; teamIndex += 1) {
    const baseName = sourceNames[(teamIndex + seed) % sourceNames.length];
    const teamName = language === "zh" ? `${baseName}${teamIndex >= sourceNames.length ? "分队" : ""}` : `${baseName}${teamIndex >= sourceNames.length ? ` Squad ${teamIndex + 1}` : ""}`;
    const starterIds: string[] = [];
    for (let slot = 0; slot < 5; slot += 1) {
      let ageRoll: number;
      let ratingRoll: number;
      [ageRoll, nextSeed] = nextRandom(nextSeed);
      [ratingRoll, nextSeed] = nextRandom(nextSeed);
      const sequence = teamIndex * 5 + slot + seed;
      const nickname = language === "zh"
        ? `${CHINESE_SURNAMES[sequence % CHINESE_SURNAMES.length]}${CHINESE_GIVEN[(sequence * 3) % CHINESE_GIVEN.length]}`
        : `${ENGLISH_CALLSIGNS[sequence % ENGLISH_CALLSIGNS.length]}${sequence % 97}`;
      const id = stableId("generated-player", `${seed}-${teamIndex}-${slot}-${nickname}`);
      starterIds.push(id);
      players.push({
        id,
        nickname,
        realName: language === "zh"
          ? `${CHINESE_SURNAMES[(sequence * 5) % CHINESE_SURNAMES.length]}${CHINESE_GIVEN[(sequence * 7) % CHINESE_GIVEN.length]}${CHINESE_GIVEN[(sequence * 11) % CHINESE_GIVEN.length]}`
          : `${ENGLISH_FIRST[sequence % ENGLISH_FIRST.length]} ${ENGLISH_LAST[(sequence * 3) % ENGLISH_LAST.length]}`,
        nationality: language === "zh" ? "中国" : ["United States", "Canada", "United Kingdom", "Australia", "Sweden"][sequence % 5],
        age: 17 + Math.floor(ageRoll * 15),
        role: ROLES[slot],
        rating: Number((0.88 + ratingRoll * 0.36).toFixed(2)),
        source: "fictional",
        updatedAt: new Date().toISOString().slice(0, 10),
      });
    }
    const average = players.filter((player) => starterIds.includes(player.id)).reduce((sum, player) => sum + player.rating, 0) / 5;
    teams.push({
      id: stableId("generated-team", `${seed}-${teamIndex}-${teamName}`),
      name: teamName,
      shortName: language === "zh" ? teamName.slice(0, 2) : teamName.split(" ").map((part) => part[0]).join("").slice(0, 4).toUpperCase(),
      region: language === "zh" ? "Asia" : ["Europe", "Americas", "Oceania"][teamIndex % 3],
      color: COLORS[(teamIndex + seed) % COLORS.length],
      source: "fictional",
      language,
      roster: { starters: starterIds, substitutes: [] },
      rating: Math.round(900 + average * 650),
      stability: Number((0.5 + (teamIndex % 7) * 0.05).toFixed(2)),
      updatedAt: new Date().toISOString().slice(0, 10),
    });
  }
  return { players, teams };
}
