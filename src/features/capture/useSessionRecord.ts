import { useEffect, useState } from 'react';
import { useApp } from '../../app/context';
import { type SessionRecord, getSessionRecord } from '../../data/repositories';
import type { Instrument } from './build';

export type SessionLoad =
  | { state: 'loading' }
  | { state: 'missing' }
  | { state: 'other-content' }
  | { state: 'already-captured' }
  | { state: 'ready'; record: SessionRecord };

/**
 * Loads a session for capture. A captured instrument is a permanent record, so it can't be entered
 * twice. Scoring with different content than the session recorded would mix versions, so that's refused.
 */
export function useCaptureRecord(sessionId: string, instrument: Instrument): SessionLoad {
  const { db, pack } = useApp();
  const [load, setLoad] = useState<SessionLoad>({ state: 'loading' });

  useEffect(() => {
    let current = true;
    getSessionRecord(db, sessionId)
      .then((record) => {
        if (!current) return;
        if (!record) setLoad({ state: 'missing' });
        else if (record.session.instruments[instrument]) setLoad({ state: 'already-captured' });
        else if (record.session.contentVersion !== pack.contentVersion) setLoad({ state: 'other-content' });
        else setLoad({ state: 'ready', record });
      })
      .catch(() => {
        if (current) setLoad({ state: 'missing' });
      });
    return () => {
      current = false;
    };
  }, [db, pack.contentVersion, sessionId, instrument]);

  return load;
}
