import assert from "node:assert/strict";
import test from "node:test";
import {
  parseAppDatabaseV3,
  parseCustomTeamPackage,
  parseSaveGame,
  parseTemplatePackage,
} from "../.test-dist/src/domain/importValidation.js";
import { TEMPLATE_BY_ID } from "../.test-dist/src/data/templates.js";
import { validateRoster } from "../.test-dist/src/domain/validation.js";
import { copyTeamToCustom, createDefaultDatabase, createTournamentSave } from "../.test-dist/src/state/operations.js";

function validDatabaseWithSave() {
  const database = createDefaultDatabase();
  const template = TEMPLATE_BY_ID["single-8"];
  const teamIds = database.teams.slice(0, template.teamCount).map((team) => team.id);
  return createTournamentSave(database, "Import roundtrip", template, teamIds, teamIds[0], 77);
}

test("full database import rejects malformed or missing top-level data", () => {
  assert.throws(() => parseAppDatabaseV3({ version: 3 }), /players|选手/i);
  const database = validDatabaseWithSave();
  for (const key of ["players", "templates", "settings"]) {
    const malformed = structuredClone(database);
    delete malformed[key];
    assert.throws(() => parseAppDatabaseV3(malformed), new RegExp(key, "i"));
  }
});

test("full database import rejects roster references to missing players", () => {
  const database = validDatabaseWithSave();
  database.teams[0].roster.starters[0] = "missing-player";
  assert.throws(() => parseAppDatabaseV3(database), /missing-player|阵容|引用/i);
});

test("full database import preserves incomplete professional rosters but they remain unplayable", () => {
  const database = createDefaultDatabase();
  const incomplete = database.teams.find((team) => team.source === "professional" && team.roster.starters.length < 5);
  assert.ok(incomplete);
  assert.match(validateRoster(incomplete, database.players).join(" "), /5|首发/);
  assert.deepEqual(parseAppDatabaseV3(JSON.parse(JSON.stringify(database))), JSON.parse(JSON.stringify(database)));
});

test("full database import still rejects incomplete fictional and custom rosters", () => {
  for (const source of ["fictional", "custom"]) {
    const base = createDefaultDatabase();
    const database = source === "custom"
      ? copyTeamToCustom(base, base.teams.find((team) => team.roster.starters.length === 5).id, "Incomplete Custom")
      : base;
    const team = database.teams.find((candidate) => candidate.source === source);
    assert.ok(team);
    team.roster.starters = team.roster.starters.slice(0, 4);
    assert.throws(() => parseAppDatabaseV3(database), /5|首发|阵容/i);
  }
});

test("full database import rejects duplicate ids and malformed template options", () => {
  const duplicate = validDatabaseWithSave();
  duplicate.players[1].id = duplicate.players[0].id;
  assert.throws(() => parseAppDatabaseV3(duplicate), /重复 ID/i);

  const malformedTemplate = validDatabaseWithSave();
  malformedTemplate.templates[0].stages[0].avoidRematches = "yes";
  assert.throws(() => parseAppDatabaseV3(malformedTemplate), /avoidRematches|布尔/i);
});

test("save import rejects malformed tournament progress", () => {
  const save = validDatabaseWithSave().saves[0];
  const malformed = structuredClone(save);
  malformed.tournament.matches = [{ id: "bad-match", completed: true }];
  assert.throws(() => parseSaveGame(malformed), /match|比赛/i);

  const badStanding = structuredClone(save);
  badStanding.tournament.standings[badStanding.tournament.activeTeamIds[0]].opponents = ["missing-team"];
  assert.throws(() => parseSaveGame(badStanding), /missing-team|standing|积分|对手/i);

  const missingStanding = structuredClone(save);
  delete missingStanding.tournament.standings[missingStanding.tournament.activeTeamIds[0]];
  assert.throws(() => parseSaveGame(missingStanding), /standings|积分榜|缺少/i);
});

test("valid database and save roundtrip through runtime parsers", () => {
  const database = validDatabaseWithSave();
  database.migration = { ...database.migration, fictionalNicknameVersion: 1 };
  const serializedDatabase = JSON.parse(JSON.stringify(database));
  const serializedSave = JSON.parse(JSON.stringify(database.saves[0]));
  assert.deepEqual(parseAppDatabaseV3(serializedDatabase), serializedDatabase);
  assert.deepEqual(parseSaveGame(serializedSave), serializedSave);
});

test("template packages roundtrip and force imported templates to custom", () => {
  const template = structuredClone(TEMPLATE_BY_ID["single-8"]);
  const packageJson = JSON.parse(JSON.stringify({ kind: "cs2-tournament-template", version: 1, template }));
  const parsed = parseTemplatePackage(packageJson);
  assert.equal(parsed.kind, "cs2-tournament-template");
  assert.equal(parsed.version, 1);
  assert.deepEqual(parsed.template, { ...template, builtIn: false });
});

test("template packages reject malformed nested stage data", () => {
  const template = structuredClone(TEMPLATE_BY_ID["single-8"]);
  template.stages[0].bestOf.final = 7;
  assert.throws(
    () => parseTemplatePackage({ kind: "cs2-tournament-template", version: 1, template }),
    /bestOf\.final|BO|值无效/i,
  );
});

test("custom team packages roundtrip complete members and force custom sources", () => {
  const database = createDefaultDatabase();
  const team = structuredClone(database.teams[0]);
  const memberIds = new Set([...team.roster.starters, ...team.roster.substitutes, ...(team.roster.coachId ? [team.roster.coachId] : [])]);
  const players = structuredClone(database.players.filter((player) => memberIds.has(player.id)));
  const parsed = parseCustomTeamPackage({ kind: "cs2-custom-team", version: 1, team, players });
  assert.equal(parsed.team.source, "custom");
  assert.ok(parsed.players.every((player) => player.source === "custom"));
  assert.equal(parsed.team.hltvId, undefined);
  assert.ok(parsed.players.every((player) => player.hltvId === undefined && player.sampleStatus === undefined));
  assert.deepEqual(new Set(parsed.players.map((player) => player.id)), memberIds);
});

test("custom team packages reject missing, blank, and unrelated members", () => {
  const database = createDefaultDatabase();
  const team = structuredClone(database.teams[0]);
  const memberIds = new Set([...team.roster.starters, ...team.roster.substitutes, ...(team.roster.coachId ? [team.roster.coachId] : [])]);
  const players = structuredClone(database.players.filter((player) => memberIds.has(player.id)));

  assert.throws(
    () => parseCustomTeamPackage({ kind: "cs2-custom-team", version: 1, team, players: players.slice(1) }),
    new RegExp(team.roster.starters[0], "i"),
  );

  const blankOptional = structuredClone(players);
  blankOptional[blankOptional.length - 1].nationality = "   ";
  assert.throws(
    () => parseCustomTeamPackage({ kind: "cs2-custom-team", version: 1, team, players: blankOptional }),
    /nationality|国籍|非空/i,
  );

  assert.throws(
    () => parseCustomTeamPackage({ kind: "cs2-custom-team", version: 1, team, players: [...players, { ...players[0], id: "unrelated-member" }] }),
    /unrelated-member|无关|阵容/i,
  );
});
