export type DataSource = "professional" | "custom" | "fictional";
export type NameLanguage = "zh" | "en" | "mixed" | "none";
export type PlayerRole = "IGL" | "AWPer" | "Rifler" | "Entry" | "Support" | "Coach" | "Unset";
export type StageType = "swiss" | "single_elimination" | "double_elimination" | "round_robin" | "groups";
export type BestOf = 1 | 3 | 5;

export type Player = {
  id: string;
  nickname: string;
  realName: string;
  nationality: string;
  age: number;
  role: PlayerRole;
  rating: number;
  source: DataSource;
  hltvId?: number;
  sampleStatus?: "current" | "fallback" | "insufficient";
  updatedAt: string;
};

export type Roster = {
  starters: string[];
  substitutes: string[];
  coachId?: string;
};

export type Team = {
  id: string;
  name: string;
  shortName: string;
  region: string;
  color: string;
  source: DataSource;
  language: Exclude<NameLanguage, "mixed" | "none">;
  roster: Roster;
  rating: number;
  stability: number;
  hltvId?: number;
  updatedAt: string;
};

export type StageBestOf = {
  default: BestOf;
  decisive?: BestOf;
  final?: BestOf;
};

export type StageConfig = {
  id: string;
  name: string;
  type: StageType;
  advanceCount: number;
  entrantCount?: number;
  inviteCount?: number;
  bestOf: StageBestOf;
  winsToAdvance?: number;
  lossesToEliminate?: number;
  avoidRematches?: boolean;
  cycles?: 1 | 2;
  groupCount?: number;
  groupFormat?: "round_robin" | "swiss";
  thirdPlace?: boolean;
  grandFinalReset?: boolean;
};

export type TournamentTemplate = {
  id: string;
  name: string;
  description?: string;
  builtIn: boolean;
  teamCount: number;
  stages: StageConfig[];
};

export type TeamSnapshot = Team & {
  players: Player[];
};

export type Match = {
  id: string;
  stageIndex: number;
  groupId?: string;
  round: number;
  bracket?: "swiss" | "upper" | "lower" | "final" | "third_place" | "league";
  teamAId: string;
  teamBId: string;
  bestOf: BestOf;
  scoreA?: number;
  scoreB?: number;
  winnerTeamId?: string;
  completed: boolean;
};

export type Standing = {
  teamId: string;
  wins: number;
  losses: number;
  scoreFor: number;
  scoreAgainst: number;
  opponents: string[];
};

export type StageResult = {
  stageId: string;
  qualifiedTeamIds: string[];
  eliminatedTeamIds: string[];
};

export type TournamentState = {
  version: 3;
  id: string;
  name: string;
  template: TournamentTemplate;
  controlledTeamId: string;
  teamSnapshots: TeamSnapshot[];
  seed: number;
  stageIndex: number;
  round: number;
  activeTeamIds: string[];
  currentMatches: Match[];
  matches: Match[];
  standings: Record<string, Standing>;
  stageResults: StageResult[];
  championTeamId?: string;
  createdAt: number;
  updatedAt: number;
  legacyFormat?: boolean;
};

export type SaveGame = {
  id: string;
  name: string;
  tournament: TournamentState;
  createdAt: number;
  updatedAt: number;
};

export type AppSettings = {
  language: "zh-CN" | "en";
  defaultProfessionalPercent: number;
  simulationSpeed: "instant" | "normal";
  onlineAiEnabled: boolean;
};

export type DataSnapshotInfo = {
  source: string;
  sourceDate: string;
  updatedAt: string;
  teamCount: number;
  playerCount: number;
};

export type AppDatabase = {
  version: 3;
  players: Player[];
  teams: Team[];
  templates: TournamentTemplate[];
  saves: SaveGame[];
  settings: AppSettings;
  professionalSnapshot: DataSnapshotInfo;
  migration?: { legacyV2ImportedAt?: number; legacyBackup?: string; fictionalNicknameVersion?: number };
};

export type HltvUpdateStatus = {
  state: "idle" | "running" | "ready" | "error" | "cancelled";
  processed: number;
  total?: number;
  message: string;
  addedTeams?: number;
  addedPlayers?: number;
  changedPlayers?: number;
};

export type AiGenerationRequest = {
  count: number;
  language: "zh" | "en";
  region: string;
  style: string;
  minRating: number;
  maxRating: number;
};

export type AiGenerationResult = {
  teams: Team[];
  players: Player[];
};

export type TemplatePackage = {
  kind: "cs2-tournament-template";
  version: 1;
  template: TournamentTemplate;
};

export type CustomTeamPackage = {
  kind: "cs2-custom-team";
  version: 1;
  team: Team;
  players: Player[];
};
