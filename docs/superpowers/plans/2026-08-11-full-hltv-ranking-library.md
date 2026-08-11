# HLTV 完整排名职业库 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将内置职业库升级为 HLTV 2026-08-10 完整排名的 215 支队伍和 1,032 名登记选手，同时只允许 180 支完整五人队伍进入赛事选择。

**Architecture:** 使用一个可审计的 JSON 快照作为职业数据单一来源，由 `proTeams.ts` 在加载时做严格结构校验并映射到现有领域类型。数据库导入校验允许 1-5 人的职业阵容存在，但赛事资格仍统一由 `validateRoster` 的五人规则决定；一次性迁移只替换精确匹配旧 16 队/80 人内置基线的职业数据，并保持存档快照不变。

**Tech Stack:** TypeScript 5、React 18、Node test runner、Vite 6、Tauri 2、Rust、SQLite、CSV/Markdown/ZIP。

---

### Task 1: 固化并校验完整 HLTV 快照

**Files:**
- Create: `src/data/hltvProfessionalSnapshot.json`
- Create: `src/data/professionalSnapshot.ts`
- Modify: `src/data/proTeams.ts`
- Modify: `tests/data.test.mjs`

- [ ] **Step 1: 写入会失败的快照完整性测试**

在 `tests/data.test.mjs` 中断言：

```js
assert.equal(PROFESSIONAL_TEAMS.length, 215);
assert.equal(PROFESSIONAL_PLAYERS.length, 1032);
assert.equal(new Set(PROFESSIONAL_PLAYERS.map((player) => player.id)).size, 1032);
assert.deepEqual(PROFESSIONAL_SNAPSHOT_INFO.ranks, Array.from({ length: 215 }, (_, index) => index + 1));

const complete = PROFESSIONAL_TEAMS.filter((team) => team.roster.starters.length === 5);
const incomplete = PROFESSIONAL_TEAMS.filter((team) => team.roster.starters.length < 5);
assert.equal(complete.length, 180);
assert.equal(incomplete.length, 35);
assert.equal(PROFESSIONAL_TEAMS.reduce((sum, team) => sum + 5 - team.roster.starters.length, 0), 43);
assert.ok(complete.every((team) => validateRoster(team, PROFESSIONAL_PLAYERS).length === 0));
assert.ok(incomplete.every((team) => validateRoster(team, PROFESSIONAL_PLAYERS).length > 0));
```

快照元数据测试通过 `PROFESSIONAL_SNAPSHOT_INFO` 检查日期、两个来源 URL、连续排名 1-215、统计计数和无跨队选手复用。

- [ ] **Step 2: 运行测试确认旧 16 队数据失败**

Run: `npm.cmd test -- --test-name-pattern="professional snapshot"`

Expected: FAIL，实际队伍数为 16、选手数为 80。

- [ ] **Step 3: 生成并保存浏览器验证的静态快照**

从以下已确认来源生成 `src/data/hltvProfessionalSnapshot.json`：

```text
https://www.hltv.org/ranking/teams/2026/august/10
https://www.hltv.org/stats/players?startDate=2026-02-11&endDate=2026-08-11&minMapCount=10
```

JSON 顶层结构固定为：

```ts
type ProfessionalSnapshot = {
  version: 2;
  sourceDate: "2026-08-10";
  rankingUrl: string;
  statsUrl: string;
  completeTeamCount: 180;
  incompleteTeamCount: 35;
  missingRosterSlotCount: 43;
  unmatchedStatsPlayerCount: number;
  players: Array<{
    hltvId: number;
    nickname: string;
    realName: string;
    nationality: string;
    rating: number;
    sampleStatus: "current" | "insufficient";
  }>;
  teams: Array<{
    rank: number;
    hltvId: number;
    name: string;
    playerHltvIds: number[];
  }>;
};
```

Rating 仅按 HLTV player ID 关联；未匹配者使用 `1.00` 和 `insufficient`。不得补写缺失的 43 个位置。

