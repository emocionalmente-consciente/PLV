# PsIV migration plan: React + TypeScript on GitHub Pages

A phase-by-phase plan for future coding sessions. Background is in [ARCHITECTURE.md](ARCHITECTURE.md), the data dump steps are in [DATA_EXTRACTION.md](DATA_EXTRACTION.md), and the target data structure and phase notes are in [DATA_MODEL.md](DATA_MODEL.md). Read the matching notes there before starting a phase.

**How to use it:** start a session with *"Implement Phase N from docs/migration/MIGRATION_PLAN.md."* Each phase is one session unless noted. Tick its acceptance criteria before moving on.

## Status

| Phase | Name | Status |
|---|---|---|
| 0 | Data gate | Done on Mac (see [content decisions](DATA_EXTRACTION.md#content-decisions)) |
| 1 | Repo, scaffold and deploy | Built and checked locally. First push and Pages setup still to do |
| 2 | Color protocol engine | Built and checked locally, not committed yet |
| 3 | Trait scoring | Built and checked locally, not committed yet |
| 4 | Content packs | Built and checked locally, not committed yet. The real packs still need your passphrase |
| 5 | Local data | Built and checked locally, not committed yet |
| 6 | Operator capture | Built and checked locally, not committed yet |
| 7 | Results | Built and checked locally, not committed yet. CI level wording and the Lealtad Grupal text are open |
| 8 | Profiles and manuals | Built and checked locally, not committed yet |
| 9 | Norm profiles | Built and checked locally, not committed yet. A psychologist must sign off the notes |
| 10 | Examinee mode and links | Built and checked locally, not committed yet. Consent text, instructions and card colors need sign-off |
| 11 | Hardening and cutover | Not started |

Phases 2–3 don't depend on Phase 0 and can run alongside it, but real reports can't ship until Phase 0 is done.

## Decisions made

- **Scoring rules are public (2026-11-09):** the repo stays public, so the Color protocol, trait formulas and C.E. rules can be read in the code and the site. Norms, report texts, test items and the C.I. key stay in encrypted packs outside the repo.
- **Norms:** treat the Lüscher study as the general "Europe" reference. No French-specific norms.
- **Language:** everything in Spanish for now.
- **Restricted content:** a private encrypted content pack, never in the repo.
- **V1 scope:** operator parity **plus** an examinee mode, designed for personalized links later.
- **Data extraction:** done on Mac, with no Windows step needed. Examinee rows, including recovered deleted ones, were exported to a restricted folder and never go into a content pack or the new app's data.
- **Traits:** keyed by ID, not by name.
- **Content conflicts:** the database and program win over the documents.

## Target architecture

- **Stack:** Vite, React, strict TypeScript, React Router `HashRouter` (avoids 404s on deep links in GitHub Pages), Recharts, Dexie (IndexedDB), Zod, `react-hook-form`, Vitest, Playwright.
- **Repo:** a **new** repo, `~/Documents/GitHub/PLV`, separate from the legacy tree. Copy `docs/migration/` into it in Phase 1. Never run `git init` on the legacy tree: it holds 1.1 GB of binaries, personal data, hardcoded credentials (`_Dm.pas:516`, the HASP files) and a scanned book.
- **No backend.** GitHub Pages is static, so all storage is in the browser. Results exist only on that device until exported.
- **Printing:** print CSS plus `window.print()`, which also gives PDF.

```text
src/
  domain/    pure, framework-free: color/ ci/ ce/ norms/ (no React, no IndexedDB)
  content/   Zod schemas, pack loader, decryption
  data/      Dexie repositories, encrypted backup
  features/  examinees/ capture/ results/ profiles/ manuals/ exam/
  app/       routes, layout, Spanish strings
tools/       local scripts: pack builder, DB probes
```

**Content packs** are encrypted with AES-GCM and a PBKDF2-derived key via WebCrypto, and real ones are stored outside git:

| Pack | Contains | Who holds it |
|---|---|---|
| Operator | Answer keys, norms, report texts, profiles, manuals | Licensed operators (passphrase) |
| Examinee | Instructions and items only, **no keys, norms or report texts** | Delivered through invitations |
| Demo | Synthetic content, safe to commit | Public site and CI tests |

This keeps restricted content off the public site. It doesn't stop a passphrase holder from copying the content.

**Replacing legacy pieces:**

| Legacy | Replacement |
|---|---|
| HASP, PACSecure | Removed; the pack passphrase is the access gate |
| JPEG screens + `ExecuteTags` | Routes and components |
| TeeChart | Recharts |
| RichView, ReportBuilder | HTML + print CSS |
| DBISAM | IndexedDB + content packs |
| ZLB backups | Encrypted export/import file |

## Phases

### Phase 0: Data gate

Follow [DATA_EXTRACTION.md](DATA_EXTRACTION.md): dump required tables on the Mac, or apply the Windows and re-authoring fallbacks.

- [x] Every Tier 1 item has a validated JSON file or a recorded fallback decision

### Phase 1: Repo, scaffold and deploy

Create the repo with Vite/React/TS strict, ESLint, Vitest and a placeholder page. Node 22 is installed through asdf. Add `.gitignore` and the [workflow below](#workflow-file-githubworkflowsdeployyml), plus a CI check that rejects `*.DAT`, `*.BLB`, `*.exe`, `*.pdf`, pack files and the [other forbidden files](DATA_MODEL.md#phase-1). Set Pages source to **GitHub Actions**.

- [ ] A push to `main` deploys a working page
- [ ] The CI check fails on a forbidden file

### Phase 2: Color protocol engine

Port `BuscaExcepciones`, `TipoPar`, `BuscaPares`, `MarcaPares`, `SignosAdmir` and `Letras` from `UAlgoritColor.pas` as pure functions. Replace the globals (`Serie1`, `Serie2`, `Xs`, `N0`–`N7`). Pascal strings are 1-based, so use a tested position helper to avoid off-by-one errors.

- [x] Outputs match hand-worked book examples (PDF p. 30–38) and the `Protocolo` screenshot. The code wins where they differ: see the [Phase 2 notes](DATA_MODEL.md#phase-2)
- [x] No input throws across all 40,320 permutations, each paired with 4 partners
- [x] Outputs match the private [legacy oracle](DATA_MODEL.md#legacy-oracle-new-finding), or each mismatch is explained

### Phase 3: Trait scoring

Port in this order; splitting into 2 sessions is reasonable:

1. P4 Intra (`UAlgoritColorIntra`), Inter (`UAlgoritColorInter`) and the qualitative selector (`GrabaCualitativos`), returning text *codes*, not DB IDs
2. CE (`...W` units, `UAlgoritAutoDescW`)
3. CI (`UAlgoritCoefInt`, `CalifNivel` at `VerInformeG32.pas:291`)

Unify shared helpers.

- [x] Every rule branch that can be reached has a test. See the [Phase 3 notes](DATA_MODEL.md#phase-3) for the ones that can't
- [x] The [legacy quirks](#legacy-quirks) are handled as decided

### Phase 4: Content packs

Zod schemas, `tools/build-pack` CLI, encrypted loader, passphrase screen, demo pack. Follow the [content pack structure](DATA_MODEL.md#content-pack).

- [x] All [build pack checks](DATA_MODEL.md#build-pack-checks) pass
- [x] An automated grep finds no restricted strings in `dist/`. CI checks file types and demo packs, and the string search runs where the private folder is present
- [x] A wrong passphrase fails cleanly

### Phase 5: Local data

Dexie schema for examinees, sessions, answers and scores, following the [local database structure](DATA_MODEL.md#local-database). Search by name, cascading delete with confirmation, age calculation (fix the approximate `CalculaEdad`, `_Dm.pas:566`), encrypted backup and restore.

- [x] A backup restores identically in a fresh browser profile

### Phase 6: Operator capture

Examinee + session form, Color entry (`ValidaSerie` rules), CI grid with V/N/E totals, CE grid. Keep the Color → CI combined flow.

- [x] Playwright runs all three flows from new examinee to saved scores

### Phase 7: Results

History list, Informe P4 and CE, Protocolo, Gráfica (Mínimo/Máximo/Examen, flat rather than 3D), print layouts.

- [x] Output is reviewed side by side with `Graficos/_ScreenCaptureP4` and `_ScreenCaptureCE`. A psychologist still has to review real reports
- [x] Prints cleanly on Letter and A4

### Phase 8: Profiles and manuals

Job profile editor (min/max per trait, companies, positions, copy profile), blocked factory profiles (`BLOQUEADO`), manuals viewer.

- [x] A custom profile changes the chart ranges

### Phase 9: Norm profiles (LatAm and Europa)

A selectable `NormProfile` stored **with each session**, so old reports never change. Everything in Spanish.

```ts
interface NormProfile {
  id: 'latam' | 'europa-luscher';
  colorReference: Record<ColorDigit, number>; // first-choice %
  colorOrder: string;
  interpretiveNotes: NoteOverride[];          // e.g. Azul in 5th–6th place
  ciNorms: CiNormTable;
  ceNorms: 'latam';
  status: 'validated' | 'reference-only';
}
```

- **What Europa changes:** the Color reference panel (examinee's choice vs that table) and which book notes apply, such as removing the Mexico-only Azul and Violeta notes.
- **What it can't change:** CI and CE, which have no European data. They keep existing tables, and reports must say so, for example: *"Referencia europea para Colores; C.I. y C.E. con tablas LatAm."*
- Color scores stay the same under both profiles, since the rules don't read norms.
- A psychologist signs off on the note overrides. The full position data (Lüscher's book, p. 90–100, cited in the appendix) could enrich this if you obtain a copy.

Acceptance:

- [x] One session renders under both profiles with the correct label and unchanged scores

### Phase 10: Examinee mode and personalized links (2–3 sessions)

Works without a backend:

1. The operator creates an invitation, producing a link: `…/#/e/<signed token>`.
2. The token holds an invitation ID, assigned tests, expiry, the operator's public key and the examinee pack key. It holds **no names or personal data**. The fragment after `#` isn't sent to the server.
3. The examinee sees consent and instructions, then takes the tests on screen with resumable progress.
4. Answers are encrypted to the operator's public key, and the examinee sends back a file or code.
5. The operator imports it, and scoring runs only on the operator's side.

**Limits to state in the operator guide:**

- No automatic result return, no enforced single use, no real revocation: all of these need a backend later.
- Anyone with a link can see that pack's items.
- Losing the operator's private key loses pending results, so it must be included in backups.
- Screen colours vary by device, and the book stresses that incorrect administration invalidates results (PDF p. 26). So on-screen Color results carry an **"administración en pantalla"** label until validated against cards. Instructions must not ask for the "favorite" colour, the error the book criticizes.

**Open items for this phase:**

- Exact card colours: no values in the repo.
- CI time limit: not found in the docs.
- CI answer options and text alternatives: all 36 questions were recovered as scanned images, so options must be authored from them. See [DATA_MODEL.md](DATA_MODEL.md#phase-10).

Acceptance:

- [x] A link opened in a clean browser produces a file that imports and scores correctly
- [x] An automated check finds no answer keys or personal data in the token or bundle

### Phase 11: Hardening and cutover

Accessibility, Content-Security-Policy meta tag, dependency audit, operator guide, pilot with real cases by a psychologist, legal review. Keep the legacy app available until sign-off.

- [ ] Psychologist and legal sign-off recorded

## Workflow file: `.github/workflows/deploy.yml`

`npm run build` runs `tsc -b && vite build`. Use `base: './'` in `vite.config.ts`.

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test -- --run
      - run: npm run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

**Manual setup:** repo **Settings → Pages → Source: GitHub Actions**. Private repos need a paid plan for Pages, and the site itself is still public on standard plans.

## Risks and decisions

### Legacy quirks

Default: reproduce and test them so results match, then fix only with psychologist approval.

| Location | Quirk | Handling |
|---|---|---|
| `UAlgoritColor.pas:1186`, `UAlgoritColorIntra.pas:452`, `UAlgoritColorInter.pas:395` | Report text is picked **at random**. One range excludes the last option; another can read index 0 of a 1-based array | Done in `domain/text/select.ts`: seeded by session, and every option can be chosen |
| `UAlgoritColor.pas:738` | `N6` tested twice, so text `CD05` is unreachable (likely meant `N7`) | Fixed in the new version: the second test is `N7`, so `CD05` can appear. This is a deliberate difference from legacy |
| `UAlgoritColor.pas:504` | Default result is `1` rather than `-1` | Resolved: no text has ID 1, so it means no text, and the engine returns none |
| `UAlgoritColor.pas:1056` | `(1 > 0)`, commented as an escape from the criterion, makes `CG09` a catch-all | Done: an explicit fallback |
| `UAlgoritColorIntra.pas:63` | Autoestima forced to 55 for C.E. Global | Kept, confirmed as correct |
| `UAlgoritCoefInt.pas:194` | Under 18 returns an undefined result; missing norm rows too | Done: `CiValidationError` with a Spanish message |
| `VerInformeG32.pas:293` | Labels like "Deficiente Mental" are dated and stigmatizing, on a hiring report | The engine returns a level from 1 to 9. New labels will be provided later, for Phase 7 |
| Global state in all engines | Values persist between examinees | Done: pure functions. One case kept a stale value, 5 `=` signs, and it never appeared in 6 million sampled pairs |
| `UAlgoritColorIntraW.pas:229`, `:521`, `:547` | `ConLetras(2) = False and (...)`: in Pascal `and` binds tighter than `=`, so legacy ignores the listed conditions. With no letters, it gives Laboriosidad at least 75 and Afán de Triunfo 100 | Fixed for new sessions, which follow the conditions as written. **A deliberate difference from legacy. A psychologist should confirm the new results** |
| `UAlgoritColorIntraW.pas:428` | `A and (one sign) or (two signs)` skips `A` for `_-`, so any `_` on the 7 scores Sobre Esfuerzo 100 in legacy | Fixed for new sessions, which require every condition. **A deliberate difference from legacy** |
| `UAlgoritColorInterW.pas:120` | Reads `Serie[9]` when 5 or 4 is last, which is Delphi's `#0` terminator | Reproduced with `charOrEnd1` |

Found in Phase 6: with the real pack, `LEALTAD GRUPAL` (`ce:23`) has no text band at 90 and 100 in at least one profile. From the code, legacy shows an error there and doesn't save that score. The new app keeps the score with no text, so Phase 7 must show that case clearly. **A psychologist should say what those scores should show.**

### Other risks

- **Legacy oracle is partial:** the app can't run without a HASP key and Windows, but stored results give [175 color input pairs with legacy outputs](DATA_MODEL.md#legacy-oracle-new-finding), and score groups for Phase 3. The color protocol matches all 174 usable pairs. Scoring matches the newest stored rows, but those are few, and many older rows differ, probably because earlier builds wrote them: see the [Phase 3 notes](DATA_MODEL.md#phase-3). Accuracy still also rests on book examples, screenshots, branch tests and a psychologist's pilot.
- **Psychometric validity:** the book's correlations (+0.72 to +0.91, PDF p. 76) are the author's own. The Lüscher test isn't widely accepted as a selection tool, so reports should support, not decide, hiring.
- **Legal (have counsel confirm before real use):**
  - content licensing for the Lüscher material and CI items
  - consent and data protection for test results (Mexico's LFPDPPP, GDPR for anyone in Europe)
  - the EU AI Act, which restricts workplace emotion inference and treats recruitment tools as high-risk; this matters if the Europa profile means real use there

## Final end-to-end check

Deploy from `main`, load a pack, run all three operator flows and the examinee link flow, print each report, restore a backup, and confirm `dist/` holds no restricted content.
