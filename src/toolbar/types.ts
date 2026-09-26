export interface KeyItem {
  id: string;
  label: string;
  sequence?: string;
  steps?: string[];
  commandText?: string;
  category?: 'pane' | 'tab' | 'navigation' | 'scroll' | 'session' | 'resize' | 'special';
  description?: string;
}

export interface KeymapConfig {
  modifiers: string[];
  specialKeys: KeyItem[];
  ctrlShortcuts: KeyItem[];
  altShortcuts: KeyItem[];
  functionKeys: KeyItem[];
  zellijQuickActions?: KeyItem[];
}

export type SendDataFn = (data: string) => void;
