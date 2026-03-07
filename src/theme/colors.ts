export const colors = {
  light: {
    background: '#FFFFFF',
    surface: '#F5F5F7',
    surfaceElevated: '#FFFFFF',
    card: '#F0F0F3',
    primary: '#6C5CE7',
    primaryLight: '#A29BFE',
    accent: '#FF6B6B',
    text: '#1A1A2E',
    textSecondary: '#6B7280',
    textTertiary: '#9CA3AF',
    border: '#E5E7EB',
    icon: '#6B7280',
    iconActive: '#6C5CE7',
    miniPlayerBg: '#FFFFFF',
    tabBar: '#FFFFFF',
    tabBarBorder: '#E5E7EB',
    searchBar: '#F0F0F3',
    skeleton: '#E5E7EB',
    danger: '#EF4444',
    success: '#10B981',
    overlay: 'rgba(0, 0, 0, 0.5)',
    playerGradientStart: '#6C5CE7',
    playerGradientEnd: '#2D1B69',
  },
  dark: {
    background: '#0A0A0F',
    surface: '#14141F',
    surfaceElevated: '#1C1C2E',
    card: '#1C1C2E',
    primary: '#A29BFE',
    primaryLight: '#6C5CE7',
    accent: '#FF6B6B',
    text: '#F1F1F6',
    textSecondary: '#9CA3AF',
    textTertiary: '#6B7280',
    border: '#2D2D3F',
    icon: '#9CA3AF',
    iconActive: '#A29BFE',
    miniPlayerBg: '#14141F',
    tabBar: '#0A0A0F',
    tabBarBorder: '#1C1C2E',
    searchBar: '#1C1C2E',
    skeleton: '#1C1C2E',
    danger: '#EF4444',
    success: '#10B981',
    overlay: 'rgba(0, 0, 0, 0.7)',
    playerGradientStart: '#6C5CE7',
    playerGradientEnd: '#0A0A0F',
  },
} as const;

export type ThemeColors = {
  background: string;
  surface: string;
  surfaceElevated: string;
  card: string;
  primary: string;
  primaryLight: string;
  accent: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  icon: string;
  iconActive: string;
  miniPlayerBg: string;
  tabBar: string;
  tabBarBorder: string;
  searchBar: string;
  skeleton: string;
  danger: string;
  success: string;
  overlay: string;
  playerGradientStart: string;
  playerGradientEnd: string;
};
export type ColorScheme = 'light' | 'dark';
