package intelligence

import (
	"context"
	"fmt"
	"math"
	"time"

	"github.com/zerodha/logf"
)

// ThreatLevelComputer computes threat levels from real OSINT data
// using a weighted multi-factor model similar to the Python OSINT service
type ThreatLevelComputer struct {
	eventStore *EventStore
	log        logf.Logger
}

// NewThreatLevelComputer creates a new threat level computer
func NewThreatLevelComputer(es *EventStore, log logf.Logger) *ThreatLevelComputer {
	return &ThreatLevelComputer{
		eventStore: es,
		log:        log,
	}
}

// ThreatAssessment represents a computed threat assessment from OSINT data
type ThreatAssessment struct {
	OverallScore    int                    `json:"overallScore"`    // 0-100
	OverallLevel    string                 `json:"overallLevel"`    // "low", "moderate", "elevated", "high", "critical"
	FactorScores    map[string]FactorScore `json:"factorScores"`
	TopContributors []ThreatContributor    `json:"topContributors"`
	ComputedAt      time.Time              `json:"computedAt"`
}

// FactorScore represents the score from a single threat factor
type FactorScore struct {
	Score     int     `json:"score"`     // 0-100 contribution
	Weight    float64 `json:"weight"`    // 0.0-1.0
	Weighted  float64 `json:"weighted"`  // score * weight
	RawCount  int     `json:"rawCount"`  // raw event count
	Details   string  `json:"details"`
}

// ThreatContributor represents the top contributing factors to the threat score
type ThreatContributor struct {
	Category string  `json:"category"`
	Score    int     `json:"score"`
	Detail   string  `json:"detail"`
}

