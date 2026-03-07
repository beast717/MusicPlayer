import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { zustandMMKVStorage } from '../services/storage';
import { AudioQuality } from '../utils/constants';

interface SettingsState {
  audioQuality: AudioQuality;
  downloadOverWifiOnly: boolean;
  autoPlay: boolean;
}

interface SettingsActions {
  setAudioQuality: (quality: AudioQuality) => void;
  setDownloadOverWifiOnly: (value: boolean) => void;
  setAutoPlay: (value: boolean) => void;
}

type SettingsStore = SettingsState & SettingsActions;

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      audioQuality: 'high' as AudioQuality,
      downloadOverWifiOnly: true,
      autoPlay: true,

      setAudioQuality: (quality: AudioQuality) => set({ audioQuality: quality }),
      setDownloadOverWifiOnly: (value: boolean) => set({ downloadOverWifiOnly: value }),
      setAutoPlay: (value: boolean) => set({ autoPlay: value }),
    }),
    {
      name: 'settings-store',
      storage: createJSONStorage(() => zustandMMKVStorage),
    }
  )
);
