# CS2 General Tournament Simulator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the standalone Major simulator into a general CS2 tournament desktop application with editable team/player libraries, common and custom formats, offline fictional data, optional HLTV/OpenAI updates, multi-save persistence, and legacy save migration.

**Architecture:** Keep tournament progression and validation as pure TypeScript modules. Store the application database as versioned JSON documents inside SQLite through small Tauri commands, so the frontend can also use a localStorage fallback in browser development. Put network access, HLTV parsing, and API-key handling in Rust; keep React focused on the desktop navigation, editors, creation wizard, and tournament control room.

**Tech Stack:** React 18, TypeScript 5.6, Node test runner, Vite 6, Tauri 2, Rust, SQLite via rusqlite, reqwest, scraper, keyring.

---

## File Structure

- `src/domain/types.ts`: shared player, team, template, tournament, match, database, and service types.
- `src/domain/validation.ts`: roster, language, template, and score validation.
- `src/domain/random.ts`: seeded random helpers and offline fictional generation.
- `src/data/fictionalTeams.ts`: bundled 50-team, 250-player Chinese/English fictional snapshot.
- `src/data/proTeams.ts`: bundled professional snapshot and source metadata.
- `src/data/templates.ts`: built-in Major, Swiss, elimination, league, and group templates.
- `src/engine/tournamentEngine.ts`: stage initialization, pairing, scoring, advancement, and simulation.
- `src/engine/legacyMigration.ts`: import of `cs2-major-simulator.saves.v2`.
- `src/services/storage.ts`: Tauri SQLite commands with browser localStorage fallback.
- `src/services/external.ts`: typed wrappers for HLTV and OpenAI Tauri commands.
- `src/state/AppStore.tsx`: database loading, persistence, mutations, and current navigation.
- `src/pages/*.tsx`: saves, create wizard, teams, players, templates, data center, settings, and tournament pages.
- `src/components/*.tsx`: reusable navigation, team/player rows, forms, dialogs, and title bar.
- `src/app.css`: responsive desktop layout and readable control styling.
- `tests/*.test.ts`: TypeScript behavior tests.
- `src-tauri/src/database.rs`: SQLite initialization, read/write, backup, and import/export helpers.
- `src-tauri/src/hltv.rs`: HLTV parser and updater.
- `src-tauri/src/openai.rs`: credential storage and structured team generation.
- `src-tauri/tests/fixtures/*.html`: stable HTML parser fixtures.

### Task 1: Test Harness and Domain Contracts

**Files:**
- Create: `tsconfig.test.json`
- Create: `src/domain/types.ts`
- Create: `tests/validation.test.ts`
- Create: `src/domain/validation.ts`
- Modify: `package.json`

- [ ] **Step 1: Add a test command and test compiler config**

```json
{
  "scripts": {
    "test": "tsc -p tsconfig.test.json && node --test .test-dist/tests"
  }
}
```

`tsconfig.test.json` compiles `src/domain`, `src/engine`, `src/data`, and `tests` to `.test-dist` using ES modules.

- [ ] **Step 2: Write failing roster, language, score, and template tests**

```ts
test("a playable roster has exactly five unique starters", () => {
  assert.deepEqual(validateRoster(teamWithFiveUniqueStarters), []);
  assert.match(validateRoster(teamWithDuplicateStarter).join(" "), /重复/);
});

test("fictional names stay in their selected language", () => {
  assert.equal(detectNameLanguage("霜火竞技"), "zh");
  assert.equal(detectNameLanguage("Northwind"), "en");
  assert.equal(detectNameLanguage("霜火 Northwind"), "mixed");
});

test("series scores match best-of rules", () => {
  assert.equal(validateSeriesScore(3, 2, 1), null);
  assert.match(validateSeriesScore(3, 3, 1) ?? "", /BO3/);
});
```

- [ ] **Step 3: Run the test and verify RED**

Run: `npm test`
Expected: FAIL because domain modules do not exist.

- [ ] **Step 4: Define exact domain contracts and minimal validators**

Define `Player`, `Team`, `Roster`, `StageConfig`, `TournamentTemplate`, `TournamentState`, `Match`, `SaveGame`, `AppDatabase`, `HltvUpdateResult`, and `AiGenerationRequest`. Implement `validateRoster`, `detectNameLanguage`, `validateSeriesScore`, and `validateTemplate` to satisfy the tests.

- [ ] **Step 5: Run the test and verify GREEN**

Run: `npm test`
Expected: all validation tests pass.

- [ ] **Step 6: Commit**

```powershell
git add major-simulator/package.json major-simulator/tsconfig.test.json major-simulator/src/domain major-simulator/tests/validation.test.ts
git commit -m "feat: define tournament domain model"
```

### Task 2: Bundled Data, Templates, and Offline Generation

