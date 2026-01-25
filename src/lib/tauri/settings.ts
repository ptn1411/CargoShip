import { invoke } from "@tauri-apps/api/core";

export interface TerminalSettings {
  theme: string;
  font_size: number;
  font_family: string;
  cursor_style: string;
  cursor_blink: boolean;
}

export const settingsApi = {
  getTerminalSettings: () => invoke<TerminalSettings>("get_terminal_settings"),
  saveTerminalSettings: (settings: TerminalSettings) =>
    invoke<void>("save_terminal_settings", { settings }),
};
