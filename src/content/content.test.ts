import { describe, expect, it } from 'vitest';
import { checkExamineePack, checkManualsPack, checkOperatorPack, htmlProblems } from './checks';
import { PackError, decryptPack, encryptPack } from './crypto';
import { demoExamineePack, demoManualsPack, demoOperatorPack } from './demo-content';
import { openExamineePack, openOperatorPack, variantsByBaseCode } from './loader';
import { examineePackSchema, operatorPackSchema } from './schemas';

// A low count keeps these tests fast. Real packs use DEFAULT_ITERATIONS.
const FAST = 1000;
const codeOf = async (action: Promise<unknown>): Promise<string> => {
  try {
    await action;
    return 'no error';
  } catch (error) {
    return error instanceof PackError ? error.code : 'other error';
  }
};

describe('encryption', () => {
  it('round-trips a value', async () => {
    const file = await encryptPack({ hello: 'mundo', n: [1, 2, 3] }, 'una frase', FAST);
    await expect(decryptPack(file, 'una frase', FAST)).resolves.toEqual({ hello: 'mundo', n: [1, 2, 3] });
  });

  it('fails cleanly with a wrong passphrase', async () => {
    const file = await encryptPack({ a: 1 }, 'correcta', FAST);
    expect(await codeOf(decryptPack(file, 'incorrecta', FAST))).toBe('wrong-passphrase');
  });

  it('fails cleanly with an empty passphrase', async () => {
    const file = await encryptPack({ a: 1 }, 'correcta', FAST);
    expect(await codeOf(decryptPack(file, '', FAST))).toBe('wrong-passphrase');
  });

  it('detects a changed ciphertext', async () => {
    const file = await encryptPack({ a: 1 }, 'frase', FAST);
    file[file.length - 1] = (file[file.length - 1] ?? 0) ^ 1;
    expect(await codeOf(decryptPack(file, 'frase', FAST))).toBe('wrong-passphrase');
  });

  it('detects a changed header, which is authenticated', async () => {
    const file = await encryptPack({ a: 1 }, 'frase', FAST);
    // The cipher label isn't used to decrypt, so only the authentication can notice this change.
    const at = new TextDecoder('latin1').decode(file).indexOf('AES-256-GCM');
    expect(at).toBeGreaterThan(0);
    file[at] = 'X'.charCodeAt(0);
    expect(await codeOf(decryptPack(file, 'frase', FAST))).toBe('wrong-passphrase');
  });

  it.each([
    ['empty', new Uint8Array(0)],
    ['not a pack', new TextEncoder().encode('esto no es un paquete de contenido')],
    ['magic only', new TextEncoder().encode('PSIVPACK')],
  ])('rejects a file that is %s', async (_name, bytes) => {
    expect(await codeOf(decryptPack(new Uint8Array(bytes), 'frase', FAST))).toBe('invalid-file');
  });

  it('rejects a file with too few iterations', async () => {
    const file = await encryptPack({ a: 1 }, 'frase', FAST);
    expect(await codeOf(decryptPack(file, 'frase'))).toBe('invalid-file');
  });

  it('uses a new salt and IV for each file', async () => {
    const a = await encryptPack({ a: 1 }, 'frase', FAST);
    const b = await encryptPack({ a: 1 }, 'frase', FAST);
    expect(a).not.toEqual(b);
  });

  it('does not store the content or passphrase in clear', async () => {
    const file = await encryptPack({ secreto: 'contenido-visible' }, 'frase-visible', FAST);
    const text = new TextDecoder('latin1').decode(file);
    expect(text).not.toContain('contenido-visible');
    expect(text).not.toContain('frase-visible');
  });
});

describe('demo pack', () => {
  it('passes the schemas and every build check', () => {
    expect(operatorPackSchema.safeParse(demoOperatorPack()).success).toBe(true);
    expect(checkOperatorPack(demoOperatorPack())).toEqual([]);
    expect(checkManualsPack(demoManualsPack())).toEqual([]);
    expect(checkExamineePack(demoExamineePack(), demoOperatorPack())).toEqual([]);
  });

  it('opens through the loader', async () => {
    const file = await encryptPack(demoOperatorPack(), 'demo', FAST);
    const pack = await openOperatorPack(file, 'demo', FAST);
    expect(pack.contentVersion).toBe('demo-1');
  });

  it('gives every selector code at least one variant', () => {
    const variants = variantsByBaseCode(demoOperatorPack());
    expect(variants.CC01).toHaveLength(2);
    expect(variants.CM01).toHaveLength(2);
  });
});