**Files:**
- Create: `tests/data.test.ts`
- Create: `src/domain/random.ts`
- Create: `src/data/fictionalTeams.ts`
- Create: `src/data/proTeams.ts`
- Create: `src/data/templates.ts`

- [ ] **Step 1: Write failing bundled-data tests**

```ts
test("bundles fifty fictional teams and 250 unique players", () => {
  assert.equal(FICTIONAL_TEAMS.length, 50);
  assert.equal(new Set(FICTIONAL_PLAYERS.map((player) => player.id)).size, 250);
});

test("fictional rosters are internally single-language", () => {
  for (const team of FICTIONAL_TEAMS) {
    const expected = team.language;
    assert.equal(detectNameLanguage(team.name), expected);
    for (const id of team.roster.starters) {
      assert.equal(detectNameLanguage(PLAYER_BY_ID[id].nickname), expected);
    }
  }
});

test("all built-in templates validate", () => {
  for (const template of BUILT_IN_TEMPLATES) assert.deepEqual(validateTemplate(template), []);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test`
Expected: FAIL because bundled data modules do not exist.

- [ ] **Step 3: Implement deterministic generators and snapshots**

Use seeded Chinese surname/given-name lists and English callsign fragments. Generate 25 Chinese and 25 English teams with five starters each, unique IDs, role coverage, ages 17-31, and ratings distributed from 0.88 to 1.24. Add a bundled professional snapshot with HLTV IDs and active rosters for the current core professional pool; mark its source date explicitly. Add built-in templates for Major, Swiss 16/32, single elimination 8/16/32, double elimination 8/16, single/double round robin, and grouped league-to-playoff formats.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `npm test`
Expected: all data and validation tests pass.

- [ ] **Step 5: Commit**

```powershell
git add major-simulator/src/data major-simulator/src/domain/random.ts major-simulator/tests/data.test.ts
git commit -m "feat: add professional and fictional team libraries"
```

### Task 3: General Tournament Engine

**Files:**
- Create: `tests/tournamentEngine.test.ts`
- Create: `src/engine/tournamentEngine.ts`

- [ ] **Step 1: Write failing tests for each stage type**

```ts
test("Swiss advances three-win teams and eliminates three-loss teams", () => {
  const state = createTournament(swissTemplate, sixteenSnapshots, "team-1", 7);
  const completed = playDeterministicRounds(state);
  assert.equal(completed.stageResults[0].qualifiedTeamIds.length, 8);
});

test("single elimination produces one champion", () => {
  const completed = playAllAi(createTournament(singleElim8, eightSnapshots, "team-1", 9));
  assert.ok(completed.championTeamId);
  assert.equal(completed.matches.filter((match) => match.completed).length, 7);
});

test("round robin applies head-to-head after wins and score difference", () => {
  const table = rankRoundRobin(teams, completedMatches);
  assert.deepEqual(table.map((row) => row.teamId), expectedOrder);
});

test("controlled-team matches stop for a manual series score", () => {
  const state = advanceUntilControlledOrComplete(initial, "team-1");
  assert.ok(findControlledMatch(state, "team-1"));
  assert.throws(() => submitControlledScore(state, "team-1", 3, 0), /BO3/);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test`
Expected: FAIL because the general engine does not exist.

- [ ] **Step 3: Implement seeded simulation and stage adapters**

Implement `createTournament`, `advanceUntilControlledOrComplete`, `submitControlledScore`, `simulateCurrentBatch`, `rankRoundRobin`, `pairSwiss`, `buildSingleElimination`, `buildDoubleElimination`, and group-stage advancement. Use stable team IDs and snapshots rather than global name maps. Derive team strength from starter ratings plus stability, and use a seeded Mulberry32 generator.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `npm test`
Expected: all engine tests pass with deterministic results.

- [ ] **Step 5: Commit**

```powershell
git add major-simulator/src/engine/tournamentEngine.ts major-simulator/tests/tournamentEngine.test.ts
git commit -m "feat: implement configurable tournament engine"
```

### Task 4: SQLite Persistence and Legacy Migration

**Files:**
- Create: `tests/legacyMigration.test.ts`
- Create: `src/engine/legacyMigration.ts`
- Create: `src/services/storage.ts`
- Create: `src-tauri/src/database.rs`
- Modify: `src-tauri/src/main.rs`
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Write failing legacy migration tests**

```ts
test("imports v2 saves without changing completed match results", () => {
  const database = migrateLegacyLibrary(legacyLibraryFixture, baseDatabase);
  assert.equal(database.saves[0].matches[0].winnerTeamId, "pro-tyloo");
  assert.equal(database.saves[0].legacyFormat, true);
});

test("creates snapshot-only placeholder players for unmatched legacy teams", () => {
  const database = migrateLegacyLibrary(unmatchedFixture, baseDatabase);
  assert.equal(database.saves[0].teamSnapshots[0].players.length, 5);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test`
