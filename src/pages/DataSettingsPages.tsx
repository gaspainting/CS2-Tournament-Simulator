import { useEffect, useRef, useState } from "react";
import { CheckIcon, DatabaseIcon, DownloadIcon, RefreshIcon, SaveIcon, TrashIcon, UploadIcon } from "../components/icons";
import { generateFictionalTeams } from "../data/fictionalTeams";
import { parseAppDatabaseV3 } from "../domain/importValidation";
import type { HltvUpdateStatus } from "../domain/types";
import { cancelHltvUpdate, commitHltvUpdate, deleteOpenAiKey, generateAiTeams, getHltvUpdateStatus, hasOpenAiKey, setOpenAiKey, startHltvUpdate } from "../services/external";
import { useAppStore } from "../state/AppStore";
import { mergeGeneratedData, mergeProfessionalUpdate } from "../state/operations";

export function DataCenterPage() {
  const { database, setDatabase, setError } = useAppStore();
  const [status, setStatus] = useState<HltvUpdateStatus>({ state: "idle", processed: 0, message: "尚未启动更新" });
  const [offlineCount, setOfflineCount] = useState(5);
  const [offlineLanguage, setOfflineLanguage] = useState<"zh" | "en">("zh");
  const [aiCount, setAiCount] = useState(3);
  const [aiLanguage, setAiLanguage] = useState<"zh" | "en">("en");
  const [aiRegion, setAiRegion] = useState("International");
  const [aiStyle, setAiStyle] = useState("professional esports");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status.state !== "running") return;
    const timer = window.setInterval(() => void getHltvUpdateStatus().then(setStatus).catch(() => undefined), 1200);
    return () => window.clearInterval(timer);
  }, [status.state]);

  const start = async () => { try { setStatus(await startHltvUpdate()); } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); } };
  const commit = async () => { try { const payload = await commitHltvUpdate(); setDatabase((current) => mergeProfessionalUpdate(current, payload)); setStatus({ ...status, state: "idle", message: "职业库已应用" }); } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); } };
  const generateOffline = () => { try { const result = generateFictionalTeams(Date.now() >>> 0, offlineCount, offlineLanguage); setDatabase((current) => mergeGeneratedData(current, result.teams, result.players)); } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); } };
  const generateOnline = async () => {
    setBusy(true);
    try { const result = await generateAiTeams({ count: aiCount, language: aiLanguage, region: aiRegion, style: aiStyle, minRating: 0.88, maxRating: 1.24 }); setDatabase((current) => mergeGeneratedData(current, result.teams, result.players)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(false); }
  };
  const fictionalTeams = database.teams.filter((team) => team.source === "fictional");
  return <div className="page-shell"><header className="page-header"><div><span>DATA OPERATIONS</span><h1>数据中心</h1><p>职业库更新和名单生成都是可选操作，离线核心功能始终可用。</p></div></header>
    <section className="tool-section"><div className="tool-section__head"><div><span>HLTV PROFESSIONAL SNAPSHOT</span><h2>职业队与职业选手</h2><p>活跃名单分页、个人资料与近期 Rating；完整更新可能耗时较长，可随时取消。</p></div><div className="snapshot-stats"><span><strong>{database.professionalSnapshot.teamCount}</strong> 队</span><span><strong>{database.professionalSnapshot.playerCount}</strong> 人</span><span>数据日期 <strong>{database.professionalSnapshot.sourceDate}</strong></span></div></div><div className="update-console"><div><span className={`status-dot status-${status.state}`} /><div><strong>{status.message}</strong><small>{status.total ? `${status.processed} / ${status.total}` : `${status.processed} 项`} {status.addedTeams ? `· ${status.addedTeams} 支可用队伍` : ""}</small></div></div>{status.total && <progress value={status.processed} max={status.total} />}</div><div className="inline-actions">{status.state !== "running" && status.state !== "ready" && <button className="primary-button" onClick={() => void start()}><RefreshIcon size={18} />从 HLTV 更新</button>}{status.state === "running" && <button className="danger-button" onClick={() => { void cancelHltvUpdate(); setStatus({ ...status, state: "cancelled", message: "正在取消更新" }); }}>取消更新</button>}{status.state === "ready" && <button className="primary-button" onClick={() => void commit()}><CheckIcon size={18} />应用职业库更新</button>}</div></section>
    <section className="tool-section"><div className="tool-section__head"><div><span>OFFLINE GENERATOR</span><h2>离线虚构名单</h2><p>生成结果严格保持纯中文或纯英文，每支队伍默认五名首发。</p></div><div className="snapshot-stats"><span><strong>{fictionalTeams.length}</strong> 队</span><span><strong>{database.players.filter((player) => player.source === "fictional").length}</strong> 人</span></div></div><div className="generator-form"><label>语言<select value={offlineLanguage} onChange={(event) => setOfflineLanguage(event.target.value as "zh" | "en")}><option value="zh">纯中文</option><option value="en">纯英文</option></select></label><label>队伍数量<input type="number" min="1" max="20" value={offlineCount} onChange={(event) => setOfflineCount(Number(event.target.value))} /></label><button className="primary-button" onClick={generateOffline}>生成并加入队伍库</button></div></section>
    <section className="tool-section"><div className="tool-section__head"><div><span>OPTIONAL ONLINE AI</span><h2>在线 AI 生成</h2><p>需要先在设置中保存 OpenAI API Key；响应通过结构校验后才会写入本地数据库。</p></div></div><div className="generator-form wide"><label>语言<select value={aiLanguage} onChange={(event) => setAiLanguage(event.target.value as "zh" | "en")}><option value="zh">纯中文</option><option value="en">纯英文</option></select></label><label>地区<input value={aiRegion} onChange={(event) => setAiRegion(event.target.value)} /></label><label>命名风格<input value={aiStyle} onChange={(event) => setAiStyle(event.target.value)} /></label><label>数量<input type="number" min="1" max="20" value={aiCount} onChange={(event) => setAiCount(Number(event.target.value))} /></label><button className="primary-button" disabled={busy} onClick={() => void generateOnline()}>{busy ? "正在生成..." : "使用 AI 生成"}</button></div></section>
  </div>;
}

