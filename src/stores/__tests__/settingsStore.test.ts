jest.mock('../../services/storage', () => ({
  zustandMMKVStorage: {
    // Settings saved by a version that still had autoPlay
    getItem: (name: string) =>
      name === 'settings-store'
        ? JSON.stringify({
            state: {
              audioQuality: 'low',
              downloadOverWifiOnly: false,
              autoPlay: true,
              primaryHue: 'red',
            },
            version: 0,
          })
        : null,
    setItem: () => {},
    removeItem: () => {},
  },
}));

import { useSettingsStore } from '../settingsStore';

it('drops the removed autoPlay setting and keeps the rest', () => {
  const state = useSettingsStore.getState();

  expect(state).not.toHaveProperty('autoPlay');
  expect(state).toMatchObject({
    audioQuality: 'low',
    downloadOverWifiOnly: false,
    primaryHue: 'red',
  });
});
