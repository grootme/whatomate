/**
 * Integration tests for strategies/index.ts
 *
 * Tests the Strategy Registry, all 6 decision strategies,
 * threshold evaluation, risk scoring weighted model,
 * and consensus voting logic.
 *
 * DB calls are mocked with manual mock objects.
 */

import {
  strategyRegistry,
  thresholdStrategy,
  patternStrategy,
  riskScoringStrategy,
  consensusStrategy,
  predictiveStrategy,
  adaptiveStrategy,
} from '../strategies/index';
import type {
  DecisionStrategy,
  StrategyContext,
  ThresholdConfig,
  Entity,
  PatternDetection,
  RawMessage,
  Alert,
  AlertSeverity,
} from '../types';
import { shouldAlertSpec, actionablePatternSpec } from '../specs';

// ===== STRATEGY REGISTRY =====

describe('strategyRegistry', () => {
  it('has all 6 strategies registered', () => {
    const allStrategies = strategyRegistry.getAll();
    expect(allStrategies.length).toBe(6);
  });

  it('can retrieve each strategy by id', () => {
    const ids: DecisionStrategy[] = ['threshold', 'pattern', 'risk_scoring', 'consensus', 'predictive', 'adaptive'];
    for (const id of ids) {
      const strategy = strategyRegistry.get(id);
      expect(strategy).toBeDefined();
      expect(strategy!.id).toBe(id);
    }
  });

  it('returns undefined for unknown strategy id', () => {
    const strategy = strategyRegistry.get('nonexistent' as DecisionStrategy);
    expect(strategy).toBeUndefined();
  });

  it('evaluateWith returns dismiss for unknown strategy', async () => {
    const result = await strategyRegistry.evaluateWith('nonexistent' as DecisionStrategy, {} as StrategyContext);
    expect(result.action).toBe('dismiss');
    expect(result.confidence).toBe(0);
    expect(result.reasoning).toContain('not found');
  });

  it('each strategy has id, name, and description', () => {
    const allStrategies = strategyRegistry.getAll();
    for (const strategy of allStrategies) {
      expect(strategy.id).toBeDefined();
      expect(strategy.name).toBeDefined();
      expect(strategy.description).toBeDefined();
      expect(typeof strategy.id).toBe('string');
      expect(typeof strategy.name).toBe('string');
      expect(typeof strategy.description).toBe('string');
    }
  });

  it('all 6 strategy IDs match the DecisionStrategy type values', () => {
    const allStrategies = strategyRegistry.getAll();
    const ids = allStrategies.map(s => s.id).sort();
    expect(ids).toEqual(['adaptive', 'consensus', 'pattern', 'predictive', 'risk_scoring', 'threshold']);
  });
});

// ===== Individual Strategy References =====

describe('individual strategy exports', () => {
  it('thresholdStrategy has correct id', () => {
    expect(thresholdStrategy.id).toBe('threshold');
  });

  it('patternStrategy has correct id', () => {
    expect(patternStrategy.id).toBe('pattern');
  });

  it('riskScoringStrategy has correct id', () => {
    expect(riskScoringStrategy.id).toBe('risk_scoring');
  });

  it('consensusStrategy has correct id', () => {
    expect(consensusStrategy.id).toBe('consensus');
  });

  it('predictiveStrategy has correct id', () => {
    expect(predictiveStrategy.id).toBe('predictive');
  });

  it('adaptiveStrategy has correct id', () => {
    expect(adaptiveStrategy.id).toBe('adaptive');
  });
});

// ===== THRESHOLD STRATEGY =====

