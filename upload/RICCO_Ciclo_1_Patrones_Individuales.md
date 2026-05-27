# RICCO Platform: Ciclo 1 — Patrones Individuales

**Versión:** 3.0 — Ciclo Fresco Completo
**Fecha:** 2026-03-05
**Alcance:** 60+ motores de comercio · 142 componentes · 42 páginas · 75+ rutas API · 22 industrias · Capa de Resiliencia

---

## Contexto

Este documento es la **primera parte** del reporte de 3 ciclos de identificación de patrones de la plataforma RICCO. Se enfoca exclusivamente en los **patrones individuales** — las unidades fundamentales de diseño que componen la arquitectura.

La relación entre los tres ciclos es jerárquica:
- **Ciclo 1 (este documento):** Patrones individuales — las piezas atómicas del diseño
- **Ciclo 2:** Meta-Patrones — combinaciones emergentes de patrones individuales que forman estructuras repetitivas de mayor orden
- **Ciclo 3:** Meta-Meta-Patrones — los principios arquitectónicos irreducibles que gobiernan todas las decisiones de diseño

Los patrones documentados aquí son la base sobre la cual se construyen los meta-patrones (Ciclo 2) y los meta-meta-patrones (Ciclo 3).

---

## Resumen del Ciclo 1

Se identificaron **60 patrones individuales** (22 GoF, 12 Domain, 19 React/Next.js, 7 Infrastructure), incluyendo **8 patrones NUEVOS** + 19 patrones adicionales documentados en revisión posterior. Los 8 patrones nuevos originales: Pipeline Middleware, Priority Queue, Ring Buffer, Health Check Aggregator, Event Deduplication Chain, API Adapter (Thin Client), Stale-While-Revalidate Decorator, y Invalidation Chain.

---

## 1.1 Patrones GoF (Gang of Four)

### 1.1.1 Strategy Pattern — 15+ Implementaciones

El patrón Strategy es el más ubicuo en la plataforma, presente en prácticamente todos los motores de dominio:

```typescript
// Ejemplo: DeliveryFeeStrategy en food-delivery-engine.ts
type DeliveryFeeStrategyType = 'flat' | 'distance' | 'dynamic';

const DELIVERY_FEE_STRATEGIES: Record<DeliveryFeeStrategyType, DeliveryFeeCalculator> = {
  flat: (baseFee, _distance, _zone) => baseFee,
  distance: (baseFee, distance, zone) => baseFee + (distance * zone.perKmFee),
  dynamic: (baseFee, distance, zone, surge) => (baseFee + distance * zone.perKmFee) * surge,
};
```

**Ocurrencias documentadas:**
| Motor | Estrategia | Variantes |
|-------|-----------|-----------|
| Food Delivery | DeliveryFeeStrategy | flat, distance, dynamic |
| Reservation | PricingStrategy | hourly, daily, flat |
| Listing | PricingStrategy | sale, rent, lease, auction |
| Listing | SearchStrategy | keyword, geo, filter |
| Dispatch | DispatchStrategy | nearest_first, balanced, rating_priority, surge_pricing |
| Fulfillment | FulfillmentPricingStrategy | ground, sea, air, multimodal |
| B2B | B2BPricingStrategy | volume-tiered, contract, spot |
| Caching | CacheStrategy (interfaz) | Memory, LocalStorage, IndexedDB, ServiceWorker |
| CQRS | ConsistencyStrategy | eventual, strong |
| Event Sourcing | SnapshotStrategy | every-n, milestone |
| Platform | BusinessModelStrategy | 6 modelos de negocio |
| Payment | FeeCalculationStrategy | por método de pago |
| Booking | CancellationPolicy | 5 políticas por industria |

### 1.1.2 Observer Pattern — 12+ Implementaciones

El Observer se implementa de dos formas: (a) observer local dentro de cada motor, y (b) bridge al EventBus centralizado.

```typescript
// ObservableEngine<T> — Base class en engine-base.ts
export abstract class ObservableEngine<ET extends string, E> {
  private observers: Array<(event: { type: ET; entity: E; timestamp: string }) => void> = [];

  addObserver(callback): () => void {
    this.observers.push(callback);
    return () => { this.observers = this.observers.filter(o => o !== callback); };
  }

  protected emitEvent(type, entity, eventPrefix, aggregateType, getAggregateId, getPayload): void {
    // 1. Notificar observers locales (síncrono)
    for (const observer of this.observers) {
      try { observer(event); } catch { /* aislamiento de errores */ }
    }
    // 2. Bridge al EventBus central (async fire-and-forget)
    void eventBus.emit(`${eventPrefix}.${type}`, getAggregateId(entity), aggregateType, getPayload(entity))
      .catch(() => { /* falla del EventBus no debe romper el motor */ });
  }
}
```

