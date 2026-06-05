package intelligence

import (
        "context"
        "crypto/sha256"
        "fmt"
        "regexp"
        "strings"
        "sync"
        "time"

        "github.com/google/uuid"
        "github.com/zerodha/logf"
)

// AnalysisEngine implements DNA Layer 2: Analysis
type AnalysisEngine struct {
        eventStore *EventStore
        log        logf.Logger
        mu         sync.RWMutex

        // In-memory entity cache (backed by PostgreSQL for durability)
        entities map[string]*Entity
        // In-memory pattern state
        patterns map[string]*PatternDetection
}

// NewAnalysisEngine creates a new AnalysisEngine
func NewAnalysisEngine(es *EventStore, log logf.Logger) *AnalysisEngine {
        return &AnalysisEngine{
                eventStore: es,
                log:        log,
                entities:   make(map[string]*Entity),
                patterns:   make(map[string]*PatternDetection),
        }
}

// AnalyzeMessage performs full analysis on a raw message (DNA Layer 2)
func (ae *AnalysisEngine) AnalyzeMessage(ctx context.Context, msg RawMessage) (*AnalysisResult, error) {
        result := &AnalysisResult{
                MessageID:    msg.ID,
                AnalyzedAt:   time.Now(),
                Entities:     []Entity{},
                Keywords:     []KeywordMatch{},
                Sentiment:    ae.ComputeSentiment(msg.Content),
                Patterns:     []PatternDetection{},
        }

        // Extract entities
        entities := ae.ExtractEntities(msg.Content)
        result.Entities = entities

        // Detect keywords
        keywords := ae.DetectKeywords(msg.Content)
        result.Keywords = keywords

        // Update entity mentions
        for i := range entities {
                ae.updateEntity(entities[i], msg.Source)
        }

        // Store entities in the event store
        for _, entity := range entities {
                _ = ae.eventStore.Append(ctx, StreamAnalyzedMessages, IntelligenceEvent{
                        EventType:     EventTypeEntityExtracted,
                        AggregateID:   entity.ID,
                        AggregateType: "entity",
                        Payload: map[string]interface{}{
                                "entity":   entity,
                                "source":   msg.Source,
                                "messageId": msg.ID,
                        },
                        Timestamp: time.Now(),
                })
        }

        // Store keyword matches
        if len(keywords) > 0 {
                _ = ae.eventStore.Append(ctx, StreamAnalyzedMessages, IntelligenceEvent{
                        EventType:     "keywords.detected",
                        AggregateID:   msg.ID,
                        AggregateType: "message",
                        Payload: map[string]interface{}{
                                "messageId": msg.ID,
                                "keywords":  keywords,
                                "source":    msg.Source,
                        },
                        Timestamp: time.Now(),
                })
        }

        // Store sentiment
        _ = ae.eventStore.Append(ctx, StreamAnalyzedMessages, IntelligenceEvent{
                EventType:     "sentiment.computed",
                AggregateID:   msg.ID,
                AggregateType: "message",
                Payload: map[string]interface{}{
                        "messageId": msg.ID,
                        "sentiment": result.Sentiment,
                },
                Timestamp: time.Now(),
        })

        // Mark the original message event as analyzed
        _ = ae.eventStore.Append(ctx, StreamAnalyzedMessages, IntelligenceEvent{
                EventType:     EventTypeMessageAnalyzed,
                AggregateID:   msg.ID,
                AggregateType: "message",
                Payload: map[string]interface{}{
                        "messageId":    msg.ID,
                        "entityCount":  len(entities),
                        "keywordCount": len(keywords),
                        "sentiment":    result.Sentiment,
                },
                Timestamp: time.Now(),
                Processed: true,
        })

        return result, nil
}

// AnalysisResult holds the complete analysis result for a message
type AnalysisResult struct {
        MessageID  string          `json:"messageId"`
        AnalyzedAt time.Time       `json:"analyzedAt"`
        Entities   []Entity        `json:"entities"`
        Keywords   []KeywordMatch  `json:"keywords"`
        Sentiment  SentimentResult `json:"sentiment"`
        Patterns   []PatternDetection `json:"patterns"`
}

