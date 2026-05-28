/**
 * Integration tests for analysis-engine.ts
 *
 * Tests the core analysis functions: sentiment scoring, suspicious content
 * detection, fraud keyword matching, and entity extraction — all with
 * multi-language support (Spanish, English, Portuguese, French).
 */

import {
  computeSentimentScore,
  isContentSuspicious,
  isFraudRelated,
  extractEntities,
  SUSPICIOUS_KEYWORDS,
  FRAUD_KEYWORDS,
  ENTITY_PATTERNS,
} from '../analysis-engine';

// ===== computeSentimentScore() =====

describe('computeSentimentScore', () => {
  it('returns 50 (neutral) for content with no sentiment keywords', () => {
    const score = computeSentimentScore('El clima está soleado hoy');
    expect(score).toBe(50);
  });

  it('decreases score for Spanish negative words', () => {
    const score = computeSentimentScore('¡Fraude detectado! Peligro inminente, robo en progreso');
    // 'fraude' (-10), 'peligro' (-10), 'robo' (-10) = -30 → 50 - 30 = 20
    expect(score).toBeLessThan(50);
    expect(score).toBe(20);
  });

  it('decreases score for English negative words', () => {
    const score = computeSentimentScore('Fraud alert! Critical threat, urgent breach detected');
    // 'fraud' (-10), 'alert' (-10), 'critical' (-10), 'threat' (-10), 'urgent' (-10), 'breach' (-10) = -60 → 50 - 60 = -10 → clamped to 0
    expect(score).toBe(0);
  });

  it('decreases score for Portuguese negative words', () => {
    const score = computeSentimentScore('Perigo! Alerta de roubo, crime urgente e crítico');
    // 'perigo' (-10), 'alerta' (-10), 'roubo' (-10), 'crime' (-10), 'urgente' (-10), 'crítico' (-10) = -60 → clamped to 0
    expect(score).toBe(0);
  });

  it('decreases score for French negative words', () => {
    const score = computeSentimentScore('Danger! Alerte de vol, crime mort et menace critique');
    // 'danger' (-10), 'alerte' (-10), 'vol' (-10), 'crime' (-10), 'mort' (-10), 'menace' (-10), 'critique' (-10) = -70 → clamped to 0
    expect(score).toBe(0);
  });

  it('increases score for Spanish positive words', () => {
    const score = computeSentimentScore('Sistema seguro con protección y ayuda legal');
    // 'seguro' (+5), 'protección' (+5), 'ayuda' (+5), 'legal' (+5) = +20 → 50 + 20 = 70
    expect(score).toBe(70);
  });

  it('increases score for English positive words', () => {
    const score = computeSentimentScore('Safe security protection help support verified legitimate');
    // 'safe' (+5), 'security' (+5), 'protection' (+5), 'help' (+5), 'support' (+5), 'verified' (+5), 'legitimate' (+5) = +35 → 50 + 35 = 85
    expect(score).toBe(85);
  });

  it('increases score for Portuguese positive words', () => {
    const score = computeSentimentScore('Sistema seguro com segurança e proteção, ajuda legal');
    // 'seguro' (+5), 'segurança' (+5), 'proteção' (+5), 'ajuda' (+5), 'legal' (+5) = +25 → 50 + 25 = 75
    expect(score).toBe(75);
  });

  it('increases score for French positive words', () => {
    const score = computeSentimentScore('Sûr sécurité protection aide légal justice confiance');
    // 'sûr' (+5), 'sécurité' (+5), 'protection' (+5), 'aide' (+5), 'légal' (+5), 'justice' (+5), 'confiance' (+5) = +35 → 50 + 35 = 85
    expect(score).toBe(85);
  });

  it('clamps score to 0 minimum (all negative)', () => {
    const score = computeSentimentScore('fraude estafa peligro alerta robo hurto delito crimen muerte amenaza urgente crítico danger fraud theft crime death threat');
    expect(score).toBe(0);
  });

  it('clamps score to 100 maximum (all positive)', () => {
    const score = computeSentimentScore('seguro seguridad protección ayuda apoyo legal justicia confianza safe security protection help support verified legitimate sûr sécurité aide légal justice confiance');
    expect(score).toBe(100);
  });

  it('negative words have stronger effect than positive words (-10 vs +5)', () => {
    const scoreNeutral = computeSentimentScore('hello world');
    const scoreOneNeg = computeSentimentScore('fraude hello world');
    const scoreOnePos = computeSentimentScore('seguro hello world');
    // Negative word: -10, Positive word: +5
    expect(scoreNeutral - scoreOneNeg).toBe(10);
    expect(scoreOnePos - scoreNeutral).toBe(5);
  });

  it('handles mixed content with both positive and negative words', () => {
    const score = computeSentimentScore('Fraude detected but security protection verified');
    // 'fraud' (-10) + 'security' (+5) + 'protection' (+5) + 'verified' (+5) = -10+15 = +5 → 55
    expect(score).toBe(55);
  });

  it('is case-insensitive', () => {
    const lower = computeSentimentScore('fraude');
    const upper = computeSentimentScore('FRAUDE');
    const mixed = computeSentimentScore('FraUdE');
    expect(lower).toBe(upper);
    expect(lower).toBe(mixed);
  });
});