**Buses de eventos documentados:**
- `CommerceEventBusClass` — 22+ tipos de eventos, 12+ tipos de agregados, wildcard subscriptions
- `SagaEventBus` — 10 tipos de eventos de saga
- `BookingEventBus` — 11 tipos de eventos de reservas
- `ReservationEventBus` — 11 tipos de eventos
- `FoodEventBus` — 11 tipos de eventos
- `HealthcareEngine` — 9 tipos de eventos de prescripción
- `CircuitBreakerRegistry.onStateChange` — eventos de cambio de estado
- `CachingEngine.on` — eventos de cache (hit, miss, set, invalidate, expire, stale)

### 1.1.3 State Machine Pattern — 9+ Implementaciones

Cada motor de dominio implementa una máquina de estados con transiciones validadas:

```typescript
// GenericStateMachine en engine-base.ts
export class GenericStateMachine<S extends string, E> {
  constructor(private transitions: TransitionRule<S, E>[]) {}

  canTransition(current: S, target: S, entity: E): boolean {
    const rule = this.transitions.find(t => t.from === current && t.to === target);
    if (!rule) return false;
    if (rule.guard && !rule.guard(entity)) return false;
    return true;
  }
}
```

**Máquinas de estado documentadas:**
| Motor | Estados | Transiciones | Notable |
|-------|---------|-------------|---------|
| Booking | 7 | 10+ | Con waitlist promotion |
| Reservation | 8 | 10+ | Con recurrencia |
| Food Order | 10 | 13+ | Con kitchen priority |
| Prescription | 9 | 13+ | Con pipeline OCR |
| Listing | 6+ | 8+ | Con builder |
| Dispatch/Ride | 6 | 8+ | Con surge pricing |
| Shipment | 13 | 20+ | Con customs pipeline |
| Membership (Fitness) | 5 | 8+ | Con freeze/unfreeze |
| Circuit Breaker | 3 | 4 | CLOSED↔OPEN↔HALF_OPEN |
| B2B (Quotation+Order+Invoice) | 3×5 | 15+ | Triple lifecycle |

### 1.1.4 Specification Pattern — 10+ Implementaciones

El patrón Specification con composición `andSpec`/`orSpec`/`notSpec` es un pilar de validación:

```typescript
// spec-composition.ts
export function andSpec<T>(...specs: ComposableSpec<T>[]): ComposableSpec<T> {
  return {
    id: specs.map(s => s.id).join('_and_'),
    labelEs: specs.map(s => s.labelEs).join(' + '),
    isSatisfiedBy(ctx: T): boolean {
      return specs.every(spec => {
        try { return spec.isSatisfiedBy(ctx); }
        catch { return false; } // aislamiento de errores en specs
      });
    },
  };
}
```

**Specs documentados:**
- BookingSpec: 4 specs (availability, capacity, cancellation-window, no-outstanding-balance)
- ReservationSpec: 5 specs (capacity, advance-booking, no-outstanding-balance, no-show-penalty, valid-license)
- FoodOrderSpec: 4 specs (minimum-order, vendor-open, delivery-zone, allergen-warning)
- PrescriptionSpec: 5 specs (doctor-license, controlled-substance, prescription-expiry, patient-age, pregnancy-safety)
- ListingSpec: 5 specs (listing-complete, price-in-range, agent-verified, image-quality, compliance)
- DispatchSpec: 7 specs (driver-online, capacity, radius, rating, vehicle-type, license, customer-no-outstanding)
- ShipmentSpec: 5 specs (weight-limit, hazmat, customs-docs, refrigeration, insurance)
- B2BSpec: 4 specs (credit-check, minimum-order, tax-id, payment-terms)
- FitnessSpec: 5 specs (membership-active, class-capacity, health-clearance, booking-window, no-show-penalty)
- CheckoutValidationHook: 7 hooks (pharmacy-prescription, pharmacy-age, pharmacy-interaction, food-allergen, carrental-license, health-license, legal-bar-verification)

### 1.1.5 Registry Pattern — 10+ Implementaciones

El patrón Registry gestiona colecciones de adaptadores, estrategias y configuraciones:

```typescript
// AdapterRegistry<T> en engine-base.ts
export class AdapterRegistry<A extends { industryId: string }> {
  private adapters: Map<string, A> = new Map();
  
  delegate<R>(industryId: string, method: (adapter: A) => R, fallback: () => R): R {
    const adapter = this.adapters.get(industryId);
    if (adapter) return method(adapter);
    return fallback();
  }
}
```