// ExtractEntities extracts named entities from content using regex patterns
func (ae *AnalysisEngine) ExtractEntities(content string) []Entity {
        var entities []Entity
        seen := make(map[string]bool)

        // Phone numbers
        phoneRegex := regexp.MustCompile(`\+?\d{1,3}[\s.-]?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}`)
        for _, match := range phoneRegex.FindAllString(content, -1) {
                key := "phone:" + match
                if !seen[key] {
                        seen[key] = true
                        entities = append(entities, Entity{
                                ID:       uuid.New().String(),
                                Name:     match,
                                Type:     "phone",
                                RiskScore: 10,
                                RiskLevel: "low",
                                Sources:  []string{},
                        })
                }
        }

        // Crypto wallet addresses (Bitcoin)
        btcRegex := regexp.MustCompile(`\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b`)
        for _, match := range btcRegex.FindAllString(content, -1) {
                key := "crypto:" + match
                if !seen[key] {
                        seen[key] = true
                        entities = append(entities, Entity{
                                ID:         uuid.New().String(),
                                Name:       match,
                                Type:       "crypto_wallet",
                                RiskScore:  40,
                                RiskLevel:  "medium",
                                Sources:    []string{},
                        })
                }
        }

        // Ethereum wallet addresses
        ethRegex := regexp.MustCompile(`\b0x[a-fA-F0-9]{40}\b`)
        for _, match := range ethRegex.FindAllString(content, -1) {
                key := "crypto:" + match
                if !seen[key] {
                        seen[key] = true
                        entities = append(entities, Entity{
                                ID:         uuid.New().String(),
                                Name:       match,
                                Type:       "crypto_wallet",
                                RiskScore:  40,
                                RiskLevel:  "medium",
                                Sources:    []string{},
                        })
                }
        }

        // Email addresses
        emailRegex := regexp.MustCompile(`\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b`)
        for _, match := range emailRegex.FindAllString(content, -1) {
                key := "email:" + match
                if !seen[key] {
                        seen[key] = true
                        entities = append(entities, Entity{
                                ID:         uuid.New().String(),
                                Name:       match,
                                Type:       "email",
                                RiskScore:  15,
                                RiskLevel:  "low",
                                Sources:    []string{},
                        })
                }
        }

        // URLs
        urlRegex := regexp.MustCompile(`https?://[^\s<>"{}|\\^\[\]]+`)
        for _, match := range urlRegex.FindAllString(content, -1) {
                key := "url:" + match
                if !seen[key] {
                        seen[key] = true
                        entities = append(entities, Entity{
                                ID:         uuid.New().String(),
                                Name:       match,
                                Type:       "url",
                                RiskScore:  20,
                                RiskLevel:  "low",
                                Sources:    []string{},
                        })
                }
        }

        // Person names - capitalized words (simple heuristic)
        // This is a basic approach; a real system would use NER
        personRegex := regexp.MustCompile("\\b[A-Z][a-z]+(?:\\s+[A-Z][a-z]+)+\\b")
        for _, match := range personRegex.FindAllString(content, -1) {
                // Skip common false positives
                lower := strings.ToLower(match)
                skip := false
                for _, fp := range commonFalsePositives {
                        if lower == fp {
                                skip = true
                                break
                        }
                }
                if skip {
                        continue
                }
                key := "person:" + match
                if !seen[key] {
                        seen[key] = true
                        entities = append(entities, Entity{
                                ID:         uuid.New().String(),
                                Name:       match,
                                Type:       "person",
                                RiskScore:  15,
                                RiskLevel:  "low",
                                Sources:    []string{},
                        })
                }
        }

        // Location patterns - common location indicators
        locPatterns := []string{
                "(?i)(?:en|in|at|desde|hacia)\\s+([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*)",
        }
        for _, pattern := range locPatterns {
                re := regexp.MustCompile(pattern)
                for _, submatch := range re.FindAllStringSubmatch(content, -1) {
                        if len(submatch) > 1 {
                                loc := submatch[1]
                                key := "location:" + loc
                                if !seen[key] {
                                        seen[key] = true
                                        entities = append(entities, Entity{
                                                ID:         uuid.New().String(),
                                                Name:       loc,
                                                Type:       "location",
                                                RiskScore:  10,
                                                RiskLevel:  "low",
                                                Sources:    []string{},
                                        })
                                }
                        }
                }
        }

        return entities
}

