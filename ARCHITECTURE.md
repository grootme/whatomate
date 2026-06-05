# Arquitectura de la Plataforma Whatomate Intelligence

> Diagrama Entidad-Relación y documentación de la arquitectura del sistema de inteligencia.

---

## Diagrama Entidad-Relación (ER)

```mermaid
erDiagram
    %% ============================================================
    %% ENTIDADES CORE - Configuración y Taxonomía
    %% ============================================================

    View {
        string id PK
        string label
        string icon
        string group
    }

    Severity {
        string level PK
        string label
        string badge
        string border
        string bg
        string icon
        int points
        int order
    }

    RiskLevel {
        string level PK
        string label
        string labelEs
        string color
        string bg
        string border
        string icon
        float minScore
    }

    DNALayer {
        string id PK
        string name
        string nameEs
        string color
        string bg
        string icon
        string description
    }

    MissionGroup {
        string id PK
        string name
        string shortName
        string icon
        string description
        json categories
        json thresholds
        json weights
    }

    PatternType {
        string id PK
        string label
        string labelEs
        string sequence
        json keywords
        string icon
    }

    Strategy {
        string id PK
        string name
        string nameEs
        string icon
        string description
        string color
    }

    AgentStatus {
        string status PK
        string label
        string color
        string bg
        string icon
    }

    %% ============================================================
    %% ENTIDADES OPERACIONALES - Datos en Tiempo Real
    %% ============================================================

    Alert {
        string id PK
        string groupId FK
        string severity FK
        string title
        string description
        datetime timestamp
        string category
        float riskScore
        boolean acknowledged
    }

    Event {
        string id PK
        string eventType
        json payload
        string source
        datetime timestamp
        string correlationId
    }

    IntelligenceReport {
        string id PK
        string groupId FK
        datetime generatedAt
        string period
        string summary
        float riskScore
        string riskLevel FK
    }

    MonitoringRule {
        string id PK
        string name
        string field
        string operator
        string value
        string severity FK
        boolean enabled
    }

    Agent {
        string id PK
        string name
        string status FK
        datetime lastActivity
        string missionGroupId FK
    }

    ConsensusVote {
        string agentId FK
        string groupId FK
        string vote
        datetime timestamp
    }

    %% ============================================================
    %% RELACIONES - Grupo de Misión (Centro del Dominio)
    %% ============================================================

    MissionGroup ||--o{ Alert : "genera alertas"
    MissionGroup ||--o{ MonitoringRule : "define reglas de monitoreo"
    MissionGroup ||--o{ Agent : "asigna agentes"
    MissionGroup ||--o{ ConsensusVote : "recibe votos de consenso"
    MissionGroup ||--o{ IntelligenceReport : "produce informes"

    %% ============================================================
    %% RELACIONES - Alerta y Severidad
    %% ============================================================

    Alert }o--|| Severity : "tiene severidad"
    Alert }o--|| RiskLevel : "tiene nivel de riesgo"

    %% ============================================================
    %% RELACIONES - Estrategia y Procesamiento
    %% ============================================================

    Strategy ||--o{ MissionGroup : "procesa grupo de misión"
    Strategy ||--o{ Alert : "produce alertas"
    PatternType }o--o{ Strategy : "detectado por estrategia"

    %% ============================================================
    %% RELACIONES - Capas DNA (Flujo Pipeline)
    %% ============================================================

    DNALayer ||--o| DNALayer : "alimenta capa siguiente"

    %% ============================================================
    %% RELACIONES - Agente y Consenso
    %% ============================================================

    Agent }o--|| MissionGroup : "pertenece a grupo"
    Agent ||--o{ ConsensusVote : "emite votos"
    Agent }o--|| AgentStatus : "tiene estado"

    %% ============================================================
    %% RELACIONES - Informe de Inteligencia
    %% ============================================================

    IntelligenceReport }o--|| MissionGroup : "cubre grupo"
    IntelligenceReport }o--o{ Alert : "incluye alertas"

    %% ============================================================
    %% RELACIONES - Monitoreo
    %% ============================================================

    MonitoringRule }o--|| Severity : "clasifica severidad"

    %% ============================================================
    %% RELACIONES - Eventos (Event Sourcing)
    %% ============================================================

    Event }o--o| Alert : "referencia por correlationId"
    Event }o--o| Agent : "referencia por correlationId"
    Event }o--o| MissionGroup : "referencia por correlationId"
    Event }o--o| Strategy : "referencia por correlationId"

    %% ============================================================
    %% RELACIONES - Vista (Navegación)
    %% ============================================================

    View }o--o| Alert : "muestra"
    View }o--o| MissionGroup : "muestra"
    View }o--o| Agent : "muestra"
    View }o--o| IntelligenceReport : "muestra"
    View }o--o| Strategy : "muestra"
    View }o--o| DNALayer : "muestra"
```

