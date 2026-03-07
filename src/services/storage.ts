import { createMMKV, type MMKV } from 'react-native-mmkv';

let storage: MMKV;
try {
  storage = createMMKV({ id: 'musicplayer-storage' });
} catch {
  storage = createMMKV();
}

// Helper functions for typed access
export const mmkvStorage = {
  getString: (key: string): string | undefined => {
    return storage.getString(key);
  },
  setString: (key: string, value: string): void => {
    storage.set(key, value);
  },
  getNumber: (key: string): number | undefined => {
    return storage.getNumber(key);
  },
  setNumber: (key: string, value: number): void => {
    storage.set(key, value);
  },
  getBoolean: (key: string): boolean | undefined => {
    return storage.getBoolean(key);
  },
  setBoolean: (key: string, value: boolean): void => {
    storage.set(key, value);
  },
  getObject: <T>(key: string): T | undefined => {
    const str = storage.getString(key);
    if (!str) return undefined;
    try {
      return JSON.parse(str) as T;
    } catch {
      return undefined;
    }
  },
  setObject: <T>(key: string, value: T): void => {
    storage.set(key, JSON.stringify(value));
  },
  delete: (key: string): void => {
    storage.remove(key);
  },
  clearAll: (): void => {
    storage.clearAll();
  },
};

// Zustand persist storage adapter for MMKV
export const zustandMMKVStorage = {
  getItem: (name: string): string | null => {
    const value = storage.getString(name);
    return value ?? null;
  },
  setItem: (name: string, value: string): void => {
    storage.set(name, value);
  },
  removeItem: (name: string): void => {
    storage.remove(name);
  },
};