// Common false positives for person name detection
var commonFalsePositives = []string{
        "buenos dias", "buenas noches", "buenas tardes", "good morning",
        "good evening", "good night", "new york", "los angeles", "san francisco",
        "san juan", "buenos aires", "rio de janeiro", "sao paulo",
        "costa rica", "puerto rico", "el salvador", "reino unido",
        "estados unidos", "norte america", "sur america", "sudafrica",
}

// keywordCategories defines multi-language keyword categories for detection
var keywordCategories = map[string]map[string][]string{
        "fraud": {
                "es": {"estafa", "fraude", "engaño", "estafador", "engañoso", "timado", "timo", "pirámide", "esquema ponzi", "phishing", "clonación", "suplantación", "falso", "fraudulento"},
                "en": {"scam", "fraud", "scammer", "phishing", "pyramid scheme", "ponzi", "fake", "counterfeit", "identity theft", "impersonation"},
                "pt": {"golpe", "fraude", "golpista", "esquema pirâmide", "falsificação", "phishing", "golpe do pix"},
                "fr": {"arnaque", "fraude", "escroc", "phishing", "faux", "contrefaçon", "usurpation d'identité"},
        },
        "scam": {
                "es": {"envía dinero", "transferencia urgente", "ganaste un premio", "has sido seleccionado", "oportunidad única", "dinero fácil", "retira tu premio", "haz clic aquí", "verifica tu cuenta", "tu cuenta ha sido bloqueada"},
                "en": {"send money", "urgent transfer", "you won", "you have been selected", "unique opportunity", "easy money", "click here", "verify your account", "your account has been blocked", "wire transfer"},
                "pt": {"envie dinheiro", "transferência urgente", "você ganhou", "oportunidade única", "dinheiro fácil", "clique aqui", "verifique sua conta"},
                "fr": {"envoyez de l'argent", "transfert urgent", "vous avez gagné", "opportunité unique", "argent facile", "cliquez ici"},
        },
        "crypto": {
                "es": {"bitcoin", "ethereum", "criptomoneda", "cripto", "billetera digital", "wallet", "minar", "minería", "token", "defi", "nft", "exchange", "ico", "airdrop", "stake", "staking"},
                "en": {"bitcoin", "ethereum", "cryptocurrency", "crypto", "digital wallet", "mining", "token", "defi", "nft", "exchange", "ico", "airdrop", "stake", "staking", "usdt", "usdc"},
                "pt": {"bitcoin", "ethereum", "criptomoeda", "cripto", "carteira digital", "minerar", "mineração"},
                "fr": {"bitcoin", "ethereum", "cryptomonnaie", "crypto", "portefeuille numérique", "minage"},
        },
        "laundering": {
                "es": {"blanqueo", "lavado de dinero", "lavado de activos", "dinero sucio", "dinero negro", "paraíso fiscal", "offshore", "empresa fachada", "transferencia sospechosa", "movimiento inusual"},
                "en": {"money laundering", "dirty money", "tax haven", "offshore", "shell company", "suspicious transfer", "unusual movement", "layering", "integration", "placement"},
                "pt": {"lavagem de dinheiro", "dinheiro sujo", "paraíso fiscal", "offshore", "empresa fachada", "transferência suspeita"},
                "fr": {"blanchiment", "blanchiment d'argent", "argent sale", "paradis fiscal", "offshore", "société écran"},
        },
        "migration": {
                "es": {"crucero", "paso", "coyote", "pollero", "migración irregular", "cruce ilegal", "atravesar la frontera", "sin papeles", "indocumentado", "ruta migratoria"},
                "en": {"border crossing", "smuggling", "human trafficking", "illegal migration", "undocumented", "coyote", "migrant route", "irregular migration"},
                "pt": {"travessia", "coiote", "imigração irregular", "cruze ilegal", "sem documentos", "rota migratória"},
                "fr": {"traversée", "passeur", "migration irrégulière", "sans papiers", "clandestin", "trafic d'êtres humains"},
        },
        "disinformation": {
                "es": {"desinformación", "fake news", "noticia falsa", "propaganda", "manipulación", "conspiración", "teoría conspirativa", "engaño masivo", "información falsa"},
                "en": {"disinformation", "fake news", "propaganda", "manipulation", "conspiracy", "misinformation", "deepfake", "bot campaign"},
                "pt": {"desinformação", "fake news", "notícia falsa", "propaganda", "manipulação", "conspiração"},
                "fr": {"désinformation", "fake news", "propagande", "manipulation", "conspiration", "fausse information"},
        },
}

