import { Suspense, lazy, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { useApp } from '../../app/context';
import { listCustomProfiles } from '../../data/repositories';
import type { CustomProfile } from '../../data/schemas';
import { fullName } from '../examinees/names';
import { positionOf } from '../profiles/profiles';
import { buildChart } from './report';
import { ResultFrame, ResultMissing } from './ResultParts';
import type { ChartKind } from './ScoreChart';
import { useResult } from './useResult';

// Loaded on demand, so the chart library doesn't slow the rest of the app.
const ScoreChart = lazy(() => import('./ScoreChart'));

const SESSION_PROFILE = 'session';
const CHART_KINDS: { value: ChartKind; label: string }[] = [
  { value: 'bars', label: 'Barras' },
  { value: 'surface', label: 'Superficie (apilada)' },
  { value: 'bars3d', label: 'Barras 3D (interactiva)' },
];

export function ChartPage() {
  const { db, pack } = useApp();
  const { sessionId = '' } = useParams();
  const result = useResult(sessionId);
  const [compareWith, setCompareWith] = useState(SESSION_PROFILE);
  const [kind, setKind] = useState<ChartKind>('bars');
  const [customProfiles, setCustomProfiles] = useState<CustomProfile[]>([]);

  useEffect(() => {
    listCustomProfiles(db)
      .then(setCustomProfiles)
      .catch(() => {
        setCustomProfiles([]);
      });
  }, [db]);

  if (!result) return <ResultMissing loading={result === undefined} />;

  const { session, scores = [] } = result.record;
  const profiles = [...pack.profiles, ...customProfiles];
  const other = profiles.find((p) => p.id === compareWith);
  // Comparing changes only this view. The session keeps its own copy of the profile.
  const profile = other ?? session.profile;
  const footName = other ? positionOf(other) : session.profile.name;
  const data = buildChart(pack, session, scores, profile.ranges);

  return (
    <ResultFrame result={result} title="Gráfica" landscape>
      <div className="no-print chart-compare">
        <label htmlFor="chart-profile">Comparar con el perfil</label>
        <select
          id="chart-profile"
          value={compareWith}
          onChange={(event) => {
            setCompareWith(event.target.value);
          }}
        >
          <option value={SESSION_PROFILE}>{session.profile.name} (el de la sesión)</option>
          {profiles
            .filter((p) => p.id !== session.profile.id)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
        <label htmlFor="chart-kind">Tipo de gráfica</label>
        <select
          id="chart-kind"
          value={kind}
          onChange={(event) => {
            setKind(CHART_KINDS.find((option) => option.value === event.target.value)?.value ?? 'bars');
          }}
        >
          {CHART_KINDS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <p className="chart-name">{fullName(result.examinee)}</p>
      {/* The 3D view can be operated, so it can't sit inside an element announced as one image. */}
      <div className="chart-scroll" {...(kind === 'bars3d' ? {} : { role: 'img', 'aria-label': `Gráfica de puntuaciones de ${fullName(result.examinee)}. Los valores están en la tabla de datos.` })}>
        <Suspense fallback={<p role="status">Cargando gráfica…</p>}>
          <ScoreChart data={data} showRanges={profile.hasRanges} kind={kind} />
        </Suspense>
      </div>
      <p className="chart-profile-name">{footName}</p>
      <details className="no-print">
        <summary>Ver datos en tabla</summary>
        <table className="scores">
          <thead>
            <tr>
              <th scope="col">Rasgo</th>
              {profile.hasRanges && <th scope="col">Mínimo</th>}
              {profile.hasRanges && <th scope="col">Máximo</th>}
              <th scope="col">Examen</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.traitId}>
                <td>{row.name}</td>
                {profile.hasRanges && <td>{row.minimum ?? '—'}</td>}
                {profile.hasRanges && <td>{row.maximum ?? '—'}</td>}
                <td>{row.score ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </ResultFrame>
  );
}
