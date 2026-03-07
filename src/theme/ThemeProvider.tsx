import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { colors, ThemeColors, ColorScheme } from './colors';

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

  const value = useMemo(
    () => ({
      colorScheme,
      theme: colors[colorScheme],
      isDark: colorScheme === 'dark',
    }),
    [colorScheme]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
