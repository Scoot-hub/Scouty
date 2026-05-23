/**
 * Integration tests — flux affiliation & crédits
 * Covers: format du code, calcul earned_total, quotas journaliers étendus
 *
 * Les tests serveur nécessitent l'API (npm run api).
 * Les tests purement logiques (format, calcul) s'exécutent sans serveur.
 */
import { describe, it, expect } from 'vitest';
import { isoToDisplay, displayToIso, formatDate, datePlaceholder } from '@/lib/format-utils';

// ── Format de code de parrainage ──────────────────────────────────────────────

describe('Format code de parrainage', () => {
  const VALID_CODES = ['SCOUTY-5B354D95', 'SCOUTY-AAAAAAAA', 'SCOUTY-12345678'];
  const INVALID_CODES = [
    '',
    'SCOUTY',
    'SCOUTY-',
    'SCOUTY-1234',          // trop court
    'SCOUTY-123456789',     // trop long
    'scouty-5b354d95',      // minuscules
    'REF-5B354D95',         // mauvais préfixe
    "' OR 1=1 --",          // injection SQL
  ];

  const isValidCode = (code: string) => /^SCOUTY-[0-9A-F]{8}$/.test(code);

  for (const code of VALID_CODES) {
    it(`accepte le code valide : ${code}`, () => {
      expect(isValidCode(code)).toBe(true);
    });
  }

  for (const code of INVALID_CODES) {
    it(`rejette le code invalide : "${code}"`, () => {
      expect(isValidCode(code)).toBe(false);
    });
  }
});

// ── Calcul des crédits effectifs ──────────────────────────────────────────────

describe('Calcul crédits effectifs (earned_total étend tous les quotas)', () => {
  function effectiveQuotas(base: { daily: number; weekly: number; monthly: number }, earnedTotal: number) {
    const earned = earnedTotal;
    return {
      daily:   base.daily   + earned,
      weekly:  base.weekly  + earned,
      monthly: base.monthly + earned,
    };
  }

  it('sans crédits gagnés — quotas inchangés', () => {
    const q = effectiveQuotas({ daily: 10, weekly: 50, monthly: 150 }, 0);
    expect(q).toEqual({ daily: 10, weekly: 50, monthly: 150 });
  });

  it('100 crédits affiliés → extension sur toutes les périodes', () => {
    const q = effectiveQuotas({ daily: 10, weekly: 50, monthly: 150 }, 100);
    expect(q.daily).toBe(110);
    expect(q.weekly).toBe(150);
    expect(q.monthly).toBe(250);
  });

  it('un utilisateur ayant consommé son quota journalier peut utiliser ses crédits gagnés', () => {
    const base = { daily: 10, weekly: 50, monthly: 150 };
    const earned = 100;
    const used = { daily: 10, weekly: 10, monthly: 10 };
    const eff = effectiveQuotas(base, earned);
    // Quotidien : 10 used sur 110 → encore de la capacité
    expect(used.daily).toBeLessThan(eff.daily);
  });
});

// ── Utilitaires de date ───────────────────────────────────────────────────────

describe('isoToDisplay — conversion ISO → format affiché', () => {
  const cases: [string, Parameters<typeof isoToDisplay>[1], string][] = [
    ['2000-01-15', 'DD/MM/YYYY', '15/01/2000'],
    ['2000-01-15', 'MM/DD/YYYY', '01/15/2000'],
    ['2000-01-15', 'YYYY-MM-DD', '2000-01-15'],
    ['',           'DD/MM/YYYY', ''],
    ['invalid',    'DD/MM/YYYY', 'invalid'],   // passthrough si non parseable
  ];

  for (const [input, fmt, expected] of cases) {
    it(`"${input}" en ${fmt} → "${expected}"`, () => {
      expect(isoToDisplay(input, fmt)).toBe(expected);
    });
  }
});

describe('displayToIso — parsing saisie utilisateur → ISO', () => {
  const valid: [string, Parameters<typeof displayToIso>[1], string][] = [
    ['15/01/2000', 'DD/MM/YYYY', '2000-01-15'],
    ['01/15/2000', 'MM/DD/YYYY', '2000-01-15'],
    ['2000-01-15', 'YYYY-MM-DD', '2000-01-15'],
    ['15-01-2000', 'DD/MM/YYYY', '2000-01-15'],  // séparateur tiret accepté
    ['2000-01-15', 'DD/MM/YYYY', '2000-01-15'],  // déjà ISO → passthrough
  ];

  for (const [input, fmt, expected] of valid) {
    it(`parse "${input}" (${fmt}) → ${expected}`, () => {
      expect(displayToIso(input, fmt)).toBe(expected);
    });
  }

  const invalid: [string, Parameters<typeof displayToIso>[1]][] = [
    ['',           'DD/MM/YYYY'],
    ['invalid',    'DD/MM/YYYY'],
    ['31/02/2023', 'DD/MM/YYYY'],  // 31 février
    ['01/13/2023', 'DD/MM/YYYY'],  // mois 13
    ['01/01/1800', 'DD/MM/YYYY'],  // année hors plage
    ['01/01/2200', 'DD/MM/YYYY'],  // année future hors plage
    ["' OR 1=1",   'DD/MM/YYYY'],  // injection SQL
  ];

  for (const [input, fmt] of invalid) {
    it(`rejette "${input}" (${fmt}) → null`, () => {
      expect(displayToIso(input, fmt)).toBeNull();
    });
  }
});

describe('datePlaceholder', () => {
  it('retourne jj/mm/aaaa pour DD/MM/YYYY', () => {
    expect(datePlaceholder('DD/MM/YYYY')).toBe('jj/mm/aaaa');
  });
  it('retourne mm/dd/yyyy pour MM/DD/YYYY', () => {
    expect(datePlaceholder('MM/DD/YYYY')).toBe('mm/dd/yyyy');
  });
  it('retourne yyyy-mm-dd pour YYYY-MM-DD', () => {
    expect(datePlaceholder('YYYY-MM-DD')).toBe('yyyy-mm-dd');
  });
});

describe('formatDate — affichage depuis ISO', () => {
  it('formate une date en DD/MM/YYYY', () => {
    expect(formatDate('2024-06-15', 'DD/MM/YYYY')).toBe('15/06/2024');
  });
  it('retourne "—" pour null', () => {
    expect(formatDate(null, 'DD/MM/YYYY')).toBe('—');
  });
  it('retourne "—" pour undefined', () => {
    expect(formatDate(undefined, 'DD/MM/YYYY')).toBe('—');
  });
});
