import assert from "node:assert/strict";
import test from "node:test";
import { FICTIONAL_NICKNAME_MIGRATIONS, generateFictionalTeams } from "../.test-dist/src/data/fictionalTeams.js";
import { TEMPLATE_BY_ID } from "../.test-dist/src/data/templates.js";
import {
  autoFillParticipants,
  copyTeamToCustom,
  createDefaultDatabase,
  createTournamentSave,
  deleteTeam,
  exportCustomTeamPackage,
  exportTemplatePackage,
  importCustomTeamPackage,
  importTemplatePackage,
  mergeGeneratedData,
  mergeMissingBuiltIns,
  mergeProfessionalUpdate,
  upsertPlayer,
  upsertTeam,
} from "../.test-dist/src/state/operations.js";

test("default database contains bundled professional and fictional libraries", () => {
  const database = createDefaultDatabase();
  assert.ok(database.teams.filter((team) => team.source === "professional").length >= 16);
  assert.equal(database.teams.filter((team) => team.source === "fictional").length, 50);
  assert.ok(database.templates.length >= 10);
});

test("built-in nickname migration updates only untouched library players once", () => {
  const change = FICTIONAL_NICKNAME_MIGRATIONS[0];
  assert.ok(change);
  let legacy = createDefaultDatabase();
  legacy = {
    ...legacy,
    migration: undefined,
    players: legacy.players.map((player) => player.id === change.id ? { ...player, nickname: change.from } : player),
  };
  const affectedTeam = legacy.teams.find((team) => team.roster.starters.includes(change.id));
  assert.ok(affectedTeam);
  const teamIds = [affectedTeam.id, ...legacy.teams.filter((team) => team.id !== affectedTeam.id).slice(0, 7).map((team) => team.id)];
  legacy = createTournamentSave(legacy, "Nickname Migration", TEMPLATE_BY_ID["single-8"], teamIds, affectedTeam.id, 33);
  const originalSaves = structuredClone(legacy.saves);

  const migrated = mergeMissingBuiltIns(legacy);
  assert.equal(migrated.players.find((player) => player.id === change.id)?.nickname, change.to);
  assert.equal(migrated.migration?.fictionalNicknameVersion, 1);
  assert.deepEqual(migrated.saves, originalSaves);
  assert.deepEqual(mergeMissingBuiltIns(migrated), migrated);

  const manuallyEdited = {
    ...legacy,
    players: legacy.players.map((player) => player.id === change.id ? { ...player, nickname: "自定义ID" } : player),
  };
  assert.equal(mergeMissingBuiltIns(manuallyEdited).players.find((player) => player.id === change.id)?.nickname, "自定义ID");
});

test("deleting a library team does not change save snapshots", () => {
  let database = createDefaultDatabase();
  const template = TEMPLATE_BY_ID["single-8"];
  const teamIds = database.teams.slice(0, 8).map((team) => team.id);
  database = createTournamentSave(database, "Snapshot Test", template, teamIds, teamIds[0], 33);
  const before = database.saves[0].tournament.teamSnapshots[0];
  const next = deleteTeam(database, before.id);
  assert.equal(next.teams.some((team) => team.id === before.id), false);
  assert.equal(next.saves[0].tournament.teamSnapshots.some((team) => team.id === before.id), true);
});

test("auto fill honors professional percentage and excludes duplicates", () => {
  const database = createDefaultDatabase();
  const template = TEMPLATE_BY_ID["single-16"];
  const controlledId = database.teams.find((team) => team.source === "custom")?.id ?? database.teams[0].id;
  const selected = autoFillParticipants(database, template, controlledId, 60, 45);
  assert.equal(selected.length, 16);
  assert.equal(new Set(selected).size, 16);
  assert.ok(selected.includes(controlledId));
  const professionalCount = selected.filter((id) => database.teams.find((team) => team.id === id)?.source === "professional").length;
  assert.ok(professionalCount >= 8 && professionalCount <= 11);
});

