use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::time::Duration;

const KEYRING_SERVICE: &str = "cs2-tournament-simulator";
const KEYRING_ACCOUNT: &str = "openai-api-key";
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiRequest {
    count: u8,
    language: String,
    region: String,
    style: String,
    min_rating: f64,
    max_rating: f64,
    model: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeneratedRoster { starters: Vec<String>, substitutes: Vec<String>, coach_id: Option<String> }

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeneratedTeam {
    id: String, name: String, short_name: String, region: String, color: String, source: String, language: String,
    roster: GeneratedRoster, rating: u32, stability: f64, updated_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeneratedPlayer {
    id: String, nickname: String, real_name: String, nationality: String, age: u8, role: String,
    rating: f64, source: String, updated_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct GeneratedPayload { teams: Vec<GeneratedTeam>, players: Vec<GeneratedPlayer> }

fn credential() -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT).map_err(|error| error.to_string())
}

pub fn extract_output_text(payload: &serde_json::Value) -> Result<String, String> {
    payload.get("output").and_then(|value| value.as_array()).into_iter().flatten()
        .flat_map(|message| message.get("content").and_then(|value| value.as_array()).into_iter().flatten())
        .find(|content| content.get("type").and_then(|value| value.as_str()) == Some("output_text"))
        .and_then(|content| content.get("text").and_then(|value| value.as_str()))
        .map(str::to_string)
        .ok_or_else(|| "OpenAI 响应中没有结构化文本".to_string())
}

fn validate_ai_request(request: &AiRequest) -> Result<(), String> {
    if request.count == 0 || request.count > 20 { return Err("单次生成数量必须在 1 到 20 之间".into()); }
    if request.language != "zh" && request.language != "en" { return Err("生成语言必须是 zh 或 en".into()); }
    if request.region.trim().is_empty() { return Err("生成地区不能为空".into()); }
    if request.style.trim().is_empty() { return Err("命名风格不能为空".into()); }
    if !request.min_rating.is_finite() || !request.max_rating.is_finite()
        || request.min_rating < 0.5 || request.max_rating > 2.0
        || request.min_rating > request.max_rating {
        return Err("生成 Rating 范围必须是 0.5 到 2.0 之间的有效区间".into());
    }
    Ok(())
}

fn name_language(value: &str) -> &'static str {
    let chinese = value.chars().any(|character| ('\u{3400}'..='\u{9fff}').contains(&character));
    let latin = value.chars().any(|character| character.is_ascii_alphabetic());
    match (chinese, latin) { (true, false) => "zh", (false, true) => "en", (true, true) => "mixed", _ => "none" }
}

fn normalized_identity(value: &str) -> String { value.trim().to_lowercase() }

