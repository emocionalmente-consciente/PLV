import { type FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useApp } from '../../app/context';
import { createCustomProfile, deleteCustomProfile, listCustomProfiles } from '../../data/repositories';
import type { CustomProfile } from '../../data/schemas';
import { allProfiles, isNameTaken, newCustomProfile, profileName } from './profiles';

const profilePath = (id: string): string => `/perfiles/${encodeURIComponent(id)}`;

export function ProfilesPage() {
  const { db, pack } = useApp();
  const navigate = useNavigate();
  const [custom, setCustom] = useState<CustomProfile[]>([]);
  const [changes, setChanges] = useState(0);
  const [sourceId, setSourceId] = useState(pack.profiles[0]?.id ?? '');
  const [company, setCompany] = useState('');
  const [position, setPosition] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CustomProfile | null>(null);

  useEffect(() => {
    let current = true;
    listCustomProfiles(db)
      .then((list) => {
        if (current) setCustom(list);
      })
      .catch(() => {
        if (current) setError('No se pudo leer la base de datos de este navegador.');
      });
    return () => {
      current = false;
    };
  }, [db, changes]);

  const every = allProfiles(pack, custom);
  const companies = [...new Set(custom.map((p) => p.company).filter(Boolean))];
  const positions = [...new Set(every.map((p) => ('position' in p ? p.position : p.name)))];

  const create = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    const source = every.find((p) => p.id === sourceId);
    if (!source) return;
    if (position.trim() === '') {
      setError('Escribe el nombre del puesto.');
      return;
    }
    if (isNameTaken(profileName(company, position), every)) {
      setError('Ya existe un perfil con esa empresa y ese puesto.');
      return;
    }
    try {
      const profile = newCustomProfile(crypto.randomUUID(), source, company, position);
      await createCustomProfile(db, profile);
      void navigate(profilePath(profile.id));
    } catch {
      setError('No se pudo crear el perfil. Inténtalo de nuevo.');
    }
  };

  const confirmDelete = async (): Promise<void> => {
    if (!pendingDelete) return;
    try {
      await deleteCustomProfile(db, pendingDelete.id);
      setPendingDelete(null);
      setChanges((n) => n + 1);
    } catch {
      setError('No se pudo eliminar. No se cambió ningún dato.');
    }
  };

  return (
    <>
      <section className="panel" aria-labelledby="profiles-title">
        <h2 id="profiles-title">Perfiles de puesto</h2>
        <h3>De fábrica</h3>
        <ul className="examinee-list">
          {pack.profiles.map((profile) => (
            <li key={profile.id}>
              <Link to={profilePath(profile.id)}>{profile.name}</Link>
              <span className="muted">Solo consulta</span>
            </li>
          ))}
        </ul>

        <h3>Definidos por el usuario</h3>
        {custom.length === 0 && <p className="muted">Todavía no hay perfiles propios.</p>}
        <ul className="examinee-list">
          {custom.map((profile) => (
            <li key={profile.id}>
              <Link to={profilePath(profile.id)}>{profile.name}</Link>
              <button
                type="button"
                className="secondary"
                aria-label={`Eliminar el perfil ${profile.name}`}
                onClick={() => {
                  setPendingDelete(profile);
                }}
              >
                Eliminar
              </button>
            </li>
          ))}
        </ul>

        {pendingDelete && (
          <div role="alertdialog" aria-labelledby="delete-profile-title" className="confirm">
            <p id="delete-profile-title">
              <strong>¿Eliminar el perfil {pendingDelete.name}?</strong>
            </p>
            <p>Las sesiones ya capturadas con este perfil no cambian, porque guardan su propia copia.</p>
            <div className="row">
              <button type="button" className="danger" onClick={() => void confirmDelete()}>
                Sí, eliminar
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setPendingDelete(null);
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="panel" aria-labelledby="new-profile-title">
        <h2 id="new-profile-title">Crear un perfil</h2>
        <form onSubmit={(event) => void create(event)} className="stack" noValidate aria-label="Crear un perfil">
          <label htmlFor="profile-source">Perfil de origen</label>
          <select
            id="profile-source"
            value={sourceId}
            onChange={(event) => {
              setSourceId(event.target.value);
            }}
          >
            {every.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>

          <label htmlFor="profile-company">Empresa (opcional)</label>
          <input
            id="profile-company"
            list="company-names"
            autoComplete="off"
            value={company}
            onChange={(event) => {
              setCompany(event.target.value);
            }}
          />
          <datalist id="company-names">
            {companies.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>

          <label htmlFor="profile-position">Puesto</label>
          <input
            id="profile-position"
            list="position-names"
            autoComplete="off"
            value={position}
            onChange={(event) => {
              setPosition(event.target.value);
            }}
          />
          <datalist id="position-names">
            {positions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>

          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
          <button type="submit">Crear a partir del origen</button>
        </form>
      </section>
    </>
  );
}
