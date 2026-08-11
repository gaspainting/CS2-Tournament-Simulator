import { useEffect, useMemo, useState } from "react";
import { BackIcon, CheckIcon, PlayIcon, RefreshIcon, TrophyIcon } from "../components/icons";
import type { Match, TeamSnapshot } from "../domain/types";
import { advanceUntilControlledOrComplete, findControlledMatch, isSwissBye, submitControlledScore } from "../engine/tournamentEngine";
import { useAppStore } from "../state/AppStore";
import { updateSaveTournament } from "../state/operations";

function TeamBadge({ team }: { team?: TeamSnapshot }) {
  return <span className="team-mark" style={{ borderColor: team?.color, color: team?.color }}>{team?.shortName.slice(0, 4) ?? "TBD"}</span>;
}

function MatchRow({ match, teams, controlledTeamId }: { match: Match; teams: Map<string, TeamSnapshot>; controlledTeamId: string }) {
  const a = teams.get(match.teamAId);
  const b = teams.get(match.teamBId);
  const bye = isSwissBye(match);
  const controlled = !bye && (match.teamAId === controlledTeamId || match.teamBId === controlledTeamId);
  return <div className={`match-row${controlled ? " is-controlled" : ""}${match.completed ? " is-complete" : ""}`}><div className="match-row__meta"><span>{bye ? "轮空" : `BO${match.bestOf}`}</span><small>{match.groupId ?? (match.bracket === "lower" ? "败者组" : match.bracket === "upper" ? "胜者组" : match.bracket === "final" ? "总决赛" : match.bracket === "third_place" ? "季军赛" : "")}</small></div><div className={match.winnerTeamId === match.teamAId ? "match-team winner" : "match-team"}><TeamBadge team={a} /><span>{a?.name ?? match.teamAId}</span><strong>{match.scoreA ?? "-"}</strong></div>{bye ? <div className="match-team"><span className="team-mark">BYE</span><span>轮空</span><strong>-</strong></div> : <div className={match.winnerTeamId === match.teamBId ? "match-team winner" : "match-team"}><TeamBadge team={b} /><span>{b?.name ?? match.teamBId}</span><strong>{match.scoreB ?? "-"}</strong></div>}</div>;
}