pub fn validate_generation_json(payload: &str, request: &AiRequest) -> Result<String, String> {
    validate_ai_request(request)?;
    let parsed: GeneratedPayload = serde_json::from_str(payload).map_err(|error| format!("AI JSON 解析失败：{error}"))?;
    if parsed.teams.len() != request.count as usize {
        return Err(format!("AI 返回队伍数量错误：请求 {}，实际 {}", request.count, parsed.teams.len()));
    }

    let mut team_ids = HashSet::new();
    let mut team_names = HashSet::new();
    for team in &parsed.teams {
        if team.id.trim().is_empty() || !team_ids.insert(team.id.as_str()) { return Err(format!("AI 返回了空白或重复队伍 ID：{}", team.id)); }
        if team.name.trim().is_empty() || !team_names.insert(normalized_identity(&team.name)) { return Err(format!("AI 返回了空白或重复队伍名称：{}", team.name)); }
        if team.short_name.trim().is_empty() || team.region.trim().is_empty() || team.updated_at.trim().is_empty() { return Err(format!("队伍 {} 存在空白必填字段", team.name)); }
        if team.source != "fictional" { return Err(format!("队伍 {} source 必须是 fictional", team.name)); }
        if team.language != request.language || name_language(&team.name) != request.language { return Err(format!("队伍 {} 名称语言与请求不一致", team.name)); }
        if team.region != request.region { return Err(format!("队伍 {} 地区与请求不一致", team.name)); }
        if !regex::Regex::new(r"^#[0-9a-fA-F]{6}$").expect("static color regex").is_match(&team.color) { return Err(format!("队伍 {} 颜色无效", team.name)); }
        if team.rating == 0 || team.rating > 5000 { return Err(format!("队伍 {} rating 无效", team.name)); }
        if !team.stability.is_finite() || !(0.0..=1.0).contains(&team.stability) { return Err(format!("队伍 {} stability 无效", team.name)); }
    }

    let mut player_ids = HashSet::new();
    let mut player_nicknames = HashSet::new();
    for player in &parsed.players {
        if player.id.trim().is_empty() || !player_ids.insert(player.id.as_str()) { return Err(format!("AI 返回了空白或重复选手 ID：{}", player.id)); }
        if player.nickname.trim().is_empty() || !player_nicknames.insert(normalized_identity(&player.nickname)) { return Err(format!("AI 返回了空白或重复选手 nickname：{}", player.nickname)); }
        if player.real_name.trim().is_empty() || player.nationality.trim().is_empty() || player.updated_at.trim().is_empty() { return Err(format!("选手 {} 存在空白必填字段", player.nickname)); }
        if player.source != "fictional" { return Err(format!("选手 {} source 必须是 fictional", player.nickname)); }
        if name_language(&player.nickname) != request.language { return Err(format!("选手 {} nickname 语言与请求不一致", player.nickname)); }
        if !(16..=45).contains(&player.age) { return Err(format!("选手 {} 年龄无效", player.nickname)); }
        if !["IGL", "AWPer", "Rifler", "Entry", "Support", "Coach"].contains(&player.role.as_str()) { return Err(format!("选手 {} role 无效", player.nickname)); }
        if !player.rating.is_finite() || !(0.5..=2.0).contains(&player.rating)
            || player.rating < request.min_rating || player.rating > request.max_rating {
            return Err(format!("选手 {} 评分超出请求范围", player.nickname));
        }
    }

    let players_by_id = parsed.players.iter().map(|player| (player.id.as_str(), player)).collect::<HashMap<_, _>>();
    let mut assigned_to = HashMap::<&str, &str>::new();
    let starter_roles = HashSet::from(["IGL", "AWPer", "Rifler", "Entry", "Support"]);
    for team in &parsed.teams {
        if team.roster.starters.len() != 5 { return Err(format!("队伍 {} 必须拥有 5 名首发", team.name)); }
        if team.roster.substitutes.len() > 2 { return Err(format!("队伍 {} 最多只能拥有 2 名替补", team.name)); }
        let mut roster_ids = HashSet::new();
        let mut roles = HashSet::new();
        for (id, is_starter, is_coach) in team.roster.starters.iter().map(|id| (id, true, false))
            .chain(team.roster.substitutes.iter().map(|id| (id, false, false)))
            .chain(team.roster.coach_id.iter().map(|id| (id, false, true))) {
            if !roster_ids.insert(id.as_str()) { return Err(format!("队伍 {} 阵容成员重叠：{}", team.name, id)); }
            let player = players_by_id.get(id.as_str()).ok_or_else(|| format!("队伍 {} 引用了不存在的选手：{}", team.name, id))?;
            if let Some(owner) = assigned_to.insert(id.as_str(), team.id.as_str()) {
                return Err(format!("选手 {} 被队伍 {} 和 {} 跨队复用", id, owner, team.id));
            }
            if is_coach && player.role != "Coach" { return Err(format!("队伍 {} 教练 {} role 必须是 Coach", team.name, player.nickname)); }
            if !is_coach && player.role == "Coach" { return Err(format!("队伍 {} 比赛阵容不能引用 Coach 选手", team.name)); }
            if is_starter { roles.insert(player.role.as_str()); }
        }
        if roles != starter_roles { return Err(format!("队伍 {} 首发 role 必须完整覆盖 IGL、AWPer、Entry、Rifler、Support", team.name)); }
    }
    if assigned_to.len() != parsed.players.len() {
        let orphan = parsed.players.iter().find(|player| !assigned_to.contains_key(player.id.as_str())).expect("length mismatch guarantees orphan");
        return Err(format!("选手 {} 未被任何队伍阵容引用", orphan.nickname));
    }
    serde_json::to_string(&parsed).map_err(|error| error.to_string())
}