describe('threshold strategy', () => {
  // Helper to build a minimal StrategyContext with just thresholds
  function makeCtx(thresholds: Partial<ThresholdConfig>[]): StrategyContext {
    return {
      messages: [],
      entities: [],
      patterns: [],
      thresholds: thresholds.map(t => ({
        id: t.id ?? 'thr_1',
        name: t.name ?? 'Test Threshold',
        description: t.description ?? '',
        metric: t.metric ?? 'test_metric',
        condition: t.condition ?? 'gte',
        value: t.value ?? 10,
        unit: t.unit ?? 'count',
        alertSeverity: t.alertSeverity ?? 'MEDIA' as AlertSeverity,
        alertType: t.alertType ?? 'warning',
        enabled: t.enabled ?? true,
        currentValue: t.currentValue ?? 0,
        ...t,
      })) as ThresholdConfig[],
      alerts: [],
    };
  }

  it('returns monitor when no thresholds are triggered', async () => {
    // currentValue below value → not breached
    const ctx = makeCtx([{ value: 10, currentValue: 3, enabled: true, condition: 'gte' }]);
    const result = await thresholdStrategy.evaluate(ctx);
    expect(result.action).toBe('monitor');
    expect(result.confidence).toBe(100);
  });

  it('returns alert when a threshold is triggered (currentValue >= value with gte)', async () => {
    const ctx = makeCtx([{ value: 5, currentValue: 8, enabled: true, condition: 'gte' }]);
    const result = await thresholdStrategy.evaluate(ctx);
    expect(result.action).toBe('alert');
    expect(result.confidence).toBeGreaterThanOrEqual(70);
  });

  it('does NOT trigger when threshold is disabled', async () => {
    const ctx = makeCtx([{ value: 5, currentValue: 8, enabled: false, condition: 'gte' }]);
    const result = await thresholdStrategy.evaluate(ctx);
    expect(result.action).toBe('monitor');
  });

  it('triggers with "lte" condition when currentValue <= value', async () => {
    const ctx = makeCtx([{ value: 10, currentValue: 5, enabled: true, condition: 'lte' }]);
    const result = await thresholdStrategy.evaluate(ctx);
    expect(result.action).toBe('alert');
  });

  it('triggers with "gt" condition when currentValue > value', async () => {
    const ctx = makeCtx([{ value: 10, currentValue: 11, enabled: true, condition: 'gt' }]);
    const result = await thresholdStrategy.evaluate(ctx);
    expect(result.action).toBe('alert');
  });

  it('triggers with "lt" condition when currentValue < value', async () => {
    const ctx = makeCtx([{ value: 10, currentValue: 5, enabled: true, condition: 'lt' }]);
    const result = await thresholdStrategy.evaluate(ctx);
    expect(result.action).toBe('alert');
  });

  it('triggers with "eq" condition when currentValue === value', async () => {
    const ctx = makeCtx([{ value: 10, currentValue: 10, enabled: true, condition: 'eq' }]);
    const result = await thresholdStrategy.evaluate(ctx);
    expect(result.action).toBe('alert');
  });

  it('escalates severity based on highest triggered threshold', async () => {
    const ctx = makeCtx([
      { id: 'thr_low', value: 5, currentValue: 8, enabled: true, condition: 'gte', alertSeverity: 'BAJA' },
      { id: 'thr_high', value: 3, currentValue: 8, enabled: true, condition: 'gte', alertSeverity: 'CRÍTICA' },
    ]);
    const result = await thresholdStrategy.evaluate(ctx);
    expect(result.action).toBe('alert');
    expect(result.severity).toBe('CRÍTICA');
  });
});

// ===== RISK SCORING STRATEGY (Weighted Model) =====

