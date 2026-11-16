import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useApp } from '../../app/context';
import { type HistoryRow, listHistory, normalizeName } from '../../data/repositories';
import { fullName } from '../examinees/names';
import { type ReportModule, capturedSummary, moduleOf } from './report';

type Filter = 'all' | ReportModule;

export function HistoryPage() {
  const { db } = useApp();
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    listHistory(db)
      .then((list) => {
        if (current) setRows(list);
      })
      .catch(() => {
        if (current) setFailed(true);
      });
    return () => {
      current = false;
    };
  }, [db]);

  if (failed) return <p role="alert">No se pudo leer la base de datos de este navegador.</p>;
  if (!rows) return <p role="status">Cargando…</p>;

  const words = normalizeName(query).split(' ').filter(Boolean);
  const shown = rows.filter(({ examinee, session }) => {
    const name = normalizeName(fullName(examinee));
    return words.every((word) => name.includes(word)) && (filter === 'all' || moduleOf(session) === filter);
  });

  return (
    <section className="panel" aria-labelledby="history-title">
      <h2 id="history-title">Historial</h2>
      <label htmlFor="history-search">Buscar por nombre</label>
      <input
        id="history-search"
        type="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
      />
      <label htmlFor="history-module">Módulo</label>
      <select
        id="history-module"
        value={filter}
        onChange={(event) => {
          setFilter(event.target.value as Filter);
        }}
      >
        <option value="all">Todos</option>
        <option value="p4">Psicolaboral 4</option>
        <option value="ce">PsicoEmocional</option>
      </select>

      {shown.length === 0 && <p className="muted">{rows.length === 0 ? 'Todavía no hay sesiones.' : 'No hay resultados.'}</p>}
      {shown.length > 0 && (
        <table className="scores history">
          <caption className="visually-hidden">Sesiones, de la más reciente a la más antigua</caption>
          <thead>
            <tr>
              <th scope="col">Fecha</th>
              <th scope="col">Examinado</th>
              <th scope="col">Pruebas</th>
              <th scope="col">Perfil</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(({ examinee, session }) => (
              <tr key={session.id}>
                <td>
                  <Link to={`/sesiones/${session.id}`}>{session.testDate}</Link>
                </td>
                <td>{fullName(examinee)}</td>
                <td>{capturedSummary(session)}</td>
                <td>{session.profile.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