fn response_schema() -> serde_json::Value {
    serde_json::json!({
      "type":"object","additionalProperties":false,"required":["teams","players"],
      "properties":{
        "teams":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["id","name","shortName","region","color","source","language","roster","rating","stability","updatedAt"],"properties":{
          "id":{"type":"string"},"name":{"type":"string"},"shortName":{"type":"string"},"region":{"type":"string"},"color":{"type":"string"},"source":{"type":"string","const":"fictional"},"language":{"type":"string","enum":["zh","en"]},
          "roster":{"type":"object","additionalProperties":false,"required":["starters","substitutes","coachId"],"properties":{"starters":{"type":"array","items":{"type":"string"}},"substitutes":{"type":"array","maxItems":2,"items":{"type":"string"}},"coachId":{"type":["string","null"]}}},
          "rating":{"type":"integer"},"stability":{"type":"number"},"updatedAt":{"type":"string"}
        }}},
        "players":{"type":"array","items":{"type":"object","additionalProperties":false,"required":["id","nickname","realName","nationality","age","role","rating","source","updatedAt"],"properties":{
          "id":{"type":"string"},"nickname":{"type":"string"},"realName":{"type":"string"},"nationality":{"type":"string"},"age":{"type":"integer"},"role":{"type":"string","enum":["IGL","AWPer","Rifler","Entry","Support","Coach"]},"rating":{"type":"number"},"source":{"type":"string","const":"fictional"},"updatedAt":{"type":"string"}
        }}}
      }
    })
}

