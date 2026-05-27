/**
 * Specification Pattern — RICCO ADN: Guarded Lifecycle
 * 
 * Composable specifications for validating intelligence operations.
 * Follows the RICCO pattern: andSpec / orSpec / notSpec composition.
 */

import type { ComposableSpec, Alert, ThresholdConfig, RawMessage, RiskAssessment, PatternDetection } from './types';

// ===== SPEC COMPOSITION (from RICCO) =====

export function andSpec<T>(...specs: ComposableSpec<T>[]): ComposableSpec<T> {
  return {
    id: specs.map(s => s.id).join('_and_'),
    label: specs.map(s => s.label).join(' + '),
    isSatisfiedBy(ctx: T): boolean {
      return specs.every(spec => {
        try { return spec.isSatisfiedBy(ctx); }
        catch { return false; }
      });
    },
  };
}

export function orSpec<T>(...specs: ComposableSpec<T>[]): ComposableSpec<T> {
  return {
    id: specs.map(s => s.id).join('_or_'),
    label: specs.map(s => s.label).join(' | '),
    isSatisfiedBy(ctx: T): boolean {
      return specs.some(spec => {
        try { return spec.isSatisfiedBy(ctx); }
        catch { return false; }
      });
    },
  };
}

export function notSpec<T>(spec: ComposableSpec<T>): ComposableSpec<T> {
  return {
    id: `not_${spec.id}`,
    label: `NOT(${spec.label})`,
    isSatisfiedBy(ctx: T): boolean {
      try { return !spec.isSatisfiedBy(ctx); }
      catch { return true; }
    },
  };
}

// ===== SPEC REGISTRY (Registry-Driven - RICCO ADN 3) =====

export class SpecRegistry<T> {
  private specs: Map<string, ComposableSpec<T>> = new Map();

  register(spec: ComposableSpec<T>): void {
    this.specs.set(spec.id, spec);
  }

  validate(ctx: T): { satisfied: boolean; warnings: string[] } {
    const warnings: string[] = [];
    let allSatisfied = true;
    for (const spec of this.specs.values()) {
      if (!spec.isSatisfiedBy(ctx)) {
        warnings.push(`${spec.label}: requisito no cumplido`);
        allSatisfied = false;
      }
    }
    return { satisfied: allSatisfied, warnings };
  }

  getAll(): ComposableSpec<T>[] {
    return Array.from(this.specs.values());
  }
}

// ===== THRESHOLD SPECS =====

export const thresholdBreachSpec: ComposableSpec<{ threshold: ThresholdConfig }> = {
  id: 'threshold_breach',
  label: 'Umbral superado',
  isSatisfiedBy(ctx) {
    const { threshold } = ctx;
    switch (threshold.condition) {
      case 'gte': return threshold.currentValue >= threshold.value;
      case 'lte': return threshold.currentValue <= threshold.value;
      case 'gt': return threshold.currentValue > threshold.value;
      case 'lt': return threshold.currentValue < threshold.value;
      case 'eq': return threshold.currentValue === threshold.value;
      default: return false;
    }
  },
};

export const thresholdEnabledSpec: ComposableSpec<{ threshold: ThresholdConfig }> = {
  id: 'threshold_enabled',
  label: 'Umbral habilitado',
  isSatisfiedBy(ctx) {
    return ctx.threshold.enabled;
  },
};

// Composed: alert only if enabled AND breached
export const shouldAlertSpec = andSpec(thresholdEnabledSpec, thresholdBreachSpec);

// ===== ALERT SPECS =====

export const alertNotAcknowledgedSpec: ComposableSpec<{ alert: Alert }> = {
  id: 'alert_not_acknowledged',
  label: 'Alerta no reconocida',
  isSatisfiedBy(ctx) {
    return !ctx.alert.acknowledged;
  },
};

export const criticalAlertSpec: ComposableSpec<{ alert: Alert }> = {
  id: 'alert_critical',
  label: 'Alerta crítica',
  isSatisfiedBy(ctx) {
    return ctx.alert.severity === 'CRÍTICA';
  },
};

export const highOrCriticalAlertSpec: ComposableSpec<{ alert: Alert }> = {
  id: 'alert_high_or_critical',
  label: 'Alerta alta o crítica',
  isSatisfiedBy(ctx) {
    return ctx.alert.severity === 'CRÍTICA' || ctx.alert.severity === 'ALTA';
  },
};

// Escalate if critical AND not acknowledged
export const shouldEscalateSpec = andSpec(criticalAlertSpec, alertNotAcknowledgedSpec);

// ===== MESSAGE SPECS =====

export const suspiciousContentSpec: ComposableSpec<{ message: RawMessage; keywords: string[] }> = {
  id: 'suspicious_content',
  label: 'Contenido sospechoso',
  isSatisfiedBy(ctx) {
    const content = ctx.message.content.toLowerCase();
    return ctx.keywords.some(kw => content.includes(kw.toLowerCase()));
  },
};

export const highVolumeSpec: ComposableSpec<{ messages: RawMessage[]; threshold: number; windowMs: number }> = {
  id: 'high_volume',
  label: 'Volumen alto de mensajes',
  isSatisfiedBy(ctx) {
    const now = Date.now();
    const recent = ctx.messages.filter(m => now - m.timestamp.getTime() < ctx.windowMs);
    return recent.length >= ctx.threshold;
  },
};

// ===== RISK SPECS =====

export const highRiskSpec: ComposableSpec<{ assessment: RiskAssessment }> = {
  id: 'high_risk',
  label: 'Riesgo alto (score >= 70)',
  isSatisfiedBy(ctx) {
    return ctx.assessment.score >= 70;
  },
};

export const criticalRiskSpec: ComposableSpec<{ assessment: RiskAssessment }> = {
  id: 'critical_risk',
  label: 'Riesgo crítico (score >= 90)',
  isSatisfiedBy(ctx) {
    return ctx.assessment.score >= 90;
  },
};

// ===== PATTERN SPECS =====

export const highConfidencePatternSpec: ComposableSpec<{ pattern: PatternDetection }> = {
  id: 'high_confidence_pattern',
  label: 'Patrón de alta confianza (>= 80%)',
  isSatisfiedBy(ctx) {
    return ctx.pattern.confidence >= 80;
  },
};

export const activePatternSpec: ComposableSpec<{ pattern: PatternDetection }> = {
  id: 'active_pattern',
  label: 'Patrón activo',
  isSatisfiedBy(ctx) {
    return ctx.pattern.status === 'active' || ctx.pattern.status === 'confirmed';
  },
};

// Combined: active AND high confidence
export const actionablePatternSpec = andSpec(activePatternSpec, highConfidencePatternSpec);
