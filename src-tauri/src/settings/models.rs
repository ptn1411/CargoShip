use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalSettings {
    pub theme: String,
    pub font_size: u32,
    pub font_family: String,
    pub cursor_style: String,
    pub cursor_blink: bool,
}

impl Default for TerminalSettings {
    fn default() -> Self {
        Self {
            theme: "dark".to_string(),
            font_size: 14,
            font_family: "Menlo, Monaco, \"Courier New\", monospace".to_string(),
            cursor_style: "block".to_string(),
            cursor_blink: true,
        }
    }
}
