# RICCO Platform: Ciclo 2 — Meta-Patrones

**Versión:** 3.0 — Ciclo Fresco Completo
**Fecha:** 2026-03-05
**Alcance:** 60+ motores de comercio · 142 componentes · 42 páginas · 75+ rutas API · 22 industrias · Capa de Resiliencia

---

## Contexto

Este documento es la **segunda parte** del reporte de 3 ciclos de identificación de patrones de la plataforma RICCO. Se enfoca exclusivamente en los **meta-patrones** — las combinaciones emergentes de patrones individuales que forman estructuras repetitivas de mayor orden.

La relación entre los tres ciclos es jerárquica:
- **Ciclo 1:** Patrones individuales — las piezas atómicas del diseño (Strategy, Observer, State Machine, etc.)
- **Ciclo 2 (este documento):** Meta-Patrones — combinaciones de patrones individuales que se repiten coherentemente en múltiples motores
- **Ciclo 3:** Meta-Meta-Patrones — los principios arquitectónicos irreducibles que gobiernan todas las decisiones de diseño

Los meta-patrones documentados aquí son combinaciones concretas de los patrones individuales del Ciclo 1, y son manifestaciones de los principios del Ciclo 3. Se identificaron **33 meta-patrones** (24 previos + **6 NUEVOS** + **3 adicionales documentados en revisión posterior**).

---

## Resumen del Ciclo 2

Se identificaron **33 meta-patrones** (24 previos + **6 NUEVOS** + **3 adicionales documentados en revisión posterior**): Spec-Gated State Reactive (refinado), Resilience Shielding, Priority-Ordered Execution, Cache Strategy Decoration Chain, Health State Machine, Cross-Layer Observer Bridge, Declarative Config → Runtime Resolution, Registry-Backed Proxy Chain, y Bootstrap-Driven Dependency Resolution.

---

## 2.1 Meta-Patrones Previamente Identificados (24)

Los 24 meta-patrones previamente documentados incluyen combinaciones como:
1. Spec-Gated State Reactive (Specification + State Machine + Observer + EventBus)
2. Registry-Backed Strategy (Registry + Strategy + Fallback)
3. Observable Singleton (Singleton + Observer + EventBus Bridge)
4. Builder-Spec Validation (Builder + Specification)
5. Adapter-Template Method (Adapter + Template Method + Strategy)
6. Facade-Orchestrated Saga (Facade + Saga + Memento + Observer)
7. CQRS Event Bridge (CQRS + Event Sourcing + Consistency)
8. Anti-Corruption Client (Facade + Anti-Corruption + Type Translation)
9. Factory-Strategy Platform (Abstract Factory + Strategy + Registry)
10. Decorator-Stack Cache (Decorator + Strategy + Chain of Responsibility)
11. Composite-Spec Validation (Composite + Specification)
12. Command-Scheduler Observer (Command + Observer + Singleton)
13. Singleton-Registry Engine (Singleton + Registry + Facade)
14. Pipeline-Chain API (Chain of Responsibility + Pipeline + Facade)
15. Event-Dedup Observer (Observer + Event Dedup + Max Depth)
16. Idempotency-Concurrent (Idempotency + Concurrent Request Protection)
17. Circuit-Breaker Registry (State Machine + Registry + Observer)
18. Dead-Letter Retry (Repository + Strategy + Observer)
19. WebSocket Priority Queue (Priority Queue + Dead Letter + Observer)
20. Error-Categorization Reporter (Repository + Strategy + Observer)
21. Ring-Buffer History (Ring Buffer + Dedup Index)
22. Health-Aggregator Monitor (Health Check + Aggregator + Observer)
23. Resilience-Orchestrator (Singleton + Aggregator + Alerting)
24. Multi-Layer Cache (Strategy + Decorator + Builder)

---

## 2.2 Meta-Patrones NUEVOS (6)

### 2.2.1 Spec-Gated State Reactive (Refinado) — NUEVO refinamiento

**Firma:** `Specification → State Machine → Observer → EventBus Bridge → Resilience Shield`

El meta-patrón central de la plataforma se ha refinado con la incorporación de la capa de resiliencia:

```typescript
// Flujo completo refinado:
// 1. Spec Validation → ComposableSpec.isSatisfiedBy() con andSpec/orSpec
// 2. State Transition → GenericStateMachine.canTransition() con guards
// 3. Side Effect → TransitionRule.onTransition() hook
// 4. Local Notification → ObservableEngine.emitEvent() a observers locales
// 5. EventBus Bridge → eventBus.emit() con fire-and-forget + error isolation
// 6. Resilience Shield → circuitBreaker.execute() + idempotency + errorReporter.reportSilent()
```

