import { stableId } from "../domain/random.js";
import type { Player, PlayerRole, Team } from "../domain/types.js";

export const PROFESSIONAL_SNAPSHOT_DATE = "2026-08-10";

type SeedPlayer = [nickname: string, realName: string, nationality: string, role: PlayerRole, rating: number, hltvId?: number];
type SeedTeam = { name: string; shortName: string; region: string; color: string; hltvId: number; players: SeedPlayer[] };

const seeds: SeedTeam[] = [
  { name: "Team Vitality", shortName: "VIT", region: "Europe", color: "#f5c400", hltvId: 9565, players: [["apEX", "Dan Madesclaire", "France", "IGL", 1.01, 7322], ["ZywOo", "Mathieu Herbaut", "France", "AWPer", 1.32, 11893], ["flameZ", "Shahar Shushan", "Israel", "Entry", 1.12, 16693], ["ropz", "Robin Kool", "Estonia", "Rifler", 1.18, 11816], ["mezii", "William Merriman", "United Kingdom", "Support", 1.08, 18462]] },
  { name: "Team Spirit", shortName: "TS", region: "Europe", color: "#49b7e8", hltvId: 7020, players: [["chopper", "Leonid Vishnyakov", "Russia", "IGL", 0.98, 7716], ["sh1ro", "Dmitry Sokolov", "Russia", "AWPer", 1.22, 16920], ["donk", "Danil Kryshkovets", "Russia", "Entry", 1.25, 21167], ["zont1x", "Miroslav Plakhotia", "Ukraine", "Rifler", 1.08, 20423], ["magixx", "Boris Vorobiev", "Russia", "Support", 1.05, 18317]] },
  { name: "Team Falcons", shortName: "FLC", region: "Europe", color: "#d8b96b", hltvId: 11283, players: [["kyxsan", "Damjan Stoilkovski", "North Macedonia", "IGL", 1.02, 19600], ["m0NESY", "Ilya Osipov", "Russia", "AWPer", 1.20, 19230], ["NiKo", "Nikola Kovac", "Bosnia and Herzegovina", "Entry", 1.14, 3741], ["kyousuke", "Maksim Lukin", "Russia", "Rifler", 1.17, 24177], ["TeSeS", "Rene Madsen", "Denmark", "Support", 1.08, 12018]] },
  { name: "Natus Vincere", shortName: "NAVI", region: "Europe", color: "#ffdb18", hltvId: 4608, players: [["Aleksib", "Aleksi Virolainen", "Finland", "IGL", 1.02, 9816], ["w0nderful", "Ihor Zhdanov", "Ukraine", "AWPer", 1.15, 20127], ["jL", "Justinas Lekavicius", "Lithuania", "Entry", 1.13, 19206], ["b1t", "Valeriy Vakhovskiy", "Ukraine", "Rifler", 1.14, 18987], ["iM", "Mihai Ivan", "Romania", "Support", 1.09, 14759]] },
  { name: "MOUZ", shortName: "MOUZ", region: "Europe", color: "#df1f35", hltvId: 4494, players: [["Brollan", "Ludvig Brolin", "Sweden", "IGL", 1.10, 13666], ["torzsi", "Adam Torzsas", "Hungary", "AWPer", 1.13, 18072], ["Spinx", "Lotan Giladi", "Israel", "Entry", 1.14], ["Jimpphat", "Jimi Salo", "Finland", "Rifler", 1.12, 18850], ["xertioN", "Dorian Berman", "Israel", "Support", 1.11, 20312]] },
  { name: "FURIA", shortName: "FUR", region: "Americas", color: "#f0c808", hltvId: 8297, players: [["FalleN", "Gabriel Toledo", "Brazil", "IGL", 1.05, 2023], ["molodoy", "Danil Golubenko", "Kazakhstan", "AWPer", 1.18, 24144], ["YEKINDAR", "Mareks Galinskis", "Latvia", "Entry", 1.10, 13915], ["KSCERATO", "Kaike Cerato", "Brazil", "Rifler", 1.17, 15631], ["yuurih", "Yuri Santos", "Brazil", "Support", 1.10, 12553]] },
  { name: "The MongolZ", shortName: "MGLZ", region: "Asia", color: "#d91f2b", hltvId: 6248, players: [["bLitz", "Garidmagnai Byambasuren", "Mongolia", "IGL", 1.10, 17372], ["910", "Usukhbayar Banzragch", "Mongolia", "AWPer", 1.13, 21809], ["Senzu", "Azbayar Munkhbold", "Mongolia", "Entry", 1.15, 21118], ["Techno", "Sodbayar Munkhbold", "Mongolia", "Rifler", 1.09, 20990], ["mzinho", "Ayush Batbold", "Mongolia", "Support", 1.07, 20989]] },
  { name: "Aurora Gaming", shortName: "AUR", region: "Europe", color: "#6f55ff", hltvId: 11861, players: [["MAJ3R", "Engin Kupeli", "Türkiye", "IGL", 1.01, 692], ["woxic", "Ozgur Eker", "Türkiye", "AWPer", 1.12, 8574], ["XANTARES", "Ismailcan Dortkardes", "Türkiye", "Entry", 1.16, 7938], ["Wicadia", "Ali Haydar Yalcin", "Türkiye", "Rifler", 1.10, 19422], ["jottAAA", "Samet Koklu", "Türkiye", "Support", 1.08, 22294]] },
  { name: "G2 Esports", shortName: "G2", region: "Europe", color: "#e5e7eb", hltvId: 5995, players: [["huNter-", "Nemanja Kovac", "Bosnia and Herzegovina", "IGL", 1.07, 3972], ["SunPayus", "Alvaro Garcia", "Spain", "AWPer", 1.13, 19164], ["malbsMd", "Mario Samayoa", "Guatemala", "Entry", 1.12, 21445], ["MATYS", "Matyas Oravec", "Slovakia", "Rifler", 1.12, 19610], ["HeavyGod", "Nikita Martynenko", "Israel", "Support", 1.11, 20447]] },
  { name: "Astralis", shortName: "AST", region: "Europe", color: "#e31b23", hltvId: 6665, players: [["HooXi", "Rasmus Nielsen", "Denmark", "IGL", 0.97, 10096], ["device", "Nicolai Reedtz", "Denmark", "AWPer", 1.15, 7592], ["stavn", "Martin Lund", "Denmark", "Entry", 1.11, 10994], ["jabbi", "Jakob Nygaard", "Denmark", "Rifler", 1.11, 17956], ["Staehr", "Victor Staehr", "Denmark", "Support", 1.08, 20304]] },
  { name: "Team Liquid", shortName: "TL", region: "Americas", color: "#4668af", hltvId: 5973, players: [["Twistzz", "Russel Van Dulken", "Canada", "IGL", 1.11, 10394], ["ultimate", "Roland Tomkowiak", "Poland", "AWPer", 1.09, 19258], ["NertZ", "Guy Iluz", "Israel", "Entry", 1.13, 15739], ["NAF", "Keith Markovic", "Canada", "Rifler", 1.14, 8520], ["siuhy", "Kamil Szkaradek", "Poland", "Support", 1.03, 16820]] },
  { name: "FaZe Clan", shortName: "FAZE", region: "Europe", color: "#d71920", hltvId: 6667, players: [["karrigan", "Finn Andersen", "Denmark", "IGL", 0.94, 429], ["broky", "Helvijs Saukants", "Latvia", "AWPer", 1.11, 18053], ["rain", "Havard Nygaard", "Norway", "Entry", 1.06, 8183], ["frozen", "David Cernansky", "Slovakia", "Rifler", 1.17, 9960], ["jcobbb", "Jakub Pietruszewski", "Poland", "Support", 1.06, 21938]] },
  { name: "TYLOO", shortName: "TYL", region: "Asia", color: "#e11d2e", hltvId: 4863, players: [["Attacker", "YuanZhang Sheng", "China", "IGL", 1.04, 8552], ["Jee", "Yi Yang", "China", "AWPer", 1.08, 18221], ["Mercury", "BingYuan Wang", "China", "Entry", 1.09, 18145], ["JamYoung", "Yi Yang", "China", "Rifler", 1.12, 19692], ["Moseyuh", "Chen Qianhao", "China", "Support", 1.10, 20090]] },
  { name: "Lynn Vision Gaming", shortName: "LVG", region: "Asia", color: "#36a6d8", hltvId: 8840, players: [["westmelon", "Zhe Niu", "China", "IGL", 1.06, 17427], ["z4kr", "Dehao Mao", "China", "AWPer", 1.09, 17932], ["EmiliaQAQ", "Wenyu Tang", "China", "Entry", 1.07, 21692], ["Starry", "Lizhi Ye", "China", "Rifler", 1.12, 17645], ["flying", "Peiqi Song", "China", "Support", 1.05, 20580]] },
  { name: "BIG", shortName: "BIG", region: "Europe", color: "#c9152d", hltvId: 7532, players: [["tabseN", "Johannes Wodarz", "Germany", "IGL", 1.04, 5794], ["syrsoN", "Florian Rische", "Germany", "AWPer", 1.11, 7266], ["prosus", "David Hesse", "Germany", "Entry", 1.04, 19148], ["Krimbo", "Karim Moussa", "Germany", "Rifler", 1.12, 19899], ["JDC", "Jon de Castro", "Germany", "Support", 1.07, 19198]] },
  { name: "paiN Gaming", shortName: "PNG", region: "Americas", color: "#6a43a5", hltvId: 4773, players: [["biguzera", "Rodrigo Bittencourt", "Brazil", "IGL", 1.12, 18141], ["nqz", "Lucas Soares", "Brazil", "AWPer", 1.10, 19630], ["snow", "Joao Vinicius", "Brazil", "Entry", 1.09, 22047], ["dav1deuS", "David Tapia", "Chile", "Rifler", 1.08, 17798], ["kauez", "Kaue Kaschuk", "Brazil", "Support", 1.06, 20698]] },
];

