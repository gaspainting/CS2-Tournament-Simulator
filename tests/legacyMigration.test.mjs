import assert from "node:assert/strict";
import test from "node:test";
import { FICTIONAL_PLAYERS, FICTIONAL_TEAMS } from "../.test-dist/src/data/fictionalTeams.js";
import { PROFESSIONAL_PLAYERS, PROFESSIONAL_TEAMS, PROFESSIONAL_SNAPSHOT_DATE } from "../.test-dist/src/data/proTeams.js";
import { BUILT_IN_TEMPLATES } from "../.test-dist/src/data/templates.js";
import { migrateLegacyLibrary } from "../.test-dist/src/engine/legacyMigration.js";

const baseDatabase = {
  version: 3,
  players: [...PROFESSIONAL_PLAYERS, ...FICTIONAL_PLAYERS],
  teams: [...PROFESSIONAL_TEAMS, ...FICTIONAL_TEAMS],
  templates: BUILT_IN_TEMPLATES,
  saves: [],
  settings: { language: "zh-CN", defaultProfessionalPercent: 50, simulationSpeed: "instant", onlineAiEnabled: false },
  professionalSnapshot: { source: "HLTV", sourceDate: PROFESSIONAL_SNAPSHOT_DATE, updatedAt: PROFESSIONAL_SNAPSHOT_DATE, teamCount: PROFESSIONAL_TEAMS.length, playerCount: PROFESSIONAL_PLAYERS.length },
};

const legacyLibrary = {
  activeId: "legacy-save",
  saves: [{
    id: "legacy-save",
    name: "旧 Major",
    controlledTeam: "TYLOO",
    createdAt: 1,
    updatedAt: 2,
    tournament: {
      version: 1,
      seed: 99,
      phase: "stage1",
      round: 2,
      activeTeams: ["TYLOO", "Unknown Five"],
      records: { TYLOO: { wins: 1, losses: 0 }, "Unknown Five": { wins: 0, losses: 1 } },
      currentMatches: [],
      matches: [{ id: "legacy-match", stage: "stage1", round: 1, teamA: "TYLOO", teamB: "Unknown Five", bestOf: 1, winner: "TYLOO", scoreA: 13, scoreB: 8 }],
      qualifiers: {},
    },
  }],
};

test("imports v2 saves without changing completed match results", () => {
  const database = migrateLegacyLibrary(legacyLibrary, baseDatabase);
  const save = database.saves[0];
  assert.equal(save.tournament.legacyFormat, true);
  assert.equal(save.tournament.matches[0].winnerTeamId, "hltv-team-4863");
  assert.equal(save.tournament.matches[0].scoreA, 13);
  assert.equal(save.tournament.matches[0].scoreB, 8);
});

test("creates snapshot-only placeholder players for unmatched legacy teams", () => {
  const database = migrateLegacyLibrary(legacyLibrary, baseDatabase);
  const snapshot = database.saves[0].tournament.teamSnapshots.find((team) => team.name === "Unknown Five");
  assert.ok(snapshot);
  assert.equal(snapshot.players.length, 5);
  assert.equal(snapshot.roster.starters.length, 5);
  assert.equal(database.teams.some((team) => team.name === "Unknown Five"), false);
});

test("does not import the same legacy save twice", () => {
  const once = migrateLegacyLibrary(legacyLibrary, baseDatabase);
  const twice = migrateLegacyLibrary(legacyLibrary, once);
  assert.equal(twice.saves.length, 1);
});
