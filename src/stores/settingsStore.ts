import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { zustandMMKVStorage } from '../services/storage';
import { AudioQuality } from '../utils/constants';
import { PrimaryHue } from '../theme/colors';

interface SettingsState {
  audioQuality: AudioQuality;
  downloadOverWifiOnly: boolean;
  primaryHue: PrimaryHue;
}

interface SettingsActions {
  setAudioQuality: (quality: AudioQuality) => void;
  setDownloadOverWifiOnly: (value: boolean) => void;
  setPrimaryHue: (hue: PrimaryHue) => void;
}

type SettingsStore = SettingsState & SettingsActions;

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      audioQuality: 'high' as AudioQuality,
      downloadOverWifiOnly: true,
      primaryHue: 'navy' as PrimaryHue,

      setAudioQuality: (quality: AudioQuality) => set({ audioQuality: quality }),
      setDownloadOverWifiOnly: (value: boolean) => set({ downloadOverWifiOnly: value }),
      setPrimaryHue: (hue: PrimaryHue) => set({ primaryHue: hue }),
    }),
    {
      name: 'settings-store',
      storage: createJSONStorage(() => zustandMMKVStorage),
      version: 1,
      migrate: (persistedState, version) => {
        const state = { ...(persistedState as Record<string, unknown>) };
        // v1: removed the unused autoPlay setting
        if (version < 1) delete state.autoPlay;
        return state as unknown as SettingsState;
      },
    }
  )
);
