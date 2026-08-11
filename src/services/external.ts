import { invoke } from "@tauri-apps/api/core";
import type { AiGenerationRequest, AiGenerationResult, HltvUpdateStatus, Player, Team } from "../domain/types";

export type HltvPayload = { players: Player[]; teams: Team[]; sourceDate: string };

function requireTauri(): void {
  if (!("__TAURI_INTERNALS__" in window)) throw new Error("此功能仅在桌面应用中可用");
}

export async function startHltvUpdate(): Promise<HltvUpdateStatus> {
  requireTauri();
  return invoke("start_hltv_update");
}

export async function getHltvUpdateStatus(): Promise<HltvUpdateStatus> {
  requireTauri();
  return invoke("get_hltv_update_status");
}

export async function cancelHltvUpdate(): Promise<void> {
  requireTauri();
  await invoke("cancel_hltv_update");
}

export async function commitHltvUpdate(): Promise<HltvPayload> {
  requireTauri();
  return JSON.parse(await invoke<string>("commit_hltv_update")) as HltvPayload;
}

export async function setOpenAiKey(apiKey: string): Promise<void> {
  requireTauri();
  await invoke("set_openai_key", { apiKey });
}

export async function hasOpenAiKey(): Promise<boolean> {
  if (!("__TAURI_INTERNALS__" in window)) return false;
  return invoke("has_openai_key");
}

export async function deleteOpenAiKey(): Promise<void> {
  requireTauri();
  await invoke("delete_openai_key");
}

export async function generateAiTeams(request: AiGenerationRequest & { model?: string }): Promise<AiGenerationResult> {
  requireTauri();
  return JSON.parse(await invoke<string>("generate_ai_teams", { request })) as AiGenerationResult;
}