test("empty professional updates are rejected without clearing the existing library", () => {
  const database = createDefaultDatabase();
  const customTeam = { ...database.teams[0], id: "custom-kept", name: "自建队", source: "custom" };
  const withCustom = { ...database, teams: [...database.teams, customTeam] };
  assert.throws(
    () => mergeProfessionalUpdate(withCustom, { teams: [], players: [], sourceDate: "2026-08-10" }),
    /空|职业|professional/i,
  );
  assert.ok(withCustom.teams.some((team) => team.id === "custom-kept"));
  assert.ok(withCustom.teams.some((team) => team.source === "professional"));
});

test("professional updates validate ids, source, roster references, and fields", () => {
  const database = createDefaultDatabase();
  const players = structuredClone(database.players.filter((player) => player.source === "professional"));
  const teams = structuredClone(database.teams.filter((team) => team.source === "professional"));
  assert.throws(() => mergeProfessionalUpdate(database, {
    players: players.map((player, index) => index === 1 ? { ...player, id: players[0].id } : player),
    teams,
    sourceDate: "2026-08-11",
  }), /ID|重复/i);
  assert.throws(() => mergeProfessionalUpdate(database, {
    players: players.map((player, index) => index === 0 ? { ...player, source: "custom" } : player),
    teams,
    sourceDate: "2026-08-11",
  }), /source|职业|professional/i);
  assert.throws(() => mergeProfessionalUpdate(database, {
    players,
    teams: teams.map((team, index) => index === 0 ? { ...team, roster: { ...team.roster, starters: [...team.roster.starters.slice(0, 4), "missing-player"] } } : team),
    sourceDate: "2026-08-11",
  }), /missing-player|阵容|引用/i);
  assert.throws(() => mergeProfessionalUpdate(database, {
    players: players.map((player, index) => index === 0 ? { ...player, rating: Number.NaN } : player),
    teams,
    sourceDate: "2026-08-11",
  }), /rating|评分/i);
  assert.throws(() => mergeProfessionalUpdate(database, {
    players: players.map((player, index) => index === 0 ? { ...player, age: 15 } : player),
    teams,
    sourceDate: "2026-08-11",
  }), /age|年龄/i);
  assert.throws(() => mergeProfessionalUpdate(database, {
    players: players.map((player, index) => index === 0 ? { ...player, rating: 0.49 } : player),
    teams,
    sourceDate: "2026-08-11",
  }), /rating|评分/i);
});

test("professional updates reject an obvious partial scrape relative to the current library", () => {
  const database = createDefaultDatabase();
  const players = structuredClone(database.players.filter((player) => player.source === "professional").slice(0, 5));
  const team = structuredClone(database.teams.find((candidate) => candidate.source === "professional"));
  team.roster.starters = players.map((player) => player.id);
  assert.throws(
    () => mergeProfessionalUpdate(database, { players, teams: [team], sourceDate: "2026-08-11" }),
    /缩水|partial|下降|数量/i,
  );
});

test("editing a roster member cannot invalidate a referenced team", () => {
  const database = createDefaultDatabase();
  const team = database.teams[0];
  const starter = database.players.find((player) => player.id === team.roster.starters[0]);
  assert.ok(starter);
  assert.throws(() => upsertPlayer(database, { ...starter, role: "Coach" }), /首发|Coach|阵容/i);
  assert.equal(database.players.find((player) => player.id === starter.id)?.role, starter.role);
});

test("template import preserves existing templates and deterministically remaps collisions", () => {
  const database = createDefaultDatabase();
  const original = structuredClone(database.templates[0]);
  const packageValue = exportTemplatePackage(original);
  const first = importTemplatePackage(database, packageValue);
  const second = importTemplatePackage(database, packageValue);
  const imported = first.templates.at(-1);

  assert.equal(first.templates.length, database.templates.length + 1);
  assert.deepEqual(first.templates.find((template) => template.id === original.id), original);
  assert.notEqual(imported.id, original.id);
  assert.equal(imported.id, second.templates.at(-1).id);
  assert.equal(imported.builtIn, false);
});

