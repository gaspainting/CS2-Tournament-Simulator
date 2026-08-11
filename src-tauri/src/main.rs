#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod database;
mod hltv;
mod openai;

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            database::load_database,
            database::save_database,
            database::backup_database,
            hltv::start_hltv_update,
            hltv::get_hltv_update_status,
            hltv::cancel_hltv_update,
            hltv::commit_hltv_update,
            openai::set_openai_key,
            openai::has_openai_key,
            openai::delete_openai_key,
            openai::generate_ai_teams
        ])
        .run(tauri::generate_context!())
        .expect("error while running CS2 Tournament Simulator");
}