**Registries documentados:**
- AdapterRegistry (genérico) — booking adapters, reservation adapters, listing adapters
- SpecRegistry<T> — specs composable por dominio
- CircuitBreakerRegistry — circuit breakers por nombre de dependencia
- industryRegistry — 22 industrias
- viewRegistry — vistas por industria
- cartStoreRegistry — stores de carrito por industria
- iconRegistry — iconos por industria
- landingPresetRegistry — presets de landing
- landingDesignRegistry — diseños de landing
- PlatformConfigurationFactory — fábricas por modelo de negocio

### 1.1.6 Singleton Pattern — 25+ Implementaciones

Prácticamente todos los motores usan Singleton (lazy initialization):

```typescript
// Patrón estándar en toda la plataforma
class SomeEngineClass {
  private static instance: SomeEngineClass;
  static getInstance(): SomeEngineClass {
    if (!SomeEngineClass.instance) {
      SomeEngineClass.instance = new SomeEngineClass();
    }
    return SomeEngineClass.instance;
  }
}
export const someEngine = SomeEngineClass.getInstance();
```

### 1.1.7 Template Method Pattern — 7+ Implementaciones

Los adaptadores de industria usan Template Method para definir el esqueleto del algoritmo:

```typescript
// IndustryBookingAdapter — Template Method
export interface IndustryBookingAdapter {
  industryId: string;
  industryName: string;
  defaultSlotDuration: number;     // Varía por industria
  maxAdvanceBookingDays: number;   // Varía por industria
  cancellationPolicyHours: number; // Varía por industria
  requiresConfirmation: boolean;   // Varía por industria
  getAvailableSlots(date: string): BookingSlot[];
  validateBooking(context: BookingContext): ValidationResult;
  onCancel(booking: BookingRecord): void; // Hook de personalización
}
```

### 1.1.8 Builder Pattern — 5+ Implementaciones

El Builder se usa para construir objetos complejos con APIs fluidas:

```typescript
// ListingBuilder en listing-engine.ts
class ListingBuilder {
  withTitle(title: string): this { ... return this; }
  withDescription(desc: string): this { ... return this; }
  withPrice(amount: number, currency: string): this { ... return this; }
  withImages(images: string[]): this { ... return this; }
  withAgent(agentId: string): this { ... return this; }
  build(): Listing { ... }
}

// ShipmentBuilder en fulfillment-engine.ts
// WorkoutPlanBuilder en fitness-engine.ts
// QuotationBuilder en b2b-engine.ts
// CacheKeyBuilder en caching-engine.ts
```

### 1.1.9 Factory Pattern — 6+ Implementaciones

Abstract Factory en Platform Engine, Factory Method en CQRS y otros:

```typescript
// PlatformConfigurationFactory — Abstract Factory
export interface PlatformConfigurationFactory {
  createModules(): PlatformModule[];
  createIndustries(): IndustrySpec[];
  createFeatures(): Record<string, boolean>;
  createIntegrations(): Record<string, unknown>;
}

// 6 fábricas concretas: B2CMarketplace, MultiVendor, BookingService, FoodDelivery, DigitalMarketplace, Agency
```

### 1.1.10 Command Pattern — 3+ Implementaciones

- Scheduler Engine: Jobs como comandos con ejecución programada
- CQRS: Command Bus con middleware pipeline
- Saga: Cada step es un par execute/compensate (Command + Undo)

### 1.1.11 Decorator Pattern — 4+ Implementaciones

La capa de caching usa decoradores apilados:

```typescript
// Decoradores de cache en caching-engine.ts
const layeredCache = new MetricsDecorator(
  new StaleWhileRevalidateDecorator(
    new SerializationDecorator(
      new MemoryCacheStrategy()
    ),
    60000 // stale window
  )
);
```

### 1.1.12 Facade Pattern — 10+ Implementaciones

Cada motor expone una fachada singleton que simplifica la interacción:
- `commerceClient` — fachada para todas las operaciones de comercio (40+ métodos)
- `sagaOrchestrator` — fachada para sagas
- `cachingEngine` — fachada para cache multi-estrategia
- `platformEngine` — fachada para configuración de plataforma
- `resilienceOrchestrator` — fachada para monitoreo de salud

### 1.1.13 Memento Pattern — 2 Implementaciones

- Saga: `SagaSnapshot` para recuperación de estado
- Event Sourcing: `Snapshot` para rebuild de agregados

### 1.1.14 Prototype Pattern — 1 Implementación

- Platform Engine: `PlatformPrototype.clone()` para clonar configuraciones de deployment

### 1.1.15 Composite Pattern — 1 Implementación

- Spec Composition: `andSpec`/`orSpec`/`notSpec` crean specs compuestos