- [ ] **Step 4: 实现快照解析器和领域映射**

在 `src/data/professionalSnapshot.ts` 对重复 ID、非法字段、空阵容、超过五人、断号排名、悬空引用和跨队复用直接抛错，并导出解析后的元数据。`src/data/proTeams.ts` 映射规则固定为：

```ts
id: `hltv-player-${player.hltvId}`
age: 24
role: "Unset"
source: "professional"
updatedAt: snapshot.sourceDate

id: `hltv-team-${team.hltvId}`
shortName: deriveShortName(team.name)
region: "International"
color: deterministicTeamColor(team.hltvId)
language: "en"
rating: Math.round(1000 + averageRosterRating * 600)
stability: 0.72
```

- [ ] **Step 5: 运行数据测试并提交**

Run: `npm.cmd test -- --test-name-pattern="professional snapshot"`

Expected: PASS，215/1,032/180/35/43 全部精确匹配。

Commit: `feat: bundle complete HLTV ranking snapshot`

### Task 2: 分离“可存储职业阵容”和“可参赛阵容”规则

**Files:**
- Modify: `src/domain/importValidation.ts`
- Modify: `tests/importValidation.test.mjs`
- Modify: `tests/validation.test.mjs`

- [ ] **Step 1: 写入职业不完整阵容导入测试**

新增测试：完整数据库中一支 `source === "professional"` 的队伍缩减为 4 名首发后，`parseAppDatabaseV3` 成功；同样的 4 人阵容若改为 `fictional` 或 `custom`，解析必须失败；所有三类队伍调用 `validateRoster` 时仍返回“首发阵容必须恰好包含 5 名选手”。

- [ ] **Step 2: 运行测试确认当前解析器拒绝 4 人职业队**

Run: `npm.cmd test -- --test-name-pattern="incomplete professional|incomplete fictional|incomplete custom"`

Expected: FAIL，职业队在数据库解析阶段被 `validateRoster` 拒绝。

- [ ] **Step 3: 增加持久化专用阵容校验**

在 `src/domain/importValidation.ts` 中把数据库队伍校验改为：

```ts
function validateStoredTeamRoster(team: Team, players: Player[], path: string): void {
  if (team.source !== "professional") {
    validateTeamRoster(team, players, path);
    return;
  }
  const { starters, substitutes, coachId } = team.roster;
  const playerById = new Map(players.map((player) => [player.id, player]));
  if (starters.length < 1 || starters.length > 5) invalid(path, "职业队首发阵容必须包含 1 到 5 名选手");
  if (new Set(starters).size !== starters.length) invalid(path, "首发阵容中存在重复选手");
  if (substitutes.length > 2 || new Set(substitutes).size !== substitutes.length) invalid(path, "替补阵容无效");
  if (substitutes.some((id) => starters.includes(id))) invalid(path, "同一选手不能同时担任首发和替补");
  if (coachId && (starters.includes(coachId) || substitutes.includes(coachId))) invalid(path, "教练不能同时进入比赛阵容");
  for (const id of [...starters, ...substitutes, ...(coachId ? [coachId] : [])]) {
    if (!playerById.has(id)) invalid(path, `阵容引用了不存在的成员：${id}`);
  }
  if (starters.some((id) => playerById.get(id)?.role === "Coach")) invalid(path, "首发成员不能使用 Coach 位置");
  if (substitutes.some((id) => playerById.get(id)?.role === "Coach")) invalid(path, "替补成员不能使用 Coach 位置");
  if (coachId && playerById.get(coachId)?.role !== "Coach") invalid(path, "教练成员的 role 必须是 Coach");
}
```

`parseCustomTeamPackage`、自建编辑和赛事创建继续调用严格的 `validateRoster`，不放宽。

- [ ] **Step 4: 运行校验测试并提交**