export function SettingsPage() {
  const { database, setDatabase, replaceDatabase, setError } = useAppStore();
  const [apiKey, setApiKey] = useState("");
  const [keySaved, setKeySaved] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  useEffect(() => { void hasOpenAiKey().then(setKeySaved).catch(() => setKeySaved(false)); }, []);
  const saveKey = async () => { try { await setOpenAiKey(apiKey); setApiKey(""); setKeySaved(true); } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); } };
  const removeKey = async () => { try { await deleteOpenAiKey(); setKeySaved(false); } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); } };
  const exportDatabase = () => { const blob = new Blob([JSON.stringify(database, null, 2)], { type: "application/json" }); const anchor = document.createElement("a"); anchor.href = URL.createObjectURL(blob); anchor.download = `cs2-tournament-backup-${Date.now()}.json`; anchor.click(); URL.revokeObjectURL(anchor.href); };
  const importDatabase = async (file?: File) => { if (!file) return; try { const parsed = parseAppDatabaseV3(JSON.parse(await file.text())); if (window.confirm("导入完整数据库会替换当前本地数据，继续吗？")) replaceDatabase(parsed); } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); } };
  return <div className="page-shell"><header className="page-header"><div><span>APPLICATION SETTINGS</span><h1>设置</h1><p>管理默认赛事选项、凭据和完整数据库备份。</p></div></header>
    <section className="settings-section"><div><h2>赛事默认值</h2><p>创建赛事向导会使用这些初始设置。</p></div><div className="settings-fields"><label>默认职业队占比 <strong>{database.settings.defaultProfessionalPercent}%</strong><input type="range" min="0" max="100" step="10" value={database.settings.defaultProfessionalPercent} onChange={(event) => setDatabase((current) => ({ ...current, settings: { ...current.settings, defaultProfessionalPercent: Number(event.target.value) } }))} /></label><label>模拟速度<select value={database.settings.simulationSpeed} onChange={(event) => setDatabase((current) => ({ ...current, settings: { ...current.settings, simulationSpeed: event.target.value as "instant" | "normal" } }))}><option value="instant">立即显示</option><option value="normal">正常</option></select></label></div></section>
    <section className="settings-section"><div><h2>OpenAI API Key</h2><p>凭据保存到 Windows 凭据存储，不进入数据库、日志或导出文件。</p></div><div className="credential-panel"><span className={keySaved ? "credential-state saved" : "credential-state"}>{keySaved ? "已保存" : "未配置"}</span><input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="sk-..." autoComplete="off" /><button className="primary-button" disabled={!apiKey.trim()} onClick={() => void saveKey()}><SaveIcon size={18} />保存凭据</button>{keySaved && <button className="danger-button" onClick={() => void removeKey()}><TrashIcon size={18} />删除</button>}</div></section>
    <section className="settings-section"><div><h2>完整数据库备份</h2><p>包含队伍、选手、模板和全部赛事存档，不包含 API Key。</p></div><div className="inline-actions"><input ref={importRef} hidden type="file" accept="application/json" onChange={(event) => void importDatabase(event.target.files?.[0])} /><button className="secondary-button" onClick={() => importRef.current?.click()}><UploadIcon size={18} />导入备份</button><button className="primary-button" onClick={exportDatabase}><DownloadIcon size={18} />导出完整备份</button></div></section>
    <section className="settings-section about-row"><DatabaseIcon size={28} /><div><h2>本地数据库</h2><p>SQLite v3 · {database.teams.length} 支队伍 · {database.players.length} 名成员 · {database.saves.length} 个赛事存档</p></div></section>
  </div>;
}
