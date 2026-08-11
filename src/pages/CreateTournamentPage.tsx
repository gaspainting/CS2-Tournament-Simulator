import { useDeferredValue, useMemo, useState } from "react";
import StageEditor from "../components/StageEditor";
import TeamEditor from "../components/TeamEditor";
import { BackIcon, CheckIcon, PlusIcon, SearchIcon } from "../components/icons";
import { normalizeStageConfig } from "../domain/stageConfig";
import type { TournamentTemplate } from "../domain/types";
import { validateRoster, validateTemplate } from "../domain/validation";
import { useAppStore } from "../state/AppStore";
import { autoFillParticipants, createTournamentSave } from "../state/operations";

const stepLabels = ["基本信息", "赛制规则", "操纵队", "参赛名单", "确认创建"];

export default function CreateTournamentPage() {
  const { database, setDatabase, setPage, setActiveSaveId, setError } = useAppStore();
  const [step, setStep] = useState(0);
  const [templateId, setTemplateId] = useState(database.templates[0]?.id ?? "");
  const selectedTemplate = database.templates.find((template) => template.id === templateId) ?? database.templates[0];
  const [draft, setDraft] = useState<TournamentTemplate>(() => ({ ...structuredClone(selectedTemplate), stages: selectedTemplate.stages.map((stage) => normalizeStageConfig(stage, stage.type, selectedTemplate.teamCount)) }));
  const [name, setName] = useState(`${selectedTemplate?.name ?? "CS2"} 新赛事`);
  const playableTeams = useMemo(() => database.teams.filter((team) => validateRoster(team, database.players).length === 0), [database.players, database.teams]);
  const [controlledTeamId, setControlledTeamId] = useState(playableTeams[0]?.id ?? "");
  const [selectedIds, setSelectedIds] = useState<string[]>(controlledTeamId ? [controlledTeamId] : []);
  const [selectionMode, setSelectionMode] = useState<"auto" | "manual">("auto");
  const [professionalPercent, setProfessionalPercent] = useState(database.settings.defaultProfessionalPercent);
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query.toLowerCase());
  const [teamEditorOpen, setTeamEditorOpen] = useState(false);

  const chooseTemplate = (id: string) => {
    const next = database.templates.find((template) => template.id === id);
    if (!next) return;
    setTemplateId(id);
    setDraft({ ...structuredClone(next), stages: next.stages.map((stage) => normalizeStageConfig(stage, stage.type, next.teamCount)) });
    setName(`${next.name} 新赛事`);
    setSelectedIds(controlledTeamId ? [controlledTeamId] : []);
  };
  const updateStage = (index: number, stage: TournamentTemplate["stages"][number]) => setDraft((current) => ({ ...current, stages: current.stages.map((item, stageIndex) => stageIndex === index ? stage : item) }));
  const selectControlled = (id: string) => {
    setControlledTeamId(id);
    setSelectedIds((current) => current.includes(id) ? current : [id, ...current.filter((item) => item !== id)]);
  };
  const fill = () => {
    try { setSelectedIds(autoFillParticipants(database, draft, controlledTeamId, professionalPercent, Date.now() >>> 0, selectedIds)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
  };
  const toggleParticipant = (id: string) => setSelectedIds((current) => current.includes(id) ? (id === controlledTeamId ? current : current.filter((item) => item !== id)) : current.length < draft.teamCount ? [...current, id] : current);
  const issues = [
    ...validateTemplate(draft),
    ...(!name.trim() ? ["请输入赛事名称"] : []),
    ...(!controlledTeamId ? ["请选择操纵队"] : []),
    ...(selectedIds.length !== draft.teamCount ? [`参赛名单需要 ${draft.teamCount} 支队伍，当前为 ${selectedIds.length} 支`] : []),
    ...(new Set(selectedIds).size !== selectedIds.length ? ["参赛名单存在重复队伍"] : []),
  ];
  const create = () => {
    if (issues.length) { setError(issues.join("；")); return; }
    try {
      const next = createTournamentSave(database, name.trim(), draft, selectedIds, controlledTeamId, Date.now() >>> 0);
      setDatabase(next);
      setActiveSaveId(next.saves[0].id);
      setPage("tournament");
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
  };

  return <div className="page-shell create-page">
    <header className="page-header"><div><span>TOURNAMENT WIZARD</span><h1>创建赛事</h1><p>从常见模板开始，或逐阶段修改为完全自定义赛制。</p></div><button className="secondary-button" onClick={() => setPage("saves")}><BackIcon size={18} />返回存档</button></header>
    <div className="wizard-steps">{stepLabels.map((label, index) => <button key={label} className={step === index ? "is-active" : index < step ? "is-complete" : ""} onClick={() => setStep(index)}><span>{index < step ? <CheckIcon size={17} /> : index + 1}</span>{label}</button>)}</div>
    <section className="wizard-panel">
      {step === 0 && <><div className="section-heading"><span>STEP 01</span><h2>赛事名称与预设模板</h2></div><label className="wide-field">赛事名称<input value={name} maxLength={48} onChange={(event) => setName(event.target.value)} /></label><div className="template-picker">{database.templates.map((template) => <button key={template.id} className={templateId === template.id ? "is-selected" : ""} onClick={() => chooseTemplate(template.id)}><span>{template.builtIn ? "内置模式" : "自定义"}</span><strong>{template.name}</strong><small>{template.teamCount} 队 · {template.stages.length} 阶段</small></button>)}</div></>}
      {step === 1 && <><div className="section-heading"><span>STEP 02</span><h2>赛制规则</h2><p>修改内容只作用于本次赛事，不会覆盖模板库。</p></div><label className="inline-number-field">参赛队伍数<input type="number" min="4" max="64" step="2" value={draft.teamCount} onChange={(event) => { const teamCount = Number(event.target.value); setDraft((current) => ({ ...current, teamCount, stages: current.stages.map((stage) => normalizeStageConfig(stage, stage.type, teamCount)) })); setSelectedIds((current) => current.slice(0, teamCount)); }} /></label><div className="stage-editor-list">{draft.stages.map((stage, index) => <StageEditor key={stage.id} stage={stage} index={index} teamCount={draft.teamCount} onChange={(next) => updateStage(index, next)} />)}</div></>}
      {step === 2 && <><div className="section-heading row"><div><span>STEP 03</span><h2>选择操纵队</h2><p>操纵队比赛会暂停，由你填写最终系列赛比分。</p></div><button className="secondary-button" onClick={() => setTeamEditorOpen(true)}><PlusIcon size={18} />现场创建自建队</button></div><label className="search-box standalone"><SearchIcon size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索队伍" /></label><div className="team-choice-grid">{playableTeams.filter((team) => `${team.name} ${team.shortName}`.toLowerCase().includes(deferred)).map((team) => <button className={controlledTeamId === team.id ? "is-selected" : ""} key={team.id} onClick={() => selectControlled(team.id)}><span className="team-mark" style={{ borderColor: team.color, color: team.color }}>{team.shortName.slice(0, 4)}</span><div><strong>{team.name}</strong><small>{team.source === "professional" ? "职业" : team.source === "fictional" ? "虚构" : "自建"} · {team.rating}</small></div>{controlledTeamId === team.id && <CheckIcon size={20} />}</button>)}</div></>}
      {step === 3 && <><div className="section-heading"><span>STEP 04</span><h2>组建参赛名单</h2></div><div className="selection-toolbar"><div className="segmented-control"><button className={selectionMode === "auto" ? "is-active" : ""} onClick={() => setSelectionMode("auto")}>条件自动补齐</button><button className={selectionMode === "manual" ? "is-active" : ""} onClick={() => setSelectionMode("manual")}>全部手动选择</button></div><strong>{selectedIds.length} / {draft.teamCount}</strong></div>{selectionMode === "auto" && <div className="autofill-panel"><label>职业队占比 <strong>{professionalPercent}%</strong><input type="range" min="0" max="100" step="10" value={professionalPercent} onChange={(event) => setProfessionalPercent(Number(event.target.value))} /></label><button className="primary-button" onClick={fill}>按条件补齐名单</button></div>}<label className="search-box standalone"><SearchIcon size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索参赛队" /></label><div className="participant-list">{playableTeams.filter((team) => `${team.name} ${team.shortName}`.toLowerCase().includes(deferred)).map((team) => <label className={selectedIds.includes(team.id) ? "is-selected" : ""} key={team.id}><input type="checkbox" checked={selectedIds.includes(team.id)} onChange={() => toggleParticipant(team.id)} disabled={team.id === controlledTeamId} /><span className="team-mark" style={{ borderColor: team.color, color: team.color }}>{team.shortName.slice(0, 4)}</span><span><strong>{team.name}</strong><small>{team.source === "professional" ? "职业" : team.source === "fictional" ? "虚构" : "自建"} · {team.region}</small></span>{team.id === controlledTeamId && <b>操纵队</b>}</label>)}</div></>}
      {step === 4 && <><div className="section-heading"><span>STEP 05</span><h2>检查并创建</h2></div><div className="review-grid"><div><span>赛事</span><strong>{name || "未命名"}</strong><small>{draft.name}</small></div><div><span>参赛规模</span><strong>{selectedIds.length} / {draft.teamCount}</strong><small>{draft.stages.length} 个阶段</small></div><div><span>操纵队</span><strong>{database.teams.find((team) => team.id === controlledTeamId)?.name ?? "未选择"}</strong><small>手动填写比分</small></div><div><span>职业队占比</span><strong>{selectedIds.length ? Math.round(selectedIds.filter((id) => database.teams.find((team) => team.id === id)?.source === "professional").length / selectedIds.length * 100) : 0}%</strong><small>其余为虚构或自建队</small></div></div>{issues.length ? <div className="validation-list"><strong>还需要处理：</strong>{issues.map((issue) => <span key={issue}>{issue}</span>)}</div> : <div className="ready-banner"><CheckIcon size={24} /><div><strong>赛事配置有效</strong><span>创建后会保存所有参赛队和阵容快照。</span></div></div>}</>}
    </section>
    <footer className="wizard-footer"><button className="secondary-button" disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))}>上一步</button>{step < 4 ? <button className="primary-button" onClick={() => setStep((current) => Math.min(4, current + 1))}>下一步</button> : <button className="primary-button" disabled={issues.length > 0} onClick={create}><CheckIcon size={18} />创建并进入赛事</button>}</footer>
    {teamEditorOpen && <TeamEditor onClose={() => setTeamEditorOpen(false)} onSaved={(id) => selectControlled(id)} />}
  </div>;
}