// DetectKeywords performs multi-language keyword detection
func (ae *AnalysisEngine) DetectKeywords(content string) []KeywordMatch {
        var matches []KeywordMatch
        contentLower := strings.ToLower(content)

        seen := make(map[string]bool)

        for category, languages := range keywordCategories {
                for lang, keywords := range languages {
                        for _, kw := range keywords {
                                kwLower := strings.ToLower(kw)
                                if strings.Contains(contentLower, kwLower) {
                                        key := category + ":" + kw
                                        if !seen[key] {
                                                seen[key] = true
                                                matches = append(matches, KeywordMatch{
                                                        Keyword:  kw,
                                                        Category: category,
                                                        Language: lang,
                                                        Count:    strings.Count(contentLower, kwLower),
                                                })
                                        }
                                }
                        }
                }
        }

        return matches
}

// ComputeSentiment performs basic sentiment analysis
func (ae *AnalysisEngine) ComputeSentiment(content string) SentimentResult {
        contentLower := strings.ToLower(content)
        words := strings.Fields(contentLower)

        if len(words) == 0 {
                return SentimentResult{Score: 0, Label: "neutral", Magnitude: 0}
        }

        positiveWords := map[string]bool{
                // Spanish
                "bueno": true, "excelente": true, "genial": true, "fantástico": true,
                "maravilloso": true, "feliz": true, "contento": true, "satisfecho": true,
                "gracias": true, "perfecto": true, "increíble": true, "amor": true,
                // English
                "good": true, "excellent": true, "great": true, "fantastic": true,
                "wonderful": true, "happy": true, "satisfied": true, "thanks": true,
                "perfect": true, "amazing": true, "love": true, "best": true,
                // Portuguese
                "bom": true, "ótimo": true, "maravilhoso": true,
                "obrigado": true, "perfeito": true, "incrível": true,
                // French
                "bon": true, "merci": true, "superbe": true,
        }

        negativeWords := map[string]bool{
                // Spanish
                "malo": true, "terrible": true, "horrible": true, "pésimo": true,
                "triste": true, "enojado": true, "frustrado": true, "estafa": true,
                "fraude": true, "peligro": true, "muerte": true, "asesinato": true,
                // English
                "bad": true, "worst": true,
                "sad": true, "angry": true, "frustrated": true, "scam": true,
                "fraud": true, "danger": true, "death": true, "kill": true,
                // Portuguese
                "ruim": true, "terrível": true, "horrível": true,
                // French
                "mauvais": true, "colère": true, "arnaque": true,
        }

        intensifiers := map[string]float64{
                "muy": 1.5, "muito": 1.5, "very": 1.5, "très": 1.5, "super": 1.5,
                "extremadamente": 2.0, "extremely": 2.0, "extrêmement": 2.0,
                "absolutamente": 2.0, "absolutely": 2.0, "absolument": 2.0,
        }

        var score float64
        var magnitude float64
        prevIsIntensifier := false
        intensifierMul := 1.0

        for _, word := range words {
                if mul, ok := intensifiers[word]; ok {
                        prevIsIntensifier = true
                        intensifierMul = mul
                        continue
                }

                if positiveWords[word] {
                        add := 1.0 * intensifierMul
                        score += add
                        magnitude += add
                } else if negativeWords[word] {
                        sub := 1.0 * intensifierMul
                        score -= sub
                        magnitude += sub
                }

                if prevIsIntensifier {
                        prevIsIntensifier = false
                        intensifierMul = 1.0
                }
        }

        // Normalize score to [-1, 1]
        maxPossible := float64(len(words))
        if maxPossible > 0 {
                score = score / maxPossible
                if score > 1.0 {
                        score = 1.0
                } else if score < -1.0 {
                        score = -1.0
                }
        }

        // Normalize magnitude to [0, 1]
        if maxPossible > 0 {
                magnitude = magnitude / maxPossible
                if magnitude > 1.0 {
                        magnitude = 1.0
                }
        }

        label := "neutral"
        if score > 0.1 {
                label = "positive"
        } else if score < -0.1 {
                label = "negative"
        }

        return SentimentResult{
                Score:     score,
                Label:     label,
                Magnitude: magnitude,
        }
}

