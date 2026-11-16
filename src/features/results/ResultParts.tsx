import { Fragment, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router';
import { useApp } from '../../app/context';
import { fullName } from '../examinees/names';
import { pendingInstruments } from '../capture/build';
import { INSTRUMENT_LABELS, instrumentPath } from '../capture/labels';
import { formatLongDate, moduleOf, sexLabel } from './report';
import type { HtmlNode } from './reportHtml';
import { parseReportHtml } from './reportHtml';
import type { Result } from './useResult';

export function ResultMissing({ loading }: { loading: boolean }) {
  if (loading) return <p role="status">Cargando…</p>;
  return (
    <section className="panel">
      <p role="alert">No se encontró esta sesión.</p>
      <Link to="/">Volver a examinados</Link>
    </section>
  );
}

function renderNode(node: HtmlNode, key: number, assets: Record<string, string>): ReactNode {
  if (typeof node === 'string') return <Fragment key={key}>{node}</Fragment>;
  if (node.tag === 'img') {
    const data = assets[node.src];
    return data ? <img key={key} src={`data:image/png;base64,${data}`} alt="" /> : null;
  }
  const children = node.children.map((child, i) => renderNode(child, i, assets));
  if (node.tag === 'p') {
    return (
      <p
        key={key}
        style={
          node.align
            ? {
                textAlign: node.align as 'left' | 'right' | 'center' | 'justify',
              }
            : undefined
        }
      >
        {children}
      </p>
    );
  }
  const Tag = node.tag;
  return <Tag key={key}>{children}</Tag>;
}

export function ReportHtml({ html, assets }: { html: string; assets?: Record<string, string> }) {
  const { pack } = useApp();
  return <>{parseReportHtml(html).map((node, i) => renderNode(node, i, assets ?? pack.assets))}</>;
}

/** Links and print button, which never print. */
export function ResultNav({ result }: { result: Result }) {
  const { session, colorResult } = result.record;
  const base = `/sesiones/${session.id}`;
  return (
    <div className="result-nav no-print">
      <p>
        <Link to={`/examinados/${session.examineeId}`}>← Volver al examinado</Link>
      </p>
      <nav aria-label="Resultados" className="row">
        <NavLink end to={base} className="button secondary">
          Informe
        </NavLink>
        {colorResult && (
          <NavLink to={`${base}/protocolo`} className="button secondary">
            Protocolo
          </NavLink>
        )}
        <NavLink to={`${base}/grafica`} className="button secondary">
          Gráfica
        </NavLink>
        <button
          type="button"
          onClick={() => {
            window.print();
          }}
        >
          Imprimir
        </button>
        {pendingInstruments(session).map((instrument) => (
          <Link key={instrument} className="button secondary" to={instrumentPath(session.id, instrument)}>
            Capturar {INSTRUMENT_LABELS[instrument]}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function ContentNotice({ result }: { result: Result }) {
  const { pack } = useApp();
  const { contentVersion } = result.record.session;
  if (contentVersion === pack.contentVersion) return null;
  return (
    <p role="status" className="notice no-print">
      Esta sesión se capturó con la versión {contentVersion} del contenido, y el paquete abierto es la {pack.contentVersion}. Los textos se muestran del paquete abierto.
    </p>
  );
}

interface SheetProps {
  result: Result;
  title: string;
  children: ReactNode;
  landscape?: boolean;
  /** An extra sheet printed after the main one, starting on a new page and never shown on screen. */
  appended?: boolean;
}

/**
 * One printed sheet. A table header repeats on every printed page, which gives each page the legacy
 * header with the examinee's details.
 */
export function PrintSheet({ result, title, children, landscape = false, appended = false }: SheetProps) {
  const { examinee, record } = result;
  const { session } = record;
  const classes = ['sheet', landscape && 'sheet-landscape', appended && 'sheet-appended'].filter(Boolean).join(' ');
  return (
    <div className={classes} data-module={moduleOf(session)}>
      <table className="print-frame">
        <thead>
          <tr>
            <td>
              <header className="sheet-header">
                <div>
                  <strong>{fullName(examinee)}</strong>
                  <span>Puesto: {session.profile.name}</span>
                </div>
                <div className="sheet-header-right">
                  <span>{formatLongDate(session.testDate)}</span>
                  <span>Edad: {String(session.ageAtTest)}</span>
                  <span>Sexo: {sexLabel(examinee)}</span>
                </div>
              </header>
            </td>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <h2 className="sheet-title">{title}</h2>
              {!appended && session.administration === 'screen' && (session.instruments.color || session.instruments.ce) && (
                <p className="report-note screen-note">Administración en pantalla: los colores varían según el dispositivo, y este resultado aún no está validado contra las tarjetas.</p>
              )}
              {children}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** A result screen: its links, then the printed sheet, then any sheets printed after it. */
export function ResultFrame({ result, title, children, landscape = false, after }: { result: Result; title: string; children: ReactNode; landscape?: boolean; after?: ReactNode }) {
  return (
    <>
      <ResultNav result={result} />
      <ContentNotice result={result} />
      <PrintSheet result={result} title={title} landscape={landscape}>
        {children}
      </PrintSheet>
      {after}
    </>
  );
}
