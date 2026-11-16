import { useEffect, useState } from 'react';
import { useApp } from '../../app/context';
import { type SessionRecord, getSessionRecord } from '../../data/repositories';
import type { Examinee } from '../../data/schemas';

export interface Result {
  examinee: Examinee;
  record: SessionRecord;
}

/** A saved session with its examinee. Undefined while loading, null when it doesn't exist. */
export function useResult(sessionId: string): Result | null | undefined {
  const { db } = useApp();
  const [result, setResult] = useState<Result | null | undefined>(undefined);

  useEffect(() => {
    let current = true;
    getSessionRecord(db, sessionId)
      .then(async (record) => {
        const examinee = record && (await db.examinees.get(record.session.examineeId));
        if (current) setResult(record && examinee ? { examinee, record } : null);
      })
      .catch(() => {
        if (current) setResult(null);
      });
    return () => {
      current = false;
    };
  }, [db, sessionId]);

  return result;
}
