import { useDeferredValue, useMemo, useRef, useState } from "react";
import StageEditor from "../components/StageEditor";
import TeamEditor from "../components/TeamEditor";
import { CopyIcon, DownloadIcon, EditIcon, PlusIcon, SearchIcon, TrashIcon, UploadIcon } from "../components/icons";
import { filterPlayers } from "../domain/playerFilters";
import { createStageConfig, normalizeStageConfig } from "../domain/stageConfig";
import type { Player, TournamentTemplate } from "../domain/types";
import { useAppStore } from "../state/AppStore";
import {
  copyTeamToCustom,
  deletePlayer,
  deleteTeam,
  deleteTemplate,
  exportCustomTeamPackage,
  exportTemplatePackage,
  importCustomTeamPackage,
  importTemplatePackage,
  upsertPlayer,
  upsertTemplate,
} from "../state/operations";

const sourceLabel = { professional: "职业", fictional: "虚构", custom: "自建" } as const;

function downloadJson(name: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <header className="page-header"><div><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</header>;
}

export function TeamsPage() {
  const { database, setDatabase, setError } = useAppStore();
  const [source, setSource] = useState<"all" | "professional" | "fictional" | "custom">("all");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.toLowerCase());
  const [editorTeamId, setEditorTeamId] = useState<string | undefined>();
  const [editorOpen, setEditorOpen] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const playerById = useMemo(() => new Map(database.players.map((player) => [player.id, player])), [database.players]);
  const teams = database.teams.filter((team) => (source === "all" || team.source === source) && `${team.name} ${team.shortName} ${team.region}`.toLowerCase().includes(deferredQuery));

  const remove = (id: string, name: string) => {
    if (!window.confirm(`删除队伍“${name}”？历史赛事快照不会受影响。`)) return;
    setDatabase((current) => deleteTeam(current, id));
  };
  const copy = (id: string) => {
    try { setDatabase((current) => copyTeamToCustom(current, id)); } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
  };
  const importTeam = async (file?: File) => {
    if (!file) return;
    try {
      const value = JSON.parse(await file.text());
      setDatabase((current) => importCustomTeamPackage(current, value));
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { if (importRef.current) importRef.current.value = ""; }
  };
  const exportTeam = (id: string, name: string) => {
    try { downloadJson(`${name}.team.json`, exportCustomTeamPackage(database, id)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
  };

  return <div className="page-shell">
    <PageHeader eyebrow="TEAM LIBRARY" title="队伍库" description="职业、自建和虚构队伍共用同一套阵容与实力模型。" action={<div className="header-actions"><input ref={importRef} hidden type="file" accept="application/json" onChange={(event) => void importTeam(event.target.files?.[0])} /><button className="secondary-button" onClick={() => importRef.current?.click()}><UploadIcon size={18} />导入自建队</button><button className="primary-button" onClick={() => { setEditorTeamId(undefined); setEditorOpen(true); }}><PlusIcon size={19} />创建自建队</button></div>} />
    <div className="filter-bar"><div className="segmented-control">{(["all", "professional", "fictional", "custom"] as const).map((value) => <button className={source === value ? "is-active" : ""} key={value} onClick={() => setSource(value)}>{value === "all" ? "全部" : sourceLabel[value]}</button>)}</div><label className="search-box"><SearchIcon size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索队名、简称或地区" /></label><span className="result-count">{teams.length} 支队伍</span></div>
    <div className="data-table team-table"><div className="data-table__head"><span>队伍</span><span>来源 / 地区</span><span>五名首发</span><span>实力</span><span>操作</span></div>{teams.map((team) => <div className="data-table__row" key={team.id}><div className="team-cell"><span className="team-mark" style={{ borderColor: team.color, color: team.color }}>{team.shortName.slice(0, 4)}</span><div><strong>{team.name}</strong><small>{team.roster.substitutes.length} 替补 · {team.roster.coachId ? "有教练" : "无教练"}</small></div></div><div><span className={`source-badge source-${team.source}`}>{sourceLabel[team.source]}</span><small>{team.region}</small></div><div className="roster-names">{team.roster.starters.map((id) => <span key={id}>{playerById.get(id)?.nickname ?? "未知"}</span>)}</div><div className="rating-cell"><strong>{team.rating}</strong><span>{Math.round(team.stability * 100)}% 稳定</span></div><div className="row-actions"><button title="复制为自建队" onClick={() => copy(team.id)}><CopyIcon size={18} /></button>{team.source === "custom" && <><button title="导出自建队" onClick={() => exportTeam(team.id, team.name)}><DownloadIcon size={18} /></button><button title="编辑" onClick={() => { setEditorTeamId(team.id); setEditorOpen(true); }}><EditIcon size={18} /></button></>}<button title="删除" className="danger" onClick={() => remove(team.id, team.name)}><TrashIcon size={18} /></button></div></div>)}</div>
    {editorOpen && <TeamEditor teamId={editorTeamId} onClose={() => setEditorOpen(false)} />}
  </div>;
}

function PlayerEditor({ player, onClose }: { player: Player; onClose: () => void }) {
  const { setDatabase, setError } = useAppStore();
  const [draft, setDraft] = useState(player);
  const save = () => {
    try { setDatabase((database) => upsertPlayer(database, { ...draft, updatedAt: new Date().toISOString().slice(0, 10) })); onClose(); } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
  };
  return <div className="modal-backdrop"><section className="small-modal"><header><h2>编辑选手</h2></header><div className="form-grid"><label>游戏 ID<input value={draft.nickname} onChange={(event) => setDraft({ ...draft, nickname: event.target.value })} /></label><label>真实姓名<input value={draft.realName} onChange={(event) => setDraft({ ...draft, realName: event.target.value })} /></label><label>国籍<input value={draft.nationality} onChange={(event) => setDraft({ ...draft, nationality: event.target.value })} /></label><label>年龄<input type="number" min="16" max="45" value={draft.age} onChange={(event) => setDraft({ ...draft, age: Number(event.target.value) })} /></label><label>位置<select value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value as Player["role"] })}>{["IGL", "AWPer", "Entry", "Rifler", "Support", "Coach", "Unset"].map((role) => <option key={role}>{role}</option>)}</select></label><label>评分<input type="number" min="0.5" max="2" step="0.01" value={draft.rating} onChange={(event) => setDraft({ ...draft, rating: Number(event.target.value) })} /></label></div><footer><button className="secondary-button" onClick={onClose}>取消</button><button className="primary-button" onClick={save}>保存</button></footer></section></div>;
}

