import TitleBar from "./components/TitleBar";
import AppSidebar from "./components/AppSidebar";
import { useAppStore } from "./state/AppStore";
import SavesPage from "./pages/SavesPage";
import CreateTournamentPage from "./pages/CreateTournamentPage";
import { PlayersPage, TeamsPage, TemplatesPage } from "./pages/LibraryPages";
import { DataCenterPage, SettingsPage } from "./pages/DataSettingsPages";
import TournamentPage from "./pages/TournamentPage";
import { AlertIcon, CloseIcon } from "./components/icons";
import "./App.css";

export default function App() {
  const store = useAppStore();
  const content = store.page === "saves" ? <SavesPage />
    : store.page === "create" ? <CreateTournamentPage />
      : store.page === "teams" ? <TeamsPage />
        : store.page === "players" ? <PlayersPage />
          : store.page === "templates" ? <TemplatesPage />
            : store.page === "data" ? <DataCenterPage />
              : store.page === "settings" ? <SettingsPage />
                : <TournamentPage />;

  return (
    <div className="desktop-shell">
      <TitleBar />
      <div className="app-layout">
        <AppSidebar page={store.page} onNavigate={store.setPage} saveCount={store.database.saves.length} teamCount={store.database.teams.length} playerCount={store.database.players.length} />
        <main className="app-main">
          {store.error && <div className="app-error" role="alert"><AlertIcon size={21} /><span>{store.error}</span><button aria-label="关闭错误" onClick={() => store.setError(null)}><CloseIcon size={18} /></button></div>}
          {store.loading ? <div className="app-loading"><span className="app-loading__ring" /><strong>正在载入赛事数据库</strong></div> : content}
        </main>
      </div>
    </div>
  );
}