describe('loader validation', () => {
  it('rejects a valid file holding the wrong kind of pack', async () => {
    const file = await encryptPack(demoExamineePack(), 'demo', FAST);
    expect(await codeOf(openOperatorPack(file, 'demo', FAST))).toBe('invalid-content');
  });

  it('rejects an examinee pack with a key added', async () => {
    const leaked = { ...demoExamineePack(), key: demoOperatorPack().ci.key };
    expect(examineePackSchema.safeParse(leaked).success).toBe(false);
    const file = await encryptPack(leaked, 'demo', FAST);
    expect(await codeOf(openExamineePack(file, 'demo', FAST))).toBe('invalid-content');
  });

  it('rejects an examinee item with a factor added', () => {
    const pack = demoExamineePack();
    const items = pack.ci.items.map((item) => ({ ...item, factor: 'verbal' }));
    expect(examineePackSchema.safeParse({ ...pack, ci: { items } }).success).toBe(false);
  });

  it('keeps only the first row of a repeated full code, as legacy Locate does', () => {
    const pack = demoOperatorPack();
    const first = pack.texts.find((t) => t.code === 'CC01A');
    if (!first) throw new Error('missing fixture');
    const repeated = { ...pack, texts: [...pack.texts, { ...first, id: 'p4:99999' }] };
    expect(variantsByBaseCode(repeated).CC01).not.toContain('p4:99999');
  });
});

describe('build checks catch problems', () => {
  const problemsAfter = (change: (pack: ReturnType<typeof demoOperatorPack>) => void, allowed?: Set<string>): string[] => {
    const pack = demoOperatorPack();
    change(pack);
    return checkOperatorPack(pack, allowed);
  };

  it('finds a missing CI item', () => {
    expect(problemsAfter((p) => void p.ci.items.pop())).not.toEqual([]);
  });

  it('finds a missing CE item', () => {
    expect(problemsAfter((p) => void p.ce.items.pop())).not.toEqual([]);
  });

  it('finds a CE item without three options', () => {
    expect(problemsAfter((p) => void p.ce.items[0]?.options.pop())).not.toEqual([]);
  });

  it('finds a gap in the norms', () => {
    expect(problemsAfter((p) => void p.ci.norms.table['18-30']?.pop())).not.toEqual([]);
  });

  it('finds a CI factor without 12 items', () => {
    expect(problemsAfter((p) => {
      const key = p.ci.key[0];
      if (key) key.factor = key.factor === 'verbal' ? 'numeric' : 'verbal';
    })).toContain('CI factor numeric has 13 items, expected 12');
  });

  it('finds a conclusions exception that is not a permutation', () => {
    expect(problemsAfter((p) => void (p.conclusions.exceptions['00000000'] = 'CM01'))).not.toEqual([]);
  });

  it('finds a conclusion code with no text', () => {
    expect(problemsAfter((p) => void (p.conclusions.defaultCode = 'CM99'))).not.toEqual([]);
  });

  it('finds a base code with no text', () => {
    expect(problemsAfter((p) => void (p.texts = p.texts.filter((t) => t.baseCode !== 'CB05')))).toContain('Base code CB05 has no text with a variant');
  });

  it('finds a reference to a missing text', () => {
    expect(problemsAfter((p) => void p.traitTextTables[0]?.bands[0]?.textIds.push('p4:99999'))).not.toEqual([]);
  });

  it('finds a profile with a missing range', () => {
    expect(problemsAfter((p) => {
      const profile = p.profiles[0];
      if (profile) delete profile.ranges['p4:13'];
    })).not.toEqual([]);
  });

  it('finds an unexpected empty text, and accepts one that is allowed and used', () => {
    const emptyUsed = (p: ReturnType<typeof demoOperatorPack>): string => {
      const id = p.traitTextTables[0]?.bands[0]?.textIds[0] ?? '';
      const text = p.texts.find((t) => t.id === id);
      if (text) text.html = '<p></p>';
      return id;
    };
    expect(problemsAfter((p) => void emptyUsed(p))).not.toEqual([]);
    const pack = demoOperatorPack();
    expect(checkOperatorPack(pack, new Set([emptyUsed(pack)]))).toEqual([]);
  });

  it('finds a missing image', () => {
    expect(problemsAfter((p) => void (p.assets = {}))).not.toEqual([]);
  });

  it('finds a scoring field in the examinee pack', () => {
    const leaked = { ...demoExamineePack(), points: 1 } as never;
    expect(checkExamineePack(leaked)).toContain('Examinee pack has a field named points');
  });

  it('finds a report text in the examinee pack', () => {
    const operator = demoOperatorPack();
    const text = operator.texts[0];
    if (!text) throw new Error('missing fixture');
    text.html = '<p>Este es un texto de informe bastante largo para la prueba.</p>';
    const pack = { ...demoExamineePack(), consent: 'Este es un texto de informe bastante largo para la prueba.' };
    expect(checkExamineePack(pack, operator)).toContain('Examinee pack contains a report text');
  });
});

describe('htmlProblems', () => {
  it.each(['<p>Hola</p>', '<p style="text-align:center"><strong>Hola</strong> <em>a</em> <u>b</u></p>', '<img src="images/a-1.png" alt="">'])('accepts %s', (html) => {
    expect(htmlProblems(html)).toEqual([]);
  });

  it.each([
    '<script>alert(1)</script>',
    '<a href="https://example.com">x</a>',
    '<p onclick="x()">x</p>',
    '<p style="color:red">x</p>',
    '<img src="https://example.com/a.png">',
    '<img src="images/a.bmp">',
  ])('rejects %s', (html) => {
    expect(htmlProblems(html)).not.toEqual([]);
  });
});
