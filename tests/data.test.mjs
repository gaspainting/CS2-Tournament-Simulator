import assert from "node:assert/strict";
import test from "node:test";
import { FICTIONAL_PLAYERS, FICTIONAL_TEAMS, generateFictionalTeams } from "../.test-dist/src/data/fictionalTeams.js";
import { PROFESSIONAL_PLAYERS, PROFESSIONAL_SNAPSHOT_INFO, PROFESSIONAL_TEAMS } from "../.test-dist/src/data/proTeams.js";
import { BUILT_IN_TEMPLATES } from "../.test-dist/src/data/templates.js";
import { detectNameLanguage, validateRoster, validateTemplate } from "../.test-dist/src/domain/validation.js";

const normalizedNicknames = (players) => players.map((player) => player.nickname.trim().toLocaleLowerCase());

test("bundles fifty fictional teams and 250 unique players", () => {
  assert.equal(FICTIONAL_TEAMS.length, 50);
  assert.equal(FICTIONAL_PLAYERS.length, 250);
  assert.equal(new Set(FICTIONAL_PLAYERS.map((player) => player.id)).size, 250);
});

test("bundled fictional player game IDs are globally unique", () => {
  assert.equal(new Set(normalizedNicknames(FICTIONAL_PLAYERS)).size, FICTIONAL_PLAYERS.length);
});

test("fictional rosters are internally single-language and playable", () => {
  for (const team of FICTIONAL_TEAMS) {
    assert.equal(detectNameLanguage(team.name), team.language);
    const rosterPlayers = FICTIONAL_PLAYERS.filter((player) => team.roster.starters.includes(player.id));
    assert.equal(rosterPlayers.length, 5);
    for (const player of rosterPlayers) assert.equal(detectNameLanguage(player.nickname), team.language);
    assert.deepEqual(validateRoster(team, FICTIONAL_PLAYERS), []);
  }
});

test("professional snapshot contains the complete ranked library and only complete rosters are playable", () => {
  assert.equal(PROFESSIONAL_TEAMS.length, 215);
  assert.equal(PROFESSIONAL_PLAYERS.length, 1032);
  assert.equal(new Set(PROFESSIONAL_TEAMS.map((team) => team.id)).size, PROFESSIONAL_TEAMS.length);
  assert.equal(new Set(PROFESSIONAL_PLAYERS.map((player) => player.id)).size, PROFESSIONAL_PLAYERS.length);

  const complete = PROFESSIONAL_TEAMS.filter((team) => team.roster.starters.length === 5);
  const incomplete = PROFESSIONAL_TEAMS.filter((team) => team.roster.starters.length < 5);
  assert.equal(complete.length, 180);
  assert.equal(incomplete.length, 35);
  assert.equal(PROFESSIONAL_TEAMS.reduce((sum, team) => sum + 5 - team.roster.starters.length, 0), 43);
  assert.ok(complete.every((team) => validateRoster(team, PROFESSIONAL_PLAYERS).length === 0));
  assert.ok(incomplete.every((team) => validateRoster(team, PROFESSIONAL_PLAYERS).length > 0));

  const rosterPlayerIds = PROFESSIONAL_TEAMS.flatMap((team) => team.roster.starters);
  assert.equal(new Set(rosterPlayerIds).size, rosterPlayerIds.length);
  assert.ok(rosterPlayerIds.every((id) => PROFESSIONAL_PLAYERS.some((player) => player.id === id)));
  assert.equal(PROFESSIONAL_SNAPSHOT_INFO.sourceDate, "2026-08-10");
  assert.match(PROFESSIONAL_SNAPSHOT_INFO.rankingUrl, /hltv\.org\/ranking\/teams\/2026\/august\/10/);
  assert.match(PROFESSIONAL_SNAPSHOT_INFO.statsUrl, /hltv\.org\/stats\/players/);
  assert.deepEqual(PROFESSIONAL_SNAPSHOT_INFO.ranks, Array.from({ length: 215 }, (_, index) => index + 1));
  assert.equal(PROFESSIONAL_SNAPSHOT_INFO.unmatchedStatsPlayerCount, 37);
});

test("all built-in templates validate", () => {
  assert.ok(BUILT_IN_TEMPLATES.length >= 10);
  for (const template of BUILT_IN_TEMPLATES) assert.deepEqual(validateTemplate(template), []);
});

test("offline generation creates additional single-language teams", () => {
  const generated = generateFictionalTeams(991, 3, "zh");
  assert.equal(generated.teams.length, 3);
  assert.equal(generated.players.length, 15);
  for (const team of generated.teams) {
    assert.equal(detectNameLanguage(team.name), "zh");
    for (const playerId of team.roster.starters) {
      const player = generated.players.find((item) => item.id === playerId);
      assert.equal(detectNameLanguage(player.nickname), "zh");
    }
  }
});

test("offline generation keeps Chinese and English game IDs unique", () => {
  for (const language of ["zh", "en"]) {
    const generated = generateFictionalTeams(991, 30, language);
    assert.equal(new Set(normalizedNicknames(generated.players)).size, generated.players.length);
    for (const player of generated.players) assert.equal(detectNameLanguage(player.nickname), language);
  }
});