#[tauri::command]
pub fn set_openai_key(api_key: String) -> Result<(), String> {
    if api_key.trim().is_empty() { return Err("API Key 不能为空".into()); }
    credential()?.set_password(api_key.trim()).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn has_openai_key() -> bool {
    credential().and_then(|entry| entry.get_password().map_err(|error| error.to_string())).is_ok()
}

#[tauri::command]
pub fn delete_openai_key() -> Result<(), String> {
    match credential()?.delete_credential() { Ok(()) => Ok(()), Err(keyring::Error::NoEntry) => Ok(()), Err(error) => Err(error.to_string()) }
}

#[tauri::command]
pub fn generate_ai_teams(request: AiRequest) -> Result<String, String> {
    validate_ai_request(&request)?;
    let api_key = credential()?.get_password().map_err(|_| "尚未保存 OpenAI API Key".to_string())?;
    let prompt = format!(
        "Generate {} fictional CS2 teams. Language: {}. Region: {}. Naming style: {}. Player ratings must be between {:.2} and {:.2}. Each team must have exactly five unique starters covering IGL, AWPer, Entry, Rifler and Support. Team names and player nicknames must be entirely in the selected language without mixed Chinese and Latin text.",
        request.count, request.language, request.region, request.style, request.min_rating, request.max_rating
    );
    let body = serde_json::json!({
        "model": request.model.clone().unwrap_or_else(|| "gpt-5-mini".into()),
        "input": prompt,
        "text": { "format": { "type": "json_schema", "name": "cs2_team_generation", "strict": true, "schema": response_schema() } }
    });
    let client = reqwest::blocking::Client::builder()
        .connect_timeout(CONNECT_TIMEOUT)
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|error| error.to_string())?;
    let response = client.post("https://api.openai.com/v1/responses").bearer_auth(api_key).json(&body).send().map_err(|error| error.to_string())?;
    let status = response.status();
    let value: serde_json::Value = response.json().map_err(|error| error.to_string())?;
    if !status.is_success() { return Err(value.get("error").and_then(|error| error.get("message")).and_then(|message| message.as_str()).unwrap_or("OpenAI 请求失败").to_string()); }
    validate_generation_json(&extract_output_text(&value)?, &request)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(count: u8) -> AiRequest {
        AiRequest {
            count,
            language: "en".into(),
            region: "Europe".into(),
            style: "modern".into(),
            min_rating: 0.9,
            max_rating: 1.2,
            model: None,
        }
    }

    fn generated_payload(count: usize) -> serde_json::Value {
        let roles = ["IGL", "AWPer", "Entry", "Rifler", "Support"];
        let mut teams = Vec::new();
        let mut players = Vec::new();
        for team_index in 0..count {
            let starter_ids = (0..5).map(|player_index| format!("p{team_index}-{player_index}")).collect::<Vec<_>>();
            teams.push(serde_json::json!({
                "id": format!("t{team_index}"),
                "name": format!("Team{team_index}"),
                "shortName": format!("T{team_index}"),
                "region": "Europe",
                "color": "#ffffff",
                "source": "fictional",
                "language": "en",
                "roster": { "starters": starter_ids, "substitutes": [], "coachId": null },
                "rating": 1200,
                "stability": 0.6,
                "updatedAt": "2026-08-11"
            }));
            for (player_index, role) in roles.iter().enumerate() {
                players.push(serde_json::json!({
                    "id": format!("p{team_index}-{player_index}"),
                    "nickname": format!("Player{team_index}{player_index}"),
                    "realName": format!("Real {team_index} {player_index}"),
                    "nationality": "France",
                    "age": 22,
                    "role": role,
                    "rating": 1.0,
                    "source": "fictional",
                    "updatedAt": "2026-08-11"
                }));
            }
        }
        serde_json::json!({ "teams": teams, "players": players })
    }

    #[test]
    fn extracts_structured_text_from_a_responses_payload() {
        let payload = serde_json::json!({ "output": [{ "type": "message", "content": [{ "type": "output_text", "text": "{\"teams\":[],\"players\":[]}" }] }] });
        assert_eq!(extract_output_text(&payload).unwrap(), "{\"teams\":[],\"players\":[]}");
    }

    #[test]
    fn rejects_mixed_language_ai_names() {
        let payload = r##"{
          "teams":[{"id":"t1","name":"霜火 Northwind","shortName":"SN","region":"Asia","color":"#ffffff","source":"fictional","language":"zh","roster":{"starters":["p1","p2","p3","p4","p5"],"substitutes":[],"coachId":null},"rating":1200,"stability":0.6,"updatedAt":"2026-08-10"}],
          "players":[
            {"id":"p1","nickname":"甲","realName":"甲","nationality":"中国","age":20,"role":"IGL","rating":1.0,"source":"fictional","updatedAt":"2026-08-10"},
            {"id":"p2","nickname":"乙","realName":"乙","nationality":"中国","age":20,"role":"AWPer","rating":1.0,"source":"fictional","updatedAt":"2026-08-10"},
            {"id":"p3","nickname":"丙","realName":"丙","nationality":"中国","age":20,"role":"Entry","rating":1.0,"source":"fictional","updatedAt":"2026-08-10"},
            {"id":"p4","nickname":"丁","realName":"丁","nationality":"中国","age":20,"role":"Rifler","rating":1.0,"source":"fictional","updatedAt":"2026-08-10"},
            {"id":"p5","nickname":"戊","realName":"戊","nationality":"中国","age":20,"role":"Support","rating":1.0,"source":"fictional","updatedAt":"2026-08-10"}
          ]
        }"##;
        assert!(validate_generation_json(payload, &request(1)).is_err());
    }

    #[test]
    fn accepts_payload_that_matches_request_constraints() {
        let payload = generated_payload(2).to_string();
        assert!(validate_generation_json(&payload, &request(2)).is_ok());
    }

    #[test]
    fn rejects_wrong_team_count_and_duplicate_global_identity() {
        assert!(validate_generation_json(&generated_payload(1).to_string(), &request(2)).is_err());

        let mut duplicate = generated_payload(2);
        duplicate["teams"][1]["id"] = duplicate["teams"][0]["id"].clone();
        assert!(validate_generation_json(&duplicate.to_string(), &request(2)).is_err());

        let mut duplicate = generated_payload(2);
        duplicate["teams"][1]["name"] = duplicate["teams"][0]["name"].clone();
        assert!(validate_generation_json(&duplicate.to_string(), &request(2)).is_err());

        let mut duplicate = generated_payload(2);
        duplicate["players"][5]["nickname"] = duplicate["players"][0]["nickname"].clone();
        assert!(validate_generation_json(&duplicate.to_string(), &request(2)).is_err());
    }

    #[test]
    fn rejects_cross_team_reuse_and_roster_overlap_or_missing_references() {
        let mut reused = generated_payload(2);
        reused["teams"][1]["roster"]["starters"][0] = reused["teams"][0]["roster"]["starters"][0].clone();
        assert!(validate_generation_json(&reused.to_string(), &request(2)).is_err());

        let mut overlap = generated_payload(1);
        overlap["teams"][0]["roster"]["substitutes"] = serde_json::json!(["p0-0"]);
        assert!(validate_generation_json(&overlap.to_string(), &request(1)).is_err());

        let mut missing = generated_payload(1);
        missing["teams"][0]["roster"]["starters"][0] = serde_json::json!("missing-player");
        assert!(validate_generation_json(&missing.to_string(), &request(1)).is_err());
    }

    #[test]
    fn rejects_orphan_players_and_more_than_two_substitutes() {
        let mut orphan = generated_payload(1);
        orphan["players"].as_array_mut().unwrap().push(serde_json::json!({
            "id": "orphan",
            "nickname": "Orphan",
            "realName": "Unused Player",
            "nationality": "France",
            "age": 22,
            "role": "Rifler",
            "rating": 1.0,
            "source": "fictional",
            "updatedAt": "2026-08-11"
        }));
        assert!(validate_generation_json(&orphan.to_string(), &request(1)).is_err());

        let mut substitutes = generated_payload(1);
        for index in 0..3 {
            let id = format!("sub-{index}");
            substitutes["teams"][0]["roster"]["substitutes"].as_array_mut().unwrap().push(serde_json::json!(id));
            substitutes["players"].as_array_mut().unwrap().push(serde_json::json!({
                "id": id,
                "nickname": format!("Substitute{index}"),
                "realName": format!("Substitute {index}"),
                "nationality": "France",
                "age": 22,
                "role": "Rifler",
                "rating": 1.0,
                "source": "fictional",
                "updatedAt": "2026-08-11"
            }));
        }
        assert!(validate_generation_json(&substitutes.to_string(), &request(1)).is_err());
    }

    #[test]
    fn rejects_invalid_source_language_role_age_and_rating_constraints() {
        let mut invalid = generated_payload(1);
        invalid["teams"][0]["source"] = serde_json::json!("custom");
        assert!(validate_generation_json(&invalid.to_string(), &request(1)).is_err());

        let mut invalid = generated_payload(1);
        invalid["teams"][0]["language"] = serde_json::json!("zh");
        assert!(validate_generation_json(&invalid.to_string(), &request(1)).is_err());

        let mut invalid = generated_payload(1);
        invalid["players"][0]["role"] = serde_json::json!("Coach");
        assert!(validate_generation_json(&invalid.to_string(), &request(1)).is_err());

        let mut invalid = generated_payload(1);
        invalid["players"][0]["age"] = serde_json::json!(15);
        assert!(validate_generation_json(&invalid.to_string(), &request(1)).is_err());

        let mut invalid = generated_payload(1);
        invalid["players"][0]["rating"] = serde_json::json!(1.3);
        assert!(validate_generation_json(&invalid.to_string(), &request(1)).is_err());
    }

    #[test]
    fn rejects_invalid_generation_request_rating_ranges() {
        let mut invalid = request(1);
        invalid.min_rating = 1.3;
        invalid.max_rating = 1.2;
        assert!(validate_ai_request(&invalid).is_err());

        invalid.min_rating = f64::NAN;
        assert!(validate_ai_request(&invalid).is_err());
    }
}
