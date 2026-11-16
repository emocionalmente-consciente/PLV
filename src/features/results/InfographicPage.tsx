import type { CSSProperties } from "react";
import { useParams } from "react-router";
import { useApp } from "../../app/context";
import { applicableNotes, colorReferenceRows } from "../../domain/norms/norms";
import { CARD_COLORS } from "../examinee/colors";
import { fullName } from "../examinees/names";
import {
  type FollowUp,
  type Infographic,
  PRIORITY_LABEL,
  type Status,
  type Tone,
  type TraitBar,
  type Trend,
  buildInfographic,
} from "./infographic";
import { formatLongDate, sexLabel } from "./report";
import { ResultMissing, ResultNav } from "./ResultParts";
import { type Result, useResult } from "./useResult";
import "./infographic.css";

const TONE_VAR: Record<Tone, string> = {
  strong: "var(--ig-strong)",
  avg: "var(--ig-avg)",
  watch: "var(--ig-watch)",
  alert: "var(--ig-alert)",
};
const ARROW: Record<Trend, string> = { up: "↗", flat: "→", down: "↘" };
const TREND_TONE: Record<Trend, Tone> = {
  up: "strong",
  flat: "avg",
  down: "alert",
};
const toneStyle = (tone: Tone): CSSProperties =>
  ({ "--c": TONE_VAR[tone] }) as CSSProperties;

function Tag({ tone, children }: { tone: Tone; children: string }) {
  return <span className={`ig-tag ig-${tone}`}>{children}</span>;
}

function Kpi({
  title,
  value,
  detail,
  tone,
  small = false,
}: {
  title: string;
  value: string;
  detail: string;
  tone: Tone;
  small?: boolean;
}) {
  return (
    <div className="ig-kpi" style={toneStyle(tone)}>
      <div className="ig-kpi-k">{title}</div>
      <div className={small ? "ig-kpi-v ig-kpi-v-small" : "ig-kpi-v"}>
        {value}
      </div>
      <div className="ig-kpi-d">{detail}</div>
    </div>
  );
}

function Stanine({ level }: { level: number | null }) {
  return (
    <span className="ig-stanine" aria-hidden="true">
      {Array.from({ length: 9 }, (_, i) => (
        <i
          key={i}
          className={
            level !== null && i < level
              ? i >= 6
                ? "on high"
                : "on"
              : undefined
          }
        />
      ))}
    </span>
  );
}

function CiSection({ ci }: { ci: NonNullable<Infographic["ci"]> }) {
  const level = ci.global.level ?? 0;
  const circumference = 2 * Math.PI * 50;
  return (
    <div className="ig-intel">
      <div className="ig-ring">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r="50" className="ig-ring-track" />
          <circle
            cx="60"
            cy="60"
            r="50"
            className="ig-ring-fill"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - level / 9)}
          />
        </svg>
        <div className="ig-ring-c">
          <b>{ci.global.value}</b>
          <span>C.I. · Nivel {ci.global.level ?? "—"}/9</span>
        </div>
      </div>
      <div>
        {ci.factors.map((factor) => (
          <div key={factor.label} className="ig-factor">
            <span className="ig-factor-n">{factor.label}</span>
            <span className="ig-factor-s">{factor.value}</span>
            <Stanine level={factor.level} />
            <span className="ig-factor-l">
              {factor.level === null
                ? ""
                : `Nivel ${String(factor.level)} de 9`}
            </span>
          </div>
        ))}
        <p className="ig-note">
          Puntuación global bruta: {ci.rawTotal}. Nivel respecto a la población
          general, en una escala de 9.
        </p>
      </div>
    </div>
  );
}