export function PlayersPage() {
  const { database, setDatabase, setError } = useAppStore();
  const [source, setSource] = useState<"all" | Player["source"]>("all");
  const [role, setRole] = useState("all");
  const [teamId, setTeamId] = useState("all");
  const [minRating, setMinRating] = useState(0.5);
  const [maxRating, setMaxRating] = useState(2);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Player | null>(null);
  const deferred = useDeferredValue(query.toLowerCase());
  const teamByPlayer = useMemo(() => {
    const map = new Map<string, string>();
    database.teams.forEach((team) => [...team.roster.starters, ...team.roster.substitutes, ...(team.roster.coachId ? [team.roster.coachId] : [])].forEach((id) => map.set(id, team.name)));
    return map;
  }, [database.teams]);
  const players = filterPlayers(database.players, database.teams, { source, role: role as "all" | Player["role"], teamId, query: deferred, minRating, maxRating }).sort((a, b) => b.rating - a.rating);
  const remove = (player: Player) => { try { if (window.confirm(`删除选手“${player.nickname}”？`)) setDatabase((database) => deletePlayer(database, player.id)); } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); } };
  return <div className="page-shell"><PageHeader eyebrow="PLAYER DATABASE" title="选手库" description="查看游戏 ID、真实姓名、国籍、年龄、位置和评分。" />
    <div className="filter-bar player-filters"><label className="search-box"><SearchIcon size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索游戏 ID、姓名或国籍" /></label><select value={source} onChange={(event) => setSource(event.target.value as typeof source)}><option value="all">全部来源</option><option value="professional">职业</option><option value="fictional">虚构</option><option value="custom">自建</option></select><select value={role} onChange={(event) => setRole(event.target.value)}><option value="all">全部位置</option>{["IGL", "AWPer", "Entry", "Rifler", "Support", "Coach", "Unset"].map((item) => <option key={item}>{item}</option>)}</select><select value={teamId} onChange={(event) => setTeamId(event.target.value)}><option value="all">全部队伍</option><option value="unassigned">自由选手</option>{database.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select><label className="rating-filter">Rating<input aria-label="最低 Rating" type="number" min="0.5" max={maxRating} step="0.01" value={minRating} onChange={(event) => setMinRating(Number(event.target.value))} /><span>至</span><input aria-label="最高 Rating" type="number" min={minRating} max="2" step="0.01" value={maxRating} onChange={(event) => setMaxRating(Number(event.target.value))} /></label><span className="result-count">{players.length} 名选手</span></div>
    <div className="data-table player-table"><div className="data-table__head"><span>选手</span><span>国籍 / 年龄</span><span>队伍</span><span>位置</span><span>Rating</span><span>操作</span></div>{players.map((player) => <div className="data-table__row" key={player.id}><div><strong>{player.nickname}</strong><small>{player.realName}</small></div><div><span>{player.nationality}</span><small>{player.age} 岁</small></div><div><span>{teamByPlayer.get(player.id) ?? "自由选手"}</span><small>{sourceLabel[player.source]}</small></div><div><span className="role-badge">{player.role}</span></div><div className="player-rating"><strong>{player.rating.toFixed(2)}</strong><span>{player.sampleStatus === "insufficient" ? "样本不足" : player.updatedAt}</span></div><div className="row-actions">{player.source === "custom" && <button title="编辑" onClick={() => setEditing(player)}><EditIcon size={18} /></button>}<button title="删除" className="danger" onClick={() => remove(player)}><TrashIcon size={18} /></button></div></div>)}</div>
    {editing && <PlayerEditor player={editing} onClose={() => setEditing(null)} />}
  </div>;
}