test("custom team export includes only its complete roster and rejects non-custom teams", () => {
  const database = createDefaultDatabase();
  const customDatabase = copyTeamToCustom(database, database.teams[0].id, "Portable Team");
  const team = customDatabase.teams.at(-1);
  const packageValue = exportCustomTeamPackage(customDatabase, team.id);
  const memberIds = new Set([...team.roster.starters, ...team.roster.substitutes, ...(team.roster.coachId ? [team.roster.coachId] : [])]);

  assert.equal(packageValue.kind, "cs2-custom-team");
  assert.equal(packageValue.version, 1);
  assert.deepEqual(new Set(packageValue.players.map((player) => player.id)), memberIds);
  assert.throws(() => exportCustomTeamPackage(database, database.teams[0].id), /自建|custom/i);
});

test("custom team import remaps team and player collisions without overwriting existing data", () => {
  const database = createDefaultDatabase();
  const customDatabase = copyTeamToCustom(database, database.teams[0].id, "Portable Team");
  const originalTeam = structuredClone(customDatabase.teams.at(-1));
  const originalPlayers = structuredClone(customDatabase.players);
  const packageValue = exportCustomTeamPackage(customDatabase, originalTeam.id);
  const first = importCustomTeamPackage(customDatabase, packageValue);
  const second = importCustomTeamPackage(customDatabase, packageValue);
  const importedTeam = first.teams.at(-1);
  const importedIds = [...importedTeam.roster.starters, ...importedTeam.roster.substitutes, ...(importedTeam.roster.coachId ? [importedTeam.roster.coachId] : [])];

  assert.equal(first.teams.length, customDatabase.teams.length + 1);
  assert.notEqual(importedTeam.id, originalTeam.id);
  assert.equal(importedTeam.id, second.teams.at(-1).id);
  assert.ok(importedIds.every((id) => !packageValue.players.some((player) => player.id === id)));
  assert.ok(importedIds.every((id) => first.players.some((player) => player.id === id && player.source === "custom")));
  assert.deepEqual(first.teams.find((team) => team.id === originalTeam.id), originalTeam);
  assert.deepEqual(first.players.slice(0, originalPlayers.length), originalPlayers);
});

test("upsertTeam rejects blank optional roster members", () => {
  const database = createDefaultDatabase();
  const team = structuredClone(database.teams[0]);
  const optionalId = database.players.find((player) => !team.roster.starters.includes(player.id)).id;
  team.roster.substitutes = [optionalId];
  const players = database.players.map((player) => player.id === optionalId ? { ...player, nickname: "   " } : player);
  assert.throws(() => upsertTeam({ ...database, players }, team), /nickname|游戏 ID|空白/i);
});

test("generated data deterministically remaps collisions instead of rejecting a later generation", () => {
  const database = createDefaultDatabase();
  const team = structuredClone(database.teams.find((candidate) => candidate.source === "fictional"));
  const memberIds = new Set([...team.roster.starters, ...team.roster.substitutes, ...(team.roster.coachId ? [team.roster.coachId] : [])]);
  const players = structuredClone(database.players.filter((player) => memberIds.has(player.id)));
  const first = mergeGeneratedData(database, [team], players);
  const second = mergeGeneratedData(database, [team], players);
  const imported = first.teams.at(-1);
  const importedIds = [...imported.roster.starters, ...imported.roster.substitutes, ...(imported.roster.coachId ? [imported.roster.coachId] : [])];

  assert.notEqual(imported.id, team.id);
  assert.equal(imported.id, second.teams.at(-1).id);
  assert.ok(importedIds.every((id) => !memberIds.has(id)));
  assert.ok(importedIds.every((id) => first.players.some((player) => player.id === id)));
  assert.deepEqual(first.teams.find((candidate) => candidate.id === team.id), database.teams.find((candidate) => candidate.id === team.id));
});

test("generated data remaps duplicate game IDs against the existing library", () => {
  const database = createDefaultDatabase();
  const generated = generateFictionalTeams(991, 2, "zh");
  generated.players[0].nickname = database.players[0].nickname;

  const merged = mergeGeneratedData(database, generated.teams, generated.players);
  const existingNicknames = new Set(database.players.map((player) => player.nickname.trim().toLocaleLowerCase()));
  const importedPlayers = merged.players.slice(database.players.length);
  const importedNicknames = importedPlayers.map((player) => player.nickname.trim().toLocaleLowerCase());

  assert.equal(new Set(importedNicknames).size, importedNicknames.length);
  assert.ok(importedNicknames.every((nickname) => !existingNicknames.has(nickname)));
});
