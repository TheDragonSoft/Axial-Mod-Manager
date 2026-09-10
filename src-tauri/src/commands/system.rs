/// Connectivity probe used by the frontend to verify the IPC bridge.
#[tauri::command]
pub fn ping(name: String) -> String {
    format!("pong, {name}")
}
