# PsIV data extraction guide

How to get the data the new app needs out of the legacy DBISAM database. Try the Mac route first, and use the [Windows fallback](#windows-fallback) only if it fails. This is Phase 0 of [MIGRATION_PLAN.md](MIGRATION_PLAN.md).

**Status: the Mac route worked (2026-11-06).** All 31 tables were exported on an Apple Silicon Mac, with no password, Windows or HASP key. Steps 1–6 are done, with the [content decisions](#content-decisions) applied, and step 7 waits for Phase 4. The Windows fallback remains untested and isn't needed for extraction.

To re-run the content export:

```bash
cd ~/Desktop/PsIV && node tools/dbisam-export.mjs && node tools/rvf-to-html.mjs && node tools/dbisam-corrections.mjs && node tools/dbisam-validate.mjs
```

Packs must read `xl`, `pscgrdt*`, `pscgrtxt*` and `trait-ids` from `~/psiv-private/export/corrected`.

To re-run the restricted export, which needs `~/psiv-private/Db-restricted`:

```bash
cd ~/Desktop/PsIV && node tools/dbisam-export.mjs --restricted
```

## Is this data needed?

Mostly yes. The scoring rules are in the code, but the texts, norms and job profiles that real tests and reports use are only in the database. The examinee records are not needed, and that risk has been accepted.

| Tier | Tables | Purpose | If it can't be decoded |
|---|---|---|---|
| **1: Required** | `txt`, `txtW` + `.BLB` | All report texts | Rebuild from legacy screenshots and the book's 7 sample reports, then have a psychologist author the rest. **Highest risk** |
| **1** | `pscgrtxt`, `pscgrtxtW` | Text per trait and score band | Re-author |
| **1** | `xl` | Conclusion for each Serie 2 ordering (1,010,431 bytes, about 25 bytes × 40,320 orderings; an inference to confirm) | Lose Conclusiones or re-author. No doc source found |
| **1** | `tstx`, `tstxW`, `tstxdt`, `tstxdtW`, `tstxdtr`, `tstxdtrW` + `.BLB` | CI key and norms; CE items and points | See [what the documents recover](#what-the-documents-recover) |
| **1** | `rgo`, `rgow` | Trait names and order | Rebuild from code + `GraficaSnagit.png` |
| **2: Useful** | `pscgr`, `pscgrdt`, `pscgrdtW`, `emp`, `pto` | Factory job profiles | Rebuild from screenshots, or use the editor |
| **2** | `txtm` + `.BLB` | P4 manuals | Omit at first |
| **Restricted** | `MDgr`, `MDgrL` | Screen art and click regions | Exported separately, not in packs |
| **Restricted** | `Sac`, `Sga`, `Sgr`, `Sua`, `Sur` | Probably security data for PACSecure (inferred from the names) | Exported separately, not in packs |
| **Restricted** | `prs`, `prstst`, `prststc`, `prststx`, `prsclf` | **Operator-entered examinee data** | Live and recovered deleted rows exported separately, never in packs. See [restricted tables](#restricted-tables) |

`Db/txtz.Dtf` and `Db/txtzW.Dtf` are readable text style settings, which help when converting report formatting.

## What's known about the files

- The engine is DBISAM 3.21 (`AGB_Layers_Ex/_Dm.dfm`).
- Every structure is XORed with one fixed 128-byte pattern, which restarts at 0 for each field descriptor, record and blob payload. The earlier repeating-XOR test failed because of those restarts. The session password wasn't needed.
- `.DAT` is a 127-byte header, 768 bytes per field, then fixed-size records. A first record byte of 1 marks a deleted row.
- `.BLB` is a 512-byte header, then linked blocks with an 18-byte header.
- Text blobs are RichView RVF, and the CI questions are 626×350 bitmaps inside RVF.
- `MDgr` and `MDgrL` are stored without the pattern, and the exporter detects this per table.
- The full layout is at the top of `tools/dbisam-export.mjs`. `.IDX` files weren't needed.

## What the documents recover

Conversion with `textutil` was tested on the three test documents:

| Document | Recovered | Not recovered |
|---|---|---|
| `Hoja de respuestas del C. I.doc` | Blank answer sheet (36 slots, no answers in the converted text) and the norm table for raw scores 12–30 | Embedded `PhotoFinish` objects |
| `Test Autodescriptivo.doc` | All 30 CE items | **CE points and factor mapping**, which weren't found in its text |
| `Preguntas del CI.doc` | Instructions and examples only | **The CI questions.** It contains `PhotoFinish` objects that conversion drops, so they may be there or in `tstxdt.BLB` |

The database decode now supplies the CI questions and key, the CE points and factor mapping, and norms for raw scores 0–36.

## Mac route

### 1. Set up a private workspace

Work outside any repo, and copy only an allowlist so person tables are never copied.

```bash
mkdir -p ~/psiv-private/Db ~/psiv-private/export
```

```bash
cd ~/Desktop/PsIV/Db && for t in txt txtW pscgrtxt pscgrtxtW xl tstx tstxW tstxdt tstxdtW tstxdtr tstxdtrW rgo rgow pscgr pscgrdt pscgrdtW emp pto txtm; do cp -n "$t".* ~/psiv-private/Db/; done
```

```bash
chmod -R a-w ~/psiv-private/Db
```

Install Node 22. Note these shell quirks on this Mac:

- `python3` and `strings` are Xcode stubs that trigger an install prompt.
- `grep` treats Latin-1 files as binary, so use `command grep -a`.
- Convert Latin-1 text with `iconv -f latin1 -t utf8`.

### 2. Secure the documents first

This guarantees part of Tier 1 today.

```bash
cd ~/Desktop/PsIV/docs && for f in "Hoja de respuestas del C. I" "Preguntas del CI" "Test Autodescriptivo"; do textutil -convert html -output ~/psiv-private/"$f".html "$f".doc; done
```

Turn the CI key, norm table and CE items into JSON. Then open the documents in Word or Pages to check the embedded objects, and capture the CI questions as images if they're there.

### 3. Decode spike (time-boxed to one session)

Write `tools/dbisam-probe.mjs` in Node:

- Use known plaintext: field names from `AGB_Layers_Ex/_Dm.dfm`, trait names from the code, and test names (`COEFICIENTE  INTELECTUAL 1`).
- Use `rgo.DAT` (4 KB) as the sample and compare it with `rgow.DAT`.
- Check whether the scheme depends on offset, record or password. The legacy session password is at `_Dm.pas:516`; never copy it into docs or the repo.
- Stop at the time box if there's no result, and go to the [Windows fallback](#windows-fallback).

### 4. Decode the blob format

`txt.BLB` may hold RichView or RTF. Identify the format, then convert to clean HTML, keeping bold and paragraphs.

### 5. Export

Write each table to `~/psiv-private/export/<table>.json` in UTF-8. Sources are Windows Latin-1, so check characters like `Á` and `ñ`.

### 6. Validate

- [x] CI has 36 items, and CE has 30 items
- [x] The 3 norm age bands have no gaps
- [x] `xl` has one row per permutation, with no duplicates, after decision 1
- [x] Every text code the engine uses exists: `CA00`, `CB01`–`CB09`, `CC00`–`CC33`, `CD00`–`CD31`, `CE01`–`CE03`, `CF00`, `CG01`–`CG10`, `CH01`–`CH14`, `CJ00`, `CK01`–`CK05`, `CL00`, plus each code `xl` refers to. Variants carry a letter suffix, such as `CC01A`
- [x] All traits named in `GetRasgo` calls map to an ID, after decision 2
- [ ] 10 texts spot-checked against screenshots: deferred by decision 8. 8 texts match `aStream.rtf` verbatim

### Content decisions

The raw export keeps legacy values, and `tools/dbisam-corrections.mjs` applies these to `export/corrected`.

1. **`xl`:** the one truncated `SERIE`, in row `ID_CRITERI` 1, is restored to a full permutation, keeping its conclusion code.
2. **Traits:** the new app keys traits by ID, using `corrected/trait-ids.json`. This avoids the `PERCEPCIÒN` / `PERCEPCIÓN SALUD` spelling difference.
3. **Norms:** the database wins. The one difference is the over-45s band at raw score 30.
4. **CE wording:** the program wins over `Test Autodescriptivo.doc`. 12 of 120 stems and options differ.
5. **Empty texts:** the 4 empty texts stay empty (`ID_TEXTO` 336 and 117 `CEG`, 115 `CIRA`, 116 `CIRE`).
6. **Orphaned profile rows:** ignored. This removes 18 `pscgrdt` rows (profile 113) and 30 `pscgrdtW` rows (profiles 0 and 90), plus their 174 and 105 `pscgrtxt` and `pscgrtxtW` rows.
7. **CI key:** compared with all 36 images, and nothing contradicts it. See the results below.
8. **Spot check:** comparison with screenshots and the book is deferred, as the focus for now is the code.
9. **Deleted-row counter:** accepted. The header counter isn't used.

CI key results from reading the images. This is a reasonableness check, not an expert review:

| Result | Questions (count) |
|---|---|
| Number series, confirmed by arithmetic | 12 |
| Verbal, clear | 9 |
| Figures, clear | 8 |
| Verbal, defensible but debatable | 3 |
| Figures, couldn't confirm independently | 4 |

The question images also contain spelling errors from the original scans, for example in Q26 and Q11.

### Restricted tables

`~/psiv-private/export-restricted` holds the 12 tables outside the content set. Never add them to a pack, a repo or synced storage.

- **Live examinee data:** the top-level files hold 1 person, 10 tests, 2 color results, 33 scores and 66 CI/CE answers. 4 of the 10 live tests point to a person with no row.
- **Recovered deleted rows:** `deleted/<table>.json` holds 379 person, 150 test, 489 color, 28,713 answer and 17,145 score rows. Originals in `Db/` and `Db-restricted/` still contain them. `tools/dbisam-check-deleted.mjs` reports counts only.
- **Treat recovered rows as a partial archive, not a clean history:**
  - The 380 person rows hold 224 distinct name and birth date combinations and 123 distinct names, so the rows aren't one per person.
  - 118 of 262 person IDs are shared by more than one identity. No test row uses one of those IDs: 151 of 160 tests link to one identity, and 9 link to no person.
  - Most results have lost their test row: 81 of 491 color rows, 4,687 of 28,779 answer rows and 4,326 of 17,178 score rows still link to one. So most results can't be tied to a person or age.
  - Results still group together by test ID in the expected sizes, such as 14, 15, 4 and 18 scores. That makes them useful for testing the new engines. See the [legacy oracle](DATA_MODEL.md#legacy-oracle-new-finding).
  - 47 recovered persons have digits in the name, possibly test entries, and 9 have birth years outside 1900–2007.
- **`Sur`** has a `User_Password` field, which is empty in its one live row.
- **`MDgr`, `MDgrL`:** 71 images in `blobs/MDgr` and 314 layer rows.

### 7. Build the pack

`tools/build-pack` (Phase 4) produces encrypted packs, stored outside git and backed up.

### 8. Record the outcome

Fill in the table at the end of this file.

## Windows fallback

Use this only if the Mac route fails. The goal is the same set of files, so steps 5–8 above stay the same. Any Windows PC or VM works for routes A and B. None of this has been tested yet, and the availability of the DBISAM tools needs confirming.

**Rules for every route**

- Work on a **copy** of `Db/`, never the original. The legacy code can call `RepairTable` when opening a table (`_Dm.pas:432`), and older tools may alter files.
- Copy only the Tier 1–2 allowlist, so examinee tables never reach the machine.
- Type the session password (`_Dm.pas:516`) locally when prompted. Never save it in scripts, docs or the repo.
- Don't patch or bypass the HASP check. Route C needs the real key.
- When finished, move the exports to `~/psiv-private/` on an encrypted drive, then delete the working copy and exports from Windows.

**Route order:** A → B → C → re-author. Record which route produced each table.

### Route A: DBISAM utility (try first)

1. Get the database system utility for DBISAM 3.x (`DBSYS`) from Elevate Software, the vendor, or an existing licence.
2. Check that it can read engine 3.21 files.
3. Open each allowlisted table with the password and export it to CSV.
4. Save blob fields separately, because CSV may not carry them.

### Route B: small Delphi exporter (most control)

This requires a Delphi version compatible with DBISAM 3.21 (check `AGB_Layers_Ex/ImgView_Layers_Ex.dof`) and the DBISAM 3.21 components. They aren't in the repo, so they must come from a licence.

Build a one-form tool that:

1. Creates a `TDBISAMSession`, calls `AddPassword` with the value entered at runtime, and points a `TDBISAMDatabase` at the copied folder.
2. Opens each table in a **hardcoded allowlist** with `ReadOnly := True`.
3. Writes every field of each record to a Latin-1 CSV, and saves each blob with `TBlobField.SaveToFile` as `<table>/<primary key>.<field>.bin`.
4. Prints record counts per table.

Then convert to UTF-8 JSON on the Mac with `tools/`.

### Route C: legacy apps with the real HASP key (slow)

Only if you still have the key.

1. Plug it into a Windows machine with the HASP driver installed. A VM on an Apple Silicon Mac is unlikely to work because the driver may not support it.
2. Run `ImgView_Layers_Ex.exe` or the `Polimpact.exe` authoring tool from a copied folder that includes its `Db/`.
3. Copy texts from their screens or print to PDF.

Expect manual work and an incomplete `xl`.

### Last resort: re-author

Re-author the texts with a psychologist, using the book and screenshots. Record this as a content change, because reports won't match legacy wording.

## Outcome log

| Table | Result (decoded / docs / Windows route / re-authored) | Validated | Notes |
|---|---|---|---|
| `txt`, `txtW` | Decoded | Yes | 504 + 112 texts. All codes present, 8 verbatim report matches, screenshots deferred |
| `pscgrtxt`, `pscgrtxtW` | Decoded, corrected | Yes | 867 + 522 rows after decision 6 |
| `xl` | Decoded, corrected | Yes | 40,320 valid permutations after decision 1 |
| `tstx*`, `tstxdt*`, `tstxdtr*` | Decoded | Yes | 36 CI images and key, 30 CE items with points, 3 norm bands. Decisions 3, 4 and 7 |
| `rgo`, `rgow` | Decoded | Yes | 28 + 15 traits, mapped by ID |
| `pscgr`, `pscgrdt`, `pscgrdtW`, `emp`, `pto` | Decoded, corrected | Yes | 5 profiles, 90 + 75 rows after decision 6 |
| `txtm` | Decoded | Parse only | 8 manuals and 13 images, content not reviewed |
| `MDgr`, `MDgrL` | Decoded, restricted | Parse only | 71 images, 314 layers |
| `Sac`, `Sga`, `Sgr`, `Sua`, `Sur` | Decoded, restricted | Parse only | Not used by the new app |
| `prs`, `prstst`, `prststc`, `prststx`, `prsclf` | Decoded, restricted | Counts only | Live rows and recovered deleted rows, values not inspected. Links are unreliable |
