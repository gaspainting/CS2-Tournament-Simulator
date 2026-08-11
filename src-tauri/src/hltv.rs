use regex::Regex;
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

const HLTV_ROOT: &str = "https://www.hltv.org";

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchivePlayer {
    pub hltv_id: u64,
    pub slug: String,
    pub nickname: String,
    pub real_name: String,
    pub nationality: String,
}

#[derive(Clone, Debug)]
pub struct ArchivePage {
    pub players: Vec<ArchivePlayer>,
    pub next_page: Option<u32>,
}

#[derive(Clone, Debug)]
pub struct PlayerProfile {
    pub age: Option<u8>,
    pub team_id: Option<u64>,
    pub team_name: Option<String>,
    pub rating: Option<f64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HltvPlayer {
    id: String,
    nickname: String,
    real_name: String,
    nationality: String,
    age: u8,
    role: String,
    rating: f64,
    source: String,
    hltv_id: u64,
    sample_status: String,
    updated_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HltvRoster {
    starters: Vec<String>,
    substitutes: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HltvTeam {
    id: String,
    name: String,
    short_name: String,
    region: String,
    color: String,
    source: String,
    language: String,
    roster: HltvRoster,
    rating: u32,
    stability: f64,
    hltv_id: u64,
    updated_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HltvPayload {
    players: Vec<HltvPlayer>,
    teams: Vec<HltvTeam>,
    source_date: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HltvUpdateStatus {
    state: String,
    processed: usize,
    total: Option<usize>,
    message: String,
    added_teams: usize,
    added_players: usize,
}

fn status_cell() -> &'static Mutex<HltvUpdateStatus> {
    static STATUS: OnceLock<Mutex<HltvUpdateStatus>> = OnceLock::new();
    STATUS.get_or_init(|| Mutex::new(HltvUpdateStatus {
        state: "idle".into(), processed: 0, total: None, message: "尚未更新".into(), added_teams: 0, added_players: 0,
    }))
}

fn staged_cell() -> &'static Mutex<Option<String>> {
    static STAGED: OnceLock<Mutex<Option<String>>> = OnceLock::new();
    STAGED.get_or_init(|| Mutex::new(None))
}

static CANCELLED: AtomicBool = AtomicBool::new(false);

fn selector(value: &str) -> Result<Selector, String> {
    Selector::parse(value).map_err(|_| format!("无法解析选择器：{value}"))
}

fn text_of(element: scraper::ElementRef<'_>, query: &str) -> Option<String> {
    let target = element.select(&Selector::parse(query).ok()?).next()?;
    let text = target.text().collect::<Vec<_>>().join(" ").split_whitespace().collect::<Vec<_>>().join(" ");
    (!text.is_empty()).then_some(text)
}

fn id_and_slug(href: &str, prefix: &str) -> Option<(u64, String)> {
    let parts = href.trim_matches('/').split('/').collect::<Vec<_>>();
    let offset = parts.iter().position(|part| *part == prefix)?;
    Some((parts.get(offset + 1)?.parse().ok()?, parts.get(offset + 2).unwrap_or(&"").to_string()))
}

pub fn parse_active_players(html: &str) -> Result<ArchivePage, String> {
    let document = Html::parse_document(html);
    let card_selector = selector("a.players-archive-box")?;
    let mut players = Vec::new();
    for card in document.select(&card_selector) {
        let href = card.value().attr("href").unwrap_or_default();
        let Some((hltv_id, slug)) = id_and_slug(href, "player") else { continue };
        let fallback = card.text().map(str::trim).filter(|value| !value.is_empty()).collect::<Vec<_>>();
        let nickname = text_of(card, ".players-archive-nickname").or_else(|| fallback.first().map(|value| value.to_string())).unwrap_or(slug.clone());
        let real_name = text_of(card, ".players-archive-realname").or_else(|| fallback.get(1).map(|value| value.to_string())).unwrap_or_else(|| nickname.clone());
        let flag_selector = selector("img[title]")?;
        let nationality = card.select(&flag_selector).next().and_then(|flag| flag.value().attr("title")).unwrap_or("Unknown").to_string();
        players.push(ArchivePlayer { hltv_id, slug, nickname, real_name, nationality });
    }
    let link_selector = selector("a[href]")?;
    let next_page = document.select(&link_selector).find_map(|link| {
        let label = link.text().collect::<String>();
        if !label.trim().eq_ignore_ascii_case("next") { return None; }
        let href = link.value().attr("href")?;
        href.split("page=").nth(1)?.split('&').next()?.parse().ok()
    });
    if players.is_empty() {
        return Err("HLTV 返回成功页面，但未识别到任何 player cards；页面选择器可能已变化".into());
    }
    Ok(ArchivePage { players, next_page })
}

pub fn parse_player_profile(html: &str) -> Result<PlayerProfile, String> {
    let document = Html::parse_document(html);
    let age_selector = selector(".playerAge")?;
    let age_text = document.select(&age_selector).next().map(|element| element.text().collect::<String>()).unwrap_or_default();
    let age_regex = Regex::new(r"(\d{1,2})\s*years").map_err(|error| error.to_string())?;
    let age = age_regex.captures(&age_text).and_then(|capture| capture.get(1)).and_then(|value| value.as_str().parse().ok());
    let team_selector = selector(".playerTeam a[href^='/team/']")?;
    let team_link = document.select(&team_selector).next();
    let team_id = team_link.and_then(|link| id_and_slug(link.value().attr("href")?, "team").map(|value| value.0));
    let team_name = team_link.map(|link| link.text().collect::<Vec<_>>().join(" ").split_whitespace().collect::<Vec<_>>().join(" ")).filter(|value| !value.is_empty());
    let rating_selector = selector(".player-stat .value")?;
    let rating = document.select(&rating_selector).find_map(|element| element.text().collect::<String>().trim().parse::<f64>().ok());
    Ok(PlayerProfile { age, team_id, team_name, rating })
}

fn set_status(state: &str, processed: usize, total: Option<usize>, message: String, teams: usize, players: usize) {
    if let Ok(mut status) = status_cell().lock() {
        *status = HltvUpdateStatus { state: state.into(), processed, total, message, added_teams: teams, added_players: players };
    }
}

fn color_for(id: u64) -> String {
    const COLORS: [&str; 10] = ["#e74c3c", "#2f80ed", "#27ae60", "#f2c94c", "#9b51e0", "#eb5757", "#00a6a6", "#f2994a", "#56ccf2", "#6fcf97"];
    COLORS[id as usize % COLORS.len()].to_string()
}

fn validate_hltv_payload(payload: &HltvPayload) -> Result<(), String> {
    if payload.players.is_empty() {
        return Err("HLTV 更新为空：没有可用选手".into());
    }
    if payload.teams.is_empty() {
        return Err("HLTV 更新为空：没有任何包含五名首发的可用队伍".into());
    }
    if payload.source_date.trim().is_empty() {
        return Err("HLTV 更新缺少数据日期".into());
    }
    let mut player_ids = HashSet::new();
    for player in &payload.players {
        if player.id.trim().is_empty() || !player_ids.insert(player.id.as_str()) {
            return Err(format!("HLTV 更新包含空白或重复选手 ID：{}", player.id));
        }
        if player.source != "professional" || player.nickname.trim().is_empty() || !player.rating.is_finite() {
            return Err(format!("HLTV 选手数据无效：{}", player.id));
        }
    }
    let mut team_ids = HashSet::new();
    for team in &payload.teams {
        if team.id.trim().is_empty() || !team_ids.insert(team.id.as_str()) {
            return Err(format!("HLTV 更新包含空白或重复队伍 ID：{}", team.id));
        }
        if team.source != "professional" || team.name.trim().is_empty() {
            return Err(format!("HLTV 队伍数据无效：{}", team.id));
        }
        let unique_starters = team.roster.starters.iter().collect::<HashSet<_>>();
        if team.roster.starters.len() != 5 || unique_starters.len() != 5 {
            return Err(format!("HLTV 队伍 {} 必须包含五名唯一首发", team.id));
        }
        if let Some(missing) = team.roster.starters.iter().find(|id| !player_ids.contains(id.as_str())) {
            return Err(format!("HLTV 队伍 {} 引用了不存在的首发选手：{}", team.id, missing));
        }
    }
    Ok(())
}

fn run_update() -> Result<String, String> {
    let client = reqwest::blocking::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) CS2TournamentSimulator/2.0")
        .timeout(Duration::from_secs(25))
        .build()
        .map_err(|error| error.to_string())?;
    let mut archive = Vec::new();
    let mut next_page = Some(0u32);
    let mut seen = HashSet::new();
    while let Some(page) = next_page {
        if CANCELLED.load(Ordering::Relaxed) { return Err("更新已取消".into()); }
        let url = if page == 0 { format!("{HLTV_ROOT}/players/archive/active?filter=all") } else { format!("{HLTV_ROOT}/players/archive/active?filter=all&page={page}") };
        let body = client.get(&url).send().and_then(|response| response.error_for_status()).map_err(|error| error.to_string())?.text().map_err(|error| error.to_string())?;
        let parsed = parse_active_players(&body)?;
        for player in parsed.players {
            if seen.insert(player.hltv_id) { archive.push(player); }
        }
        next_page = parsed.next_page.filter(|next| *next > page && *next < 200);
        set_status("running", archive.len(), None, format!("已读取活跃选手目录第 {} 页", page + 1), 0, archive.len());
        std::thread::sleep(Duration::from_millis(700));
    }

    let total = archive.len();
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|error| error.to_string())?.as_secs().to_string();
    let mut players = Vec::new();
    let mut team_members: BTreeMap<u64, (String, Vec<HltvPlayer>)> = BTreeMap::new();
    for (index, player) in archive.into_iter().enumerate() {
        if CANCELLED.load(Ordering::Relaxed) { return Err("更新已取消".into()); }
        let url = format!("{HLTV_ROOT}/player/{}/{}", player.hltv_id, player.slug);
        let body = client.get(&url).send().and_then(|response| response.error_for_status()).map_err(|error| error.to_string())?.text().map_err(|error| error.to_string())?;
        let profile = parse_player_profile(&body)?;
        let record = HltvPlayer {
            id: format!("hltv-player-{}", player.hltv_id), nickname: player.nickname, real_name: player.real_name,
            nationality: player.nationality, age: profile.age.unwrap_or(24), role: "Unset".into(), rating: profile.rating.unwrap_or(1.0),
            source: "professional".into(), hltv_id: player.hltv_id, sample_status: if profile.rating.is_some() { "current".into() } else { "insufficient".into() }, updated_at: stamp.clone(),
        };
        if let (Some(team_id), Some(team_name)) = (profile.team_id, profile.team_name) {
            team_members.entry(team_id).or_insert_with(|| (team_name, Vec::new())).1.push(record.clone());
        }
        players.push(record);
        set_status("running", index + 1, Some(total), format!("正在读取选手资料：{}/{}", index + 1, total), 0, players.len());
        std::thread::sleep(Duration::from_millis(700));
    }

    let mut teams = Vec::new();
    for (team_id, (name, mut members)) in team_members {
        if members.len() < 5 { continue; }
        members.sort_by(|a, b| b.rating.total_cmp(&a.rating));
        let starters = members.iter().take(5).map(|player| player.id.clone()).collect::<Vec<_>>();
        let average = members.iter().take(5).map(|player| player.rating).sum::<f64>() / 5.0;
        let short_name = name.split_whitespace().map(|part| part.chars().next().unwrap_or('X')).take(4).collect::<String>().to_uppercase();
        teams.push(HltvTeam {
            id: format!("hltv-team-{team_id}"), name, short_name, region: "International".into(), color: color_for(team_id), source: "professional".into(), language: "en".into(),
            roster: HltvRoster { starters, substitutes: members.iter().skip(5).map(|player| player.id.clone()).collect() }, rating: (1000.0 + average * 600.0).round() as u32,
            stability: 0.72, hltv_id: team_id, updated_at: stamp.clone(),
        });
    }
    let update = HltvPayload { players, teams: teams.clone(), source_date: stamp };
    validate_hltv_payload(&update)?;
    let payload = serde_json::to_string(&update).map_err(|error| error.to_string())?;
    set_status("ready", total, Some(total), "职业数据已完成，等待应用确认".into(), teams.len(), total);
    Ok(payload)
}

#[tauri::command]
pub fn start_hltv_update() -> Result<HltvUpdateStatus, String> {
    let current = status_cell().lock().map_err(|_| "更新状态被占用".to_string())?.clone();
    if current.state == "running" { return Ok(current); }
    CANCELLED.store(false, Ordering::Relaxed);
    *staged_cell().lock().map_err(|_| "暂存数据被占用".to_string())? = None;
    set_status("running", 0, None, "正在连接 HLTV".into(), 0, 0);
    std::thread::spawn(|| match run_update() {
        Ok(payload) => { if let Ok(mut staged) = staged_cell().lock() { *staged = Some(payload); } }
        Err(error) if error == "更新已取消" => set_status("cancelled", 0, None, error, 0, 0),
        Err(error) => set_status("error", 0, None, error, 0, 0),
    });
    get_hltv_update_status()
}

#[tauri::command]
pub fn get_hltv_update_status() -> Result<HltvUpdateStatus, String> {
    status_cell().lock().map(|status| status.clone()).map_err(|_| "更新状态被占用".to_string())
}

#[tauri::command]
pub fn cancel_hltv_update() {
    CANCELLED.store(true, Ordering::Relaxed);
}

#[tauri::command]
pub fn commit_hltv_update() -> Result<String, String> {
    let payload = staged_cell().lock().map_err(|_| "暂存数据被占用".to_string())?.clone().ok_or_else(|| "没有可提交的 HLTV 更新".to_string())?;
    let parsed = serde_json::from_str::<HltvPayload>(&payload).map_err(|error| format!("HLTV 暂存数据格式无效：{error}"))?;
    validate_hltv_payload(&parsed)?;
    Ok(payload)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_active_player_cards_and_next_page() {
        let page = parse_active_players(include_str!("../tests/fixtures/hltv-active.html")).unwrap();
        assert_eq!(page.players.len(), 2);
        assert_eq!(page.players[0].nickname, "ZywOo");
        assert_eq!(page.players[0].hltv_id, 11893);
        assert_eq!(page.next_page, Some(1));
    }

    #[test]
    fn parses_profile_team_age_and_rating() {
        let profile = parse_player_profile(include_str!("../tests/fixtures/hltv-player.html")).unwrap();
        assert_eq!(profile.team_name.as_deref(), Some("Vitality"));
        assert_eq!(profile.team_id, Some(9565));
        assert_eq!(profile.age, Some(25));
        assert_eq!(profile.rating, Some(1.32));
    }

    #[test]
    fn rejects_successful_archive_page_when_player_selector_drifted() {
        let error = parse_active_players(include_str!("../tests/fixtures/hltv-active-selector-drift.html"))
            .expect_err("zero recognized player cards must not be treated as a valid archive page");
        assert!(error.contains("player") || error.contains("选择器"));
    }

    #[test]
    fn rejects_successful_but_empty_active_player_page() {
        let error = parse_active_players(include_str!("../tests/fixtures/hltv-active-empty.html"))
            .expect_err("an empty active-player page must not stage an empty update");
        assert!(error.contains("任何") || error.contains("player"));
    }

    #[test]
    fn commit_rejects_empty_or_unplayable_staged_payload() {
        *staged_cell().lock().unwrap() = Some(r#"{"players":[],"teams":[],"sourceDate":"2026-08-11"}"#.into());
        let error = commit_hltv_update().expect_err("empty staged payload must not be committed");
        assert!(error.contains("空") || error.contains("队伍") || error.contains("player"));
        assert!(staged_cell().lock().unwrap().is_some(), "rejected payload should remain available for diagnosis");
        *staged_cell().lock().unwrap() = None;
    }

    #[test]
    fn commit_rejects_duplicate_ids_wrong_source_and_bad_roster_references() {
        let player = |id: &str| HltvPlayer {
            id: id.into(), nickname: id.into(), real_name: id.into(), nationality: "Test".into(), age: 24,
            role: "Unset".into(), rating: 1.0, source: "professional".into(), hltv_id: 1,
            sample_status: "current".into(), updated_at: "2026-08-11".into(),
        };
        let mut payload = HltvPayload {
            players: (1..=5).map(|index| player(&format!("player-{index}"))).collect(),
            teams: vec![HltvTeam {
                id: "team-1".into(), name: "Team".into(), short_name: "T".into(), region: "Test".into(), color: "#112233".into(),
                source: "professional".into(), language: "en".into(),
                roster: HltvRoster { starters: (1..=5).map(|index| format!("player-{index}")).collect(), substitutes: vec![] },
                rating: 1000, stability: 0.7, hltv_id: 1, updated_at: "2026-08-11".into(),
            }],
            source_date: "2026-08-11".into(),
        };

        payload.players[1].id = payload.players[0].id.clone();
        *staged_cell().lock().unwrap() = Some(serde_json::to_string(&payload).unwrap());
        assert!(commit_hltv_update().unwrap_err().contains("重复选手 ID"));

        payload.players[1].id = "player-2".into();
        payload.players[0].source = "custom".into();
        *staged_cell().lock().unwrap() = Some(serde_json::to_string(&payload).unwrap());
        assert!(commit_hltv_update().unwrap_err().contains("选手数据无效"));

        payload.players[0].source = "professional".into();
        payload.teams[0].roster.starters[0] = "missing-player".into();
        *staged_cell().lock().unwrap() = Some(serde_json::to_string(&payload).unwrap());
        assert!(commit_hltv_update().unwrap_err().contains("不存在的首发选手"));
        *staged_cell().lock().unwrap() = None;
    }
}