---

## Diagrama de Flujo del Pipeline DNA

```mermaid
flowchart LR
    L1["🟢 Capa 1<br/>Ingestión<br/>(Ingestion)"] --> L2["🔵 Capa 2<br/>Análisis<br/>(Analysis)"]
    L2 --> L3["🟡 Capa 3<br/>Monitoreo<br/>(Monitoring)"]
    L3 --> L4["🔴 Capa 4<br/>Informes<br/>(Reports)"]

    L1 -.->|OSINT / WhatsApp / Telegram| E[Event]
    E --> L2
    L2 -->|patrones detectados| S[Strategy]
    S -->|señales| A[Alert]
    L3 -->|reglas activas| A
    L4 -->|período| R[IntelligenceReport]
```

---

## Diagrama de Relaciones Centrado en MissionGroup

```mermaid
flowchart TB
    subgraph MG["Grupo de Misión (MissionGroup)"]
        direction TB
        MG_CORE["🎯 MissionGroup<br/><i>Entidad Central del Dominio</i>"]
    end

    subgraph AGENTS["Agentes"]
        direction TB
        AG["🤖 Agent"]
        CV["🗳️ ConsensusVote"]
        AS["📊 AgentStatus"]
    end

    subgraph ALERTS["Alertas y Monitoreo"]
        direction TB
        AL["🚨 Alert"]
        MR["📋 MonitoringRule"]
        SE["⚡ Severity"]
        RL["🎯 RiskLevel"]
    end

    subgraph INTEL["Inteligencia"]
        direction TB
        IR["📄 IntelligenceReport"]
        ST["🧠 Strategy"]
        PT["🔍 PatternType"]
    end

    subgraph DNA["Pipeline DNA"]
        direction LR
        DL1["🟢 Ingestión"]
        DL2["🔵 Análisis"]
        DL3["🟡 Monitoreo"]
        DL4["🔴 Informes"]
        DL1 --> DL2 --> DL3 --> DL4
    end

    subgraph EVENTS["Event Sourcing"]
        direction TB
        EV["📡 Event"]
    end

    MG_CORE -->|"asigna"| AG
    MG_CORE -->|"genera"| AL
    MG_CORE -->|"define"| MR
    MG_CORE -->|"produce"| IR
    MG_CORE -->|"recibe"| CV

    AG -->|"emite"| CV
    AG -->|"tiene"| AS
    AL -->|"clasifica"| SE
    AL -->|"evalúa"| RL
    ST -->|"procesa"| MG_CORE
    ST -->|"produce"| AL
    PT -->|"detectado por"| ST
    IR -->|"incluye"| AL

    EV -.->|"correlaciona"| AL
    EV -.->|"correlaciona"| AG
    EV -.->|"correlaciona"| MG_CORE
```

---

## Violaciones Identificadas y Transformaciones

### Resumen de Violaciones

