import type { NavigationPage } from "../state/AppStore";
import { BracketIcon, DatabaseIcon, FolderIcon, GearIcon, PlusIcon, TrophyIcon, UserIcon, UsersIcon } from "./icons";

type Props = { page: NavigationPage; onNavigate: (page: NavigationPage) => void; saveCount: number; teamCount: number; playerCount: number };

const items: { id: NavigationPage; label: string; icon: typeof TrophyIcon }[] = [
  { id: "saves", label: "赛事存档", icon: FolderIcon },
  { id: "create", label: "创建赛事", icon: PlusIcon },
  { id: "teams", label: "队伍库", icon: UsersIcon },
  { id: "players", label: "选手库", icon: UserIcon },
  { id: "templates", label: "模板库", icon: BracketIcon },
  { id: "data", label: "数据中心", icon: DatabaseIcon },
  { id: "settings", label: "设置", icon: GearIcon },
];

export default function AppSidebar({ page, onNavigate, saveCount, teamCount, playerCount }: Props) {
  return (
    <aside className="app-sidebar">
      <div className="app-sidebar__status"><span>赛事工作台</span><strong><i /> 本地数据已连接</strong></div>
      <nav aria-label="主导航">
        {items.map((item) => {
          const Icon = item.icon;
          return <button className={page === item.id ? "is-active" : ""} key={item.id} onClick={() => onNavigate(item.id)}><Icon size={21} /><span>{item.label}</span>{item.id === "saves" && <b>{saveCount}</b>}</button>;
        })}
      </nav>
      <div className="app-sidebar__summary">
        <TrophyIcon size={19} />
        <div><span>本地资产</span><strong>{teamCount} 队 · {playerCount} 人</strong></div>
      </div>
    </aside>
  );
}