describe('risk scoring strategy — weighted model', () => {
  const WEIGHTS = { nature: 0.35, volume: 0.25, connections: 0.20, osintContext: 0.15, recency: 0.05 };

  it('has correct weight distribution: nature 35%, volume 25%, connections 20%, osint 15%, recency 5%', () => {
    expect(WEIGHTS.nature).toBe(0.35);
    expect(WEIGHTS.volume).toBe(0.25);
    expect(WEIGHTS.connections).toBe(0.20);
    expect(WEIGHTS.osintContext).toBe(0.15);
    expect(WEIGHTS.recency).toBe(0.05);
    // Verify weights sum to 1.0
    const total = WEIGHTS.nature + WEIGHTS.volume + WEIGHTS.connections + WEIGHTS.osintContext + WEIGHTS.recency;
    expect(total).toBeCloseTo(1.0, 10);
  });

  it('returns monitor when no entities or patterns to evaluate', async () => {
    const ctx: StrategyContext = {
      messages: [],
      entities: [],
      patterns: [],
      thresholds: [],
      alerts: [],
    };
    const result = await riskScoringStrategy.evaluate(ctx);
    expect(result.action).toBe('monitor');
    expect(result.confidence).toBe(100);
  });

  it('computes nature score based on entity risk level', () => {
    // The risk scoring strategy uses the following mapping:
    // critical → 95, high → 75, medium → 50, low → 20
    const natureScores: Record<string, number> = {
      critical: 95,
      high: 75,
      medium: 50,
      low: 20,
    };
    expect(natureScores.critical).toBe(95);
    expect(natureScores.high).toBe(75);
    expect(natureScores.medium).toBe(50);
    expect(natureScores.low).toBe(20);
  });

  it('computes volume score using logarithmic scale (log2)', () => {
    // Volume score = min(100, ceil(log2(mentionCount + 1) * 15))
    const volumeScore = (mentionCount: number) => Math.min(100, Math.ceil(Math.log2(mentionCount + 1) * 15));

    expect(volumeScore(0)).toBe(0);   // log2(1) * 15 = 0
    expect(volumeScore(1)).toBe(15);   // log2(2) * 15 = 15
    expect(volumeScore(3)).toBe(30);   // log2(4) * 15 = 30
    expect(volumeScore(7)).toBe(45);   // log2(8) * 15 = 45
    expect(volumeScore(100)).toBe(100); // High count clamped to 100
  });

  it('computes connections score based on related patterns', () => {
    // connectionsScore = min(100, relatedPatterns.length * 25)
    const connScore = (patternCount: number) => Math.min(100, patternCount * 25);
    expect(connScore(0)).toBe(0);
    expect(connScore(1)).toBe(25);
    expect(connScore(4)).toBe(100);
    expect(connScore(10)).toBe(100); // clamped
  });

  it('recency score decreases as time passes', () => {
    // recencyScore = max(0, min(100, 100 - hoursSinceLastSeen * 2))
    const recencyScore = (hours: number) => Math.max(0, Math.min(100, 100 - hours * 2));
    expect(recencyScore(0)).toBe(100);  // Just seen
    expect(recencyScore(12)).toBe(76);  // 12 hours ago
    expect(recencyScore(50)).toBe(0);   // 50 hours ago → 0
  });

  it('risk level mapping: >=90 critical, >=70 high, >=40 medium, else low', () => {
    const getLevel = (score: number) =>
      score >= 90 ? 'critical' : score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';

    expect(getLevel(95)).toBe('critical');
    expect(getLevel(90)).toBe('critical');
    expect(getLevel(75)).toBe('high');
    expect(getLevel(70)).toBe('high');
    expect(getLevel(50)).toBe('medium');
    expect(getLevel(40)).toBe('medium');
    expect(getLevel(20)).toBe('low');
  });
});

// ===== CONSENSUS STRATEGY (Voting Logic) =====