| # | Violación | Ubicaciones Afectadas | Severidad | Impacto |
|---|-----------|----------------------|-----------|---------|
| V1 | **Entidad de Navegación fragmentada** | `navItems`, `iconMap`, `viewTitles` (3 registros) | 🔴 CRÍTICA | Inconsistencia en UI, datos duplicados sin fuente única de verdad |
| V2 | **Entidad Severity fragmentada** | 6 ubicaciones dispersas | 🔴 CRÍTICA | Severidades inconsistentes, badges/colores diferentes por vista |
| V3 | **Límites de nivel de riesgo inconsistentes** | 3 archivos con umbrales contradictorios | 🟠 ALTA | Cálculos de riesgo erróneos, alertas mal clasificadas |
| V4 | **Metadatos de patrón divididos** | 5 archivos con definiciones parciales de PatternType | 🟠 ALTA | Patrones no detectados, keywords duplicadas o faltantes |
| V5 | **Configuración de AgentStatus duplicada** | 4 lugares con definiciones de estado de agente | 🟡 MEDIA | Estados visuales diferentes, comportamiento impredecible |

### Detalle de Violaciones

#### V1: Fragmentación de Entidad de Navegación

```
ANTES (Fragmentado):
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│    navItems      │  │    iconMap      │  │   viewTitles    │
│─────────────────│  │─────────────────│  │─────────────────│
│ id: "dashboard" │  │ dashboard: 🏠   │  │ dashboard:      │
│ id: "monitoring"│  │ monitoring: 📡  │  │  "Panel"        │
│ id: "strategies"│  │ strategies: 🧠  │  │ monitoring:     │
│      ...        │  │      ...        │  │  "Monitoreo"    │
└─────────────────┘  └─────────────────┘  └─────────────────┘
         ↕ sin relación explícita ↕

DESPUÉS (Unificado):
┌─────────────────────────────────────────┐
│              View                        │
│─────────────────────────────────────────│
│ id: "dashboard"                         │
│ label: "Panel"                          │
│ icon: "🏠"                              │
│ group: "intelligence"                   │
│─────────────────────────────────────────│
│ id: "monitoring"                        │
│ label: "Monitoreo"                      │
│ icon: "📡"                              │
│ group: "intelligence"                   │
└─────────────────────────────────────────┘
```

#### V2: Fragmentación de Entidad Severity

```
ANTES (6 ubicaciones):
📁 alerts-view.tsx     → const CRITICAL = { color: "red", ... }
📁 monitoring-view.tsx → const CRITICAL = { color: "#ff0000", ... }
📁 sidebar.tsx         → const SEVERITIES = { critical: { ... } }
📁 alert-workflow.ts   → const SEVERITY_MAP = { ... }
📁 notification.ts     → const SEVERITY_LABELS = { ... }
📁 mock-data.ts        → const severityConfig = { ... }

DESPUÉS (1 fuente de verdad):
📁 specs.ts → export const SEVERITY_LEVELS: Severity[] = [
   { level: "CRITICA", label: "Crítica", badge: "destructive", ... },
   { level: "ALTA",    label: "Alta",    badge: "warning",     ... },
   { level: "MEDIA",   label: "Media",   badge: "default",     ... },
   { level: "BAJA",    label: "Baja",    badge: "secondary",   ... },
   { level: "INFO",    label: "Info",    badge: "outline",     ... },
]
```

#### V3: Límites de Nivel de Riesgo Inconsistentes

```
ANTES (3 archivos, umbrales contradictorios):
📁 risk-matrix/route.ts  → critical: >= 80
📁 threat-level.ts       → critical: >= 75
📁 analysis-engine.ts    → critical: >= 85

DESPUÉS (1 definición canónica):
📁 specs.ts → export const RISK_LEVELS: RiskLevel[] = [
   { level: "low",      minScore: 0,  ... },
   { level: "moderate", minScore: 25, ... },
   { level: "high",     minScore: 50, ... },
   { level: "critical", minScore: 75, ... },
]
```

#### V4: Metadatos de Patrón Divididos

```
ANTES (5 archivos):
📁 strategies/index.ts  → tipos de patrón (parcial)
📁 analysis-engine.ts   → secuencias de detección
📁 anomaly-detector.ts  → keywords por patrón
📁 correlation-engine.ts → reglas de correlación
📁 specs.ts             → definiciones de iconos

DESPUÉS (1 entidad unificada):
📁 specs.ts → export const PATTERN_TYPES: PatternType[] = [
   { id: "temporal",  label: "Temporal",  sequence: "T→T", keywords: [...] },
   { id: "spatial",   label: "Spatial",   sequence: "S→S", keywords: [...] },
   { id: "behavioral",label: "Behavioral",sequence: "B→B", keywords: [...] },
   { id: "anomaly",   label: "Anomaly",   sequence: "A→A", keywords: [...] },
   { id: "composite", label: "Composite", sequence: "*",   keywords: [...] },
]
```