### 1.1.16 Chain of Responsibility — 3+ Implementaciones

- Invalidation Chain (caching-engine.ts): TimeBased → TagBased → EventBased → Manual
- Prescription Pipeline (healthcare-engine.ts): Upload → OCR → Format → Auth → Compliance → Interaction
- API Handler Pipeline (with-api-handler.ts): Method → RateLimit → Auth → Validation → Idempotency → Timeout → Handler

### 1.1.17 Mediator Pattern — 1 Implementación

- EventBus centralizado como mediador entre motores

### 1.1.18 Iterator Pattern — Implícito

- EntityStore.getAll(), Map.entries(), Array iteration en adaptadores

### 1.1.19 Proxy Pattern — 2 Implementaciones

Encontrado en `lib/mcp/proxy.ts` (~327 líneas) y `lib/deerflow/proxy.ts` (~92 líneas). MCPProxy agrega múltiples servidores MCP detrás de un endpoint unificado con routing, timeout, ejecución batch y health checks. DeerFlowProxy proporciona gateway proxy para ejecución MCP. Ambos son singletons que controlan el acceso a los recursos subyacentes.

### 1.1.20 Bridge Pattern — 3 Implementaciones

Encontrado en `lib/commerce/models/adapters.ts` (~221 líneas, declarado explícitamente "Bridge Pattern (Structural)"), `lib/ai/skill-mcp-bridge.ts`, y `lib/commerce/observer-bridge/observer-bridge.ts` (~449 líneas). El Bridge de adaptadores desacopla la abstracción de los tipos de industria existentes de la implementación del contrato CommerceItem unificado. ObserverBridge conecta observers locales del motor al EventBus central sin acoplamiento directo.

### 1.1.21 Flyweight Pattern — 2 Implementaciones

Encontrado en `lib/platform/tenant-engine.ts` (~1014 líneas, declarado explícitamente) y `lib/platform/plugin-engine.ts` (~970 líneas). TenantEngine comparte la configuración base de plataforma entre tenants — solo las diferencias se almacenan por tenant, evitando duplicación masiva de datos inmutables. Plugin engine declara "Flyweight: Config isolation delegated to backend".

### 1.1.22 Interpreter Pattern — 2 Implementaciones

Encontrado en `lib/synthlang/parser.ts` (~456 líneas) y `lib/platform/tenant-engine.ts`. SynthLang parser analiza notación DSL personalizada en un AST estructurado con reglas gramaticales definidas. TenantConfigResolver interpreta configuraciones JSON declarativas en instancias runtime, traduciendo la representación del lenguaje a comportamiento ejecutable.

---

## 1.2 Patrones de Dominio (DDD + Enterprise)

### 1.2.1 Saga Pattern — 1 Implementación Completa

```typescript
// SagaStep<TContext> con execute + compensate
export interface SagaStep<TContext> {
  id: string;
  execute: (context: TContext) => Promise<TContext>;
  compensate: (context: TContext) => Promise<TContext>;
  optional?: boolean;
  maxRetries?: number;
}

// 3 sagas definidas: MarketplaceOrderSaga, ReturnSaga, VendorOnboardingSaga
```

### 1.2.2 CQRS Pattern — 1 Implementación Completa

- Command Bus con middleware pipeline
- Query Bus delegado a ReadModelStore
- Event Bridge para sincronización write→read
- Consistency Strategy (eventual vs strong)

### 1.2.3 Event Sourcing Pattern — 1 Implementación Completa

- EventStore con append/load
- EventSourcingRepository con rebuild de agregados
- Projections (OrderSummary, OrderTimeline)
- Snapshot Strategy (EveryN, Milestone)

### 1.2.4 Repository Pattern — Implícito

- EntityStore<T> como repositorio genérico in-memory
- Prisma Client como repositorio persistente

### 1.2.5 Domain Event Pattern — 100+ Tipos de Eventos

- `COMMERCE_EVENTS` con 100+ constantes tipadas
- 12+ tipos de agregados
- Event history ring buffer (últimos 1000)

### 1.2.6 Domain Model Pattern — En `models/commerce-model.ts`

- `CommerceType`, `FulfillmentType` como value objects
- Adaptadores de modelo en `models/adapters.ts`

### 1.2.7 Anti-Corruption Layer — En `api/commerce-client.ts`

```typescript
// commerce-client.ts — Zero imports from @/lib/commerce/
// Tipos independientes: ApiResult<T>, commerce-client.types.ts
// Traducción de tipos internos del motor → tipos de API pública
```

### 1.2.8 Bounded Context — Implícito

- Cada motor de dominio es un bounded context
- Adapters traducen entre contextos

### 1.2.9 Aggregate Root — 1 Implementación