// DetectPatterns analyzes a batch of messages for pattern detection
func (ae *AnalysisEngine) DetectPatterns(ctx context.Context, messages []RawMessage) []PatternDetection {
        var patterns []PatternDetection

        // Group messages by sender for behavioral analysis
        senderMessages := make(map[string][]RawMessage)
        for _, msg := range messages {
                senderMessages[msg.SenderName] = append(senderMessages[msg.SenderName], msg)
        }

        // Detect fraud patterns
        fraudPatterns := ae.detectFraudPatterns(messages, senderMessages)
        patterns = append(patterns, fraudPatterns...)

        // Detect money laundering patterns
        launderingPatterns := ae.detectLaunderingPatterns(messages, senderMessages)
        patterns = append(patterns, launderingPatterns...)

        // Detect disinformation patterns
        disinfoPatterns := ae.detectDisinformationPatterns(messages)
        patterns = append(patterns, disinfoPatterns...)

        // Detect crypto manipulation patterns
        cryptoPatterns := ae.detectCryptoManipulationPatterns(messages)
        patterns = append(patterns, cryptoPatterns...)

        // Detect irregular migration patterns
        migrationPatterns := ae.detectMigrationPatterns(messages)
        patterns = append(patterns, migrationPatterns...)

        // Store detected patterns as events
        for _, pattern := range patterns {
                ae.mu.Lock()
                ae.patterns[pattern.ID] = &pattern
                ae.mu.Unlock()

                _ = ae.eventStore.Append(ctx, StreamPatterns, IntelligenceEvent{
                        EventType:     EventTypePatternDetected,
                        AggregateID:   pattern.ID,
                        AggregateType: "pattern",
                        Payload: map[string]interface{}{
                                "patternType": pattern.PatternType,
                                "confidence":  pattern.Confidence,
                                "severity":    pattern.Severity,
                                "description": pattern.Description,
                                "occurrences": pattern.Occurrences,
                                "entityIds":   pattern.EntityIDs,
                        },
                        Timestamp: time.Now(),
                })
        }

        return patterns
}

// detectFraudPatterns detects fraud-related patterns across messages
func (ae *AnalysisEngine) detectFraudPatterns(messages []RawMessage, senderMessages map[string][]RawMessage) []PatternDetection {
        var patterns []PatternDetection

        // Pattern: Multiple senders using similar fraud language
        fraudKeywordCount := make(map[string]int)
        for _, msg := range messages {
                keywords := ae.DetectKeywords(msg.Content)
                for _, kw := range keywords {
                        if kw.Category == "fraud" || kw.Category == "scam" {
                                fraudKeywordCount[msg.SenderName]++
                        }
                }
        }

        for sender, count := range fraudKeywordCount {
                if count >= 3 {
                        severity := "MEDIA"
                        confidence := 60 + count*5
                        if confidence > 95 {
                                confidence = 95
                        }
                        if count >= 5 {
                                severity = "ALTA"
                        }

                        patterns = append(patterns, PatternDetection{
                                ID:           uuid.New().String(),
                                PatternType:  "fraud",
                                Confidence:   confidence,
                                Severity:     severity,
                                Status:       "active",
                                Description:  fmt.Sprintf("Sender '%s' frequently uses fraud-related language (%d occurrences)", sender, count),
                                Occurrences:  count,
                                LastDetected: time.Now(),
                        })
                }
        }

        return patterns
}