function TemplateEditor({ template, onClose }: { template: TournamentTemplate; onClose: () => void }) {
  const { setDatabase, setError } = useAppStore();
  const [draft, setDraft] = useState<TournamentTemplate>(() => ({ ...structuredClone(template), stages: template.stages.map((stage) => normalizeStageConfig(stage, stage.type, template.teamCount)) }));
  const updateStage = (index: number, stage: TournamentTemplate["stages"][number]) => setDraft((current) => ({ ...current, stages: current.stages.map((item, stageIndex) => stageIndex === index ? stage : item) }));
  const save = () => { try { setDatabase((database) => upsertTemplate(database, { ...draft, builtIn: false })); onClose(); } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); } };
  return <div className="modal-backdrop"><section className="editor-modal template-editor"><header className="editor-modal__header"><div><span>FORMAT BUILDER</span><h2>赛事模板编辑器</h2></div></header><div className="editor-modal__body"><div className="form-grid"><label>模板名称<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label>参赛队数<input type="number" min="4" max="64" step="2" value={draft.teamCount} onChange={(event) => { const teamCount = Number(event.target.value); setDraft((current) => ({ ...current, teamCount, stages: current.stages.map((stage) => normalizeStageConfig(stage, stage.type, teamCount)) })); }} /></label></div><div className="stage-editor-list">{draft.stages.map((stage, index) => <StageEditor key={stage.id} stage={stage} index={index} teamCount={draft.teamCount} onChange={(next) => updateStage(index, next)} canRemove={draft.stages.length > 1} onRemove={() => setDraft((current) => ({ ...current, stages: current.stages.filter((_, stageIndex) => stageIndex !== index) }))} />)}</div><button className="secondary-button" onClick={() => setDraft((current) => ({ ...current, stages: [...current.stages, createStageConfig(`stage-${Date.now()}`, "single_elimination", current.teamCount)] }))}><PlusIcon size={17} />添加阶段</button></div><footer className="editor-modal__footer"><button className="secondary-button" onClick={onClose}>取消</button><button className="primary-button" onClick={save}>保存模板</button></footer></section></div>;
}

export function TemplatesPage() {
  const { database, setDatabase, setError } = useAppStore();
  const [editing, setEditing] = useState<TournamentTemplate | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const duplicate = (template: TournamentTemplate) => setEditing({ ...structuredClone(template), id: `custom-template-${Date.now()}`, name: `${template.name} 副本`, builtIn: false });
  const importTemplate = async (file?: File) => {
    if (!file) return;
    try {
      const value = JSON.parse(await file.text());
      setDatabase((current) => importTemplatePackage(current, value));
    }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { if (importRef.current) importRef.current.value = ""; }
  };
  const exportTemplate = (template: TournamentTemplate) => {
    try { downloadJson(`${template.name}.template.json`, exportTemplatePackage(template)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
  };
  return <div className="page-shell"><PageHeader eyebrow="FORMAT LIBRARY" title="赛事模板" description="直接使用常见模式，或复制后修改队伍数、阶段、晋级和 BO 规则。" action={<div className="header-actions"><input ref={importRef} hidden type="file" accept="application/json" onChange={(event) => void importTemplate(event.target.files?.[0])} /><button className="secondary-button" onClick={() => importRef.current?.click()}><UploadIcon size={18} />导入模板</button><button className="primary-button" onClick={() => setEditing({ id: `custom-template-${Date.now()}`, name: "自定义赛事", builtIn: false, teamCount: 8, stages: [{ id: `stage-${Date.now()}`, name: "淘汰赛", type: "single_elimination", advanceCount: 1, bestOf: { default: 3, final: 5 } }] })}><PlusIcon size={18} />新建模板</button></div>} />
    <div className="template-list">{database.templates.map((template) => <article className="template-row" key={template.id}><div><span className={template.builtIn ? "source-badge source-professional" : "source-badge source-custom"}>{template.builtIn ? "内置" : "自定义"}</span><h3>{template.name}</h3><p>{template.description ?? template.stages.map((stage) => stage.name).join(" → ")}</p></div><div className="template-row__stats"><span><strong>{template.teamCount}</strong> 队</span><span><strong>{template.stages.length}</strong> 阶段</span></div><div className="row-actions"><button title="导出模板" onClick={() => exportTemplate(template)}><DownloadIcon size={18} /></button><button title="复制" onClick={() => duplicate(template)}><CopyIcon size={18} /></button>{!template.builtIn && <><button title="编辑" onClick={() => setEditing(template)}><EditIcon size={18} /></button><button title="删除" className="danger" onClick={() => setDatabase((database) => deleteTemplate(database, template.id))}><TrashIcon size={18} /></button></>}</div></article>)}</div>
    {editing && <TemplateEditor template={editing} onClose={() => setEditing(null)} />}
  </div>;
}
