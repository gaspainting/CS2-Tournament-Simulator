import { useRef } from "react";
import { CopyIcon, DownloadIcon, PlayIcon, PlusIcon, RefreshIcon, TrashIcon, UploadIcon } from "../components/icons";
import { parseSaveGame } from "../domain/importValidation";
import type { SaveGame } from "../domain/types";
import { createTournament } from "../engine/tournamentEngine";
import { useAppStore } from "../state/AppStore";
import { deleteSave } from "../state/operations";

function downloadJson(name: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

export default function SavesPage() {
  const { database, setDatabase, setPage, setActiveSaveId, setError } = useAppStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const open = (id: string) => { setActiveSaveId(id); setPage("tournament"); };
  const duplicate = (save: SaveGame) => {
    const now = Date.now();
    const copy = structuredClone(save);
    copy.id = `save-copy-${now}`;
    copy.name = `${save.name} 副本`;
    copy.createdAt = now;
    copy.updatedAt = now;
    copy.tournament.id = `tournament-copy-${now}`;
    copy.tournament.name = copy.name;
    setDatabase((current) => ({ ...current, saves: [copy, ...current.saves] }));
  };
  const reset = (save: SaveGame) => {
    if (!window.confirm(`重新开始“${save.name}”？现有比赛进度会被清除。`)) return;
    const tournament = createTournament(save.tournament.template, save.tournament.teamSnapshots, save.tournament.controlledTeamId, Date.now() >>> 0, save.name);
    setDatabase((current) => ({ ...current, saves: current.saves.map((item) => item.id === save.id ? { ...item, tournament, updatedAt: Date.now() } : item) }));
  };
  const importFile = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = parseSaveGame(JSON.parse(await file.text()));
      const imported = { ...parsed, id: `save-import-${Date.now()}`, name: `${parsed.name}（导入）`, updatedAt: Date.now() };
      setDatabase((current) => ({ ...current, saves: [imported, ...current.saves] }));
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
  };
  return <div className="page-shell">
    <header className="page-header"><div><span>TOURNAMENT SAVES</span><h1>赛事存档</h1><p>每个存档保存独立队伍快照、随机种子、对阵和比赛历史。</p></div><div className="header-actions"><input ref={inputRef} hidden type="file" accept="application/json" onChange={(event) => void importFile(event.target.files?.[0])} /><button className="secondary-button" onClick={() => inputRef.current?.click()}><UploadIcon size={18} />导入</button><button className="primary-button" onClick={() => setPage("create")}><PlusIcon size={19} />创建赛事</button></div></header>
    {database.saves.length === 0 ? <div className="empty-state"><span>NO SAVES</span><h2>还没有赛事存档</h2><p>从常见模板开始，或配置一套完全自定义的赛制。</p><button className="primary-button" onClick={() => setPage("create")}><PlusIcon size={19} />创建第一场赛事</button></div> : <div className="save-list">{database.saves.map((save) => {
      const tournament = save.tournament;
      const controlled = tournament.teamSnapshots.find((team) => team.id === tournament.controlledTeamId);
      const stage = tournament.template.stages[tournament.stageIndex];
      return <article className="save-row" key={save.id}><button className="save-row__main" onClick={() => open(save.id)}><span className="team-mark large" style={{ borderColor: controlled?.color, color: controlled?.color }}>{controlled?.shortName.slice(0, 4) ?? "CS2"}</span><div><span className="save-row__meta">{tournament.template.name} · {tournament.teamSnapshots.length} 队</span><h2>{save.name}</h2><p>{tournament.championTeamId ? `冠军：${tournament.teamSnapshots.find((team) => team.id === tournament.championTeamId)?.name}` : `${stage?.name ?? "赛事结束"} · 第 ${tournament.round} 轮 · 操纵 ${controlled?.name}`}</p></div><span className={tournament.championTeamId ? "status-pill complete" : "status-pill active"}>{tournament.championTeamId ? "已结束" : "进行中"}</span></button><div className="save-row__actions"><button className="primary-button compact" onClick={() => open(save.id)}><PlayIcon size={17} />继续</button><button title="导出" onClick={() => downloadJson(`${save.name}.json`, save)}><DownloadIcon size={18} /></button><button title="复制" onClick={() => duplicate(save)}><CopyIcon size={18} /></button><button title="重新开始" onClick={() => reset(save)}><RefreshIcon size={18} /></button><button title="删除" className="danger" onClick={() => { if (window.confirm(`删除“${save.name}”？`)) setDatabase((current) => deleteSave(current, save.id)); }}><TrashIcon size={18} /></button></div></article>;
    })}</div>}
  </div>;
}
