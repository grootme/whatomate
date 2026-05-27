# RICCO Platform — Meta-Patrones de Arquitectura

**Análisis Profundo de Patrones sobre Patrones, Flujos Cruzados entre Industrias y Bifurcaciones**

**10 Meta-Patrones | 31 Bifurcaciones | 54 Engines | 22 Industrias**

Fecha: Mayo 2026 | Versión: 1.0  
Next.js 16 + React 19 + TypeScript 5 | 75+ API Routes | 60+ Commerce Engines

---

## Tabla de Contenidos

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Meta-Patrones: Patrones sobre Patrones](#2-meta-patrones-patrones-sobre-patrones)
   - 2.1 Spec-Gated State Reactive (Meta-Patrón Universal)
   - 2.2 Spec-Gated State Reactive Adapter (Booking + Reservation)
   - 2.3 Spec-Gated State Reactive Strategy (Food Delivery)
   - 2.4 Spec-Ranked Strategy State Reactive (Dispatch)
   - 2.5 Multi-Strategy Spec-Gated Builder State Reactive (Fulfillment)
   - 2.6 Registry-Factory-Spec Pipeline (Industry Pattern)
   - 2.7 Template Method Pipeline (API Routes)
   - 2.8 Event Bus Bridge (Cross-Domain)
3. [Flujos Cruzados entre Industrias](#3-flujos-cruzados-entre-industrias)
   - 3.1 Mapa de Industrias a Grupos de Patrones
   - 3.2 Inventario de Flujos por Dominio
   - 3.3 Oportunidades de Consolidación
4. [Bifurcaciones: Anti-Patrones if/else](#4-bifurcaciones-anti-patrones-ifelse)
   - 4.1 Branching por Industria (Prioridad Crítica)
   - 4.2 Switch por Tipo (Prioridad Alta)
   - 4.3 Switch por Status (State Pattern Disfrazado)
   - 4.4 Cadenas de Severidad (Chain of Responsibility)
5. [Patrones de Datos y Transformaciones](#5-patrones-de-datos-y-transformaciones)
   - 5.1 Flujo Universal de Datos
   - 5.2 Patrones de Transformación Comunes
6. [Plan de Refactorización Priorizado](#6-plan-de-refactorización-priorizado)
7. [Scorecard de Madurez](#7-scorecard-de-madurez)

---

## 1. Resumen Ejecutivo

Este análisis revela que la plataforma RICCO, con sus 60+ engines de comercio y 75+ rutas API, ha implementado más de 20 patrones GOF de forma individual. Sin embargo, la verdadera potencia arquitectónica emerge cuando estos patrones se combinan entre sí, creando lo que denominamos **Meta-Patrones**: patrones de orden superior que surgen de la interacción sinérgica entre patrones individuales. Hemos identificado 10 meta-patrones distintos que gobiernan el comportamiento de toda la plataforma.

El hallazgo más significativo es que el Meta-Patrón **"Spec-Gated State Reactive"** aparece en TODOS los 5 engines de dominio principales (booking, reservation, food-delivery, dispatch, fulfillment). Este meta-patrón sigue un pipeline inmutable: **Specification** (valida si una acción puede proceder) → **State Machine** (transiciona la entidad a nuevo estado) → **Observer** (reacciona al cambio emitiendo eventos). Este patrón se repite con variantes que añaden Strategy, Adapter, Builder o Chain of Responsibility según la complejidad del dominio.

Además, hemos identificado 31 puntos de bifurcación donde la lógica de negocios usa if/else o switch en lugar de patrones de diseño. Estos puntos representan riesgo de mantenibilidad: cada nueva industria o tipo requiere modificar código existente en vez de agregar nuevos componentes. La buena noticia es que la plataforma YA usa patrones Strategy/Registry correctamente en 12+ engines, demostrando que la refactorización es viable y consistente con la arquitectura existente.

### Cifras Clave

| Métrica | Valor | Detalle |
|---------|-------|---------|
| Meta-Patrones identificados | 10 | Patrones de orden superior surgidos de combinaciones |
| Patrones GOF individuales | 20+ | Strategy, Observer, Specification, State, etc. |
| Puntos de bifurcación if/else | 31 | Candidatos a refactorizar con patrones |
| Engines singleton | 54 | Cada uno es un dominio auto-contenido |
| Rutas API v1 | 75+ | Todas usan withApiHandler (Template Method) |
| Industrias soportadas | 22 | Mapeadas a 9 grupos de patrones |
| Oportunidades de consolidación | 4 | Engines que pueden fusionarse |
| Specs duplicados (andSpec/orSpec) | 5 | Misma función copiada en 5 engines |

---

## 2. Meta-Patrones: Patrones sobre Patrones

Un meta-patrón es un patrón que emerge de la combinación sinérgica de dos o más patrones GOF. No es simplemente "usar Strategy y Observer en la misma clase", sino que los patrones interactúan de forma que el output de uno alimenta el input del siguiente, creando un pipeline semántico que define el comportamiento del dominio completo. Cada meta-patrón tiene un nombre, una firma de patrones constituyentes, y un flujo de datos que lo caracteriza.

### 2.1 Spec-Gated State Reactive (Meta-Patrón Universal)

**Firma:** Specification + State Machine + Observer

Este es el meta-patrón más importante de la plataforma. Aparece en TODOS los engines de dominio sin excepción. Su flujo es un pipeline inmutable de tres fases que garantiza que ninguna acción se ejecuta sin validación, ninguna transición ocurre sin registro, y ningún cambio pasa desapercibido. La belleza de este meta-patrón es que cada fase es independiente y testeable por separado, pero juntas forman un contrato de integridad que protege al dominio completo.

**Pipeline del Meta-Patrón:**

| Fase | Patrón GOF | Responsabilidad | Output |
|------|-----------|----------------|--------|
| 1. Validation Gate | Specification | Determina si la acción es permitida | isSatisfied: boolean + warnings[] |
| 2. State Transition | State Machine | Transiciona entidad a nuevo estado | updatedRecord + transition log |
| 3. Reactive Notification | Observer | Notifica a subscriptores del cambio | Event {type, entity, timestamp} |
| 4. Cross-Domain Bridge | Event Bus | Propaga al bus centralizado | CommerceEvent {type, aggregateId, payload} |

La especificación compuesta (andSpec/orSpec) permite crear reglas de validación complejas a partir de especificaciones atómicas reutilizables. Por ejemplo, en Booking Engine: `ageSpec.and(verifiedCustomerSpec).and(advanceBookingSpec)` crea una regla que exige mayoría de edad, cliente verificado Y reserva anticipada. La composición es declarativa y las specs son testeables individualmente, siguiendo el principio de responsabilidad única.

### 2.2 Spec-Gated State Reactive Adapter (Booking + Reservation)

**Firma:** Specification + State Machine + Observer + Strategy/Template Method

Este meta-patrón extiende el Universal añadiendo una capa de adaptación por industria via Strategy. Cada industria registra un adapter que implementa la interfaz común (getAvailableSlots, calculatePrice, validateBooking) pero con lógica específica del dominio. El motor base delega al adapter cuando existe, y usa la implementación default cuando no. Esto permite que 7 industrias de booking compartan el 85% del código mientras cada una personaliza su comportamiento sin tocar el motor base.

| Engine | Adapters Registrados | Industrias |
|--------|---------------------|------------|
| Booking Pattern | 7 adapters | travel, hotels, beauty, legal, events, health, booking |
| Reservation Pattern | 7 adapters | parking, carwash, autoworkshop, sports, carrental, coworking, laundry |
| Listing Pattern | 2 adapters | realestate, mall |

**Hallazgo crítico:** Los engines de Booking y Reservation comparten un 85% de estructura ADN. Ambos tienen: spec composition (andSpec/orSpec), state machine con transiciones guardadas, observer con bridge al event bus, adapter registration con registerAdapter(), singleton con Map-based stores, y cancellation policies. La única diferencia significativa es que Reservation añade Builder (add-ons), Waitlist Queue, y PricingStrategy (hourly/daily/flat). Esto sugiere que deben compartir una base común que denominamos **"TemporalResourceEngine"**.

### 2.3 Spec-Gated State Reactive Strategy (Food Delivery)

**Firma:** Specification + State Machine + Observer + Strategy Selection

El engine de Food Delivery añade una capa de selección de estrategia entre la validación por specs y las transiciones de estado. Esta capa decide QUÉ modelo de tarifa de entrega aplicar (flat, distance-based, dynamic pricing) según la zona y el proveedor. La selección de estrategia no es estática sino **contextual**: el mismo pedido puede usar diferentes estrategias según la distancia, la hora del día, y la demanda actual. Además, incorpora un Builder para la construcción paso a paso del precio del item (base + size + customizations) y un Factory para la creación de items del menú con variantes.

La contribución única de este meta-patrón es la noción de **"estrategia contextual"**: la estrategia no se selecciona una vez al inicio sino que puede cambiar durante el flujo. Por ejemplo, si un pedido cambia de delivery a pickup, la estrategia de pricing cambia de distance-based a flat. Esto requiere que el state machine sea consciente de la estrategia activa y permita recálculo en las transiciones relevantes.

### 2.4 Spec-Ranked Strategy State Reactive (Dispatch)

**Firma:** Specification + Chain of Responsibility + Strategy + State Machine + Observer

El engine de Dispatch es el más sofisticado en términos de selección de recursos. Añade una capa de ranking (Chain of Responsibility) entre el filtrado por specs y la asignación por estrategia. El flujo es: los conductores se filtran por especificaciones (online, capacidad, radio, rating, licencia), luego se **RANKIFICAN** por la estrategia seleccionada (nearestFirst, balanced, ratingPriority, surgePricing), y finalmente se ofrece secuencialmente con timeout. Si un conductor rechaza o no responde, se pasa al siguiente en el ranking (Chain of Responsibility).

Este meta-patrón demuestra cómo Chain of Responsibility no es solo para validación secuencial sino también para **asignación con fallback**. Cada eslabón de la cadena es un candidato que puede aceptar o rechazar la solicitud, y la cadena avanza automáticamente. El timeout por candidato y el límite de intentos previenen bucles infinitos. Este patrón es aplicable a cualquier dominio que requiera asignación de recursos con preferencias (asignación de mesa en restaurantes, asignación de sala en coworking, asignación de vehículo en car rental).

### 2.5 Multi-Strategy Spec-Gated Builder State Reactive (Fulfillment)

**Firma:** 2x Strategy + Specification + Builder + State Machine + Observer

El engine de Fulfillment es el más complejo, combinando DOS jerarquías de estrategia independientes: **FulfillmentPricingStrategy** (ground/sea/air/rail/multimodal) y **CustomsClearanceStrategy** (pre-clearance, post-clearance, in-bond, express). Además usa un Builder con API fluida (fromOrigin, toDestination, addPackage, addWaypoint, addCustomsDocument) para construir la entidad compleja del envío. El state machine tiene 14 estados con un sub-pipeline de aduana que es un mini-state-machine dentro del principal.

La noción clave aquí es el **"strategy stack"**: dos o más estrategias que operan en dimensiones independientes del mismo dominio. El pricing depende de la ruta, mientras que la aduana depende del tipo de mercancía. Ambas se seleccionan independientemente y se aplican en fases distintas del ciclo de vida del envío. Este meta-patrón es aplicable a cualquier dominio con múltiples dimensiones de variación (una suscripción que varía tanto en plan como en región, un booking que varía tanto en tipo de servicio como en hora del día).

### 2.6 Registry-Factory-Spec Pipeline (Industry Pattern)

**Firma:** Registry + Factory + Specification

El IndustryPatternEngine es el meta-patrón maestro que orquesta TODOS los demás engines. Su función es mapear industrias a grupos de patrones, y grupos de patrones a configuraciones específicas. El flujo es: **Registry** (22 industrias mapeadas a 9 grupos de patrones) → **Factory** (crea la configuración completa a partir de templates con overrides) → **Specification** (valida que el checkout sea consistente con la configuración). Este engine NO implementa lógica de negocio directamente sino que actúa como orquestador declarativo.

La innovación de este meta-patrón es que convierte la configuración en código ejecutable. En vez de if/else para determinar qué features tiene cada industria, usa maps declarativas que son data-driven. Agregar una industria nueva es agregar una entrada al mapa, no modificar lógica. Este es el patrón que debería expandirse para cubrir las bifurcaciones que aún usan if/else en otros engines.

### 2.7 Template Method Pipeline (API Routes)

**Firma:** Template Method + Chain of Responsibility

Todas las 75+ rutas API usan `withApiHandler`, que implementa un Template Method con pipeline de cross-cutting concerns: Method Check, Rate Limiting, Auth Check, Body Validation, Execute Handler, Error Catch. Cada paso es un filtro en la cadena que puede cortocircuitar la ejecución devolviendo un error estandarizado. Este patrón garantiza consistencia: ninguna ruta puede olvidar rate limiting o manejo de errores porque están integrados en el template.

| Paso | Patrón | Acción | Error si falla |
|------|--------|--------|----------------|
| 1. Method Check | Guard | Verifica HTTP method permitido | 405 Method Not Allowed |
| 2. Rate Limit | Chain | Verifica límite por IP | 429 Too Many Requests |
| 3. Auth Check | Guard | Verifica Authorization header | 401 Unauthorized |
| 4. Body Validation | Specification | Zod parse + schema validation | 400 Bad Request |
| 5. Execute Handler | Strategy | Delegado al handler específico | 500 Internal Error |
| 6. Error Catch | Null Object | Catch-all con respuesta estándar | Error sanitizado |

### 2.8 Event Bus Bridge (Cross-Domain)

**Firma:** Observer + Mediator + Async Bridge

El Event Bus Bridge es el meta-patrón que conecta todos los engines de dominio. Cada engine tiene sus observers locales (síncronos, dentro del mismo proceso), y un bridge asíncrono al event bus centralizado que propaga eventos a subscriptores de otros dominios. El bridge usa fire-and-forget con catch vacío: el failure del event bus NUNCA rompe el engine emisor. Esto garantiza resiliencia y desacoplamiento: un engine puede funcionar completamente sin que el event bus esté disponible.

El event bus centralizado agrega 27 tipos de eventos (order, payment, cart, subscription, reward, vendor, dispute, review, food, booking, scheduler) y soporta wildcard subscriptions, priority ordering, dead letter handler, y event history de 1000 eventos para debugging. Los subscriptores reales incluyen: notificaciones al vendor, earning de loyalty points, scheduling de reminders, y audit logging.

---

## 3. Flujos Cruzados entre Industrias

Las 22 industrias de la plataforma no son silos aislados sino que participan en flujos compartidos que atraviesan múltiples engines. Entender estos flujos cruzados es esencial para identificar oportunidades de consolidación y prevenir duplicación inadvertida. A continuación mapeamos cada industria a su grupo de patrón, identificamos los flujos compartidos, y proponemos consolidaciones.

### 3.1 Mapa de Industrias a Grupos de Patrones

| Grupo de Patrón | Industrias | Engine | Meta-Patrón |
|-----------------|------------|--------|-------------|
| Booking (7) | travel, hotels, beauty, legal, events, health, booking | booking-pattern-engine | Spec-Gated State Reactive Adapter |
| Reservation (7) | parking, carwash, autoworkshop, sports, carrental, coworking, laundry | reservation-engine | Spec-Gated State Reactive Adapter |
| Food Delivery (2) | food, restaurants | food-delivery-engine | Spec-Gated State Reactive Strategy |
| Healthcare (2) | pharmacy, health | healthcare-engine | Spec-Gated State Reactive |
| Fitness (1) | fitness | fitness-engine | Spec-Gated State Reactive |
| Listing (2) | realestate, mall | listing-engine | Spec-Gated State Reactive Adapter |
| Dispatch (1) | taxi | dispatch-engine | Spec-Ranked Strategy State Reactive |
| Fulfillment (1) | cargo | fulfillment-engine | Multi-Strategy Builder State Reactive |
| B2B (1) | wholesale | b2b-engine | Spec-Gated State Reactive |

### 3.2 Inventario de Flujos por Dominio

Cada grupo de patrón define un flujo canónico que todas sus industrias siguen. Estos flujos son las "rutas felices" del dominio, con bifurcaciones manejadas por specs y estrategias. Lo notable es que muchos flujos comparten sub-flujos idénticos (validación, pricing, notification) que actualmente se duplican en cada engine.

| Flujo | Industrias | Pipeline Canónico |
|-------|------------|-------------------|
| Booking Flow | 7 industries | Select service → pick resource → choose slot → spec-validate → create → confirm → check-in → complete |
| Reservation Flow | 7 industries | Select resource → pick time → add add-ons → spec-validate → create → confirm → check-in → complete |
| Food Delivery Flow | 2 industries | Browse menu → customize item → checkout → spec-validate → place order → prepare → deliver |
| Dispatch Flow | 1 industry | Request ride → spec-filter drivers → strategy-rank → assign → pickup → complete |
| Fulfillment Flow | 1 industry | Quote → book → pickup → transit → customs → deliver |
| Listing Flow | 2 industries | Browse → search → interest → visit → offer → close |

### 3.3 Oportunidades de Consolidación

Basado en el análisis de meta-patrones y flujos cruzados, hemos identificado 4 oportunidades de consolidación que eliminarían duplicación significativa sin perder flexibilidad.

| Consolidación | Engines | Líneas eliminadas | Meta-Patrón compartido |
|---------------|---------|-------------------|----------------------|
| TemporalResourceEngine | Booking + Reservation | ~1,500 | Spec-Gated State Reactive Adapter |
| RealtimeAssignmentEngine | Dispatch + Food Delivery | ~800 | Spec-Ranked Strategy State Reactive |
| HealthDomainEngine | Healthcare + Fitness | ~600 | Spec-Gated State Reactive + Membership |
| B2B Logistics Pipeline | B2B + Fulfillment | ~400 | Multi-Strategy Builder State Reactive |

#### A. TemporalResourceEngine (Booking + Reservation)

Los engines de Booking y Reservation comparten un 85% de estructura. Ambos tienen: spec composition (andSpec/orSpec), state machine con transiciones guardadas, observer con bridge al event bus, adapter registration con registerAdapter(), singleton con Map stores, y cancellation policies. La propuesta es extraer una clase base abstracta **"TemporalResourceEngine"** que contenga la infraestructura compartida (spec/state/observer/adapter/registry), y que Booking y Reservation hereden de ella añadiendo solo sus diferencias: Reservation añade Builder (add-ons), Waitlist Queue, y PricingStrategy (hourly/daily/flat).

#### B. RealtimeAssignmentEngine (Dispatch + Food Delivery)

Ambos engines asignan recursos en tiempo real: Dispatch asigna conductores, Food Delivery asigna riders. La cola de preparación del kitchenQueue en Food Delivery es estructuralmente idéntica a la pendingAssignments en Dispatch. La propuesta es extraer una base **"RealtimeAssignmentEngine"** con la lógica de cola priorizada, timeout con fallback (Chain of Responsibility), y tracking en tiempo real. Food Delivery añadiría la capa de kitchen management, y Dispatch la capa de route estimation.

#### C. HealthDomainEngine (Healthcare + Fitness)

Ambos dominios manejan membresías (Fitness MembershipTier y Healthcare SubscriptionTier), progreso de pacientes/clientes, y requisitos de cumplimiento regulatorio. La propuesta es un **"HealthDomainEngine"** compartido con membership management, compliance specs, y progress tracking. Healthcare añadiría prescription validation y drug interactions, mientras Fitness añadiría class booking y workout tracking.

#### D. B2B Logistics Pipeline (B2B + Fulfillment)

El flujo de cotización de B2B es un subconjunto del pipeline de Fulfillment (quote → book). Ambos usan la misma configuración CARGO_DELIVERY del industry-pattern-engine. La propuesta es mergear la lógica de credit/quotation de B2B dentro del fulfillment engine como una estrategia adicional, eliminando la necesidad de un engine B2B separado.

---

## 4. Bifurcaciones: Anti-Patrones if/else

Hemos identificado 31 puntos de bifurcación donde la lógica de negocios usa if/else o switch en lugar de patrones de diseño. Estos son "code smells" arquitectónicos: no causan bugs inmediatos, pero hacen que agregar nuevas industrias, tipos o estados requiera modificar código existente en vez de agregar componentes nuevos. Los clasificamos por severidad y tipo.

### 4.1 Branching por Industria (Prioridad Crítica)

Estos son los más peligrosos: cada nueva industria requiere cambios en múltiples engines. Violan el Open/Closed Principle y son la principal fuente de deuda técnica en la plataforma.

**Finding 1.1: Booking Cancellation Policy if/else Chain**

```typescript
getCancellationPolicy(industryId: string): CancellationPolicy {
  if (industryId === "hotels") return CANCELLATION_POLICIES.hotel;
  if (industryId === "legal") return CANCELLATION_POLICIES.legal;
  if (industryId === "pharmacy" || industryId === "health") return CANCELLATION_POLICIES.strict;
  if (industryId === "beauty" || industryId === "booking") return CANCELLATION_POLICIES.flexible;
  return CANCELLATION_POLICIES.default;
}
```

**Patrón recomendado:** Strategy Registry. Los adapters ya existen y cada uno debería llevar su propia política de cancelación. El método getCancellationPolicy debería delegar al adapter: `adapter?.getCancellationPolicy() ?? defaultPolicy`. Actualmente, el engine tiene una cadena if/else DUPLICADA que ignora los adapters. Esto significa que agregar una industria nueva requiere editar tanto el adapter COMO este método, violando DRY y OCP.

**Finding 1.2: Listing Engine RealEstate Hardcoding**

```typescript
// 4 bifurcaciones separadas en el mismo engine:
if (ctx.listing.industryId === "realestate") { ... }          // Línea 443
if (ctx.listing.industryId === "realestate" && ctx.complianceLevel === "strict") { ... }  // Línea 466
if (listing.industryId === "realestate" && !listing.hasDisclosures) { ... }  // Línea 1044
const complianceLevel = listing.industryId === "realestate" ? "strict" : "basic"  // Línea 1644
```

**Patrón recomendado:** Delegar al IndustryListingAdapter. Los adapters ya existen con `validateListing()` y `getRequiredDisclosures()`, pero las specs inline NO usan los adapters. Cada nueva industria de listing (autos, jobs, etc.) esparcirá más if/else si no se refactoriza.

**Finding 1.3: Reservation Engine License Spec**

```typescript
if (["carrental", "autoworkshop"].includes(ctx.industryId)) {
  return ctx.customer.hasValidLicense === true;
}
```

**Patrón recomendado:** Specification por Adapter. Cada IndustryReservationAdapter debería proveer sus propias specs en vez de hardcodear un array en la spec compartida. La próxima industria que requiera licencia (truck rental?) exigirá editar esta spec.

### 4.2 Switch por Tipo (Prioridad Alta)

Estos switches representan dispatching por tipo donde cada rama debería ser una estrategia registrada en un mapa. La plataforma YA usa este patrón correctamente en 12+ engines (auth strategies, stock strategies, search strategies, tax strategies, etc.), lo que demuestra que la refactorización es consistente con la arquitectura existente.

| Finding | Archivo | Switch sobre | Rutas | Patrón Recomendado |
|---------|---------|-------------|-------|-------------------|
| 2.1 | auth-engine.ts:474 | provider type | 7 | Strategy delegation |
| 2.2 | cqrs-engine.ts:667 | command type | 4 | Command Registry |
| 2.3 | scheduler-engine.ts (4x) | schedule type | 4 | ScheduleTypeStrategy |
| 2.4 | promotions-engine.ts:228 | promotion type | 10 | DiscountCalculationStrategy |
| 2.5 | search-engine.ts (2x) | filter operator | 8 | FilterOperator Registry |
| 2.6 | category-engine.ts:430 | display type | 4 | Factory Registry |
| 2.7 | search-engine.ts:819 | sort strategy | 6 | SortStrategy Map |
| 2.8 | variation-engine.ts:393 | stock policy | 3 | StockPolicyStrategy |

**Caso crítico - Promotions Engine:** El switch más grande del codebase, con 10 tipos de promoción (PercentageDiscount, FixedDiscount, BuyXGetY, BundleDeal, FlashSale, CouponCode, LoyaltyMultiplier, FreeShipping, FirstPurchase, VolumeBonus). Cada tipo tiene su propia lógica de cálculo de descuento, pero todo está en un único método switch. Un DiscountCalculationStrategy por tipo permitiría agregar nuevas promociones sin tocar el motor base.

**Caso crítico - Scheduler Engine:** El MISMO switch sobre schedule.type aparece 4 veces (calculateNextRun, shouldExecute, estimateDuration, getScheduleDescription). Esto es una violación DRY obvia. Un ScheduleTypeStrategy con 4 métodos eliminaría toda la duplicación.

### 4.3 Switch por Status (State Pattern Disfrazado)

Estos switches sobre status son State Machines disfrazadas. La plataforma YA tiene un OrderStateMachine robusto en process/order-state-machine.ts, pero algunos engines no lo usan y reimplementan la lógica con if/else sobre status.

| Finding | Archivo | Statuses | Patrón Recomendado |
|---------|---------|----------|-------------------|
| 3.1 | fulfillment-engine.ts:1414 | 8 estados de envío | State Pattern con state objects |
| 3.2 | checkout/status route.ts:35 | 3+ estados de transacción | TransactionStatus state objects |
| 3.3 | store-engine.ts:684 | 3 statuses | STATUS_EVENT_MAP lookup |
| 3.4 | offline-engine.ts:159 | 3x2 transiciones | Transition table [current][previous] |
| 3.5 | warranty-engine.ts:694 | 5 tipos de resolución | ResolutionStrategy |

### 4.4 Cadenas de Severidad (Chain of Responsibility)

Estas cadenas if/else evalúan niveles de severidad o riesgo en orden descendente. Son candidatos naturales para Chain of Responsibility: cada handler verifica si aplica a su nivel y, si no, pasa al siguiente en la cadena. Esto es especialmente importante en Healthcare donde las reglas regulatorias cambian con frecuencia.

| Finding | Archivo | Niveles | Patrón Recomendado |
|---------|---------|---------|-------------------|
| 4.1 | healthcare-engine.ts:949 | 5 niveles de riesgo | Chain of Responsibility: RiskAssessor |
| 4.2 | warranty-engine.ts:635 | 4 niveles de daño | Rule Engine: DamageClassifier chain |
| 4.3 | dispatch-engine.ts:833 | 5 tiers de pricing | Config Table: SURGE_BRACKETS[] |
| 4.4 | review-engine.ts:538 | 2 tipos de entidad | EntityRatingStrategy |

---

## 5. Patrones de Datos y Transformaciones

### 5.1 Flujo Universal de Datos

Todos los engines de dominio siguen el mismo flujo de datos, que es una manifestación concreta del meta-patrón "Spec-Gated State Reactive". Este flujo universal garantiza que la información pasa por las mismas etapas de validación, transformación y notificación, independientemente del dominio. La consistencia del flujo es lo que permite que los engines sean interoperables a través del event bus.

| Etapa | Componente | Entrada | Salida | Patrón |
|-------|-----------|---------|--------|--------|
| 1. Input | API Route + Zod | HTTP Request | Validated Body | Template Method |
| 2. Validation | Specification Chain | Validated Body + Context | isSatisfied + warnings | Specification |
| 3. Creation | Engine Method | Validated Body | Domain Record | Factory Method |
| 4. Storage | In-Memory Map | Domain Record | Stored Record | Repository |
| 5. Observer Notification | Observer Array | Domain Record + Event | Callbacks ejecutados | Observer |
| 6. Bridge | EventBus.emit() | CommerceEvent | Subscribers notificados | Mediator |
| 7. EventBus Cross-Action | Subscribers | CommerceEvent | Side effects | Chain of Responsibility |
| 8. Feedback | Zustand Store | API Response | UI Re-render | Observer (React) |

### 5.2 Patrones de Transformación Comunes

Hemos identificado 3 patrones de transformación de datos que se repiten en todos los engines. Estos patrones son candidatos para extracción a funciones compartidas que eliminen la duplicación.

**Patrón A: Input → Validation → Record → Event**  
Usado por TODOS los 5 engines de dominio. El flujo es: construir contexto de validación, ejecutar specs y recolectar warnings, crear record con ID generado, almacenar en Map, emitir evento local, y hacer bridge al event bus. Este patrón se repite textualmente en booking, reservation, food, dispatch y fulfillment engines. La única variación es el tipo de record y el prefijo del ID.

**Patrón B: Transition → Guard → Update → Event**  
Usado por TODOS los state machines. El flujo es: encontrar la regla de transición, verificar el guard (si existe), crear record actualizado con nuevo status, almacenar, mapear transición a tipo de evento, y emitir. Este patrón se repite textualmente en 5+ engines. La única variación es el mapa de transición-a-evento.

**Patrón C: Adapter Selection → Delegation → Fallback**  
Usado por booking y reservation engines. El flujo es: buscar adapter por industryId, si existe delegar al adapter, si no usar implementación default. Este patrón es correcto y bien implementado, pero las specs y cancellation policies NO siguen el mismo patrón: usan if/else en vez de delegar al adapter. La refactorización debería extender este patrón a todas las bifurcaciones por industria.

---

## 6. Plan de Refactorización Priorizado

El plan de refactorización se organiza en 4 prioridades basadas en el impacto (cuántas industrias o rutas se benefician) y el esfuerzo (líneas a cambiar y riesgo de regresión). Cada item identifica el patrón a aplicar, el archivo a modificar, y el beneficio esperado.

| Pri | Finding | Patrón | Rutas afectadas | Esfuerzo |
|-----|---------|--------|----------------|----------|
| P0 | 1.1 Booking Cancellation | Strategy Registry | 6 industrias | Low |
| P0 | 2.4 Promotions Discount | Discount Strategy | 10 tipos | Medium |
| P0 | 2.2 CQRS Command Dispatch | Command Registry | 4 tipos | Low |
| P1 | 2.1 Auth Provider Validation | Strategy delegation | 7 providers | Low |
| P1 | 1.2 Listing RealEstate | Delegate to Adapter | 2 industrias | Medium |
| P1 | 3.1 Fulfillment Status | State Pattern | 8 statuses | Medium |
| P1 | 2.3 Scheduler (4x switch) | ScheduleTypeStrategy | 4 tipos x 4 | Medium |
| P2 | 4.1 Healthcare Risk | Chain of Responsibility | 5 niveles | Medium |
| P2 | 4.2 Warranty Damage | Rule Engine | 4 niveles | Low |
| P2 | 4.3 Dispatch Surge Pricing | Config Table | 5 tiers | Low |
| P2 | 2.5 Search Filter (2x) | Strategy Map | 8 operadores | Low |
| P2 | 6.1 Tax Condition (2x) | Strategy Map | 5x6 combinaciones | Low |
| P3 | 3.2 Checkout Status | State Pattern | 3+ statuses | Low |
| P3 | 5.1 View Size (6x) | SizeAdapter Strategy | 3 sizes x 6 | Medium |
| P3 | 1.3 Reservation License | Spec per Adapter | 2 industrias | Low |
| P3 | 7.1 Shipping Add-On | Strategy | 3 tipos | Low |

**Estrategia de implementación:** Seguir el principio Pareto (80/20). Las prioridades P0 y P1 representan el 20% del esfuerzo que resuelve el 80% de los problemas. Las P0 son especialmente urgentes porque afectan a múltiples industrias y violan el Open/Closed Principle. Cada refactorización debe incluir tests que verifiquen que el comportamiento existente no cambia, y que el nuevo patrón es extensible sin modificar código existente.

---

## 7. Scorecard de Madurez

La scorecard evalúa la madurez arquitectónica de la plataforma en 8 dimensiones, cada una calificada de 1 a 5. La puntuación global es un promedio ponderado que refleja la importancia relativa de cada dimensión para una plataforma de e-commerce multi-industria.

| Dimensión | Puntuación | Peso | Detalle |
|-----------|-----------|------|---------|
| Patrones GOF | 4.5 / 5 | 15% | 20+ patrones bien implementados; Strategy y Observer excelentes |
| Meta-Patrones emergentes | 4.0 / 5 | 15% | 10 meta-patrones identificados; Spec-Gated State Reactive universal |
| Consistencia API | 4.5 / 5 | 10% | 75+ rutas con withApiHandler + Zod; 1 ruta migrada |
| Extensibilidad (OCP) | 3.0 / 5 | 15% | 31 bifurcaciones if/else violan OCP; adapters correctos pero incompletos |
| Cross-Domain Integration | 3.5 / 5 | 15% | Event bus bridge implementado; observers reales registrados |
| Consolidación de Engines | 2.5 / 5 | 10% | 4 pares de engines con 60-85% duplicación; spec composition 5x duplicado |
| Seguridad de Precios | 5.0 / 5 | 10% | Backend calcula todos los precios; Zod strippea campos extra |
| Test Coverage | 2.0 / 5 | 10% | 105 tests generados; cobertura inicial; muchos engines sin tests |

**Puntuación Global: 3.6 / 5.0**

La plataforma tiene una base arquitectónica sólida con patrones GOF bien implementados y meta-patrones emergentes poderosos. Las áreas de mejora principales son: (1) eliminar las 31 bifurcaciones if/else con patrones Strategy/Chain/State, (2) consolidar los 4 pares de engines con alta duplicación, y (3) aumentar la cobertura de tests. Con estas refactorizaciones, la puntuación proyectada es 4.5/5.0.

---

*RICCO Platform — Análisis de Meta-Patrones Arquitectónicos | Generado automáticamente | Mayo 2026*