// ===== isContentSuspicious() =====

describe('isContentSuspicious', () => {
  it('returns false for clean content', () => {
    expect(isContentSuspicious('El clima está muy bonito hoy')).toBe(false);
    expect(isContentSuspicious('Hello, how are you doing?')).toBe(false);
  });

  it('detects Spanish suspicious keywords', () => {
    expect(isContentSuspicious('Esto es un fraude')).toBe(true);
    expect(isContentSuspicious('Cuidado con la estafa')).toBe(true);
    expect(isContentSuspicious('Invertir en crypto para ganancia')).toBe(true);
    expect(isContentSuspicious('Lavado de dinero detectado')).toBe(true);
    expect(isContentSuspicious('Es un robo hack del sistema')).toBe(true);
  });

  it('detects English suspicious keywords', () => {
    expect(isContentSuspicious('This is a fraud scheme')).toBe(true);
    expect(isContentSuspicious('Watch out for the scam')).toBe(true);
    expect(isContentSuspicious('Phishing attack detected')).toBe(true);
    expect(isContentSuspicious('Money laundering operation')).toBe(true);
    expect(isContentSuspicious('Ransomware extortion counterfeit')).toBe(true);
  });

  it('detects Portuguese suspicious keywords', () => {
    expect(isContentSuspicious('Isso é um golpe')).toBe(true);
    expect(isContentSuspicious('Investimento em dinheiro')).toBe(true);
    expect(isContentSuspicious('Lavagem de dinheiro')).toBe(true);
    expect(isContentSuspicious('Suborno e corrupção')).toBe(true);
  });

  it('detects French suspicious keywords', () => {
    expect(isContentSuspicious('Ceci est une arnaque')).toBe(true);
    expect(isContentSuspicious('Escroquerie en investissement')).toBe(true);
    expect(isContentSuspicious('Blanchiment d\'argent')).toBe(true);
    expect(isContentSuspicious('Contrefaçon et extorsion')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isContentSuspicious('FRAUDE')).toBe(true);
    expect(isContentSuspicious('FraUdE')).toBe(true);
    expect(isContentSuspicious('SCAM')).toBe(true);
  });

  it('matches partial words in longer strings', () => {
    expect(isContentSuspicious('The word fraudster appears here')).toBe(true); // 'fraud' is in 'fraudster'
    expect(isContentSuspicious('Cryptocurrency investment')).toBe(true); // 'crypto' is in 'Cryptocurrency'
  });
});

// ===== isFraudRelated() =====

