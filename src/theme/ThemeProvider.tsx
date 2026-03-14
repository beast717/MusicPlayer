import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { colors, ThemeColors, ColorScheme, primaryPalettes } from './colors';
import { useSettingsStore } from '../stores/settingsStore';

interface ThemeContextValue {
  colorScheme: ColorScheme;
  theme: ThemeColors;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  colorScheme: 'dark',
  theme: colors.dark,
  isDark: true,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const colorScheme: ColorScheme = systemScheme === 'light' ? 'light' : 'dark';
  const primaryHue = useSettingsStore((s) => s.primaryHue);

  const value = useMemo(() => {
    const baseTheme = colors[colorScheme];
    const palette = primaryPalettes[primaryHue] || primaryPalettes.navy;
    
    return {
      colorScheme,
      theme: {
        ...baseTheme,
        primary: palette.primary,
        primaryLight: palette.primaryLight,
        playerGradientStart: palette.gradient,
      },
      isDark: colorScheme === 'dark',
    };
  }, [colorScheme, primaryHue]);

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
