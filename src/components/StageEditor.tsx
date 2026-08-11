import { normalizeStageConfig, qualifiersPerGroup } from "../domain/stageConfig";
import type { BestOf, StageConfig, StageType } from "../domain/types";
import { TrashIcon } from "./icons";

type Props = {
  stage: StageConfig;
  index: number;
  teamCount: number;
  onChange: (stage: StageConfig) => void;
  onRemove?: () => void;
  canRemove?: boolean;
};

const stageTypes: { value: StageType; label: string }[] = [
  { value: "swiss", label: "瑞士轮" },
  { value: "single_elimination", label: "单败淘汰" },
  { value: "double_elimination", label: "双败淘汰" },
  { value: "round_robin", label: "循环联赛" },
  { value: "groups", label: "分组赛" },
];

function BestOfSelect({ value, onChange }: { value: BestOf; onChange: (value: BestOf) => void }) {
  return <select value={value} onChange={(event) => onChange(Number(event.target.value) as BestOf)}><option value="1">BO1</option><option value="3">BO3</option><option value="5">BO5</option></select>;
}

export default function StageEditor({ stage, index, teamCount, onChange, onRemove, canRemove = false }: Props) {
  const emit = (next: StageConfig) => onChange(index === 0 ? { ...next, inviteCount: undefined } : next);
  const patch = (next: Partial<StageConfig>) => emit({ ...stage, ...next });
  const updateOptionalCount = (key: "entrantCount" | "inviteCount", value: string) => {
    emit(normalizeStageConfig({ ...stage, [key]: value === "" ? undefined : Number(value) }, stage.type, teamCount));
  };
  const updateBestOf = (key: "default" | "decisive" | "final", value: BestOf) => patch({ bestOf: { ...stage.bestOf, [key]: value } });
  const groupCount = stage.groupCount ?? 2;
  const perGroup = qualifiersPerGroup(stage);

  return <div className="stage-editor">
    <div className="stage-editor__main">
      <span className="stage-editor__number">{index + 1}</span>
      <input aria-label="阶段名称" value={stage.name} onChange={(event) => patch({ name: event.target.value })} />
      <select aria-label="阶段类型" value={stage.type} onChange={(event) => emit(normalizeStageConfig(stage, event.target.value as StageType, teamCount))}>{stageTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
      <label>{stage.type === "groups" ? "总晋级" : "晋级"}<input type="number" min="1" max={stage.entrantCount ?? teamCount} value={stage.advanceCount} readOnly={stage.type === "groups"} onChange={(event) => patch({ advanceCount: Number(event.target.value) })} /></label>
      <label>默认 BO<BestOfSelect value={stage.bestOf.default} onChange={(value) => updateBestOf("default", value)} /></label>
      {onRemove ? <button className="icon-button danger" aria-label="删除阶段" disabled={!canRemove} onClick={onRemove}><TrashIcon size={18} /></button> : <span />}
    </div>
    <div className="stage-editor__options">
      <label>阶段参赛<input type="number" min="2" max={teamCount} value={stage.entrantCount ?? ""} placeholder="自动" onChange={(event) => updateOptionalCount("entrantCount", event.target.value)} /></label>
      {index > 0 && <label>邀请名额<input type="number" min="0" max={stage.entrantCount ?? teamCount} value={stage.inviteCount ?? ""} placeholder="0" onChange={(event) => updateOptionalCount("inviteCount", event.target.value)} /></label>}
      {stage.type === "swiss" && <>
        <label>晋级胜场<input type="number" min="1" max={teamCount} value={stage.winsToAdvance ?? 3} onChange={(event) => patch({ winsToAdvance: Number(event.target.value) })} /></label>
        <label>淘汰负场<input type="number" min="1" max={teamCount} value={stage.lossesToEliminate ?? 3} onChange={(event) => patch({ lossesToEliminate: Number(event.target.value) })} /></label>
        <label>关键局 BO<BestOfSelect value={stage.bestOf.decisive ?? 3} onChange={(value) => updateBestOf("decisive", value)} /></label>
        <label className="stage-toggle"><input type="checkbox" checked={stage.avoidRematches ?? true} onChange={(event) => patch({ avoidRematches: event.target.checked })} />避免重复对阵</label>
      </>}
      {stage.type === "round_robin" && <label>循环次数<select value={stage.cycles ?? 1} onChange={(event) => patch({ cycles: Number(event.target.value) as 1 | 2 })}><option value="1">单循环</option><option value="2">双循环</option></select></label>}
      {stage.type === "groups" && <>
        <label>小组数量<input type="number" min="2" max={Math.max(2, Math.floor(teamCount / 2))} value={groupCount} onChange={(event) => {
          const nextCount = Number(event.target.value);
          emit(normalizeStageConfig({ ...stage, groupCount: nextCount, advanceCount: nextCount * perGroup }, "groups", teamCount));
        }} /></label>
        <label>每组晋级<input type="number" min="1" max={Math.max(1, Math.floor(teamCount / groupCount))} value={perGroup} onChange={(event) => patch({ advanceCount: groupCount * Number(event.target.value) })} /></label>
        <label>小组赛制<select value={stage.groupFormat ?? "round_robin"} onChange={(event) => emit(normalizeStageConfig({ ...stage, groupFormat: event.target.value as "round_robin" | "swiss" }, "groups", teamCount))}><option value="round_robin">循环赛</option><option value="swiss">瑞士轮</option></select></label>
        {stage.groupFormat !== "swiss" && <label>小组循环<select value={stage.cycles ?? 1} onChange={(event) => patch({ cycles: Number(event.target.value) as 1 | 2 })}><option value="1">单循环</option><option value="2">双循环</option></select></label>}
        {stage.groupFormat === "swiss" && <label>关键局 BO<BestOfSelect value={stage.bestOf.decisive ?? 3} onChange={(value) => updateBestOf("decisive", value)} /></label>}
      </>}
      {(stage.type === "single_elimination" || stage.type === "double_elimination") && <>
        <label>总决赛 BO<BestOfSelect value={stage.bestOf.final ?? 5} onChange={(value) => updateBestOf("final", value)} /></label>
        <label className="stage-toggle"><input type="checkbox" checked={stage.thirdPlace ?? false} onChange={(event) => patch({ thirdPlace: event.target.checked })} />季军赛</label>
        {stage.type === "double_elimination" && <label className="stage-toggle"><input type="checkbox" checked={stage.grandFinalReset ?? false} onChange={(event) => patch({ grandFinalReset: event.target.checked })} />总决赛重置</label>}
      </>}
    </div>
  </div>;
}