Expected: FAIL because migration does not exist.

- [ ] **Step 3: Implement migration and frontend storage adapter**

`loadDatabase()` first invokes Tauri `load_database`; in browser development it reads `cs2-tournament-simulator.database.v3`. On first load, read `cs2-major-simulator.saves.v2`, create immutable legacy snapshots, save a raw JSON backup, and mark migration complete.

- [ ] **Step 4: Implement SQLite commands and Rust unit tests**

Create a `documents(namespace TEXT, key TEXT, value TEXT, updated_at INTEGER, PRIMARY KEY(namespace,key))` table. Add commands `load_database`, `save_database`, `backup_database`, `export_document`, and `import_document`. Each save runs in a transaction and validates JSON before replacing the active document.

- [ ] **Step 5: Run TypeScript and Rust tests**

Run: `npm test`
Expected: migration tests pass.

Run: `cargo test --locked`
Expected: database round-trip and invalid-JSON rollback tests pass.

- [ ] **Step 6: Commit**

```powershell
git add major-simulator/src/engine/legacyMigration.ts major-simulator/src/services/storage.ts major-simulator/tests/legacyMigration.test.ts major-simulator/src-tauri
git commit -m "feat: persist simulator data in sqlite"
```

### Task 5: HLTV and OpenAI Services

**Files:**
- Create: `src/services/external.ts`
- Create: `src-tauri/src/hltv.rs`
- Create: `src-tauri/src/openai.rs`
- Create: `src-tauri/tests/fixtures/hltv-active.html`
- Create: `src-tauri/tests/fixtures/hltv-player.html`
- Modify: `src-tauri/src/main.rs`
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Add failing Rust parser tests**

```rust
#[test]
fn parses_active_player_card() {
    let players = parse_active_players(include_str!("../tests/fixtures/hltv-active.html")).unwrap();
    assert_eq!(players[0].nickname, "ZywOo");
    assert_eq!(players[0].hltv_id, 11893);
}

#[test]
fn parses_profile_team_age_and_rating() {
    let profile = parse_player_profile(include_str!("../tests/fixtures/hltv-player.html")).unwrap();
    assert_eq!(profile.team_name.as_deref(), Some("Vitality"));
    assert_eq!(profile.age, Some(25));
}
```

- [ ] **Step 2: Run Rust tests and verify RED**

Run: `cargo test --locked hltv`
Expected: FAIL because parsers do not exist.

- [ ] **Step 3: Implement cancellable, throttled HLTV update**

Parse active archive pages, follow visible pagination, fetch player profiles with a conservative delay, cache successful responses, and return a staged `HltvUpdateResult`. Expose `start_hltv_update`, `get_hltv_update_status`, `cancel_hltv_update`, and `commit_hltv_update`. Never overwrite the active snapshot before `commit_hltv_update` validates roster and ID uniqueness.

- [ ] **Step 4: Implement credential-backed OpenAI generation**

Expose `set_openai_key`, `has_openai_key`, `delete_openai_key`, and `generate_ai_teams`. Store the key under service `cs2-tournament-simulator` through Windows Credential Manager. Send a strict JSON-schema request, deserialize the response, validate team language and roster sizes, and return data without persisting the key or response logs.

- [ ] **Step 5: Run Rust tests and verify GREEN**

Run: `cargo test --locked`
Expected: parser, database, and response validation tests pass without live network calls.

- [ ] **Step 6: Commit**

```powershell
git add major-simulator/src/services/external.ts major-simulator/src-tauri/src major-simulator/src-tauri/tests major-simulator/src-tauri/Cargo.toml major-simulator/src-tauri/Cargo.lock
git commit -m "feat: add hltv and ai data services"
```

### Task 6: Application Store and CRUD Workflows

**Files:**
- Create: `tests/storeOperations.test.ts`
- Create: `src/state/operations.ts`
- Create: `src/state/AppStore.tsx`
- Modify: `src/main.tsx`

- [ ] **Step 1: Write failing state-operation tests**

```ts
test("deleting a library team does not change save snapshots", () => {
  const next = deleteTeam(databaseWithSave, "custom-1");
  assert.equal(next.teams.some((team) => team.id === "custom-1"), false);
  assert.equal(next.saves[0].teamSnapshots.some((team) => team.id === "custom-1"), true);
});

test("auto fill honors professional percentage and excludes duplicates", () => {
  const selected = autoFillParticipants(database, template, controlledId, 60, seed);
  assert.equal(new Set(selected).size, selected.length);
  assert.equal(selected.length, template.teamCount);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test`
Expected: FAIL because store operations do not exist.

- [ ] **Step 3: Implement immutable CRUD operations and provider**