// ComputeThreatLevel computes a comprehensive threat level from OSINT data
func (tlc *ThreatLevelComputer) ComputeThreatLevel(ctx context.Context, data *OSINTSnapshot) *ThreatAssessment {
	if data == nil {
		return &ThreatAssessment{
			OverallScore:    0,
			OverallLevel:    "low",
			FactorScores:    make(map[string]FactorScore),
			ComputedAt:      time.Now(),
		}
	}

	factors := make(map[string]FactorScore)
	totalScore := 0.0
	var contributors []ThreatContributor

	// Factor 1: Seismic Activity (weight: 0.15)
	seismicScore, seismicDetail := tlc.computeSeismicScore(data)
	factors["seismic"] = FactorScore{
		Score:    seismicScore,
		Weight:   0.15,
		Weighted: float64(seismicScore) * 0.15,
		RawCount: len(data.Earthquakes),
		Details:  seismicDetail,
	}
	totalScore += float64(seismicScore) * 0.15
	if seismicScore > 30 {
		contributors = append(contributors, ThreatContributor{Category: "seismic", Score: seismicScore, Detail: seismicDetail})
	}

	// Factor 2: Military Aviation (weight: 0.15)
	aviationScore, aviationDetail := tlc.computeAviationScore(data)
	factors["military_aviation"] = FactorScore{
		Score:    aviationScore,
		Weight:   0.15,
		Weighted: float64(aviationScore) * 0.15,
		RawCount: len(data.Flights),
		Details:  aviationDetail,
	}
	totalScore += float64(aviationScore) * 0.15
	if aviationScore > 30 {
		contributors = append(contributors, ThreatContributor{Category: "military_aviation", Score: aviationScore, Detail: aviationDetail})
	}

	// Factor 3: GPS Jamming (weight: 0.20) - Higher weight due to direct threat
	gpsScore, gpsDetail := tlc.computeGPSJammingScore(data)
	factors["gps_jamming"] = FactorScore{
		Score:    gpsScore,
		Weight:   0.20,
		Weighted: float64(gpsScore) * 0.20,
		RawCount: len(data.GPSJamming),
		Details:  gpsDetail,
	}
	totalScore += float64(gpsScore) * 0.20
	if gpsScore > 20 {
		contributors = append(contributors, ThreatContributor{Category: "gps_jamming", Score: gpsScore, Detail: gpsDetail})
	}

	// Factor 4: Conflict Events (weight: 0.20)
	conflictScore, conflictDetail := tlc.computeConflictScore(data)
	factors["conflict"] = FactorScore{
		Score:    conflictScore,
		Weight:   0.20,
		Weighted: float64(conflictScore) * 0.20,
		RawCount: len(data.LiveUAMap),
		Details:  conflictDetail,
	}
	totalScore += float64(conflictScore) * 0.20
	if conflictScore > 20 {
		contributors = append(contributors, ThreatContributor{Category: "conflict", Score: conflictScore, Detail: conflictDetail})
	}

	// Factor 5: UAV Activity (weight: 0.10)
	uavScore, uavDetail := tlc.computeUAVScore(data)
	factors["uav"] = FactorScore{
		Score:    uavScore,
		Weight:   0.10,
		Weighted: float64(uavScore) * 0.10,
		RawCount: len(data.UAVs),
		Details:  uavDetail,
	}
	totalScore += float64(uavScore) * 0.10
	if uavScore > 30 {
		contributors = append(contributors, ThreatContributor{Category: "uav", Score: uavScore, Detail: uavDetail})
	}

	// Factor 6: SIGINT Activity (weight: 0.10)
	sigintScore, sigintDetail := tlc.computeSIGINTScore(data)
	factors["sigint"] = FactorScore{
		Score:    sigintScore,
		Weight:   0.10,
		Weighted: float64(sigintScore) * 0.10,
		RawCount: len(data.SIGINT),
		Details:  sigintDetail,
	}
	totalScore += float64(sigintScore) * 0.10
	if sigintScore > 40 {
		contributors = append(contributors, ThreatContributor{Category: "sigint", Score: sigintScore, Detail: sigintDetail})
	}

	// Factor 7: Weather (weight: 0.05)
	weatherScore, weatherDetail := tlc.computeWeatherScore(data)
	factors["weather"] = FactorScore{
		Score:    weatherScore,
		Weight:   0.05,
		Weighted: float64(weatherScore) * 0.05,
		RawCount: func() int { if data.Weather != nil { return data.Weather.ActiveAlerts }; return 0 }(),
		Details:  weatherDetail,
	}
	totalScore += float64(weatherScore) * 0.05

	// Factor 8: Fire Activity (weight: 0.05)
	fireScore, fireDetail := tlc.computeFireScore(data)
	factors["fire"] = FactorScore{
		Score:    fireScore,
		Weight:   0.05,
		Weighted: float64(fireScore) * 0.05,
		RawCount: len(data.Fires),
		Details:  fireDetail,
	}
	totalScore += float64(fireScore) * 0.05

	// Normalize total score
	overallScore := int(math.Round(totalScore))
	if overallScore > 100 {
		overallScore = 100
	}

	// Determine level
	level := "low"
	switch {
	case overallScore >= 80:
		level = "critical"
	case overallScore >= 60:
		level = "high"
	case overallScore >= 40:
		level = "elevated"
	case overallScore >= 20:
		level = "moderate"
	}

	return &ThreatAssessment{
		OverallScore:    overallScore,
		OverallLevel:    level,
		FactorScores:    factors,
		TopContributors: contributors,
		ComputedAt:      time.Now(),
	}
}

func (tlc *ThreatLevelComputer) computeSeismicScore(data *OSINTSnapshot) (int, string) {
	if len(data.Earthquakes) == 0 {
		return 0, "No significant seismic activity"
	}

	maxMag := 0.0
	for _, eq := range data.Earthquakes {
		if eq.Magnitude > maxMag {
			maxMag = eq.Magnitude
		}
	}

	score := 0
	if maxMag >= 7.0 {
		score = 80
	} else if maxMag >= 6.0 {
		score = 50
	} else if maxMag >= 5.0 {
		score = 25
	} else if maxMag >= 4.5 {
		score = 10
	}

	if len(data.Earthquakes) >= 5 {
		score += 15
	} else if len(data.Earthquakes) >= 3 {
		score += 5
	}

	if score > 100 {
		score = 100
	}

	return score, fmt.Sprintf("Max magnitude %.1f across %d events", maxMag, len(data.Earthquakes))
}