**Impacto:** Este meta-patrón es ahora el flujo estándar para TODAS las operaciones de escritura en la plataforma, con resiliencia integrada en cada paso.

### 2.2.2 Resilience Shielding — NUEVO

**Firma:** `Circuit Breaker + Dead Letter Queue + Idempotency + Error Reporter + Health Monitor`

La capa de resiliencia forma un meta-patrón cohesivo donde cada componente protege un aspecto diferente:

```
                    ┌─────────────────────────────────────────┐
 Request ──────────►│ Idempotency Check (duplicate filter)    │
                    └─────────────┬───────────────────────────┘
                                  │
                    ┌─────────────▼───────────────────────────┐
                    │ Circuit Breaker (fast-fail if degraded) │
                    └─────────────┬───────────────────────────┘
                                  │
                    ┌─────────────▼───────────────────────────┐
                    │ Business Logic (engine operation)       │
                    └─────────────┬───────────────────────────┘
                                  │
                     ┌────────────┼────────────┐
                     │ Success    │ Failure     │
                     ▼            ▼            ▼
              Store Result   Error Reporter   Dead Letter Queue
              (Idempotency)  (ReportSilent)   (Auto-retry with backoff)
                                  │                │
                                  ▼                ▼
                            Health Monitor ◄─── Alert Generation
                            (GREEN/YELLOW/RED)
```

**Código clave de integración:**
```typescript
// withApi-handler.ts integra Idempotency + Timeout
if (config?.idempotent) {
  const storedResult = await manager.checkKey(idempotencyKey);
  if (storedResult) return replayResponse(storedResult); // Idempotency hit
  manager.markProcessing(idempotencyKey);
  // ... execute handler with timeout ...
  await manager.storeResult(idempotencyKey, { status, body }); // Store for replay
}

// Dead Letter Queue se conecta al EventBus
connectDeadLetterQueue(eventBus); // Failed event deliveries → auto-retry
```

### 2.2.3 Priority-Ordered Execution — NUEVO

**Firma:** `Priority Queue + Sorted Registry + Ordered Handler Execution`

Tres componentes implementan ejecución ordenada por prioridad:

1. **EventBus handlers:** Los handlers se ejecutan en orden de prioridad (lower = first), y dentro del mismo nivel de prioridad, en paralelo:
```typescript
const priorityGroups = this.groupByPriority(matchingSubs);
for (const group of priorityGroups) {
  await Promise.allSettled(group.map(sub => sub.handler(event)));
}
```

2. **WebSocket Queue:** Mensajes ordenados por prioridad con binary search insertion
3. **Invalidation Chain:** Handlers ordenados por `order` (TimeBased=10, TagBased=20, EventBased=30, Manual=40)

### 2.2.4 Cache Strategy Decoration Chain — NUEVO

**Firma:** `Strategy + Decorator Stack + Builder Key + Invalidation Chain`

La combinación de patrones en el sistema de caching forma un meta-patrón único:

```typescript
// Stack de decoradores con estrategias intercambiables
const cache = CachingEngine.getInstance();
cache.configureModule({
  moduleName: 'products',
  policy: { ttl: 300000, staleWhileRevalidate: 60000, varyBy: ['locale', 'currency'] },
  strategy: new MetricsDecorator(
    new StaleWhileRevalidateDecorator(
      new MemoryCacheStrategy(1000),
      60000
    )
  )
});

// Cache key builder con contexto
const key = cache.createKeyBuilder('product-list')
  .withLocale('es')
  .withCurrency('USD')
  .applyVaryBy(context, ['locale', 'currency'])
  .build();
// Resultado: "cache:product-list|currency:USD|locale:es"
```

### 2.2.5 Health State Machine — NUEVO

**Firma:** `Health Check + State Machine + Alert Generation + Observer`

El ResilienceOrchestrator implementa un meta-patrón donde los estados de salud de componentes individuales se agregan en un estado de sistema:

```
Component Health States:    healthy / degraded / unhealthy
                            │
System Health Aggregation:  GREEN (all healthy) / YELLOW (any degraded) / RED (any unhealthy)
                            │
Alert State Machine:        no_alert → warning_alert → critical_alert → resolved
```

**Transiciones de alerta:**
- `healthy → degraded`: Genera alerta WARNING
- `healthy → unhealthy`: Genera alerta CRITICAL
- `degraded → unhealthy`: Escala alerta WARNING → CRITICAL
- `unhealthy/degraded → healthy`: Resuelve alerta

### 2.2.6 Cross-Layer Observer Bridge — NUEVO

