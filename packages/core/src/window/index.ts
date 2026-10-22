import { invoke } from '@tauri-apps/api/core';

export function windowMenuSetVisible(visible: boolean): Promise<void> {
  return invoke('window_menu_set_visible', { visible });
}