export default function TournamentPage() {
  const { database, setDatabase, activeSaveId, setPage, setError } = useAppStore();
  const save = database.saves.find((item) => item.id === activeSaveId) ?? database.saves[0];
  const [viewStage, setViewStage] = useState(0);
  const tournament = save?.tournament;
  const controlledMatch = tournament ? findControlledMatch(tournament, tournament.controlledTeamId) : undefined;
  const [scoreFor, setScoreFor] = useState(2);
  const [scoreAgainst, setScoreAgainst] = useState(1);
  useEffect(() => {
    if (!controlledMatch) return;
    setScoreFor(controlledMatch.bestOf === 1 ? 13 : controlledMatch.bestOf === 3 ? 2 : 3);
    setScoreAgainst(controlledMatch.bestOf === 1 ? 8 : 1);
  }, [controlledMatch?.id]);
  useEffect(() => { if (tournament) setViewStage(tournament.stageIndex); }, [tournament?.stageIndex]);
  const teams = useMemo(() => new Map(tournament?.teamSnapshots.map((team) => [team.id, team]) ?? []), [tournament?.teamSnapshots]);

  if (!save || !tournament) return <div className="page-shell"><div className="empty-state"><h2>没有可打开的赛事</h2><button className="primary-button" onClick={() => setPage("create")}>创建赛事</button></div></div>;
  const controlled = teams.get(tournament.controlledTeamId);
  const stage = tournament.template.stages[tournament.stageIndex];
  const stageMatches = [...tournament.matches, ...tournament.currentMatches.filter((match) => !match.completed)].filter((match) => match.stageIndex === viewStage);
  const rounds = [...new Set(stageMatches.map((match) => match.round))].sort((a, b) => a - b);
  const standings = Object.values(tournament.standings).sort((a, b) => b.wins - a.wins || a.losses - b.losses || (b.scoreFor - b.scoreAgainst) - (a.scoreFor - a.scoreAgainst));

  const update = (nextTournament: typeof tournament) => setDatabase((current) => updateSaveTournament(current, save.id, nextTournament));
  const submit = () => { try { update(submitControlledScore(tournament, tournament.controlledTeamId, scoreFor, scoreAgainst)); } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); } };
  const advance = () => { try { update(advanceUntilControlledOrComplete(tournament, tournament.controlledTeamId)); } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); } };
  const champion = tournament.championTeamId ? teams.get(tournament.championTeamId) : undefined;

  return <div className="tournament-page">
    <header className="tournament-header"><div className="tournament-header__top"><button className="secondary-button compact" onClick={() => setPage("saves")}><BackIcon size={17} />赛事存档</button><div><span>{tournament.template.name}</span><h1>{save.name}</h1></div><div className="controlled-chip"><TeamBadge team={controlled} /><span>操纵队<strong>{controlled?.name}</strong></span></div></div><div className="stage-tabs">{tournament.template.stages.map((item, index) => <button className={viewStage === index ? "is-active" : index < tournament.stageIndex || tournament.championTeamId ? "is-complete" : ""} key={item.id} onClick={() => setViewStage(index)}><span>{index < tournament.stageIndex || tournament.championTeamId ? <CheckIcon size={16} /> : index + 1}</span>{item.name}</button>)}</div></header>
    <div className="tournament-content">
      <section className="control-room">
        {champion ? <div className="champion-panel"><TrophyIcon size={46} /><TeamBadge team={champion} /><div><span>TOURNAMENT CHAMPION</span><h2>{champion.name}</h2><p>{champion.id === tournament.controlledTeamId ? "你的操纵队赢得了本届赛事。" : "赛事已经全部结束。"}</p></div></div>
          : controlledMatch ? <><div className="control-room__head"><div><span>MANUAL RESULT REQUIRED</span><h2>{stage.name} · 第 {tournament.round} 轮</h2></div><span className="status-pill active">等待你的比分</span></div><div className="versus-row"><div><TeamBadge team={controlled} /><strong>{controlled?.name}</strong><small>USER CONTROLLED</small></div><span className="versus-row__center"><b>BO{controlledMatch.bestOf}</b><strong>VS</strong></span><div><TeamBadge team={teams.get(controlledMatch.teamAId === tournament.controlledTeamId ? controlledMatch.teamBId : controlledMatch.teamAId)} /><strong>{teams.get(controlledMatch.teamAId === tournament.controlledTeamId ? controlledMatch.teamBId : controlledMatch.teamAId)?.name}</strong><small>AI CONTROLLED</small></div></div><div className="score-entry"><label><span>{controlled?.shortName} 比分</span><input type="number" min="0" max="99" value={scoreFor} onChange={(event) => setScoreFor(Number(event.target.value))} /></label><strong>:</strong><label><span>对手比分</span><input type="number" min="0" max="99" value={scoreAgainst} onChange={(event) => setScoreAgainst(Number(event.target.value))} /></label><button className="primary-button" onClick={submit}><CheckIcon size={19} />提交比赛结果</button></div></>
            : <div className="auto-panel"><div><span>AUTO SIMULATION</span><h2>当前没有操纵队比赛</h2><p>推进其他队伍比赛，直到操纵队下一场或赛事结束。</p></div><button className="primary-button" onClick={advance}><PlayIcon size={19} />推进至下一场</button></div>}
      </section>
      <section className="tournament-section"><div className="section-heading row"><div><span>DYNAMIC MATCHES</span><h2>{tournament.template.stages[viewStage]?.name} 对阵</h2></div><span>{stageMatches.length} 场比赛</span></div>{rounds.length ? <div className="round-board">{rounds.map((round) => <div className="round-column" key={round}><header><span>ROUND {round}</span><strong>第 {round} 轮</strong></header><div>{stageMatches.filter((match) => match.round === round).map((match) => <MatchRow key={match.id} match={match} teams={teams} controlledTeamId={tournament.controlledTeamId} />)}</div></div>)}</div> : <div className="empty-inline">该阶段尚未生成对阵。</div>}</section>
      {viewStage === tournament.stageIndex && standings.length > 1 && <section className="tournament-section"><div className="section-heading row"><div><span>LIVE STANDINGS</span><h2>当前排名</h2></div><button className="icon-button" title="推进" onClick={advance}><RefreshIcon size={19} /></button></div><div className="standings-table">{standings.map((row, index) => <div className={row.teamId === tournament.controlledTeamId ? "is-controlled" : ""} key={row.teamId}><span>{String(index + 1).padStart(2, "0")}</span><TeamBadge team={teams.get(row.teamId)} /><strong>{teams.get(row.teamId)?.name}</strong><b>{row.wins} - {row.losses}</b><small>净胜 {row.scoreFor - row.scoreAgainst >= 0 ? "+" : ""}{row.scoreFor - row.scoreAgainst}</small></div>)}</div></section>}
    </div>
  </div>;
}
