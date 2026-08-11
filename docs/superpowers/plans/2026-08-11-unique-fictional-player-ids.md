# Unique Fictional Player IDs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every fictional player game ID unique in the bundled library, future offline generation batches, and merged local databases without changing real names or historical save snapshots.

**Architecture:** Add one deterministic nickname collision resolver to the fictional data module and reuse it for bundled and offline-generated players. Export a legacy-to-current migration table for the 25 changed built-in players, apply it once during database load, and perform a second collision pass when generated data is merged into an existing library.

**Tech Stack:** TypeScript, Node test runner, React state operations, Tauri 2, Rust, SQLite, CSV and Markdown exports.

---

### Task 1: Add failing uniqueness tests

**Files:**
- Modify: `tests/data.test.mjs:8-46`
- Modify: `tests/storeOperations.test.mjs:1-190`

- [ ] **Step 1: Add bundled and offline-generation assertions**

Add normalized nickname uniqueness checks to the bundled data test and generate 30 Chinese plus 30 English teams so the current finite-cycle bug is exercised:

```js
const normalizedNicknames = (players) => players.map((player) => player.nickname.trim().toLocaleLowerCase());

assert.equal(new Set(normalizedNicknames(FICTIONAL_PLAYERS)).size, FICTIONAL_PLAYERS.length);

for (const language of ["zh", "en"]) {
  const generated = generateFictionalTeams(991, 30, language);
  assert.equal(new Set(normalizedNicknames(generated.players)).size, generated.players.length);
  for (const player of generated.players) assert.equal(detectNameLanguage(player.nickname), language);
}
```

- [ ] **Step 2: Add database-merge collision assertion**

Extend `storeOperations.test.mjs` so a generated batch intentionally reuses an existing library nickname and the merged database must contain no duplicate normalized nicknames:

```js
const generated = generateFictionalTeams(991, 2, "zh");
generated.players[0].nickname = database.players[0].nickname;
const merged = mergeGeneratedData(database, generated.teams, generated.players);
const nicknames = merged.players.map((player) => player.nickname.trim().toLocaleLowerCase());
assert.equal(new Set(nicknames).size, nicknames.length);
```

- [ ] **Step 3: Run the tests and verify RED**

Run:

```powershell
npm.cmd test
```

Expected: FAIL because the bundled list and a 30-team Chinese offline batch contain duplicate game IDs.

### Task 2: Implement deterministic nickname collision resolution

**Files:**
- Modify: `src/data/fictionalTeams.ts:18-130`
- Test: `tests/data.test.mjs`

- [ ] **Step 1: Add normalized lookup and language-specific candidates**

Add helpers that preserve the preferred nickname when available and otherwise scan a deterministic candidate space:

```ts
function nicknameKey(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function candidateNickname(language: "zh" | "en", index: number): string {
  if (language === "en") {
    return `${ENGLISH_CALLSIGNS[index % ENGLISH_CALLSIGNS.length]}${Math.floor(index / ENGLISH_CALLSIGNS.length) + 1}`;
  }
  const twoCharacterCount = CHINESE_SURNAMES.length * CHINESE_GIVEN.length;
  if (index < twoCharacterCount) {
    return `${CHINESE_SURNAMES[index % CHINESE_SURNAMES.length]}${CHINESE_GIVEN[Math.floor(index / CHINESE_SURNAMES.length)]}`;
  }
  const offset = index - twoCharacterCount;
  return `${CHINESE_SURNAMES[offset % CHINESE_SURNAMES.length]}${CHINESE_GIVEN[Math.floor(offset / CHINESE_SURNAMES.length) % CHINESE_GIVEN.length]}${CHINESE_GIVEN[Math.floor(offset / twoCharacterCount) % CHINESE_GIVEN.length]}`;
}
```

- [ ] **Step 2: Add the reusable resolver**

```ts
export function deduplicateFictionalNicknames(players: Player[], reservedNicknames: Iterable<string> = []): Player[] {
  const preferredKeys = new Set(players.map((player) => nicknameKey(player.nickname)));
  const used = new Set(Array.from(reservedNicknames, nicknameKey));
  return players.map((player) => {
    const preferred = player.nickname.trim();
    const preferredKey = nicknameKey(preferred);
    if (!used.has(preferredKey)) {
      used.add(preferredKey);
      return { ...player, nickname: preferred };
    }
    const language = /[\u3400-\u9fff]/u.test(preferred) ? "zh" : "en";
    for (let index = 0; index < 10000; index += 1) {
      const candidate = candidateNickname(language, index);
      const key = nicknameKey(candidate);
      if (used.has(key) || preferredKeys.has(key)) continue;
      used.add(key);
      return { ...player, nickname: candidate };
    }
    throw new Error(`无法为 ${preferred} 生成唯一游戏 ID`);
  });
}
```

- [ ] **Step 3: Apply it to bundled and offline data**

Build players with the existing preferred names, then resolve them before exporting. Keep team roster IDs unchanged. For built-ins, zip legacy and resolved players to export only changed entries:

```ts
export const FICTIONAL_NICKNAME_MIGRATIONS = legacyPlayers.flatMap((player, index) => {
  const current = resolvedPlayers[index];
  return player.nickname === current.nickname ? [] : [{ id: player.id, from: player.nickname, to: current.nickname }];
});
```

Return `deduplicateFictionalNicknames(players)` from `generateFictionalTeams`.

- [ ] **Step 4: Run the data tests and verify GREEN**

Run:

```powershell
npm.cmd test
```

Expected: bundled and offline uniqueness assertions pass; the merge test still fails until Task 4.

### Task 3: Add a one-time existing-database migration