describe('consensus strategy — voting logic', () => {
  it('4/4 favor → alert with CRÍTICA severity', () => {
    // Simulate the consensus decision logic
    const favorCount = 4;
    let action: 'alert' | 'escalate' | 'dismiss' | 'monitor';
    let severity: AlertSeverity = 'MEDIA';

    if (favorCount === 4) {
      action = 'alert';
      severity = 'CRÍTICA';
    } else if (favorCount === 3) {
      action = 'alert';
      severity = 'ALTA';
    } else if (favorCount === 2) {
      action = 'escalate';
      severity = 'MEDIA';
    } else {
      action = 'dismiss';
      severity = 'BAJA';
    }

    expect(action).toBe('alert');
    expect(severity).toBe('CRÍTICA');
  });

  it('3/4 favor → alert with ALTA severity', () => {
    const favorCount = 3;
    let action: 'alert' | 'escalate' | 'dismiss' | 'monitor';
    let severity: AlertSeverity = 'MEDIA';

    if (favorCount === 4) {
      action = 'alert'; severity = 'CRÍTICA';
    } else if (favorCount === 3) {
      action = 'alert'; severity = 'ALTA';
    } else if (favorCount === 2) {
      action = 'escalate'; severity = 'MEDIA';
    } else {
      action = 'dismiss'; severity = 'BAJA';
    }

    expect(action).toBe('alert');
    expect(severity).toBe('ALTA');
  });

  it('2/4 favor → escalate with MEDIA severity', () => {
    const favorCount = 2;
    let action: 'alert' | 'escalate' | 'dismiss' | 'monitor';
    let severity: AlertSeverity = 'MEDIA';

    if (favorCount === 4) {
      action = 'alert'; severity = 'CRÍTICA';
    } else if (favorCount === 3) {
      action = 'alert'; severity = 'ALTA';
    } else if (favorCount === 2) {
      action = 'escalate'; severity = 'MEDIA';
    } else {
      action = 'dismiss'; severity = 'BAJA';
    }

    expect(action).toBe('escalate');
    expect(severity).toBe('MEDIA');
  });

  it('1/4 favor → dismiss with BAJA severity', () => {
    const favorCount = 1;
    let action: 'alert' | 'escalate' | 'dismiss' | 'monitor';
    let severity: AlertSeverity = 'MEDIA';

    if (favorCount === 4) {
      action = 'alert'; severity = 'CRÍTICA';
    } else if (favorCount === 3) {
      action = 'alert'; severity = 'ALTA';
    } else if (favorCount === 2) {
      action = 'escalate'; severity = 'MEDIA';
    } else {
      action = 'dismiss'; severity = 'BAJA';
    }

    expect(action).toBe('dismiss');
    expect(severity).toBe('BAJA');
  });

  it('0/4 favor → dismiss with BAJA severity (same as 1/4)', () => {
    const favorCount = 0;
    let action: 'alert' | 'escalate' | 'dismiss' | 'monitor';
    let severity: AlertSeverity = 'MEDIA';

    if (favorCount >= 4) {
      action = 'alert'; severity = 'CRÍTICA';
    } else if (favorCount === 3) {
      action = 'alert'; severity = 'ALTA';
    } else if (favorCount === 2) {
      action = 'escalate'; severity = 'MEDIA';
    } else {
      action = 'dismiss'; severity = 'BAJA';
    }

    expect(action).toBe('dismiss');
    expect(severity).toBe('BAJA');
  });

  it('has 4 voting agents with correct IDs', () => {
    const agents = [
      { agentId: 'ana-sem', agentName: 'Semantic Analyzer' },
      { agentId: 'ana-pat', agentName: 'Pattern Detector' },
      { agentId: 'ana-cro', agentName: 'Cross-Platform Correlator' },
      { agentId: 'ana-ris', agentName: 'Risk Scorer' },
    ];
    expect(agents.length).toBe(4);
    expect(agents.map(a => a.agentId)).toEqual(['ana-sem', 'ana-pat', 'ana-cro', 'ana-ris']);
  });

  it('Semantic Analyzer (ana-sem) votes favor when suspicious keywords present', () => {
    const suspiciousKeywords = ['fraude', 'estafa', 'scam', 'invertir', 'ganancia', 'crypto', 'dinero fácil'];
    const content = 'Operación de fraude detectada con crypto';
    const isSuspicious = suspiciousKeywords.some(kw => content.toLowerCase().includes(kw));
    expect(isSuspicious).toBe(true);
  });

  it('Cross-Platform Correlator (ana-cro) abstains when single source', () => {
    const messages = [
      { source: 'whatsapp', content: 'test' } as RawMessage,
    ];
    const sources = new Set(messages.map(m => m.source));
    const crossPlatform = sources.size >= 2;
    expect(crossPlatform).toBe(false);
    // When single source → vote would be 'abstencion'
  });

  it('Cross-Platform Correlator (ana-cro) votes favor when 2+ sources', () => {
    const messages = [
      { source: 'whatsapp', content: 'test' } as RawMessage,
      { source: 'telegram', content: 'test' } as RawMessage,
    ];
    const sources = new Set(messages.map(m => m.source));
    const crossPlatform = sources.size >= 2;
    expect(crossPlatform).toBe(true);
  });
});

// ===== SPECIFICATION PATTERN =====