#### V5: Duplicación de AgentStatus

```
ANTES (4 lugares):
📁 multiagent-view.tsx → const statusColors = { active: "green", ... }
📁 agent-reputation.ts → const AGENT_STATES = { ... }
📁 heartbeat.ts        → const STATUS_CONFIG = { ... }
📁 dashboard-cache.ts  → const agentStatusMap = { ... }

DESPUÉS (1 definición canónica):
📁 specs.ts → export const AGENT_STATUSES: AgentStatus[] = [
   { status: "active",   label: "Activo",    color: "green",  ... },
   { status: "inactive", label: "Inactivo",  color: "gray",   ... },
   { status: "warning",  label: "Advertencia",color: "yellow", ... },
   { status: "error",    label: "Error",     color: "red",    ... },
]
```

---

## Transformaciones Aplicadas

### Principio de Fuente Única de Verdad (SSOT)

```mermaid
flowchart TB
    subgraph ANTES["❌ Estado Anterior - Fragmentado"]
        direction TB
        A1["navItems.ts"] --- A2["iconMap.ts"] --- A3["viewTitles.ts"]
        B1["alerts-view"] --- B2["monitoring-view"] --- B3["sidebar"]
        B4["alert-workflow"] --- B5["notification"] --- B6["mock-data"]
        C1["risk-matrix"] --- C2["threat-level"] --- C3["analysis-engine"]
        D1["strategies/"] --- D2["anomaly-detector"] --- D3["correlation-engine"]
        D4["analysis-engine"] --- D5["specs (parcial)"]
        E1["multiagent-view"] --- E2["agent-reputation"] --- E3["heartbeat"]
        E4["dashboard-cache"]
    end

    subgraph DESPUES["✅ Estado Posterior - Unificado"]
        direction TB
        S["📋 specs.ts<br/><b>Fuente Única de Verdad</b>"]
        S --> V["View[]"]
        S --> SV["Severity[]"]
        S --> RL["RiskLevel[]"]
        S --> PT["PatternType[]"]
        S --> AS["AgentStatus[]"]
        S --> MG["MissionGroup[]"]
        S --> ST["Strategy[]"]
        S --> DL["DNALayer[]"]
    end

    ANTES ==>|"Refactorización"| DESPUES
```

### Catálogo de Entidades Unificadas

| Entidad | Propiedades | Valores Canónicos | Archivo Fuente |
|---------|------------|-------------------|----------------|
| `View` | id, label, icon, group | 8 vistas de navegación | `specs.ts` |
| `Severity` | level, label, badge, border, bg, icon, points, order | CRÍTICA / ALTA / MEDIA / BAJA / INFO | `specs.ts` |
| `RiskLevel` | level, label, labelEs, color, bg, border, icon, minScore | low / moderate / high / critical | `specs.ts` |
| `DNALayer` | id, name, nameEs, color, bg, icon, description | Ingestión / Análisis / Monitoreo / Informes | `specs.ts` |
| `MissionGroup` | id, name, shortName, icon, description, categories, thresholds, weights | 4 grupos de misión | `specs.ts` |
| `PatternType` | id, label, labelEs, sequence, keywords, icon | 5 tipos de patrón | `specs.ts` |
| `Strategy` | id, name, nameEs, icon, description, color | 6 estrategias | `specs.ts` |
| `AgentStatus` | status, label, color, bg, icon | active / inactive / warning / error | `specs.ts` |

---

## Cardinalidad de Relaciones

