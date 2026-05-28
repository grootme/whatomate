package intelligence

import (
        "context"
        "encoding/json"
        "fmt"
        "io"
        "net/http"
        "time"

        "github.com/zerodha/logf"
)

// OSINTClient communicates with the Python OSINT service
type OSINTClient struct {
        httpClient  *http.Client
        baseURL     string
        log         logf.Logger
        lastFetch   *time.Time
        lastSnapshot *OSINTSnapshot
}

// NewOSINTClient creates a new OSINTClient
func NewOSINTClient(httpClient *http.Client, baseURL string, log logf.Logger) *OSINTClient {
        if baseURL == "" {
                baseURL = "http://localhost:8000"
        }
        return &OSINTClient{
                httpClient: httpClient,
                baseURL:    baseURL,
                log:        log,
        }
}

// FetchOSINTData retrieves the full OSINT snapshot from the Python service
func (oc *OSINTClient) FetchOSINTData(ctx context.Context) (*OSINTSnapshot, error) {
        if oc.httpClient == nil {
                return nil, fmt.Errorf("OSINT client HTTP client not configured")
        }

        url := oc.baseURL + "/api/live-data/osint-snapshot"

        req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
        if err != nil {
                return nil, fmt.Errorf("failed to create OSINT request: %w", err)
        }

        resp, err := oc.httpClient.Do(req)
        if err != nil {
                return nil, fmt.Errorf("failed to fetch OSINT data: %w", err)
        }
        defer resp.Body.Close()

        if resp.StatusCode != http.StatusOK {
                body, _ := io.ReadAll(resp.Body)
                return nil, fmt.Errorf("OSINT service returned status %d: %s", resp.StatusCode, string(body))
        }

        body, err := io.ReadAll(resp.Body)
        if err != nil {
                return nil, fmt.Errorf("failed to read OSINT response: %w", err)
        }

        var snapshot OSINTSnapshot
        if err := json.Unmarshal(body, &snapshot); err != nil {
                return nil, fmt.Errorf("failed to unmarshal OSINT data: %w", err)
        }

        now := time.Now()
        oc.lastFetch = &now
        oc.lastSnapshot = &snapshot

        oc.log.Info("OSINT data fetched successfully",
                "earthquakes", len(snapshot.Earthquakes),
                "fires", len(snapshot.Fires),
                "ships", len(snapshot.Ships),
                "flights", len(snapshot.Flights),
                "uavs", len(snapshot.UAVs),
                "sigint", len(snapshot.SIGINT),
                "gdelt", len(snapshot.GDELT),
                "news", len(snapshot.News),
                "gpsJamming", len(snapshot.GPSJamming),
                "liveuamap", len(snapshot.LiveUAMap),
        )

        return &snapshot, nil
}

// FetchThreatFeed retrieves raw threat feed data from the Python service
func (oc *OSINTClient) FetchThreatFeed(ctx context.Context) (map[string]interface{}, error) {
        if oc.httpClient == nil {
                return nil, fmt.Errorf("OSINT client HTTP client not configured")
        }

        url := oc.baseURL + "/api/live-data"

        req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
        if err != nil {
                return nil, fmt.Errorf("failed to create threat feed request: %w", err)
        }

        resp, err := oc.httpClient.Do(req)
        if err != nil {
                return nil, fmt.Errorf("failed to fetch threat feed: %w", err)
        }
        defer resp.Body.Close()

        if resp.StatusCode != http.StatusOK {
                body, _ := io.ReadAll(resp.Body)
                return nil, fmt.Errorf("threat feed returned status %d: %s", resp.StatusCode, string(body))
        }

        body, err := io.ReadAll(resp.Body)
        if err != nil {
                return nil, fmt.Errorf("failed to read threat feed response: %w", err)
        }

        var data map[string]interface{}
        if err := json.Unmarshal(body, &data); err != nil {
                return nil, fmt.Errorf("failed to unmarshal threat feed data: %w", err)
        }

        return data, nil
}

// FetchAISummary retrieves the AI-generated summary from the Python service
func (oc *OSINTClient) FetchAISummary(ctx context.Context) (string, error) {
        if oc.httpClient == nil {
                return "", fmt.Errorf("OSINT client HTTP client not configured")
        }

        url := oc.baseURL + "/api/ai/summary"

        req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
        if err != nil {
                return "", fmt.Errorf("failed to create AI summary request: %w", err)
        }

        resp, err := oc.httpClient.Do(req)
        if err != nil {
                return "", fmt.Errorf("failed to fetch AI summary: %w", err)
        }
        defer resp.Body.Close()

        if resp.StatusCode != http.StatusOK {
                body, _ := io.ReadAll(resp.Body)
                return "", fmt.Errorf("AI summary returned status %d: %s", resp.StatusCode, string(body))
        }

        body, err := io.ReadAll(resp.Body)
        if err != nil {
                return "", fmt.Errorf("failed to read AI summary response: %w", err)
        }

        var result struct {
                Summary string `json:"summary"`
        }
        if err := json.Unmarshal(body, &result); err != nil {
                // Try returning raw body if not JSON
                return string(body), nil
        }

        return result.Summary, nil
}

// GetLastSnapshot returns the most recently fetched OSINT snapshot
func (oc *OSINTClient) GetLastSnapshot() *OSINTSnapshot {
        return oc.lastSnapshot
}

// GetLastFetchTime returns the time of the last successful OSINT fetch
func (oc *OSINTClient) GetLastFetchTime() *time.Time {
        return oc.lastFetch
}

// IsAvailable checks if the OSINT service is reachable
func (oc *OSINTClient) IsAvailable(ctx context.Context) bool {
        if oc.httpClient == nil {
                return false
        }

        url := oc.baseURL + "/health"

        req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
        if err != nil {
                return false
        }

        resp, err := oc.httpClient.Do(req)
        if err != nil {
                return false
        }
        defer resp.Body.Close()

        return resp.StatusCode == http.StatusOK
}