func (tlc *ThreatLevelComputer) computeAviationScore(data *OSINTSnapshot) (int, string) {
	milFlights := 0
	for _, f := range data.Flights {
		if f.Type == "military" {
			milFlights++
		}
	}

	if milFlights == 0 {
		return 0, "No military flights tracked"
	}

	score := 0
	if milFlights >= 20 {
		score = 70
	} else if milFlights >= 10 {
		score = 40
	} else if milFlights >= 5 {
		score = 20
	} else {
		score = 10
	}

	return score, fmt.Sprintf("%d military flights tracked", milFlights)
}

func (tlc *ThreatLevelComputer) computeGPSJammingScore(data *OSINTSnapshot) (int, string) {
	if len(data.GPSJamming) == 0 {
		return 0, "No GPS jamming detected"
	}

	severe := 0
	moderate := 0
	for _, g := range data.GPSJamming {
		switch g.Severity {
		case "severe":
			severe++
		case "moderate":
			moderate++
		}
	}

	score := 0
	if severe >= 3 {
		score = 80
	} else if severe >= 1 {
		score = 50
	} else if moderate >= 3 {
		score = 30
	} else {
		score = 10
	}

	return score, fmt.Sprintf("%d regions affected (%d severe, %d moderate)", len(data.GPSJamming), severe, moderate)
}

func (tlc *ThreatLevelComputer) computeConflictScore(data *OSINTSnapshot) (int, string) {
	if len(data.LiveUAMap) == 0 {
		return 0, "No conflict events detected"
	}

	conflictEvents := 0
	for _, e := range data.LiveUAMap {
		if e.EventType == "conflict" {
			conflictEvents++
		}
	}

	score := 0
	if conflictEvents >= 5 {
		score = 80
	} else if conflictEvents >= 3 {
		score = 50
	} else if conflictEvents >= 1 {
		score = 25
	}

	if len(data.LiveUAMap) >= 10 {
		score += 15
	}

	if score > 100 {
		score = 100
	}

	return score, fmt.Sprintf("%d conflict events out of %d total", conflictEvents, len(data.LiveUAMap))
}

func (tlc *ThreatLevelComputer) computeUAVScore(data *OSINTSnapshot) (int, string) {
	if len(data.UAVs) == 0 {
		return 0, "No UAV activity tracked"
	}

	score := 0
	if len(data.UAVs) >= 10 {
		score = 60
	} else if len(data.UAVs) >= 5 {
		score = 35
	} else {
		score = 15
	}

	return score, fmt.Sprintf("%d UAVs tracked", len(data.UAVs))
}

func (tlc *ThreatLevelComputer) computeSIGINTScore(data *OSINTSnapshot) (int, string) {
	if len(data.SIGINT) == 0 {
		return 0, "No SIGINT activity detected"
	}

	score := 0
	if len(data.SIGINT) >= 50 {
		score = 50
	} else if len(data.SIGINT) >= 20 {
		score = 30
	} else {
		score = 10
	}

	return score, fmt.Sprintf("%d signals detected", len(data.SIGINT))
}

func (tlc *ThreatLevelComputer) computeWeatherScore(data *OSINTSnapshot) (int, string) {
	if data.Weather == nil {
		return 0, "No weather data available"
	}

	score := 0
	if data.Weather.ActiveAlerts >= 10 {
		score = 60
	} else if data.Weather.ActiveAlerts >= 5 {
		score = 30
	} else if data.Weather.ActiveAlerts >= 1 {
		score = 10
	}

	return score, fmt.Sprintf("%d active weather alerts, %d extreme events", data.Weather.ActiveAlerts, len(data.Weather.ExtremeEvents))
}

func (tlc *ThreatLevelComputer) computeFireScore(data *OSINTSnapshot) (int, string) {
	if len(data.Fires) == 0 {
		return 0, "No fire detections"
	}

	score := 0
	if len(data.Fires) >= 100 {
		score = 40
	} else if len(data.Fires) >= 50 {
		score = 20
	} else {
		score = 5
	}

	return score, fmt.Sprintf("%d fire detections", len(data.Fires))
}