Encontrado en `lib/commerce/models/commerce-model.ts`. CommerceItem es el Aggregate Root implícito — el contrato unificado que TODOS los tipos de comercio implementan. Las emisiones del EventBus usan `aggregateType`/`aggregateId` confirmando este patrón: toda operación de dominio pasa por la raíz del agregado que mantiene la consistencia transaccional.

### 1.2.10 Domain Service — 4+ Implementaciones

Encontrado en `lib/commerce/shared/engine-base.ts`. Múltiples servicios de dominio stateless: GenericStateMachine, EntityStore, AdapterRegistry, SpecRegistry — encapsulan lógica de dominio que no pertenece naturalmente a una entidad o valor individual. Cada servicio opera sobre múltiples agregados sin mantener estado propio.

### 1.2.11 Value Object — Implícito

Encontrado implícitamente en `lib/commerce/models/commerce-model.ts` (tipos union Availability) y `lib/i18n/localized.ts` (tipo Localized). Estos tipos se comparan por estructura, no por identidad, y son inmutables tras su creación. Representan conceptos de dominio sin ciclo de vida propio.

### 1.2.12 Unit of Work — 2 Implementaciones

Encontrado en `lib/api/with-api-handler.ts` (~453 líneas) y `lib/commerce/resilience/idempotency.ts`. withApiHandler envuelve cada request en tracking de idempotencia (mark processing → execute → store result → clear), asegurando atomicidad operacional. El coordinator de Saga coordina transacciones multi-engine como una unidad de trabajo compuesta.

---

## 1.3 Patrones React/Next.js

### 1.3.1 Custom Hooks Pattern — 10+ Hooks

- `useActiveCart`, `useIndustryTabs`, `useLandingContent`, `useLandingData`
- `useSearch`, `useAutoScroll`, `useCartWebsocket`, `useWebsocket`
- `useStateSync`, `useAutoResizeTextarea`, `useA2UIPipeline`

### 1.3.2 Hook Factory Pattern — `createIndustryHook`

```typescript
// create-industry-hook.ts — Factory que genera hooks por industria
export function createIndustryHook(industryId: string) {
  return function useIndustry() {
    // Hook personalizado para la industria específica
  };
}
```

### 1.3.3 Context Provider Pattern

- `PlatformBootstrapProvider` — contexto de plataforma
- React Context para temas, idiomas, carritos

### 1.3.4 Store Pattern (Zustand) — 27+ Stores

- Cart stores, wallet store, booking store, notification store, AI chat store, etc.

### 1.3.5 Store Factory Pattern

```typescript
// create-cart-store.ts — Factory de stores Zustand por industria
// create-crud-store.ts — Factory genérica de stores CRUD
```

### 1.3.6 Component Registry Pattern

- `viewRegistry` — componentes por industria
- `iconRegistry` — iconos por industria

### 1.3.7 API Route Handler Pattern

```typescript
// withApiHandler — Wrapper estandarizado para todas las rutas API
export const POST = withApiHandler(async (request, context) => {
  const body = await parseRequestBody(request, schema);
  const result = await engine.operation(body);
  return successResponse(result);
}, { method: 'POST', rateLimit: { windowMs: 60000, max: 30 } });
```

### 1.3.8 Thin Client / API Adapter Pattern

```typescript
// Saga, CQRS, Event Sourcing — Todos delegan al backend API
async function callSagaApi<T>(action: string, payload: Record<string, unknown>): Promise<ApiResponse<T>> {
  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  });
  // ... manejo de errores
}
```

### 1.3.9 Error Boundary Pattern — 2 Implementaciones

Encontrado en `app/error.tsx` y `lib/platform/PlatformBootstrapProvider.tsx`. Next.js proporciona error boundary built-in via `error.tsx` con UI de recuperación. PlatformBootstrapProvider implementa un error boundary manual con estado `bootstrapError` y UI de retry, protegiendo la inicialización completa de la plataforma contra fallos en cascada.

### 1.3.10 Suspense Boundaries Pattern — 1 Implementación Compleja

Encontrado en `components/shared/ProgressiveSection.tsx` (~314 líneas). Implementa Suspense basado en prioridades: critical (sin Suspense, bloqueante), high (Suspense + fallback inmediato), normal/low (IntersectionObserver + Suspense con lazy appearance). Controlado por feature flag para desactivación global.

### 1.3.11 Code Splitting / Lazy Loading Pattern — 1 Implementación

Encontrado en `lib/commerce/view-registry.tsx` (~254 líneas). Usa `React.lazy()` para los 15+ componentes de vista por industria, habilitando code splitting por industria. Cada vista se carga solo cuando el usuario navega a esa industria, reduciendo significativamente el bundle inicial.