| Relación | Origen | Destino | Cardinalidad | Descripción |
|----------|--------|---------|-------------|-------------|
| MissionGroup → Alert | MissionGroup | Alert | 1:N | Un grupo genera múltiples alertas |
| MissionGroup → MonitoringRule | MissionGroup | MonitoringRule | 1:N | Un grupo define múltiples reglas |
| MissionGroup → Agent | MissionGroup | Agent | 1:N | Un grupo asigna múltiples agentes |
| MissionGroup → IntelligenceReport | MissionGroup | IntelligenceReport | 1:N | Un grupo produce múltiples informes |
| MissionGroup → ConsensusVote | MissionGroup | ConsensusVote | 1:N | Un grupo recibe múltiples votos |
| Alert → Severity | Alert | Severity | N:1 | Cada alerta tiene una severidad |
| Alert → RiskLevel | Alert | RiskLevel | N:1 | Cada alerta tiene un nivel de riesgo |
| Strategy → MissionGroup | Strategy | MissionGroup | 1:N | Una estrategia procesa múltiples grupos |
| Strategy → Alert | Strategy | Alert | 1:N | Una estrategia produce múltiples alertas |
| PatternType → Strategy | PatternType | Strategy | N:M | Patrones detectados por múltiples estrategias |
| DNALayer → DNALayer | DNALayer | DNALayer | 1:1 | Cada capa alimenta la siguiente (pipeline secuencial) |
| Agent → MissionGroup | Agent | MissionGroup | N:1 | Cada agente pertenece a un grupo |
| Agent → ConsensusVote | Agent | ConsensusVote | 1:N | Un agente emite múltiples votos |
| Agent → AgentStatus | Agent | AgentStatus | N:1 | Cada agente tiene un estado |
| IntelligenceReport → Alert | IntelligenceReport | Alert | 1:N | Un informe incluye múltiples alertas |
| MonitoringRule → Severity | MonitoringRule | Severity | N:1 | Cada regla clasifica por severidad |
| Event → * (cualquiera) | Event | Entidad | N:0..1 | Evento correlaciona con cualquier entidad vía correlationId |
| View → * (cualquiera) | View | Entidad | N:M | Vista muestra múltiples entidades |

---

## Matriz de Impacto de la Refactorización

```mermaid
quadrantChart
    title Matriz de Impacto vs Esfuerzo - Refactorización
    x-axis Bajo Esfuerzo --> Alto Esfuerzo
    y-axis Bajo Impacto --> Alto Impacto
    quadrant-1 "Priorizar"
    quadrant-2 "Planificar"
    quadrant-3 "Opcional"
    quadrant-4 "Considerar"
    "V2: Severity": [0.3, 0.9]
    "V1: View": [0.2, 0.7]
    "V3: RiskLevel": [0.5, 0.8]
    "V4: PatternType": [0.7, 0.6]
    "V5: AgentStatus": [0.4, 0.5]
```

---

## Notas de Implementación

### Convenciones de Nomenclatura
- **PK**: Clave primaria
- **FK**: Clave foránea
- Las entidades de configuración (`View`, `Severity`, `RiskLevel`, etc.) son **read-only** en runtime
- Las entidades operacionales (`Alert`, `Event`, `ConsensusVote`) son **write-heavy**
- `Event` utiliza el patrón **Event Sourcing** con `correlationId` para trazabilidad

### Reglas de Integridad Referencial
1. Toda `Alert` debe tener un `groupId` válido en `MissionGroup`
2. Todo `Agent` debe pertenecer a un `MissionGroup` existente
3. Los umbrales de `RiskLevel` deben estar ordenados ascendentemente por `minScore`
4. Las capas `DNALayer` siguen un orden estricto: Ingestión → Análisis → Monitoreo → Informes
5. Los `ConsensusVote` deben referenciar un `Agent` y `MissionGroup` existentes

### Dependencias entre Entidades
```mermaid
flowchart BT
    Severity & RiskLevel --> Alert
    AgentStatus --> Agent
    MissionGroup --> Alert & MonitoringRule & Agent & IntelligenceReport & ConsensusVote
    PatternType --> Strategy
    Strategy --> Alert
    DNALayer --> DNALayer
    Alert & Agent & MissionGroup & Strategy --> Event
```

---

*Documento generado como parte de la auditoría arquitectónica de la Plataforma Whatomate Intelligence.*
*Última actualización: 2026-03-04*
