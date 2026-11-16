import { useMemo, useState, useSyncExternalStore } from 'react';
import { HashRouter, Link, Route, Routes } from 'react-router';
import type { ManualsPack } from '../content/schemas';
import { createDb } from '../data/db';
import { BackupPanel } from '../features/backup/BackupPanel';
import { CeEntry } from '../features/capture/CeEntry';
import { CiEntry } from '../features/capture/CiEntry';
import { ColorEntry } from '../features/capture/ColorEntry';
import { SessionForm } from '../features/capture/SessionForm';
import { ExamineeApp } from '../features/examinee/ExamineeApp';
import { ExamineeDetail } from '../features/examinees/ExamineeDetail';
import { ExamineesPanel } from '../features/examinees/ExamineesPanel';
import { type LoadedPack, PackScreen } from '../features/pack/PackScreen';
import { InvitationForm } from '../features/invitations/InvitationForm';
import { InvitationsPage } from '../features/invitations/InvitationsPage';
import { ChartPage } from '../features/results/ChartPage';
import { ManualView, ManualsPage } from '../features/manuals/ManualsPage';
import { ProfileDetail } from '../features/profiles/ProfileDetail';
import { ProfilesPage } from '../features/profiles/ProfilesPage';
import { HistoryPage } from '../features/results/HistoryPage';
import { ProtocolPage } from '../features/results/ProtocolPage';
import { ReportPage } from '../features/results/ReportPage';
import { tokenFromHash } from '../invitations/token';
import { AppContext } from './context';
import { ErrorBoundary } from './ErrorBoundary';

const db = createDb();

function Home() {
  const [restores, setRestores] = useState(0);
  return (
    <>
      <ExamineesPanel db={db} version={restores} />
      <BackupPanel
        db={db}
        onRestored={() => {
          setRestores((n) => n + 1);
        }}
      />
    </>
  );
}

function NotFound() {
  return (
    <section className="panel">
      <p role="alert">Esta página no existe.</p>
      <Link to="/">Volver a examinados</Link>
    </section>
  );
}

function subscribeToHash(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => {
    window.removeEventListener('hashchange', onChange);
  };
}

/** An examinee link needs no operator pack, and never reaches the operator's screens. */
export function App() {
  const token = useSyncExternalStore(subscribeToHash, () => tokenFromHash(window.location.hash), () => null);
  return <ErrorBoundary>{token ? <ExamineeApp key={token} token={token} /> : <OperatorApp />}</ErrorBoundary>;
}

function OperatorApp() {
  const [loaded, setLoaded] = useState<LoadedPack | null>(null);
  const [manuals, setManuals] = useState<ManualsPack | null>(null);
  const context = useMemo(() => (loaded ? { db, pack: loaded.pack, isDemo: loaded.isDemo, manuals, setManuals } : null), [loaded, manuals]);

  if (!loaded) return <PackScreen onLoaded={setLoaded} />;

  return (
    <AppContext.Provider value={context}>
      <HashRouter>
        <main className="app">
          <header className="app-header no-print">
            <h1>
              <Link to="/">PsIV</Link>
            </h1>
            <p role="status" className="muted">
              {loaded.isDemo ? 'Contenido de demostración' : 'Paquete'}, versión {loaded.pack.contentVersion}
            </p>
            <div className="row">
              <Link className="button secondary" to="/">
                Examinados
              </Link>
              <Link className="button secondary" to="/historial">
                Historial
              </Link>
              <Link className="button secondary" to="/invitaciones">
                Invitaciones
              </Link>
              <Link className="button secondary" to="/perfiles">
                Perfiles
              </Link>
              <Link className="button secondary" to="/manuales">
                Manuales
              </Link>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setLoaded(null);
                  setManuals(null);
                }}
              >
                Cerrar paquete
              </button>
            </div>
          </header>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/historial" element={<HistoryPage />} />
            <Route path="/invitaciones" element={<InvitationsPage />} />
            <Route path="/perfiles" element={<ProfilesPage />} />
            <Route path="/perfiles/:profileId" element={<ProfileDetail />} />
            <Route path="/manuales" element={<ManualsPage />} />
            <Route path="/manuales/:manualId" element={<ManualView />} />
            <Route path="/examinados/:examineeId" element={<ExamineeDetail />} />
            <Route path="/examinados/:examineeId/sesion/nueva" element={<SessionForm />} />
            <Route path="/examinados/:examineeId/invitacion" element={<InvitationForm />} />
            <Route path="/sesiones/:sessionId" element={<ReportPage />} />
            <Route path="/sesiones/:sessionId/protocolo" element={<ProtocolPage />} />
            <Route path="/sesiones/:sessionId/grafica" element={<ChartPage />} />
            <Route path="/sesiones/:sessionId/color" element={<ColorEntry />} />
            <Route path="/sesiones/:sessionId/ci" element={<CiEntry />} />
            <Route path="/sesiones/:sessionId/ce" element={<CeEntry />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </HashRouter>
    </AppContext.Provider>
  );
}