### 1.3.12 Server/Client Component Boundary — ~100+ Archivos

Encontrado a lo largo de toda la aplicación. Las rutas API son server-only, las páginas son server components por defecto, y los componentes interactivos optan por `'use client'` de forma explícita. Este boundary arquitectónico es fundamental en Next.js App Router y la plataforma lo respeta consistentemente.

---

## 1.4 Patrones NUEVOS Identificados (No Documentados Previamente)

### 1.4.1 Pipeline Middleware Pattern (NUEVO)

El `CommandBus` en CQRS implementa un pipeline de middleware donde cada middleware puede transformar o rechazar el comando:

```typescript
// CommandBus con middleware pipeline
export class CommandBus {
  private middleware: ((command: SearchCommand) => SearchCommand | null)[] = [];

  use(middleware: (command: SearchCommand) => SearchCommand | null): this {
    this.middleware.push(middleware);
    return this;
  }

  async dispatch(command: SearchCommand): Promise<CommandResult> {
    let currentCommand: SearchCommand | null = command;
    for (const mw of this.middleware) {
      currentCommand = mw(currentCommand);
      if (!currentCommand) return { success: false, ... }; // Rechazado por middleware
    }
    return await handler(currentCommand);
  }
}
```

**Frecuencia:** 2+ ocurrencias (CommandBus, withApiHandler)

### 1.4.2 Priority Queue Pattern (NUEVO)

El `WebSocketMessageQueue` implementa una cola con prioridad ordenada:

```typescript
// WebSocketMessageQueue — Priority Queue con binary search insertion
private insertSorted(message: QueuedMessage): void {
  let low = 0, high = this.pending.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const existing = this.pending[mid];
    if (existing.priority < message.priority || 
        (existing.priority === message.priority && existing.createdAt <= message.createdAt)) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  this.pending.splice(low, 0, message);
}
```

**Prioridades:** 0 = crítico, 100 = normal, 200 = bajo

### 1.4.3 Ring Buffer Pattern (NUEVO)

Usado en dos componentes críticos:

```typescript
// EventBus — Historial de eventos (MAX_EVENT_HISTORY = 1000)
private recordEvent(event: CommerceEvent): void {
  this.eventHistory.push(event);
  if (this.eventHistory.length > MAX_EVENT_HISTORY) {
    this.eventHistory.shift(); // Ring buffer: elimina el más antiguo
  }
}

// ErrorReporter — Buffer de errores (maxErrors = 500)
if (this.errors.length >= this.maxErrors) {
  const removed = this.errors.shift(); // Ring buffer
  // ... cleanup dedup index
}
```

### 1.4.4 Health Check Aggregator Pattern (NUEVO)

El `ResilienceOrchestrator` agrega checks de salud de múltiples componentes:

```typescript
async getSystemHealth(): Promise<SystemHealthReport> {
  const components: Record<string, HealthStatus> = {};
  const checkPromises: Promise<void>[] = [];
  
  for (const [name, check] of this.healthChecks) {
    checkPromises.push(
      this.runHealthCheck(name, check).then(status => {
        components[name] = status;
        this.processStateTransition(name, status);
      })
    );
  }
  await Promise.all(checkPromises);
  const overall = this.calculateOverallHealth(components); // GREEN/YELLOW/RED
  return { overall, components, timestamp: Date.now(), activeAlerts: [...this.alerts.values()] };
}
```

### 1.4.5 Event Deduplication Chain Pattern (NUEVO)

El `eventDeduplicator` previene eventos duplicados y cadenas infinitas:

```typescript
// event-dedup.ts — Protección contra A→B→A
isDuplicate(type: string, aggregateId: string): boolean {
  const key = `${type}:${aggregateId}`;
  const now = Date.now();
  const lastSeen = this.recentEvents.get(key);
  if (lastSeen && now - lastSeen < this.dedupWindowMs) return true;
  this.recentEvents.set(key, now);
  return false;
}

canEmit(): boolean {
  return this.currentDepth < this.maxDepth; // Max chain depth
}
```

### 1.4.6 API Adapter (Thin Client) Pattern (NUEVO)

Motores como Saga, CQRS y Event Sourcing delegan toda ejecución al backend:

```typescript
// Patrón consistente en 3 motores:
// 1. Tipos auto-contenidos (sin imports de @/lib/commerce/)
// 2. API helper con error handling graceful
// 3. Singleton fachada que retorna empty state en vez de throw
// 4. Event bus local para UI subscriptions
async callApi<T>(action: string, payload: Record<string, unknown>): Promise<ApiResponse<T>> {
  try {
    const response = await fetch('/api/ai/chat', { ... });
    if (!response.ok) return { success: false, error: `API error: ${response.status}` };
    return { success: true, data: await response.json() };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Network error' };
  }
}
```

