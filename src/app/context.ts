import { createContext, useContext } from 'react';
import type { ManualsPack, OperatorPack } from '../content/schemas';
import type { PsivDb } from '../data/db';

export interface AppContextValue {
  db: PsivDb;
  pack: OperatorPack;
  isDemo: boolean;
  /** Opened on demand. Like the pack, it stays in memory only. */
  manuals: ManualsPack | null;
  setManuals: (manuals: ManualsPack) => void;
}

export const AppContext = createContext<AppContextValue | null>(null);

/** The database and the open pack. Every route below the pack screen has both. */
export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp needs an open pack');
  return value;
}
