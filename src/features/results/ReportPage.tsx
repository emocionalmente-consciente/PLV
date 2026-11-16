import { Suspense, lazy, useState } from 'react';
import { useParams } from 'react-router';
import { useApp } from '../../app/context';
import { ErrorBoundary } from '../../app/ErrorBoundary';
import type { CiLevel } from '../../domain/ci/score';
import { type NormProfile, applicableNotes, colorReferenceRows } from '../../domain/norms/norms';
import { fullName } from '../examinees/names';
import { ProtocolTable } from './ProtocolPage';
import { type CiFactorLine, type ReportBlock, buildChart, buildReport } from './report';
import { PrintSheet, ReportHtml, ResultFrame, ResultMissing } from './ResultParts';
import type { Result } from './useResult';
import { useResult } from './useResult';

/** The reviewed wording for each level comes later (plan, legacy quirks), so reports show the number. */
const levelText = (level: CiLevel | null): string => (level === null ? '' : `Nivel ${String(level)} de 9`);

const scoreText = (line: CiFactorLine): string => `${String(line.value)}${line.belowAverage ? ' −' : ''}`;

function CiSection({ block }: { block: Extract<ReportBlock, { type: 'ci' }> }) {
  return (
    <div className="report-ci">
      <dl>
        <div>
          <dt>Puntuación global bruta</dt>
          <dd>{String(block.rawTotal)}</dd>
        </div>
        <div>
          <dt>{block.global.label}</dt>
          <dd>{scoreText(block.global)}</dd>
        </div>
        <div>
          <dt>Nivel</dt>
          <dd>{levelText(block.global.level)}</dd>
        </div>
      </dl>
      <table>
        <thead>
          <tr>
            <th scope="col">Factores especiales</th>
            <th scope="col">Puntuación</th>
            <th scope="col">Nivel en relación a la población en general</th>
          </tr>
        </thead>
        <tbody>
          {block.factors.map((factor) => (
            <tr key={factor.label}>
              <td>{factor.label}</td>
              <td>{scoreText(factor)}</td>
              <td>{levelText(factor.level)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Block({ block }: { block: ReportBlock }) {
  switch (block.type) {
    case 'section':
      return <h3 className="report-section">{block.text}</h3>;
    case 'html':
      return (
        <div className="report-text">
          <ReportHtml html={block.html} />
        </div>
      );
    case 'ci':
      return <CiSection block={block} />;
    case 'trait':
      return (
        <section className="report-trait">
          <h4>
            {block.code} {block.name} <span className="report-score">{String(block.value)}</span>
          </h4>
          {block.html !== null && (
            <div className="report-text">
              <ReportHtml html={block.html} />
            </div>
          )}
          {block.missingText && <p className="report-note">Sin texto para esta puntuación.</p>}
        </section>
      );
  }
}

/** The chosen reference. It's never part of the scores, so it can be switched freely. */
function ColorReference({ norm, serie2 }: { norm: NormProfile; serie2: string }) {
  const notes = applicableNotes(norm, serie2);
  return (
    <section className="norm-panel">
      <h3 className="report-section">Referencia de colores: {norm.name}</h3>
      {norm.status === 'reference-only' && <p className="report-note">Solo como referencia: esta tabla no está validada para uso laboral.</p>}
      <table className="scores norm-reference">
        <caption className="visually-hidden">Frecuencia con que cada color se elige en primer lugar, y lugar que le dio la persona examinada</caption>
        <thead>
          <tr>
            <th scope="col">Color</th>
            <th scope="col">Elegido en primer lugar</th>
            <th scope="col">Orden de referencia</th>
            <th scope="col">Lugar en la serie 2</th>
          </tr>
        </thead>
        <tbody>
          {colorReferenceRows(norm, serie2).map((row) => (
            <tr key={row.digit}>
              <td>
                {row.digit} {row.name}
              </td>
              <td>{row.percent.toFixed(2)} %</td>
              <td>{String(row.referenceOrder)}</td>
              <td>{String(row.examineePosition)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {notes.length > 0 && (
        <ul className="norm-notes">
          {notes.map((note) => (
            <li key={note.id}>{note.text}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

const SESSION_NORM = 'session';

const ScoreChart = lazy(() => import('./ScoreChart'));

/** The legacy printout carried the protocol and the chart after the text; on screen they have their own pages. */
function PrintedExtras({ result }: { result: Result }) {
  const { pack } = useApp();
  const { session, colorResult, scores = [] } = result.record;
  const data = buildChart(pack, session, scores, session.profile.ranges);
  return (
    <>
      {colorResult && (
        <PrintSheet result={result} title="Protocolo" appended>
          <ProtocolTable colorResult={colorResult} />
        </PrintSheet>
      )}
      <PrintSheet result={result} title="Gráfica" landscape appended>
        <p className="chart-name">{fullName(result.examinee)}</p>
        <div className="chart-scroll" role="img" aria-label={`Gráfica de puntuaciones de ${fullName(result.examinee)}`}>
          <ErrorBoundary fallback={<p className="report-note">No se pudo cargar la gráfica.</p>}>
            <Suspense fallback={null}>
              <ScoreChart data={data} showRanges={session.profile.hasRanges} kind="bars" printOnly />
            </Suspense>
          </ErrorBoundary>
        </div>
        <p className="chart-profile-name">{session.profile.name}</p>
      </PrintSheet>
    </>
  );
}

export function ReportPage() {
  const { pack } = useApp();
  const { sessionId = '' } = useParams();
  const result = useResult(sessionId);
  const [viewNorm, setViewNorm] = useState(SESSION_NORM);
  const [printExtras, setPrintExtras] = useState(true);
  if (!result) return <ResultMissing loading={result === undefined} />;
  const { session } = result.record;
  const { color, ci, ce } = session.instruments;
  if (!color && !ci && !ce) {
    return (
      <ResultFrame result={result} title="Informe">
        <p className="muted">Todavía no se ha capturado ninguna prueba.</p>
      </ResultFrame>
    );
  }
  const report = buildReport(pack, result.record);
  const sessionNorm = pack.normProfiles.find((n) => n.id === session.normProfileId);
  const norm = pack.normProfiles.find((n) => n.id === viewNorm) ?? sessionNorm;
  const comparing = viewNorm !== SESSION_NORM && viewNorm !== session.normProfileId;
  const { colorResult } = result.record;
  const serie2 = colorResult?.serie2;

  return (
    <ResultFrame result={result} title={report.title} {...(printExtras ? { after: <PrintedExtras result={result} /> } : {})}>
      <div className="no-print norm-select">
        <label htmlFor="report-norm">Ver con la referencia</label>
        <select
          id="report-norm"
          value={viewNorm}
          onChange={(event) => {
            setViewNorm(event.target.value);
          }}
        >
          <option value={SESSION_NORM}>{sessionNorm?.name ?? session.normProfileId} (la de la sesión)</option>
          {pack.normProfiles
            .filter((n) => n.id !== session.normProfileId)
            .map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
        </select>
        {comparing && (
          <p role="status" className="muted norm-view-note">
            Solo para comparar: la sesión se guardó con {sessionNorm?.name ?? session.normProfileId}. Las puntuaciones son las mismas.
          </p>
        )}
        <label className="check">
          <input
            type="checkbox"
            checked={printExtras}
            onChange={(event) => {
              setPrintExtras(event.target.checked);
            }}
          />
          {colorResult ? 'Imprimir también el protocolo y la gráfica' : 'Imprimir también la gráfica'}
        </label>
      </div>
      {norm && <p className="norm-label">{norm.label}</p>}
      {report.blocks.map((block) => (
        <Block key={block.key} block={block} />
      ))}
      {norm && serie2 && <ColorReference norm={norm} serie2={serie2} />}
    </ResultFrame>
  );
}