function professionalPlayerId(teamName: string, player: SeedPlayer): string {
  return player[5] ? `hltv-player-${player[5]}` : stableId("pro-player", `${teamName}-${player[0]}`);
}

export const PROFESSIONAL_PLAYERS: Player[] = seeds.flatMap((team) => team.players.map(([nickname, realName, nationality, role, rating, hltvId]) => ({
  id: hltvId ? `hltv-player-${hltvId}` : stableId("pro-player", `${team.name}-${nickname}`),
  nickname,
  realName,
  nationality,
  age: 24,
  role,
  rating,
  source: "professional" as const,
  hltvId,
  sampleStatus: "current" as const,
  updatedAt: PROFESSIONAL_SNAPSHOT_DATE,
})));

export const PROFESSIONAL_TEAMS: Team[] = seeds.map((team, index) => ({
  id: `hltv-team-${team.hltvId}`,
  name: team.name,
  shortName: team.shortName,
  region: team.region,
  color: team.color,
  source: "professional",
  language: "en",
  roster: { starters: team.players.map((player) => professionalPlayerId(team.name, player)), substitutes: [] },
  rating: Math.round(1120 + team.players.reduce((sum, player) => sum + player[4], 0) * 140),
  stability: Number((0.66 + (index % 5) * 0.045).toFixed(2)),
  hltvId: team.hltvId,
  updatedAt: PROFESSIONAL_SNAPSHOT_DATE,
}));
