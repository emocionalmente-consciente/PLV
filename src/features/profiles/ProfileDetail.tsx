import { type FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useApp } from '../../app/context';
import { listCustomProfiles, updateCustomProfile } from '../../data/repositories';
import type { CustomProfile } from '../../data/schemas';
import { compareCodes } from '../results/report';
import { type AnyProfile, type RangeProblem, type Ranges, allProfiles, isCustom, isNameTaken, profileName, rangeProblem, traitTop } from './profiles';

type Drafts = Record<string, { min: string; max: string }>;

const PROBLEM_TEXT: Record<RangeProblem, (top: number) => string> = {
  'not-a-number': (top) => `Escribe números enteros entre 0 y ${String(top)}.`,
  'out-of-range': (top) => `El valor máximo permitido es ${String(top)}.`,
  'minimum-above-maximum': () => 'El mínimo no puede ser mayor que el máximo.',
};

const SECTIONS = [
  { module: 'p4', title: 'Psicolaboral 4' },
  { module: 'ce', title: 'PsicoEmocional' },
] as const;

function toDrafts(ranges: Ranges): Drafts {
  return Object.fromEntries(Object.entries(ranges).map(([id, r]) => [id, { min: String(r.min), max: String(r.max) }]));
}

function Editor({ profile, others, onSaved }: { profile: CustomProfile; others: readonly AnyProfile[]; onSaved: () => void }) {
  const { db, pack } = useApp();
  const [company, setCompany] = useState(profile.company);
  const [position, setPosition] = useState(profile.position);
  const [drafts, setDrafts] = useState<Drafts>(() => toDrafts(profile.ranges));
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  const problemOf = (id: string): string | null => {
    const draft = drafts[id];
    if (!draft) return null;
    const problem = rangeProblem(id, draft.min, draft.max);
    return problem ? PROBLEM_TEXT[problem](traitTop(id)) : null;
  };

  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (Object.keys(drafts).some((id) => problemOf(id))) {
      setMessage({ error: true, text: 'Corrige los valores marcados antes de guardar.' });
      return;
    }
    if (position.trim() === '') {
      setMessage({ error: true, text: 'Escribe el nombre del puesto.' });
      return;
    }
    const name = profileName(company, position);
    if (isNameTaken(name, others, profile.id)) {
      setMessage({ error: true, text: 'Ya existe un perfil con esa empresa y ese puesto.' });
      return;
    }
    const ranges = Object.fromEntries(Object.entries(drafts).map(([id, d]) => [id, { min: Number(d.min), max: Number(d.max) }]));
    try {
      await updateCustomProfile(db, { ...profile, name, company: company.trim(), position: position.trim(), ranges });
      setMessage({ error: false, text: 'Perfil guardado.' });
      onSaved();
    } catch {
      setMessage({ error: true, text: 'No se pudo guardar. No se cambió ningún dato.' });
    }
  };

  return (
    <form onSubmit={(event) => void save(event)} className="stack" noValidate aria-label="Editar perfil">
      <label htmlFor="edit-company">Empresa (opcional)</label>
      <input
        id="edit-company"
        autoComplete="off"
        value={company}
        onChange={(event) => {
          setCompany(event.target.value);
        }}
      />
      <label htmlFor="edit-position">Puesto</label>
      <input
        id="edit-position"
        autoComplete="off"
        value={position}
        onChange={(event) => {
          setPosition(event.target.value);
        }}
      />

      {SECTIONS.map(({ module, title }) => (
        <table key={module} className="scores ranges">
          <caption>{title}</caption>
          <thead>
            <tr>
              <th scope="col">Rasgo</th>
              <th scope="col">Mínimo</th>
              <th scope="col">Máximo</th>
            </tr>
          </thead>
          <tbody>
            {pack.traits
              .filter((t) => t.module === module && drafts[t.id])
              .sort((a, b) => compareCodes(a.reportCode, b.reportCode))
              .map((trait) => {
                const problem = problemOf(trait.id);
                const update = (field: 'min' | 'max', value: string): void => {
                  setMessage(null);
                  setDrafts((current) => ({ ...current, [trait.id]: { min: current[trait.id]?.min ?? '', max: current[trait.id]?.max ?? '', [field]: value } }));
                };
                return (
                  <tr key={trait.id}>
                    <td>
                      {trait.name}
                      {problem && (
                        <p role="alert" className="field-error">
                          {problem}
                        </p>
                      )}
                    </td>
                    <td>
                      <input
                        aria-label={`Mínimo de ${trait.name}`}
                        inputMode="numeric"
                        autoComplete="off"
                        aria-invalid={problem !== null}
                        value={drafts[trait.id]?.min ?? ''}
                        onChange={(event) => {
                          update('min', event.target.value);
                        }}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Máximo de ${trait.name}`}
                        inputMode="numeric"
                        autoComplete="off"
                        aria-invalid={problem !== null}
                        value={drafts[trait.id]?.max ?? ''}
                        onChange={(event) => {
                          update('max', event.target.value);
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      ))}

      {message && (
        <p role={message.error ? 'alert' : 'status'} className={message.error ? 'field-error' : 'muted'}>
          {message.text}
        </p>
      )}
      <button type="submit">Guardar perfil</button>
    </form>
  );
}

function ReadOnly({ profile }: { profile: AnyProfile }) {
  const { pack } = useApp();
  if (!profile.hasRanges) return <p className="muted">Este perfil no define rangos.</p>;
  return (
    <>
      {SECTIONS.map(({ module, title }) => (
        <table key={module} className="scores ranges">
          <caption>{title}</caption>
          <thead>
            <tr>
              <th scope="col">Rasgo</th>
              <th scope="col">Mínimo</th>
              <th scope="col">Máximo</th>
            </tr>
          </thead>
          <tbody>
            {pack.traits
              .filter((t) => t.module === module && profile.ranges[t.id])
              .sort((a, b) => compareCodes(a.reportCode, b.reportCode))
              .map((trait) => (
                <tr key={trait.id}>
                  <td>{trait.name}</td>
                  <td>{profile.ranges[trait.id]?.min}</td>
                  <td>{profile.ranges[trait.id]?.max}</td>
                </tr>
              ))}
          </tbody>
        </table>
      ))}
    </>
  );
}

export function ProfileDetail() {
  const { db, pack } = useApp();
  const { profileId = '' } = useParams();
  const [custom, setCustom] = useState<CustomProfile[] | null>(null);
  const [changes, setChanges] = useState(0);

  useEffect(() => {
    let current = true;
    listCustomProfiles(db)
      .then((list) => {
        if (current) setCustom(list);
      })
      .catch(() => {
        if (current) setCustom([]);
      });
    return () => {
      current = false;
    };
  }, [db, changes]);

  if (!custom) return <p role="status">Cargando…</p>;
  const every = allProfiles(pack, custom);
  const profile = every.find((p) => p.id === profileId);
  if (!profile) {
    return (
      <section className="panel">
        <p role="alert">No se encontró este perfil.</p>
        <Link to="/perfiles">Volver a perfiles</Link>
      </section>
    );
  }

  return (
    <>
      <p>
        <Link to="/perfiles">← Perfiles</Link>
      </p>
      <section className="panel" aria-labelledby="profile-title">
        <h2 id="profile-title">{profile.name}</h2>
        {isCustom(profile) && !profile.locked ? (
          <Editor
            key={profile.id}
            profile={profile}
            others={every}
            onSaved={() => {
              setChanges((n) => n + 1);
            }}
          />
        ) : (
          <>
            <p className="muted">Los perfiles de fábrica son de solo consulta. Para cambiarlo, crea uno propio a partir de este.</p>
            <ReadOnly profile={profile} />
          </>
        )}
      </section>
    </>
  );
}