Implement team/player/template/save create, update, copy, delete, reset, import, export, participant auto-fill, and tournament state updates. `AppStoreProvider` loads once, merges built-in snapshots only when missing, persists debounced changes, and exposes explicit loading and error states.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `npm test`
Expected: all store-operation tests pass.

- [ ] **Step 5: Commit**

```powershell
git add major-simulator/src/state major-simulator/src/main.tsx major-simulator/tests/storeOperations.test.ts
git commit -m "feat: add simulator application store"
```

### Task 7: Desktop Interface and Tournament Control Room

**Files:**
- Replace: `src/App.tsx`
- Replace: `src/App.css`
- Create: `src/app.css`
- Create: `src/components/AppSidebar.tsx`
- Create: `src/components/TeamEditor.tsx`
- Create: `src/components/PlayerEditor.tsx`
- Create: `src/components/TemplateEditor.tsx`
- Create: `src/components/ConfirmDialog.tsx`
- Create: `src/pages/SavesPage.tsx`
- Create: `src/pages/CreateTournamentPage.tsx`
- Create: `src/pages/TeamsPage.tsx`
- Create: `src/pages/PlayersPage.tsx`
- Create: `src/pages/TemplatesPage.tsx`
- Create: `src/pages/DataCenterPage.tsx`
- Create: `src/pages/SettingsPage.tsx`
- Create: `src/pages/TournamentPage.tsx`
- Remove after migration: `src/MajorSimulator.tsx`
- Remove after migration: `src/MajorSimulator.css`
- Remove after migration: `src/majorEngine.ts`

- [ ] **Step 1: Build the navigation shell and empty states**

Use a fixed custom title bar, 220-260px left navigation, readable 15-18px body text, 40-48px controls, and compact unframed page sections. Routes are state-driven so Tauri does not need a router dependency.

- [ ] **Step 2: Build the team and player libraries**

Add source tabs, search, filters, sortable tables, team roster editor, starter/bench/coach assignment, copy-to-custom, create, delete, and inline validation. Use existing icon components or add matching Lucide-style icons in `components/icons.tsx`.

- [ ] **Step 3: Build the template library and five-step creation wizard**

The wizard edits a draft only. Step five runs `validateTemplate`, `validateRoster`, duplicate checks, and participant-count checks. On success, create a save with immutable snapshots and navigate to its control room.

- [ ] **Step 4: Build the generic tournament control room**

Render stage tabs, current manual match, score form, standings, bracket/round lists, history, champion state, and auto-advance. Never assume a global team name map; resolve all display data from the save snapshot.

- [ ] **Step 5: Build data center and settings**

Show bundled and active professional snapshot dates, staged HLTV progress/diff, cancellation and commit actions, fictional library counts, offline generation, credential state, and online AI generation controls.

- [ ] **Step 6: Compile and fix all frontend errors**

Run: `npm test`
Expected: all TypeScript tests pass.

Run: `npm run build`
Expected: TypeScript and Vite production build exit 0.

- [ ] **Step 7: Commit**

```powershell
git add major-simulator/src major-simulator/index.html major-simulator/package.json major-simulator/vite.config.ts major-simulator/tsconfig.json
git commit -m "feat: build general tournament desktop interface"
```

### Task 8: Product Rename, Documentation, and Release Verification

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `README.md`
- Modify: `打开赛事模拟器.bat`
- Replace: `CS2 Major Simulator.exe` with the release binary

- [ ] **Step 1: Rename the application**

Set product name to `CS2 Tournament Simulator`, binary name to `cs2-tournament-simulator`, title to `CS2 赛事模拟器`, and storage service/identifier to stable general-tournament names. Preserve the existing standalone folder and launcher.

- [ ] **Step 2: Update README with offline, HLTV, AI, backup, and build instructions**

Document where the SQLite database lives, how to update HLTV, how to configure the optional API key, how legacy saves migrate, and how to restore a backup.

- [ ] **Step 3: Run fresh verification**

Run: `npm test`
Expected: all tests pass with zero failures.

Run: `npm run build`
Expected: frontend production build exits 0.

Run: `cargo test --locked`
Expected: all Rust tests pass with zero failures.

Run: `$env:CARGO_TARGET_DIR='E:\CS2BOT\Panel\src-tauri\target'; cargo build --release --locked`
Expected: release build exits 0 and produces `cs2-tournament-simulator.exe`.

- [ ] **Step 4: Replace the root executable**

Stop the old simulator process if it is running, copy the verified release binary to `E:\CS2BOT\major-simulator\CS2 Tournament Simulator.exe`, and update the launcher to open it.

- [ ] **Step 5: Check scope and working tree**

Run: `git status --short`
Expected: only intended `major-simulator` changes plus pre-existing unrelated user changes.

- [ ] **Step 6: Commit**

```powershell
git add major-simulator/README.md major-simulator/src-tauri major-simulator/打开赛事模拟器.bat
git commit -m "chore: release general tournament simulator"
```