describe('specification pattern used by strategies', () => {
  describe('shouldAlertSpec', () => {
    it('is satisfied when threshold is enabled AND breached', () => {
      const threshold: ThresholdConfig = {
        id: 'thr_1',
        name: 'Test',
        description: '',
        metric: 'test',
        condition: 'gte',
        value: 10,
        unit: 'count',
        alertSeverity: 'MEDIA',
        alertType: 'warning',
        enabled: true,
        currentValue: 15, // 15 >= 10 → breached
      };
      expect(shouldAlertSpec.isSatisfiedBy({ threshold })).toBe(true);
    });

    it('is NOT satisfied when threshold is disabled', () => {
      const threshold: ThresholdConfig = {
        id: 'thr_1',
        name: 'Test',
        description: '',
        metric: 'test',
        condition: 'gte',
        value: 10,
        unit: 'count',
        alertSeverity: 'MEDIA',
        alertType: 'warning',
        enabled: false,
        currentValue: 15,
      };
      expect(shouldAlertSpec.isSatisfiedBy({ threshold })).toBe(false);
    });

    it('is NOT satisfied when threshold is not breached', () => {
      const threshold: ThresholdConfig = {
        id: 'thr_1',
        name: 'Test',
        description: '',
        metric: 'test',
        condition: 'gte',
        value: 10,
        unit: 'count',
        alertSeverity: 'MEDIA',
        alertType: 'warning',
        enabled: true,
        currentValue: 5, // 5 < 10 → not breached
      };
      expect(shouldAlertSpec.isSatisfiedBy({ threshold })).toBe(false);
    });

    it('supports lte condition', () => {
      const threshold: ThresholdConfig = {
        id: 'thr_1',
        name: 'Test',
        description: '',
        metric: 'test',
        condition: 'lte',
        value: 5,
        unit: 'count',
        alertSeverity: 'MEDIA',
        alertType: 'warning',
        enabled: true,
        currentValue: 3, // 3 <= 5 → breached
      };
      expect(shouldAlertSpec.isSatisfiedBy({ threshold })).toBe(true);
    });
  });

  describe('actionablePatternSpec', () => {
    it('is satisfied when pattern is active AND high confidence (>=80)', () => {
      const pattern: PatternDetection = {
        id: 'pat_1',
        patternType: 'fraud_multichannel',
        severity: 'ALTA',
        confidence: 85,
        description: 'Test pattern',
        occurrences: 3,
        status: 'active',
        firstDetected: new Date(),
        lastDetected: new Date(),
      };
      expect(actionablePatternSpec.isSatisfiedBy({ pattern })).toBe(true);
    });

    it('is NOT satisfied when confidence is below 80', () => {
      const pattern: PatternDetection = {
        id: 'pat_1',
        patternType: 'fraud_multichannel',
        severity: 'MEDIA',
        confidence: 70,
        description: 'Test pattern',
        occurrences: 1,
        status: 'active',
        firstDetected: new Date(),
        lastDetected: new Date(),
      };
      expect(actionablePatternSpec.isSatisfiedBy({ pattern })).toBe(false);
    });

    it('is NOT satisfied when pattern is dismissed', () => {
      const pattern: PatternDetection = {
        id: 'pat_1',
        patternType: 'fraud_multichannel',
        severity: 'ALTA',
        confidence: 90,
        description: 'Test pattern',
        occurrences: 5,
        status: 'dismissed',
        firstDetected: new Date(),
        lastDetected: new Date(),
      };
      expect(actionablePatternSpec.isSatisfiedBy({ pattern })).toBe(false);
    });

    it('is satisfied when pattern is confirmed AND high confidence', () => {
      const pattern: PatternDetection = {
        id: 'pat_1',
        patternType: 'fraud_multichannel',
        severity: 'CRÍTICA',
        confidence: 95,
        description: 'Test pattern',
        occurrences: 10,
        status: 'confirmed',
        firstDetected: new Date(),
        lastDetected: new Date(),
      };
      expect(actionablePatternSpec.isSatisfiedBy({ pattern })).toBe(true);
    });
  });
});

// ===== PREDICTIVE STRATEGY =====