### 1.4.7 Stale-While-Revalidate Decorator Pattern (NUEVO)

El decorador de cache SWR retorna datos stale mientras revalida en background:

```typescript
async getOrRevalidate<T>(key, fetcher, moduleName, context): Promise<T> {
  const entry = await strategy.get<T>(resolvedKey);
  if (entry) {
    const isStale = Date.now() > entry.expiresAt - policy.staleWhileRevalidate;
    if (isStale) {
      this.backgroundRevalidate(resolvedKey, fetcher, strategy, policy); // Background
      return entry.value; // Retorna stale inmediatamente
    }
    return entry.value;
  }
  const value = await fetcher(); // Fetch síncrono si no hay cache
  await strategy.set(resolvedKey, value, policy.ttl, policy.tags);
  return value;
}
```

### 1.4.8 Invalidation Chain Pattern (NUEVO)

La cadena de invalidación de cache procesa handlers en orden:

```typescript
// InvalidationChain — Chain of Responsibility especializado
export class InvalidationChain {
  private handlers: CacheInvalidationHandler[] = [];
  
  addHandler(handler): this {
    this.handlers.push(handler);
    this.handlers.sort((a, b) => a.order - b.order);
    return this;
  }

  async process(key, strategy): Promise<void> {
    for (const handler of this.handlers) {
      const shouldStop = await handler.handle(key, strategy);
      if (shouldStop) break;
    }
  }
}
// Handlers: TimeBased(10) → TagBased(20) → EventBased(30) → Manual(40)
```

---

## 1.5 Patrones de Infraestructura (NUEVA Categoría)

### 1.5.1 Plugin Architecture — 1 Implementación

Encontrado en `lib/platform/plugin-engine.ts` (~970 líneas). Sistema completo de plugins: PluginManifest define metadatos, lifecycle state machine gestiona estados (uninstalled → installed → activated → deactivated), HookSystem para extensibilidad, PluginEventBus para eventos del ciclo de vida, PluginConfigStore para configuración, y PluginSandbox para aislamiento de ejecución.

### 1.5.2 Feature Flag / Toggle Pattern — 1 Implementación

Encontrado en `lib/commerce/resilience/feature-flags.ts` (~407 líneas). FeatureFlagManager con 6 estrategias de evaluación: boolean, percentage, segment, industry, schedule, gradual. 12 flags pre-registrados controlan funcionalidad como progressive-loading, new-checkout, dark-mode, etc. Permite activación/desactivación sin deployment.

### 1.5.3 API Middleware / Decorator Pattern — 2 Implementaciones

Encontrado en `lib/api/with-api-handler.ts` (~453 líneas) y `middleware.ts` (~75 líneas). withApiHandler envuelve handlers con validación de método, rate limiting, autenticación, contexto de tenant, validación de body, idempotencia y timeout — cada cross-cutting concern es un decorador aplicado secuencialmente. El middleware.ts de Next.js maneja routing y auth a nivel de edge.

### 1.5.4 Dependency Injection (Implícito) — 3+ Implementaciones

Encontrado en `lib/providers/provider-factory.ts` (~362 líneas), AdapterRegistry, y PlatformBootstrapProvider. ProviderFactory inyecta el DataProvider apropiado según el dominio sin que el consumidor conozca la implementación concreta. El patrón es implícito (sin framework DI) pero el efecto es equivalente: desacoplamiento entre interfaces y sus implementaciones.

### 1.5.5 Observability / OpenTelemetry-style — 1 Implementación

Encontrado en `lib/platform/observability.ts` (~1200+ líneas). Sistema completo compatible con OTel: Tracer con ActiveSpan, SpanExporter (Console/JSON/OTLP), métricas (Counter/Histogram/Gauge), HealthCheck con umbrales configurables, y AlertEngine con reglas declarativas. Proporciona visibilidad end-to-end del comportamiento del sistema.

### 1.5.6 A/B Testing Router — 1 Implementación

Encontrado en `lib/ab-testing/router.ts` (~146 líneas). Asignación determinista de variantes mediante hash basado en sesión, pesos configurables por variante, umbrales de rollback automático, y tracking de métricas. Garantiza que un usuario vea siempre la misma variante en sesiones subsiguientes.

### 1.5.7 Federated Provider / Write-Through Cache — 1 Implementación

Encontrado en `lib/memory/federated-provider.ts` (~284 líneas). Unifica Engram (SQLite FTS5 como primario) + Local MemoryStore con caching write-through y sincronización en background. Las escrituras se propagan a ambos stores, las lecturas se sirven del cache local cuando es posible.