**Firma:** `Engine Observer (local) → EventBus Bridge (async) → Dead Letter Queue (fallback) → Error Reporter (catch-all)`

El puente de observadores entre capas forma un meta-patrón de propagación de eventos con garantías de entrega:

```typescript
// ObservableEngine.emitEvent() — El puente central
protected emitEvent(type, entity, eventPrefix, aggregateType, getAggregateId, getPayload): void {
  // 1. Observers locales — síncrono, error-isolated
  for (const observer of this.observers) {
    try { observer(event); } catch { /* no propagar */ }
  }
  
  // 2. EventBus central — async fire-and-forget
  void eventBus.emit(prefix + type, aggregateId, aggregateType, payload)
    .catch(() => { /* falla del bus no rompe el motor */ });
  // EventBus internamente:
  //   - Dedup check → drop duplicates
  //   - Max depth check → prevent infinite chains
  //   - Priority-ordered handler execution
  //   - Failed handlers → dead letter handler (si configurado)
  //   Dead Letter Queue → auto-retry con backoff
  //   Permanent failures → errorReporter.reportSilent()
}
```

---

## 2.3 Meta-Patrones Adicionales (3)

#### 2.3.1 Declarative Config → Runtime Resolution (Configuración Declarativa → Resolución en Runtime)

**Firma:** `Interpreter + Strategy + Flyweight`

Una combinación de 3 patrones donde configuraciones JSON declarativas son **interpretadas** en runtime, la **estrategia** correcta es seleccionada de un registro, y los valores por defecto compartidos se aplican via **Flyweight** (solo diferencias almacenadas).

**Ocurrencias:**
- TenantEngine: DeclarativeTenantConfig → ResolvedTenant (Interpreter + Strategy + Flyweight)
- CommerceModel: CommerceModelConfig → CommerceItem (Interpreter + Strategy)
- FeatureFlags: FlagStrategy → evaluation result (Strategy + Flyweight para defaults)

Este meta-patrón es de mayor orden que cualquier constituyente individual — la combinación Interpreter+Strategy+Flyweight crea un sistema de configuración declarativa que es más potente que la suma de sus partes.

#### 2.3.2 Registry-Backed Proxy Chain (Cadena Proxy con Respaldo de Registro)

**Firma:** `Registry + Proxy + Chain of Responsibility`

Una combinación de 3 patrones donde un **proxy/gateway** enruta requests a través de una **cadena indexada por registro** de proveedores, con fallback a lo largo de la cadena hasta que uno tiene éxito.

**Ocurrencias:**
- MCPProxy: registry → proxy → múltiples servidores MCP
- ProviderFactory: registry → cadena ordenada por prioridad → mock fallback
- FederatedMemoryProvider: Engram → local fallback chain

Distinto de simple Chain of Responsibility porque el registro proporciona la fuente de la cadena y el proxy proporciona la lógica de enrutamiento.

#### 2.3.3 Bootstrap-Driven Dependency Resolution (Resolución de Dependencias Impulsada por Bootstrap)

**Firma:** `DI Container + Bootstrap Provider + Registry initialization order`

Un meta-patrón específico de React donde un **Provider component** (PlatformBootstrapProvider) inicializa el contenedor DI ordenando todos los registros en la secuencia correcta de dependencias: deployment state → industryRegistry → viewRegistry → cartStoreRegistry.

**Ocurrencias:**
- PlatformBootstrapProvider: composition root para toda la plataforma
- View registry: lazy loading después de que industryRegistry está poblado
- Cart store registry: depende de industryRegistry para crear stores por industria

El Provider actúa como composition root, y los registros sirven como service locators.

---

## Scorecard del Ciclo 2

### Madurez de Meta-Patrones por Categoría

| Categoría | Meta-Patrones | Madurez |
|-----------|---------------|---------|
| Resiliencia | 6 | ★★★★★ |
| Comercio | 12 | ★★★★★ |
| Platform | 5 | ★★★★☆ |
| API Layer | 4 | ★★★★★ |
| Configuración/Bootstrap | 2 | ★★★★☆ |

### Evolución de Meta-Patrones

| Métrica | Ciclo Anterior | Este Ciclo | Delta |
|---------|---------------|------------|-------|
| Meta-Patrones | 24 | 33 | +9 |
| Meta-Patrones NUEVOS | 0 | 6 | +6 |
| Meta-Patrones Adicionales | 0 | 3 | +3 |
| Capas de Resiliencia | 5 | 7 | +2 |

---

*Fin del Ciclo 2 — RICCO Platform: Meta-Patrones*
*24 meta-patrones previos · 6 meta-patrones nuevos · 3 meta-patrones adicionales · 33 total*