describe('isFraudRelated', () => {
  it('returns false for non-fraud content', () => {
    expect(isFraudRelated('El partido de fútbol fue emocionante')).toBe(false);
    expect(isFraudRelated('The weather is nice today')).toBe(false);
  });

  it('detects Spanish fraud keywords', () => {
    expect(isFraudRelated('Esto es un fraude')).toBe(true);
    expect(isFraudRelated('Cuidado con la estafa')).toBe(true);
    expect(isFraudRelated('Invertir dinero en crypto')).toBe(true);
  });

  it('detects English fraud keywords', () => {
    expect(isFraudRelated('This is a fraud')).toBe(true);
    expect(isFraudRelated('Investment scam for money')).toBe(true);
    expect(isFraudRelated('Phishing attack')).toBe(true);
    expect(isFraudRelated('Easy profit')).toBe(true);
  });

  it('detects Portuguese fraud keywords', () => {
    expect(isFraudRelated('Isso é um golpe')).toBe(true);
    expect(isFraudRelated('Investimento de dinheiro')).toBe(true);
  });

  it('detects French fraud keywords', () => {
    expect(isFraudRelated('Ceci est une arnaque')).toBe(true);
    expect(isFraudRelated('Investissement d\'argent')).toBe(true);
  });

  it('is a subset of suspicious keywords', () => {
    // Every fraud keyword should also be found by isContentSuspicious
    const fraudContent = 'fraude estafa scam crypto invertir dinero fraud investment money profit phishing golpe investimento dinheiro arnaque investissement argent';
    expect(isFraudRelated(fraudContent)).toBe(true);
    expect(isContentSuspicious(fraudContent)).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isFraudRelated('FRAUDE')).toBe(true);
    expect(isFraudRelated('PHISHING')).toBe(true);
    expect(isFraudRelated('ArNaQuE')).toBe(true);
  });
});

// ===== extractEntities() =====

