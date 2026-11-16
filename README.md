# PsIV web

The React and TypeScript replacement for the legacy PsIV desktop app, deployed to GitHub Pages. The phases are in [docs/migration/MIGRATION_PLAN.md](docs/migration/MIGRATION_PLAN.md).

## Commands

Node 22 is pinned in `.tool-versions`. Non-interactive shells may need `/opt/homebrew/bin` and `~/.asdf/shims` on `PATH`.

```bash
npm ci
```

```bash
npm run dev
```

```bash
npm run lint
```

```bash
npm test -- --run
```

```bash
npm run build
```

```bash
npm run check:forbidden
```

```bash
npm run test:e2e
```

The browser tests need Chromium once, from `npx playwright install chromium`.

## Restricted content

Answer keys, norms, report texts, test items and examinee data never go in this repo, including its docs. `tools/check-forbidden.mjs` rejects forbidden file types and folders in CI, but it checks paths only, so it can't catch a restricted value pasted into a text file.

The copies of the migration docs here leave out a few exact values, such as one norm cell and the book's percentage table. The originals in the legacy tree still hold them.

## Local data

Examinees and results live only in the browser's IndexedDB until someone creates a backup. Backups hold personal data, so `.psivbackup` files must never be committed.

## Content packs

Real packs hold restricted content, so they're built and kept outside this repo, in `~/psiv-private/packs`. Keep a backup of the files and the passphrase, because a lost passphrase can't be recovered.

```bash
npm run build:pack
```

`npm run build:pack -- --check` runs every check and writes nothing. `npm run build:demo` rebuilds the synthetic demo pack in `public/demo`, the only pack that may be committed. `npm run check:dist` checks the built site. It also searches for restricted strings when the private folder is present, so run it on your machine before deploying, because CI can't do that part.

## Invitations

From an examinee's page, **Invitar por enlace** creates a link with no personal data in it. The examinee answers in their own browser and returns an encrypted file or code, which you import under **Invitaciones**. Scoring happens only there.

- Nothing returns automatically, a link can be reused, and it can't be revoked. Anyone holding a link can see the questions.
- The keys that open responses are only in this browser, so make a backup after creating invitations.
- Keep `~/psiv-private/examinee-pack.key` with your private backups.

## Private oracle

`node tools/build-oracle.mjs` writes stored legacy results to `~/psiv-private/oracle`, and `npm test` then compares the engine with them. The tests skip when that folder is missing, as they do in CI. These are real people's results, so they stay out of the repo.

## Legacy tools

`tools/dbisam-*.mjs` and `tools/rvf-to-html.mjs` read the private export in `~/psiv-private`. Some also read the legacy source tree, which they expect at `~/Desktop/PsIV` unless `PSIV_LEGACY_DIR` is set.

`dbisam-validate.mjs` and `dbisam-check.mjs` print restricted values to the console, so run them only on your own machine and never in CI.
