# CS2 赛事模拟器

独立的通用 CS2 赛事桌面应用。它不依赖 CS2 Bot Panel，可管理职业、自建和虚构队伍，创建常见或自定义赛制，并保存多场彼此独立的赛事进度。

## 主要功能

- 内置 Major、瑞士轮、单败淘汰、双败淘汰、循环联赛和分组赛模板；Major 32 队模板仍可直接使用。
- 支持编辑队伍、选手、阵容和赛事模板，并为赛事选择一支操纵队手动填写系列赛比分。
- 每个赛事保存参赛队伍与阵容快照；后续修改队伍库不会改变历史赛事。
- 内置职业队与虚构队数据，包括 TYLOO 职业阵容；支持离线生成中文或英文虚构名单。
- 支持多个赛事存档、完整数据库导入导出和旧版 Major 存档迁移。

## 启动

发布包中双击 `CS2 Tournament Simulator.exe`，或运行 `打开赛事模拟器.bat`。

核心赛事模拟、队伍管理、模板管理、存档和离线名单生成均可断网使用。联网功能只有以下两项：

- **HLTV 更新**：在“数据中心”手动启动，用于更新职业选手资料和 Rating。更新完成并校验通过前不会替换现有职业库；网络失败不影响本地数据。
- **OpenAI 生成**：可选功能，需要用户自行提供 OpenAI API Key。生成结果通过结构、语言和阵容校验后才写入本地数据库。

OpenAI API Key 通过服务名 `cs2-tournament-simulator` 保存到 Windows Credential Manager，不写入 SQLite、日志、赛事存档或导出的 JSON 备份。

## 数据、备份与恢复

Windows 桌面版使用 Tauri 应用数据目录。为兼容旧桌面版本的 WebView 和 SQLite 数据，内部稳定标识有意继续使用 `com.local.cs2majorsimulator`；产品名、包名和二进制名仍使用通用赛事模拟器名称。默认数据位置为：

```text
%APPDATA%\com.local.cs2majorsimulator\simulator.sqlite3
```

首次启动并保存数据后会创建该 SQLite 文件。旧版浏览器存档键 `cs2-major-simulator.saves.v2` 仍受支持：应用首次发现旧存档时会先保存原始 JSON，再迁移赛事结果和队伍快照；无法匹配到新版职业队的旧队伍会保留为仅属于该存档的占位阵容。迁移不会删除原始存档。

旧存档自动备份位于：

```text
%APPDATA%\com.local.cs2majorsimulator\backups\database-<时间戳>.json
```

也可以在“设置”中选择“导出完整备份”，得到包含队伍、选手、模板和赛事存档的 JSON 文件。恢复时选择“导入备份”；确认后，导入内容会替换当前数据库内容。API Key 不包含在任何备份中，需要在新环境中重新配置。

建议在导入前先导出当前数据库，并在应用退出后复制 `simulator.sqlite3` 或 JSON 备份到安全位置。直接恢复 SQLite 时，应先关闭应用，再替换同一路径下的文件。

## 开发与测试

需要 Node.js、npm、Rust 工具链以及 Tauri 2 在 Windows 上要求的 WebView2 和 C++ 构建工具。

```powershell
cd E:\CS2BOT\major-simulator
npm install
npm run dev
```

桌面开发模式：

```powershell
npm run desktop:dev
```

前端测试与生产构建：

```powershell
npm test
npm run build
```

Rust 测试与检查：

```powershell
cd E:\CS2BOT\major-simulator\src-tauri
cargo test --locked
cargo check --locked
```

## Release 构建

从项目根目录执行：

```powershell
npm run desktop:build
```

也可以显式构建前端，再复用父项目的 Cargo 缓存目录构建 Rust release：

```powershell
cd E:\CS2BOT\major-simulator
npm.cmd run build
cd .\src-tauri
$env:CARGO_TARGET_DIR='E:\CS2BOT\Panel\src-tauri\target'
cargo build --release --locked
```

直接运行 `cargo build` 不会执行 Tauri CLI 配置中的 `beforeBuildCommand`，因此显式 Cargo release 构建前必须先生成 `dist` 前端产物。

生成的二进制名称为 `cs2-tournament-simulator.exe`。发布时将已验证的二进制命名为项目根目录的 `CS2 Tournament Simulator.exe`，启动脚本会打开该文件。