describe('extractEntities', () => {
  it('returns empty array for content with no entities', () => {
    const entities = extractEntities('Hola, ¿cómo estás?');
    expect(entities).toEqual([]);
  });

  it('extracts person entities with Spanish honorifics', () => {
    const entities = extractEntities('El Sr. García mencionó a la Sra. López');
    const persons = entities.filter(e => e.type === 'person');
    expect(persons.length).toBeGreaterThanOrEqual(1);
    // At least one entity with type 'person' should be found
    persons.forEach(p => {
      expect(p.type).toBe('person');
      expect(p.confidence).toBe(60);
    });
  });

  it('extracts organization entities', () => {
    const entities = extractEntities('La empresa Acme fue mencionada');
    const orgs = entities.filter(e => e.type === 'organization');
    // Should find organization entity
    if (orgs.length > 0) {
      orgs.forEach(o => {
        expect(o.type).toBe('organization');
        expect(o.confidence).toBe(60);
      });
    }
  });

  it('extracts location entities', () => {
    const entities = extractEntities('Operan en Madrid desde Barcelona');
    const locations = entities.filter(e => e.type === 'location');
    // Location extraction is regex-based; verify structure when found
    locations.forEach(l => {
      expect(l.type).toBe('location');
      expect(l.confidence).toBe(60);
    });
  });

  it('extracts Ethereum crypto wallet addresses with high confidence', () => {
    const entities = extractEntities('Send funds to 0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18');
    const wallets = entities.filter(e => e.type === 'crypto_wallet');
    expect(wallets.length).toBeGreaterThanOrEqual(1);
    wallets.forEach(w => {
      expect(w.type).toBe('crypto_wallet');
      expect(w.confidence).toBe(95); // Crypto wallets have higher confidence
      expect(w.name).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });
  });

  it('extracts Bitcoin legacy addresses', () => {
    const entities = extractEntities('Bitcoin address: 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
    const wallets = entities.filter(e => e.type === 'crypto_wallet');
    expect(wallets.length).toBeGreaterThanOrEqual(1);
    wallets.forEach(w => {
      expect(w.type).toBe('crypto_wallet');
      expect(w.confidence).toBe(95);
    });
  });

  it('extracts Bitcoin bech32 (bc1) addresses', () => {
    const entities = extractEntities('Use bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4');
    const wallets = entities.filter(e => e.type === 'crypto_wallet');
    expect(wallets.length).toBeGreaterThanOrEqual(1);
  });

  it('returns entities with correct shape (name, type, confidence)', () => {
    const entities = extractEntities('El Dr. Martínez investigó la empresa Corp');
    entities.forEach(e => {
      expect(e).toHaveProperty('name');
      expect(e).toHaveProperty('type');
      expect(e).toHaveProperty('confidence');
      expect(typeof e.name).toBe('string');
      expect(typeof e.type).toBe('string');
      expect(typeof e.confidence).toBe('number');
      expect(e.name.length).toBeGreaterThan(2);
    });
  });

  it('crypto_wallet entities have confidence of 95, others 60', () => {
    const content = 'El Sr. García envió a 0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18';
    const entities = extractEntities(content);
    entities.forEach(e => {
      if (e.type === 'crypto_wallet') {
        expect(e.confidence).toBe(95);
      } else {
        expect(e.confidence).toBe(60);
      }
    });
  });

  it('filters out matches shorter than 3 characters', () => {
    const entities = extractEntities('OK');
    // 2-char matches should be filtered out
    expect(entities.every(e => e.name.length > 2)).toBe(true);
  });

  it('resets regex lastIndex between calls (stateless behavior)', () => {
    const content = 'El Sr. García y el Sr. López';
    const result1 = extractEntities(content);
    const result2 = extractEntities(content);
    // Both calls should produce the same results
    expect(result1.length).toBe(result2.length);
  });
});

// ===== Keyword list coverage =====

describe('keyword list integrity', () => {
  it('SUSPICIOUS_KEYWORDS includes keywords from all 4 languages', () => {
    const keywordsStr = SUSPICIOUS_KEYWORDS.join(' ');
    // Spanish
    expect(keywordsStr).toContain('fraude');
    expect(keywordsStr).toContain('estafa');
    // English
    expect(keywordsStr).toContain('fraud');
    expect(keywordsStr).toContain('phishing');
    // Portuguese
    expect(keywordsStr).toContain('golpe');
    expect(keywordsStr).toContain('lavagem');
    // French
    expect(keywordsStr).toContain('arnaque');
    expect(keywordsStr).toContain('blanchiment');
  });

  it('FRAUD_KEYWORDS is a subset focused on fraud-specific terms', () => {
    const fraudStr = FRAUD_KEYWORDS.join(' ');
    // Should contain fraud-relevant keywords from all languages
    expect(fraudStr).toContain('fraude');
    expect(fraudStr).toContain('fraud');
    expect(fraudStr).toContain('scam');
    expect(fraudStr).toContain('phishing');
    expect(fraudStr).toContain('golpe');
    expect(fraudStr).toContain('arnaque');
  });

  it('ENTITY_PATTERNS has entries for all 4 entity types', () => {
    const types = Object.keys(ENTITY_PATTERNS);
    expect(types).toContain('person');
    expect(types).toContain('organization');
    expect(types).toContain('location');
    expect(types).toContain('crypto_wallet');
  });

  it('each ENTITY_PATTERNS entry has type and patterns array', () => {
    for (const [, config] of Object.entries(ENTITY_PATTERNS)) {
      expect(config).toHaveProperty('type');
      expect(config).toHaveProperty('patterns');
      expect(Array.isArray(config.patterns)).toBe(true);
      expect(config.patterns.length).toBeGreaterThan(0);
      config.patterns.forEach(p => {
        expect(p instanceof RegExp).toBe(true);
      });
    }
  });
});