**Files:**
- Modify: `src/domain/types.ts:153-162`
- Modify: `src/domain/importValidation.ts:422-427`
- Modify: `src/state/operations.ts:1-113`
- Modify: `tests/storeOperations.test.mjs`

- [ ] **Step 1: Add failing migration tests**

Import `FICTIONAL_NICKNAME_MIGRATIONS` and `mergeMissingBuiltIns`. Construct a legacy database by restoring one migrated player to its `from` value and clearing the marker. Assert that:

```js
assert.equal(migrated.players.find((player) => player.id === change.id).nickname, change.to);
assert.equal(migrated.migration.fictionalNicknameVersion, 1);
assert.deepEqual(mergeMissingBuiltIns(migrated), migrated);
assert.equal(manualEditResult.players.find((player) => player.id === change.id).nickname, "自定义ID");
assert.equal(migrated.saves[0].tournament.teamSnapshots[0].players[0].nickname, snapshotNickname);
```

- [ ] **Step 2: Verify the migration test fails**

Run `npm.cmd test` and expect a failure because the migration marker and update behavior do not exist.

- [ ] **Step 3: Extend migration metadata parsing**

Add `fictionalNicknameVersion?: number` to `AppDatabase.migration` and preserve it in `parseAppDatabaseV3` using the existing integer parser with a minimum of zero.

- [ ] **Step 4: Apply the migration during built-in merge**

Set `fictionalNicknameVersion: 1` in new default databases. In `mergeMissingBuiltIns`, when the stored marker is below 1, update only players whose internal ID and current nickname match a `FICTIONAL_NICKNAME_MIGRATIONS` entry, then set the marker. Leave `teams`, `saves`, templates, manually edited nicknames, and generated fictional players untouched.

- [ ] **Step 5: Run the full TypeScript suite**

Run `npm.cmd test` and expect all tests to pass except the generated-data merge collision test that Task 4 addresses.

### Task 4: Prevent collisions when generated data enters an existing library

**Files:**
- Modify: `src/state/operations.ts:336-365`
- Test: `tests/storeOperations.test.mjs`

- [ ] **Step 1: Resolve generated nicknames against existing names**

Initialize `nextPlayers` with the resolver and all existing database nicknames reserved:

```ts
const nextPlayers = deduplicateFictionalNicknames(
  structuredClone(players),
  database.players.map((player) => player.nickname),
);
```

Keep the existing internal-ID remapping and roster validation unchanged.

- [ ] **Step 2: Run the full TypeScript suite**

Run `npm.cmd test` and expect every TypeScript test to pass, including global nickname uniqueness after merging generated data.

- [ ] **Step 3: Run the production frontend build**

Run `npm.cmd run build` and expect Vite to finish with exit code 0.

### Task 5: Update exports, current database, and Windows executable

**Files:**
- Modify: `虚构战队与队员名单.csv`
- Modify: `虚构战队与队员名单.md`
- Modify: `全部战队与队员名单.csv`
- Modify: `全部战队与队员名单.md`
- Modify: `CS2 Tournament Simulator.exe`
- Runtime data: `%APPDATA%\com.local.cs2majorsimulator\simulator.sqlite3`

- [ ] **Step 1: Build and replace the release executable**

Run:

```powershell
npm.cmd run build
cargo test --manifest-path src-tauri\Cargo.toml
cargo build --release --manifest-path src-tauri\Cargo.toml
Copy-Item -LiteralPath 'src-tauri\target\release\cs2-tournament-simulator.exe' -Destination 'CS2 Tournament Simulator.exe' -Force
```

- [ ] **Step 2: Apply the migration to the current SQLite database**

Start the rebuilt executable, wait until `simulator.sqlite3` receives a newer write timestamp, then close the application. Verify the JSON document stored under namespace `app`, key `database` has `migration.fictionalNicknameVersion = 1`.

- [ ] **Step 3: Update roster exports from the resolved built-in mapping**

Compile the TypeScript test output, import `FICTIONAL_NICKNAME_MIGRATIONS`, associate each changed player ID with its built-in team, and mechanically replace only matching `(team, old game ID)` rows in the fictional and all-roster CSV/Markdown exports. Do not alter professional or custom exports.

- [ ] **Step 4: Verify the exported CSV independently**

Run a normalized duplicate grouping over `虚构战队与队员名单.csv` and require:

```text
Rows: 250
Teams: 50
DuplicateGameIdGroups: 0
```

Also verify exactly 25 exported game IDs changed and real names remain byte-for-byte identical by row key.

### Task 6: Final verification, cleanup, commit, and push

**Files:**
- All files changed by Tasks 1-5

- [ ] **Step 1: Run fresh verification**

Run:

```powershell
npm.cmd test
npm.cmd run build
cargo test --manifest-path src-tauri\Cargo.toml
cargo build --release --manifest-path src-tauri\Cargo.toml
```

Expected: TypeScript suite has zero failures, Rust has 16 passing tests, and both production builds exit 0.

- [ ] **Step 2: Remove generated development caches**

Remove `.test-dist`, `dist`, `src-tauri/target`, `src-tauri/gen`, and temporary migration/export files. Preserve the final root EXE and source files.

- [ ] **Step 3: Sync the clean standalone repository**

Copy the changed source, tests, docs, lists, and EXE to `C:\Users\18307\.config\superpowers\worktrees\CS2BOT\cs2-tournament-upload`. Confirm `git diff --check` passes and only intended files are changed.

- [ ] **Step 4: Commit and push**

```powershell
git add --all
git commit -m "fix: make fictional player game IDs unique"
git push origin main
```

- [ ] **Step 5: Verify GitHub**

Require `git rev-parse HEAD` to equal `git ls-remote origin refs/heads/main`, then confirm the public repository contains the updated EXE, source, tests, and roster lists.