// detectLaunderingPatterns detects money laundering patterns
func (ae *AnalysisEngine) detectLaunderingPatterns(messages []RawMessage, senderMessages map[string][]RawMessage) []PatternDetection {
        var patterns []PatternDetection

        // Pattern: Rapid sequential messages with financial keywords from same sender
        for sender, msgs := range senderMessages {
                launderingCount := 0
                for _, msg := range msgs {
                        keywords := ae.DetectKeywords(msg.Content)
                        for _, kw := range keywords {
                                if kw.Category == "laundering" || kw.Category == "crypto" {
                                        launderingCount++
                                }
                        }
                }

                if launderingCount >= 2 {
                        confidence := 50 + launderingCount*10
                        if confidence > 90 {
                                confidence = 90
                        }
                        severity := "MEDIA"
                        if launderingCount >= 4 {
                                severity = "ALTA"
                        }

                        patterns = append(patterns, PatternDetection{
                                ID:           uuid.New().String(),
                                PatternType:  "laundering",
                                Confidence:   confidence,
                                Severity:     severity,
                                Status:       "active",
                                Description:  fmt.Sprintf("Sender '%s' shows money laundering indicators (%d flagged messages)", sender, launderingCount),
                                Occurrences:  launderingCount,
                                LastDetected: time.Now(),
                        })
                }
        }

        return patterns
}

// detectDisinformationPatterns detects coordinated disinformation
func (ae *AnalysisEngine) detectDisinformationPatterns(messages []RawMessage) []PatternDetection {
        var patterns []PatternDetection

        // Pattern: Same or similar content across multiple senders (coordinated campaign)
        contentHashCount := make(map[string]int)
        senderByHash := make(map[string]map[string]bool)

        for _, msg := range messages {
                hash := contentHash(msg.Content)
                contentHashCount[hash]++
                if senderByHash[hash] == nil {
                        senderByHash[hash] = make(map[string]bool)
                }
                senderByHash[hash][msg.SenderName] = true
        }

        for hash, count := range contentHashCount {
                senders := senderByHash[hash]
                if count >= 3 && len(senders) >= 2 {
                        patterns = append(patterns, PatternDetection{
                                ID:           uuid.New().String(),
                                PatternType:  "disinformation",
                                Confidence:   55 + len(senders)*10,
                                Severity:     "ALTA",
                                Status:       "active",
                                Description:  fmt.Sprintf("Coordinated content detected: %d identical/similar messages from %d senders", count, len(senders)),
                                Occurrences:  count,
                                LastDetected: time.Now(),
                        })
                }
        }

        return patterns
}

// detectCryptoManipulationPatterns detects crypto market manipulation
func (ae *AnalysisEngine) detectCryptoManipulationPatterns(messages []RawMessage) []PatternDetection {
        var patterns []PatternDetection

        // Pattern: Pump and dump signals
        pumpCount := 0
        for _, msg := range messages {
                keywords := ae.DetectKeywords(msg.Content)
                hasCrypto := false
                hasUrgency := false
                for _, kw := range keywords {
                        if kw.Category == "crypto" {
                                hasCrypto = true
                        }
                        if kw.Category == "scam" {
                                hasUrgency = true
                        }
                }
                if hasCrypto && hasUrgency {
                        pumpCount++
                }
        }

        if pumpCount >= 2 {
                patterns = append(patterns, PatternDetection{
                        ID:           uuid.New().String(),
                        PatternType:  "crypto_manipulation",
                        Confidence:   60 + pumpCount*5,
                        Severity:     "ALTA",
                        Status:       "active",
                        Description:  fmt.Sprintf("Potential pump-and-dump pattern detected (%d suspicious crypto messages)", pumpCount),
                        Occurrences:  pumpCount,
                        LastDetected: time.Now(),
                })
        }

        return patterns
}