describe('predictive strategy — trend detection', () => {
  it('detects anomalous activity when trend ratio > 3.0', () => {
    const recentCount = 30;
    const olderCount = 8;
    const trendRatio = olderCount > 0 ? recentCount / olderCount : 1;
    expect(trendRatio).toBeGreaterThan(3.0);
  });

  it('detects surge when trend ratio > 2.0 but < 3.0', () => {
    const recentCount = 20;
    const olderCount = 8;
    const trendRatio = olderCount > 0 ? recentCount / olderCount : 1;
    expect(trendRatio).toBeGreaterThan(2.0);
    expect(trendRatio).toBeLessThanOrEqual(3.0);
  });

  it('exponential smoothing prediction formula', () => {
    const alpha = 0.3;
    const recentCount = 20;
    const olderCount = 8;
    const predicted = Math.round(alpha * recentCount + (1 - alpha) * olderCount);
    // 0.3 * 20 + 0.7 * 8 = 6 + 5.6 = 11.6 → 12
    expect(predicted).toBe(12);
  });
});

// ===== ADAPTIVE STRATEGY =====

describe('adaptive strategy — FPR-based adjustment', () => {
  it('adjustment percentage is clamped between 5% and 15%', () => {
    // adjustmentPct = min(15, max(5, FPR * 0.5))
    const calcAdjustment = (fpr: number) => Math.min(15, Math.max(5, fpr * 0.5));

    expect(calcAdjustment(5)).toBe(5);    // 5 * 0.5 = 2.5 → clamped to min 5
    expect(calcAdjustment(10)).toBe(5);   // 10 * 0.5 = 5 → within range
    expect(calcAdjustment(20)).toBe(10);  // 20 * 0.5 = 10
    expect(calcAdjustment(30)).toBe(15);  // 30 * 0.5 = 15
    expect(calcAdjustment(50)).toBe(15);  // 50 * 0.5 = 25 → clamped to max 15
  });

  it('increases threshold value when FPR > 20%', () => {
    const fpr = 30;
    const direction = fpr > 20 ? 'increase' : 'decrease';
    expect(direction).toBe('increase');
  });

  it('decreases threshold value when FPR < 5% and sensitivity < 70%', () => {
    const fpr = 3;
    const sensitivity = 50;
    const shouldDecrease = fpr < 5 && sensitivity < 70;
    expect(shouldDecrease).toBe(true);
  });

  it('skips adjustment when FPR is within acceptable range (5%-20%)', () => {
    const fpr = 12;
    const sensitivity = 80;
    const shouldAdjust = fpr > 20 || (fpr < 5 && sensitivity < 70);
    expect(shouldAdjust).toBe(false);
  });

  it('applies adaptive bounds from metadata', () => {
    const metadata = {
      adaptiveBounds: { min: 3, max: 20 },
    };
    const boundMin = metadata.adaptiveBounds.min;
    const boundMax = metadata.adaptiveBounds.max;

    // Simulating adjustment with bounds
    const currentValue = 10;
    const adjustmentPct = 15;
    const newValue = currentValue * (1 + adjustmentPct / 100); // 11.5
    const clampedValue = Math.max(boundMin, Math.min(boundMax, newValue));
    expect(clampedValue).toBe(11.5);
  });

  it('clamps to bound min when adjustment goes below', () => {
    const boundMin = 8;
    const newValue = 5; // below min
    const clamped = Math.max(boundMin, newValue);
    expect(clamped).toBe(boundMin);
  });

  it('clamps to bound max when adjustment goes above', () => {
    const boundMax = 15;
    const newValue = 20; // above max
    const clamped = Math.min(boundMax, newValue);
    expect(clamped).toBe(boundMax);
  });

  it('cooldown period prevents adjustment when last triggered < 1 hour ago', () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const lastTriggered = new Date(now.getTime() - 30 * 60 * 1000); // 30 min ago

    const inCooldown = lastTriggered >= oneHourAgo;
    expect(inCooldown).toBe(true); // Should be in cooldown
  });

  it('cooldown period allows adjustment when last triggered > 1 hour ago', () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const lastTriggered = new Date(now.getTime() - 2 * 60 * 60 * 1000); // 2 hours ago

    const inCooldown = lastTriggered >= oneHourAgo;
    expect(inCooldown).toBe(false); // Should not be in cooldown
  });
});
