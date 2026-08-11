import { useMemo, useState } from "react";
import type { Player, PlayerRole, Team } from "../domain/types";
import { validatePlayer } from "../domain/validation";
import { useAppStore } from "../state/AppStore";
import { upsertTeam } from "../state/operations";
import { CloseIcon, PlusIcon, SaveIcon, TrashIcon } from "./icons";

type DraftPlayer = Pick<Player, "id" | "nickname" | "realName" | "nationality" | "age" | "role" | "rating">;
type Props = { teamId?: string; onClose: () => void; onSaved?: (teamId: string) => void };
const STARTER_ROLES: PlayerRole[] = ["IGL", "AWPer", "Entry", "Rifler", "Support"];

function emptyPlayer(role: PlayerRole, index: number): DraftPlayer {
  return { id: "", nickname: "", realName: "", nationality: "中国", age: 20 + index, role, rating: 1 };
}

export default function TeamEditor({ teamId, onClose, onSaved }: Props) {
  const { database, setDatabase, setError } = useAppStore();
  const existing = database.teams.find((team) => team.id === teamId);
  const playerById = useMemo(() => new Map(database.players.map((player) => [player.id, player])), [database.players]);
  const [name, setName] = useState(existing?.name ?? "");
  const [shortName, setShortName] = useState(existing?.shortName ?? "");
  const [region, setRegion] = useState(existing?.region ?? "Asia");
  const [color, setColor] = useState(existing?.color ?? "#e5484d");
  const [language, setLanguage] = useState<"zh" | "en">(existing?.language ?? "zh");
  const [starters, setStarters] = useState<DraftPlayer[]>(() => existing
    ? existing.roster.starters.map((id, index) => ({ ...(playerById.get(id) ?? emptyPlayer(STARTER_ROLES[index], index)) }))
    : STARTER_ROLES.map(emptyPlayer));
  const [substitutes, setSubstitutes] = useState<DraftPlayer[]>(() => existing?.roster.substitutes.map((id, index) => ({ ...(playerById.get(id) ?? emptyPlayer("Rifler", index)) })) ?? []);
  const [coach, setCoach] = useState<DraftPlayer | null>(() => existing?.roster.coachId ? { ...(playerById.get(existing.roster.coachId) ?? emptyPlayer("Coach", 0)), role: "Coach" } : null);

  const updateDraft = (setter: React.Dispatch<React.SetStateAction<DraftPlayer[]>>, index: number, key: keyof DraftPlayer, value: string | number) => {
    setter((current) => current.map((player, playerIndex) => playerIndex === index ? { ...player, [key]: value } : player));
  };

  const save = () => {
    try {
      if (!name.trim()) throw new Error("请输入队伍名称");
      if (starters.some((player) => !player.nickname.trim() || !player.realName.trim())) throw new Error("五名首发必须填写游戏 ID 和真实姓名");
      const stamp = Date.now().toString(36);
      const date = new Date().toISOString().slice(0, 10);
      const allDrafts = [...starters, ...substitutes, ...(coach ? [coach] : [])];
      const players: Player[] = allDrafts.map((draft, index) => ({
        id: draft.id || `custom-player-${stamp}-${index}`,
        nickname: draft.nickname.trim(),
        realName: draft.realName.trim(),
        nationality: draft.nationality.trim(),
        age: Number(draft.age),
        role: draft.role,
        rating: Number(draft.rating),
        source: "custom",
        updatedAt: date,
      }));
      players.forEach((player, index) => {
        const errors = validatePlayer(player);
        if (errors.length) {
          const label = index < 5 ? `首发 ${index + 1}` : index < 5 + substitutes.length ? `替补 ${index - 4}` : "教练";
          throw new Error(`${label}：${errors.join("；")}`);
        }
      });
      const team: Team = {
        id: existing?.id ?? `custom-team-${stamp}`,
        name: name.trim(),
        shortName: shortName.trim() || name.trim().slice(0, 4).toUpperCase(),
        region,
        color,
        source: "custom",
        language,
        roster: {
          starters: players.slice(0, 5).map((player) => player.id),
          substitutes: players.slice(5, 5 + substitutes.length).map((player) => player.id),
          coachId: coach ? players[players.length - 1].id : undefined,
        },
        rating: Math.round(900 + starters.reduce((sum, player) => sum + Number(player.rating), 0) / 5 * 650),
        stability: existing?.stability ?? 0.65,
        updatedAt: date,
      };
      setDatabase((current) => {
        const ids = new Set(players.map((player) => player.id));
        const next = { ...current, players: [...current.players.filter((player) => !ids.has(player.id)), ...players] };
        return upsertTeam(next, team);
      });
      onSaved?.(team.id);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const renderPlayer = (player: DraftPlayer, index: number, kind: "starter" | "substitute") => {
    const setter = kind === "starter" ? setStarters : setSubstitutes;
    return (
      <div className="roster-editor__row" key={`${kind}-${index}`}>
        <span className="roster-editor__slot">{kind === "starter" ? `首发 ${index + 1}` : `替补 ${index + 1}`}</span>
        <input aria-label="游戏 ID" value={player.nickname} onChange={(event) => updateDraft(setter, index, "nickname", event.target.value)} placeholder="游戏 ID" />
        <input aria-label="真实姓名" value={player.realName} onChange={(event) => updateDraft(setter, index, "realName", event.target.value)} placeholder="真实姓名" />
        <input aria-label="国籍" value={player.nationality} onChange={(event) => updateDraft(setter, index, "nationality", event.target.value)} placeholder="国籍" />
        <input aria-label="年龄" className="is-number" type="number" min="16" max="45" value={player.age} onChange={(event) => updateDraft(setter, index, "age", Number(event.target.value))} />
        <select aria-label="位置" value={player.role} onChange={(event) => updateDraft(setter, index, "role", event.target.value as PlayerRole)}>{STARTER_ROLES.map((role) => <option key={role}>{role}</option>)}</select>
        <input aria-label="评分" className="is-number" type="number" min="0.5" max="2" step="0.01" value={player.rating} onChange={(event) => updateDraft(setter, index, "rating", Number(event.target.value))} />
        {kind === "substitute" && <button className="icon-button danger" aria-label="删除替补" onClick={() => setSubstitutes((current) => current.filter((_, itemIndex) => itemIndex !== index))}><TrashIcon size={18} /></button>}
      </div>
    );
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="editor-modal" role="dialog" aria-modal="true" aria-label="队伍编辑器">
        <header className="editor-modal__header"><div><span>TEAM BUILDER</span><h2>{existing ? "编辑自建队" : "创建自建队"}</h2></div><button className="icon-button" aria-label="关闭" onClick={onClose}><CloseIcon size={22} /></button></header>
        <div className="editor-modal__body">
          <div className="form-grid form-grid--team">
            <label>队伍名称<input value={name} onChange={(event) => setName(event.target.value)} placeholder={language === "zh" ? "例如：凌云竞技" : "Example: Northwind"} /></label>
            <label>简称<input value={shortName} maxLength={6} onChange={(event) => setShortName(event.target.value)} placeholder="2-6 字符" /></label>
            <label>地区<select value={region} onChange={(event) => setRegion(event.target.value)}><option>Asia</option><option>Europe</option><option>Americas</option><option>Oceania</option><option>International</option></select></label>
            <label>命名语言<select value={language} onChange={(event) => setLanguage(event.target.value as "zh" | "en")}><option value="zh">纯中文</option><option value="en">纯英文</option></select></label>
            <label>队伍颜色<input className="color-input" type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label>
          </div>
          <div className="roster-editor__head"><div><span>ACTIVE ROSTER</span><h3>首发阵容</h3></div><span>游戏 ID · 姓名 · 国籍 · 年龄 · 位置 · 评分</span></div>
          <div className="roster-editor">{starters.map((player, index) => renderPlayer(player, index, "starter"))}</div>
          <div className="roster-editor__head compact"><div><span>OPTIONAL</span><h3>替补与教练</h3></div><div className="inline-actions"><button className="secondary-button" disabled={substitutes.length >= 2} onClick={() => setSubstitutes((current) => [...current, emptyPlayer("Rifler", current.length)])}><PlusIcon size={17} />添加替补</button><button className="secondary-button" disabled={!!coach} onClick={() => setCoach(emptyPlayer("Coach", 0))}><PlusIcon size={17} />添加教练</button></div></div>
          {substitutes.map((player, index) => renderPlayer(player, index, "substitute"))}
          {coach && <div className="roster-editor__row"><span className="roster-editor__slot">教练</span><input value={coach.nickname} onChange={(event) => setCoach({ ...coach, nickname: event.target.value })} placeholder="游戏 ID" /><input value={coach.realName} onChange={(event) => setCoach({ ...coach, realName: event.target.value })} placeholder="真实姓名" /><input value={coach.nationality} onChange={(event) => setCoach({ ...coach, nationality: event.target.value })} placeholder="国籍" /><input className="is-number" type="number" min="16" max="45" value={coach.age} onChange={(event) => setCoach({ ...coach, age: Number(event.target.value) })} /><span className="static-field">Coach</span><span className="static-field">不计战力</span><button className="icon-button danger" aria-label="删除教练" onClick={() => setCoach(null)}><TrashIcon size={18} /></button></div>}
        </div>
        <footer className="editor-modal__footer"><button className="secondary-button" onClick={onClose}>取消</button><button className="primary-button" onClick={save}><SaveIcon size={18} />保存队伍</button></footer>
      </section>
    </div>
  );
}