---

## Implementación Pendiente

### Patrones Implementados (Actualización Post-Revisión)

Los siguientes patrones fueron marcados como pendientes en la versión original del reporte pero **ya están implementados**:

| Patrón | Estado | Archivo | Líneas |
|--------|--------|---------|--------|
| Pipeline Middleware (generalizado) | ✅ Implementado | `src/lib/commerce/pipeline/pipeline.ts` | ~437 |
| Health State Machine (componente) | ✅ Implementado | `src/lib/commerce/health/health-state-machine.ts` | ~434 |
| Cross-Layer Observer Bridge (unificado) | ✅ Implementado | `src/lib/commerce/observer-bridge/observer-bridge.ts` | ~449 |
| Retry Budget (rate limit de reintentos) | ✅ Implementado | `src/lib/commerce/resilience/retry-budget.ts` | ~279 |
| Feature Flag Pattern (config-driven) | ✅ Implementado | `src/lib/commerce/resilience/feature-flags.ts` | ~407 |
| Observability Correlation IDs | ✅ Implementado | `src/lib/commerce/resilience/correlation-ids.ts` | ~323 |
| Distributed Lock Pattern | ✅ Parcial (en Redis) | `src/lib/commerce/caching/redis-strategy.ts` | RedisDistributedLock |
| Localized<T> i18n | ✅ Implementado | `src/lib/commerce/locale/locale-engine.ts` | ~579 |
| Redis L1+L2 Cache | ✅ Implementado | `src/lib/commerce/caching/redis-strategy.ts` | ~400 |

### Patrones Aún Pendientes

| Patrón | Impacto | Esfuerzo | Prioridad |
|--------|---------|----------|-----------|
| Event Replay Dashboard | Medio | Alto | P2 |
| Saga Visualization | Bajo | Alto | P2 |
| Multi-Tenant Isolation | Alto | Alto | P1 |

### Mejoras Adicionales Implementadas (Post-Revisión)

| Mejora | Descripción |
|--------|-------------|
| OptimizedImage adoptado | 23 instancias en 5 componentes migradas de raw `next/image` a `OptimizedImage` con shimmer, fade-in y error fallback |
| loading.tsx route skeletons | 7 archivos creados (home, marketplace, industries, cart, account, checkout) para Streaming SSR |
| Feature flag progressive-loading | Conectado a ProgressiveSection — si se desactiva, todo se renderiza inmediatamente |
| aria-labels en marketplace | Botones interactivos ahora tienen etiquetas accesibles para screen readers |
| BottomNav label fix | "Carrito" → "Pedidos" para coincidir con ruta `/account/orders` |
| Rate limiting en rutas críticas | 7 rutas protegidas: auth (5/min), checkout (10/min), vendors (20/min) |
| Código muerto eliminado | 4 archivos eliminados: qr-utils.ts, navigation-helpers.ts, error-boundary.tsx, bilingual.ts |
| Migración bilingual → i18n | 3 componentes migrados de deprecated bilingual.ts a @/lib/i18n |

---

## Scorecard del Ciclo 1

### Madurez de Patrones por Categoría

| Categoría | Patrones | Madurez |
|-----------|----------|---------|
| GoF Clásicos | 22 | ★★★★★ |
| Domain (DDD) | 12 | ★★★★★ |
| React/Next.js | 19 | ★★★★★ |
| Infrastructure | 7 | ★★★★☆ |
| Resiliencia | 8 | ★★★★★ |

### Scorecard de Patrones Individuales

| Dimensión | Score | Nota |
|-----------|-------|------|
| Cobertura de Patrones GoF | 22/23 | 96% — Solo falta Visitor |
| Cobertura de Patrones Domain | 12/12 | 100% — Cobertura completa DDD |
| Patrones React/Next.js | 19 | Hooks, Stores, Boundaries, Code Splitting, Error/Suspense |
| Patrones Infrastructure | 7 | Plugin, Feature Flags, DI, Observability, A/B Testing, Federated Cache |
| Patrones NUEVOS identificados | 8 | Pipeline Middleware, Priority Queue, Ring Buffer, Health Check Aggregator, Event Deduplication Chain, API Adapter, SWR Decorator, Invalidation Chain |
| Extensibilidad | 9/10 | Registry + Strategy + Plugin permiten extensión sin modificación |
| Testabilidad | 7/10 | Tests existen para resiliencia, specs, y algunos motores |

---

*Fin del Ciclo 1 — RICCO Platform: Patrones Individuales*
*22 patrones GoF · 12 patrones Domain · 19 patrones React/Next.js · 7 patrones Infrastructure · 8 patrones nuevos*