Run: `npm.cmd test -- --test-name-pattern="incomplete professional|incomplete fictional|incomplete custom|roster"`

Expected: PASS。

Commit: `feat: preserve incomplete professional rosters`

### Task 3: 增加职业快照版本迁移

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/domain/importValidation.ts`
- Modify: `src/state/operations.ts`
- Modify: `tests/storeOperations.test.mjs`
- Modify: `tests/importValidation.test.mjs`

- [ ] **Step 1: 写入迁移失败测试**

构造三类数据库：精确旧基线、用户自定义职业库、已经迁移的版本 2。测试必须断言：

```js
assert.equal(migrated.migration.professionalSnapshotVersion, 2);
assert.equal(migrated.teams.filter((team) => team.source === "professional").length, 215);
assert.equal(migrated.players.filter((player) => player.source === "professional").length, 1032);
assert.deepEqual(migrated.saves, originalSaves);
assert.deepEqual(mergeMissingBuiltIns(migrated), migrated);
assert.deepEqual(mergeMissingBuiltIns(customProfessionalLibrary).teams, customProfessionalLibrary.teams);
```

- [ ] **Step 2: 运行测试确认缺少版本字段和替换逻辑**

Run: `npm.cmd test -- --test-name-pattern="professional snapshot migration"`

Expected: FAIL。

- [ ] **Step 3: 实现只升级旧内置基线的迁移**

将类型扩展为：

```ts
migration?: {
  legacyV2ImportedAt?: number;
  legacyBackup?: string;
  fictionalNicknameVersion?: number;
  professionalSnapshotVersion?: number;
};
```

`createDefaultDatabase()` 直接写入 `professionalSnapshotVersion: 2`。`mergeMissingBuiltIns()` 仅当下列条件全部满足时替换职业 players/teams：

```ts
database.professionalSnapshot.sourceDate === "2026-08-10"
database.teams.filter((team) => team.source === "professional").length === 16
database.players.filter((player) => player.source === "professional").length === 80
(database.migration?.professionalSnapshotVersion ?? 0) < 2
```

替换时只重建职业部分，保留非职业 players/teams、templates、settings、saves 和其他 migration 字段。若条件不匹配，仅记录版本 2，不覆盖用户职业库。

- [ ] **Step 4: 扩展运行时解析并验证存档字节等价**

`parseAppDatabaseV3` 读取非负整数 `professionalSnapshotVersion`。迁移测试在调用前后使用 `JSON.stringify(database.saves)` 严格比较，确保历史 `teamSnapshots` 未变化。

- [ ] **Step 5: 运行迁移与完整测试并提交**

Run: `npm.cmd test`

Expected: 全部 Node 测试 PASS。

Commit: `feat: migrate legacy professional library snapshot`

### Task 4: 验证赛事选择只包含 180 支完整职业队

**Files:**
- Modify: `tests/storeOperations.test.mjs`
- Modify: `tests/data.test.mjs`

- [ ] **Step 1: 增加资格过滤测试**

使用 `createDefaultDatabase()` 计算：

```js
const professional = database.teams.filter((team) => team.source === "professional");
const playable = professional.filter((team) => validateRoster(team, database.players).length === 0);
const blocked = professional.filter((team) => validateRoster(team, database.players).length > 0);
assert.equal(playable.length, 180);
assert.equal(blocked.length, 35);
```

再对 `autoFillParticipants` 和创建赛事页面共用的过滤条件断言：返回结果从不包含 `blocked` 中的队伍 ID。

- [ ] **Step 2: 运行测试**

Run: `npm.cmd test -- --test-name-pattern="playable professional|auto fill"`

Expected: PASS；若失败，只修正资格筛选调用点，不改 `validateRoster` 的五人规则。

- [ ] **Step 3: 提交资格覆盖**

Commit: `test: enforce professional tournament eligibility`

### Task 5: 更新当前 SQLite 与八份名单导出

**Files:**
- Modify: `职业战队与队员名单.csv`
- Modify: `职业战队与队员名单.md`
- Modify: `全部战队与队员名单.csv`
- Modify: `全部战队与队员名单.md`
- Preserve: `虚构战队与队员名单.csv`
- Preserve: `虚构战队与队员名单.md`
- Preserve: `自建战队与队员名单.csv`
- Preserve: `自建战队与队员名单.md`
- Modify: `%APPDATA%/com.local.cs2majorsimulator/simulator.sqlite3`

- [ ] **Step 1: 备份并迁移当前 SQLite JSON 文档**

从 `documents(namespace='app', key='database')` 读取 JSON，先在应用数据目录的 `backups` 中保存原始 JSON，再运行与 `mergeMissingBuiltIns` 相同的迁移规则并写回。不得删除 saves、templates、fictional/custom 数据。

- [ ] **Step 2: 生成职业和全部名单**

CSV 使用 UTF-8 BOM，至少包含：类别、排名、队伍 ID、队伍名、简称、可参赛状态、阵容人数、选手 ID、游戏 ID、真实姓名、国籍、年龄、位置、Rating、样本状态、数据日期。Markdown 顶部写明 215/1,032/180/35/43 汇总。

- [ ] **Step 3: 校验八份名单**

职业导出必须为 215 队、1,032 个选手行；全部导出必须为 266 队、1,287 个选手行。虚构名单的 250 个游戏 ID 继续全局唯一。35 支不完整职业队必须在职业/全部导出中出现，且状态为“阵容不完整/不可参赛”。

- [ ] **Step 4: 创建最终导出目录和 ZIP**

在 `E:/CS2BOT/major-simulator/exports/最终所有名单_<timestamp>/` 放入八个 CSV/Markdown 文件，并创建同名 ZIP。确认新包正确后删除旧的 `最终所有名单_2026-08-11_165054` 目录和 ZIP。

- [ ] **Step 5: 提交导出文件**

Commit: `data: export complete professional ranking library`

### Task 6: 构建 EXE、同步项目副本并完成验证

**Files:**
- Modify: `CS2 Tournament Simulator.exe`
- Synchronize: `E:/CS2BOT/major-simulator`

- [ ] **Step 1: 运行前端和 Rust 验证**

Run:

```powershell
npm.cmd test
npm.cmd run build
Set-Location src-tauri
cargo test --locked
cargo check --locked
```

Expected: 所有命令 exit code 0。

- [ ] **Step 2: 构建 release EXE**

Run:

```powershell
Set-Location src-tauri
$env:CARGO_TARGET_DIR = 'E:\CS2BOT\Panel\src-tauri\target'
cargo build --release --locked
```

将生成的 `cs2-tournament-simulator.exe` 复制为仓库根目录的 `CS2 Tournament Simulator.exe`。

- [ ] **Step 3: 验证 SQLite、快照、导出和二进制一致性**

检查 SQLite 中职业计数为 215/1,032、可参赛职业队为 180、不可参赛职业队为 35；运行 EXE 烟雾测试确认窗口能够启动后关闭。比较两个项目副本中的源码、八份名单和 EXE 哈希。

- [ ] **Step 4: 清理开发产物**

删除临时抓取文件、测试 SQLite、浏览器导出中间文件、`.test-dist`、`dist` 中不需要交付的缓存和临时日志。保留 `node_modules` 与 Cargo 共享缓存，不把它们加入 Git。

- [ ] **Step 5: 最终提交、合并并推送**

Commit: `build: ship complete HLTV professional library`

在验证通过后将 `codex/full-hltv-ranking-library` 合并到 `main` 并推送 `https://github.com/gaspainting/CS2-Tournament-Simulator`。

最终检查：

```powershell
git status --short
git log -5 --oneline --decorate
git rev-parse main
git rev-parse origin/main
```

Expected: 工作树干净，`main` 与 `origin/main` 指向同一提交。