function Bars({ bars, label }: { bars: TraitBar[]; label: string }) {
  return (
    <div className="ig-bars" role="list" aria-label={label}>
      {bars.map((bar) => (
        <div
          key={bar.traitId}
          className="ig-bar"
          role="listitem"
          style={toneStyle(bar.tone)}
        >
          <span className="ig-bar-n">{bar.name}</span>
          <span className="ig-track">
            <span
              className="ig-fill"
              style={{
                width: `${String(Math.max(0, Math.min(100, bar.value)))}%`,
              }}
            />
          </span>
          <span className="ig-bar-s">{bar.value}</span>
          <Tag tone={bar.tone}>{bar.label}</Tag>
        </div>
      ))}
      <div className="ig-axis" aria-hidden="true">
        <span />
        <span className="ig-scale">
          <span style={{ left: "0%" }}>0</span>
          <span style={{ left: "45%" }}>45</span>
          <span style={{ left: "60%" }}>60</span>
          <span style={{ left: "100%" }}>100</span>
        </span>
      </div>
    </div>
  );
}

function OutlookCard({
  title,
  status,
  evolution,
  evolutionTitle,
}: {
  title: string;
  status: Status | null;
  evolution: Infographic["stabilityEvolution"];
  evolutionTitle: string;
}) {
  if (!status && !evolution) return null;
  return (
    <div className="ig-card">
      <div className="ig-card-k">{title}</div>
      {status && (
        <>
          <Tag tone={status.tone}>
            {status.tone === "alert"
              ? "Atención"
              : status.tone === "watch"
                ? "Vigilar"
                : "Adecuado"}
          </Tag>
          <h4>{status.label}</h4>
        </>
      )}
      {evolution && (
        <div className="ig-trend">
          <span
            className={`ig-arrow ig-${TREND_TONE[evolution.trend]}`}
            aria-hidden="true"
          >
            {ARROW[evolution.trend]}
          </span>
          <span>
            <b>{evolutionTitle}:</b> {evolution.label.toLowerCase()}
          </span>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  wide = false,
}: {
  label: string;
  hint: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "ig-field ig-field-wide" : "ig-field"}>
      {label}
      <span className="ig-line">{hint}</span>
    </div>
  );
}

function FollowUpCard({ card }: { card: FollowUp }) {
  return (
    <article className="ig-fu" style={toneStyle(card.tone)}>
      <div className="ig-fu-head">
        <Tag tone={card.tone}>{PRIORITY_LABEL[card.priority]}</Tag>
        <h4>{card.title}</h4>
        <span className="ig-fu-score">
          {card.triggers.map((t, i) => (
            <span key={t.label}>
              {i > 0 && " · "}
              {t.label} <b>{t.value}</b>
            </span>
          ))}
        </span>
      </div>
      <p className="ig-fu-why">{card.why}</p>
      <div className="ig-fields">
        <Field label="Acción" hint={card.actionHint} />
        <Field label="Responsable" hint="Nombre" />
        <Field label={card.dateLabel} hint="dd/mm/aaaa" />
        {card.wideField && (
          <Field label={card.wideField.label} hint={card.wideField.hint} wide />
        )}
      </div>
      <div className="ig-status" aria-hidden="true">
        <span>Pendiente</span>
        <span>En curso</span>
        <span>Completado</span>
      </div>
    </article>
  );
}

function ColorSection({ result }: { result: Result }) {
  const { pack } = useApp();
  const { session, colorResult } = result.record;
  const norm = pack.normProfiles.find((n) => n.id === session.normProfileId);
  if (!norm || !colorResult) return null;
  const rows = colorReferenceRows(norm, colorResult.serie2);
  return (
    <section className="ig-avoid">
      <h3 className="ig-h">
        <span className="ig-num">VII</span>Referencia de colores · {norm.name}
      </h3>
      <div className="ig-colors">
        {rows.map((row) => (
          <div
            key={row.digit}
            className={
              Math.abs(row.examineePosition - row.referenceOrder) >= 3
                ? "ig-sw ig-shift"
                : "ig-sw"
            }
            style={{ "--c": CARD_COLORS[row.digit] ?? "#888" } as CSSProperties}
          >
            <div className="ig-sw-blk">
              <b>{row.digit}</b>
            </div>
            <div className="ig-sw-pos">{row.examineePosition}</div>
            <div className="ig-sw-nm">{row.name}</div>
            <div className="ig-sw-rf">
              {row.percent.toFixed(2)} %
              <br />
              ref. {row.referenceOrder}
            </div>
          </div>
        ))}
      </div>
      <p className="ig-note">
        Número grande: lugar en la serie 2. Debajo: frecuencia como primera
        elección y orden de referencia. Resaltados: desplazamientos de 3 o más
        lugares.
        {applicableNotes(norm, colorResult.serie2).map(
          (note) => ` ${note.text}`,
        )}
      </p>
    </section>
  );
}

export function InfographicPage() {
  const { pack } = useApp();
  const { sessionId = "" } = useParams();
  const result = useResult(sessionId);
  if (!result) return <ResultMissing loading={result === undefined} />;
  const { examinee, record } = result;
  const { session } = record;
  const info = buildInfographic(pack, record);
  const norm = pack.normProfiles.find((n) => n.id === session.normProfileId);

  if (!info) {
    return (
      <>
        <ResultNav result={result} />
        <section className="panel">
          <p className="muted">
            La infografía está disponible para el informe psicolaboral (Colores
            y C.I.). Para el C.E. usa el informe clásico.
          </p>
        </section>
      </>
    );
  }

  const hasTraits =
    info.workTraits.length > 0 || info.emotionalTraits.length > 0;
  return (
    <>
      <ResultNav result={result} />
      <div className="ig">
        <header className="ig-hero">
          <div>
            <div className="ig-eyebrow">Informe psicolaboral · PsIV</div>
            <h2>{fullName(examinee)}</h2>
            <div className="ig-meta">
              <span>
                Puesto <b>{session.profile.name}</b>
              </span>
              <span>
                Edad <b>{session.ageAtTest}</b>
              </span>
              <span>
                Sexo <b>{sexLabel(examinee)}</b>
              </span>
              <span>
                Evaluación <b>{formatLongDate(session.testDate)}</b>
              </span>
            </div>
          </div>
          {info.verdict && (
            <div className="ig-verdict">
              <div className="ig-eyebrow">Dictamen</div>
              <div className={`ig-pill ig-${info.verdict.tone}`}>
                {info.verdict.label}
              </div>
              {norm && <div className="ig-ref">{norm.label}</div>}
            </div>
          )}
        </header>

        {session.administration === "screen" && (
          <p className="report-note">
            Administración en pantalla: los colores varían según el dispositivo,
            y este resultado aún no está validado contra las tarjetas.
          </p>
        )}

        <div className="ig-kpis">
          {info.ci && (
            <Kpi
              title="C.I. · Factor G"
              value={String(info.ci.global.value)}
              detail={
                info.ci.global.level === null
                  ? ""
                  : `Nivel ${String(info.ci.global.level)} de 9`
              }
              tone={
                info.ci.global.level !== null && info.ci.global.level >= 7
                  ? "strong"
                  : "avg"
              }
            />
          )}
          {info.ceGlobal && (
            <Kpi
              title="C.E. Global"
              value={String(info.ceGlobal.value)}
              detail="Inteligencia emocional"
              tone={info.ceGlobal.tone}
            />
          )}
          {info.stability && (
            <Kpi
              title="Estabilidad emocional"
              value={info.stability.label}
              detail={info.stabilityEvolution?.label ?? ""}
              tone={info.stability.tone}
              small
            />
          )}
          {info.forecast && (
            <Kpi
              title="Pronóstico laboral"
              value={info.forecast.label}
              detail={
                info.forecastEvolution
                  ? `Evolución: ${info.forecastEvolution.label.toLowerCase()}`
                  : ""
              }
              tone={info.forecast.tone}
              small
            />
          )}
        </div>

        {info.ci && (
          <section className="ig-avoid">
            <h3 className="ig-h">
              <span className="ig-num">I</span>Perfil intelectual
            </h3>
            <CiSection ci={info.ci} />
          </section>
        )}

        {(info.stability ?? info.forecast) && (
          <section className="ig-avoid">
            <h3 className="ig-h">
              <span className="ig-num">II</span>Estabilidad emocional y
              pronóstico
            </h3>
            <div className="ig-duo">
              <OutlookCard
                title="Estabilidad emocional"
                status={info.stability}
                evolution={info.stabilityEvolution}
                evolutionTitle="Evolución"
              />
              <OutlookCard
                title="Pronóstico laboral"
                status={info.forecast}
                evolution={info.forecastEvolution}
                evolutionTitle="Evolución"
              />
            </div>
            <p className="ig-note">
              Resumen de las secciones II y III del informe clásico, que
              contiene el texto completo.
            </p>
          </section>
        )}

        {hasTraits && (
          <div className="ig-break">
            <div className="ig-legend">
              <span style={toneStyle("strong")}>Fortaleza</span>
              <span style={toneStyle("avg")}>Promedio (45–60)</span>
              <span style={toneStyle("watch")}>Vigilar</span>
              <span style={toneStyle("alert")}>Prioridad</span>
            </div>
            {info.workTraits.length > 0 && (
              <section className="ig-avoid">
                <h3 className="ig-h">
                  <span className="ig-num">III</span>Rasgos laborales
                  representativos
                </h3>
                <Bars bars={info.workTraits} label="Rasgos laborales" />
              </section>
            )}
            {info.emotionalTraits.length > 0 && (
              <section className="ig-avoid">
                <h3 className="ig-h">
                  <span className="ig-num">IV</span>Inteligencia emocional
                </h3>
                <Bars
                  bars={info.emotionalTraits}
                  label="Inteligencia emocional"
                />
              </section>
            )}
          </div>
        )}

        <section className="ig-break">
          <h3 className="ig-h">
            <span className="ig-num">V</span>Plan de seguimiento
          </h3>
          <p className="ig-lead">
            Cada tarjeta se activa por un puntaje fuera del rango promedio o por
            un resultado del informe. Los campos punteados se completan a mano o
            en la copia impresa.
          </p>
          {info.followUps.length === 0 ? (
            <p className="ig-note">
              Ningún puntaje requiere seguimiento específico.
            </p>
          ) : (
            info.followUps.map((card) => (
              <FollowUpCard key={card.id} card={card} />
            ))
          )}
        </section>

        <section className="ig-avoid">
          <h3 className="ig-h">
            <span className="ig-num">VI</span>Calendario de revisión
          </h3>
          <div className="ig-timeline">
            {[
              [
                "30 días",
                "Cierre de las verificaciones de prioridad alta y decisión.",
              ],
              ["60 días", "Revisión de las acciones de prioridad media."],
              [
                "90 días",
                "Evaluación integral y, si aplica, reaplicación de la prueba.",
              ],
            ].map(([when, what]) => (
              <div key={when} className="ig-tl">
                <div className="ig-when">{when}</div>
                <div className="ig-what">{what}</div>
                <span className="ig-tl-line" />
                <span className="ig-tl-line" />
              </div>
            ))}
          </div>
        </section>

        <ColorSection result={result} />

        <div className="ig-avoid">
          <div className="ig-sign">
            <div>Evaluador/a · nombre y firma</div>
            <div>Responsable de RR. HH.</div>
            <div>Fecha de cierre del seguimiento</div>
          </div>
          <p className="ig-disclaimer">
            Documento confidencial. Resume el informe PsIV del{" "}
            {formatLongDate(session.testDate).toLowerCase()} y no reemplaza el
            informe completo ni el juicio profesional del evaluador. Las
            acciones de seguimiento son sugerencias a validar por el responsable
            del proceso.
          </p>
        </div>
      </div>
    </>
  );
}