// detectMigrationPatterns detects irregular migration patterns
func (ae *AnalysisEngine) detectMigrationPatterns(messages []RawMessage) []PatternDetection {
        var patterns []PatternDetection

        migrationCount := 0
        for _, msg := range messages {
                keywords := ae.DetectKeywords(msg.Content)
                for _, kw := range keywords {
                        if kw.Category == "migration" {
                                migrationCount += kw.Count
                        }
                }
        }

        if migrationCount >= 3 {
                patterns = append(patterns, PatternDetection{
                        ID:           uuid.New().String(),
                        PatternType:  "irregular_migration",
                        Confidence:   55 + migrationCount*5,
                        Severity:     "ALTA",
                        Status:       "active",
                        Description:  fmt.Sprintf("Irregular migration indicators detected (%d keyword hits)", migrationCount),
                        Occurrences:  migrationCount,
                        LastDetected: time.Now(),
                })
        }

        return patterns
}

// updateEntity updates the in-memory entity cache with new mention data
func (ae *AnalysisEngine) updateEntity(entity Entity, source string) {
        ae.mu.Lock()
        defer ae.mu.Unlock()

        // Use name+type as the key for deduplication
        key := entity.Type + ":" + entity.Name
        if existing, ok := ae.entities[key]; ok {
                existing.MentionCount++
                existing.LastSeen = time.Now()
                existing.RiskScore = ae.calculateEntityRisk(existing)
                existing.RiskLevel = ae.scoreToLevel(existing.RiskScore)
                // Add source if not already present
                for _, s := range existing.Sources {
                        if s == source {
                                return
                        }
                }
                existing.Sources = append(existing.Sources, source)
        } else {
                e := entity
                e.MentionCount = 1
                e.LastSeen = time.Now()
                e.Sources = []string{source}
                e.RiskScore = ae.calculateEntityRisk(&e)
                e.RiskLevel = ae.scoreToLevel(e.RiskScore)
                ae.entities[key] = &e
        }
}

// calculateEntityRisk computes a risk score based on entity attributes
func (ae *AnalysisEngine) calculateEntityRisk(entity *Entity) int {
        score := 10 // Base score

        // Type-based risk
        switch entity.Type {
        case "crypto_wallet":
                score += 30
        case "person":
                score += 10
        case "organization":
                score += 15
        case "location":
                score += 5
        case "phone":
                score += 5
        case "url":
                score += 10
        }

        // Mention count factor
        score += entity.MentionCount * 3

        // Cross-platform factor
        score += len(entity.Sources) * 10

        if score > 100 {
                score = 100
        }
        return score
}

// scoreToLevel converts a numeric risk score to a risk level
func (ae *AnalysisEngine) scoreToLevel(score int) string {
        switch {
        case score >= 80:
                return "critical"
        case score >= 60:
                return "high"
        case score >= 40:
                return "medium"
        default:
                return "low"
        }
}

// GetEntities returns all tracked entities
func (ae *AnalysisEngine) GetEntities() []Entity {
        ae.mu.RLock()
        defer ae.mu.RUnlock()

        entities := make([]Entity, 0, len(ae.entities))
        for _, e := range ae.entities {
                entities = append(entities, *e)
        }
        return entities
}

// GetPatterns returns all detected patterns
func (ae *AnalysisEngine) GetPatterns() []PatternDetection {
        ae.mu.RLock()
        defer ae.mu.RUnlock()

        patterns := make([]PatternDetection, 0, len(ae.patterns))
        for _, p := range ae.patterns {
                patterns = append(patterns, *p)
        }
        return patterns
}

// contentHash generates a hash for content similarity detection
func contentHash(content string) string {
        // Normalize: lowercase, trim, collapse whitespace
        normalized := strings.ToLower(strings.TrimSpace(content))
        normalized = regexp.MustCompile("\\s+").ReplaceAllString(normalized, " ")

        h := sha256.Sum256([]byte(normalized))
        return fmt.Sprintf("%x", h[:8])
}
