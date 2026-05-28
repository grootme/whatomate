package intelligence

import (
        "context"
        "fmt"
        "sync"
        "time"

        "github.com/google/uuid"
        "github.com/zerodha/logf"
)

// ReportScheduler manages automated report generation on a schedule
type ReportScheduler struct {
        service *IntelligenceService
        log     logf.Logger
        jobs    map[string]*ScheduledReportJob
        mu      sync.RWMutex
}

// ScheduledReportJob represents a scheduled report generation job
type ScheduledReportJob struct {
        ID           string        `json:"id"`
        Name         string        `json:"name"`
        ReportType   string        `json:"reportType"` // "threat_summary", "risk_analysis", "pattern_report", "full_intelligence"
        Interval     time.Duration `json:"interval"`
        Enabled      bool          `json:"enabled"`
        LastRun      *time.Time    `json:"lastRun,omitempty"`
        NextRun      *time.Time    `json:"nextRun,omitempty"`
        RunCount     int           `json:"runCount"`
        CreatedAt    time.Time     `json:"createdAt"`
        cancel       context.CancelFunc
}

// ScheduleReportRequest is the request to create a scheduled report
type ScheduleReportRequest struct {
        Name       string `json:"name"`
        ReportType string `json:"reportType"`
        IntervalMs int64  `json:"intervalMs"` // Interval in milliseconds
        Enabled    bool   `json:"enabled"`
}

// NewReportScheduler creates a new report scheduler
func NewReportScheduler(service *IntelligenceService, log logf.Logger) *ReportScheduler {
        return &ReportScheduler{
                service: service,
                log:     log,
                jobs:    make(map[string]*ScheduledReportJob),
        }
}

// CreateJob creates and optionally starts a new scheduled report job
func (rs *ReportScheduler) CreateJob(ctx context.Context, req ScheduleReportRequest) (*ScheduledReportJob, error) {
        if req.Name == "" {
                return nil, fmt.Errorf("job name is required")
        }
        if req.ReportType == "" {
                return nil, fmt.Errorf("report type is required")
        }
        if req.IntervalMs < 60000 { // Minimum 1 minute
                return nil, fmt.Errorf("interval must be at least 60000ms (1 minute)")
        }

        // Validate report type
        validTypes := map[string]bool{
                "threat_summary":    true,
                "risk_analysis":     true,
                "pattern_report":    true,
                "full_intelligence": true,
        }
        if !validTypes[req.ReportType] {
                return nil, fmt.Errorf("invalid report type: %s", req.ReportType)
        }

        job := &ScheduledReportJob{
                ID:         uuid.New().String(),
                Name:       req.Name,
                ReportType: req.ReportType,
                Interval:   time.Duration(req.IntervalMs) * time.Millisecond,
                Enabled:    req.Enabled,
                CreatedAt:  time.Now(),
        }

        rs.mu.Lock()
        rs.jobs[job.ID] = job
        rs.mu.Unlock()

        if job.Enabled {
                rs.startJob(ctx, job)
        }

        rs.log.Info("Scheduled report job created", "id", job.ID, "name", job.Name, "type", job.ReportType, "interval", job.Interval)

        return job, nil
}

// startJob starts the background goroutine for a scheduled report job
func (rs *ReportScheduler) startJob(ctx context.Context, job *ScheduledReportJob) {
        ctx, cancel := context.WithCancel(ctx)
        job.cancel = cancel
        nextRun := time.Now().Add(job.Interval)
        job.NextRun = &nextRun

        go func() {
                ticker := time.NewTicker(job.Interval)
                defer ticker.Stop()

                for {
                        select {
                        case <-ctx.Done():
                                return
                        case <-ticker.C:
                                rs.mu.RLock()
                                enabled := job.Enabled
                                rs.mu.RUnlock()

                                if !enabled {
                                        continue
                                }

                                rs.log.Info("Running scheduled report", "job", job.Name, "type", job.ReportType)

                                report, err := rs.service.GenerateReport(ctx, job.ReportType)
                                if err != nil {
                                        rs.log.Error("Scheduled report generation failed", "job", job.Name, "error", err)
                                        continue
                                }

                                now := time.Now()
                                next := now.Add(job.Interval)

                                rs.mu.Lock()
                                job.LastRun = &now
                                job.NextRun = &next
                                job.RunCount++
                                rs.mu.Unlock()

                                rs.log.Info("Scheduled report generated", "job", job.Name, "reportId", report.ID, "severity", report.Severity)
                        }
                }
        }()
}

// DeleteJob stops and removes a scheduled report job
func (rs *ReportScheduler) DeleteJob(jobID string) error {
        rs.mu.Lock()
        defer rs.mu.Unlock()

        job, ok := rs.jobs[jobID]
        if !ok {
                return fmt.Errorf("job %s not found", jobID)
        }

        if job.cancel != nil {
                job.cancel()
        }

        delete(rs.jobs, jobID)
        rs.log.Info("Scheduled report job deleted", "id", jobID)
        return nil
}

// GetJob returns a single scheduled report job
func (rs *ReportScheduler) GetJob(jobID string) (*ScheduledReportJob, error) {
        rs.mu.RLock()
        defer rs.mu.RUnlock()

        job, ok := rs.jobs[jobID]
        if !ok {
                return nil, fmt.Errorf("job %s not found", jobID)
        }
        return job, nil
}

// ListJobs returns all scheduled report jobs
func (rs *ReportScheduler) ListJobs() []ScheduledReportJob {
        rs.mu.RLock()
        defer rs.mu.RUnlock()

        jobs := make([]ScheduledReportJob, 0, len(rs.jobs))
        for _, job := range rs.jobs {
                jobs = append(jobs, *job)
        }
        return jobs
}

// ToggleJob enables or disables a scheduled report job
func (rs *ReportScheduler) ToggleJob(ctx context.Context, jobID string, enabled bool) error {
        rs.mu.Lock()
        job, ok := rs.jobs[jobID]
        if !ok {
                rs.mu.Unlock()
                return fmt.Errorf("job %s not found", jobID)
        }

        if job.Enabled && !enabled {
                // Stop the job
                if job.cancel != nil {
                        job.cancel()
                        job.cancel = nil
                }
                job.Enabled = false
                rs.mu.Unlock()
                rs.log.Info("Scheduled report job disabled", "id", jobID)
                return nil
        }

        if !job.Enabled && enabled {
                // Start the job - must release lock first since startJob may need it
                job.Enabled = true
                rs.mu.Unlock()
                rs.startJob(ctx, job)
                rs.log.Info("Scheduled report job enabled", "id", jobID)
                return nil
        }

        rs.mu.Unlock()
        return nil
}

// UpdateJob updates a scheduled report job's configuration
func (rs *ReportScheduler) UpdateJob(ctx context.Context, jobID string, req ScheduleReportRequest) error {
        rs.mu.Lock()
        job, ok := rs.jobs[jobID]
        if !ok {
                rs.mu.Unlock()
                return fmt.Errorf("job %s not found", jobID)
        }

        // Validate if report type is being changed
        if req.ReportType != "" {
                validTypes := map[string]bool{
                        "threat_summary":    true,
                        "risk_analysis":     true,
                        "pattern_report":    true,
                        "full_intelligence": true,
                }
                if !validTypes[req.ReportType] {
                        rs.mu.Unlock()
                        return fmt.Errorf("invalid report type: %s", req.ReportType)
                }
                job.ReportType = req.ReportType
        }

        if req.Name != "" {
                job.Name = req.Name
        }

        if req.IntervalMs > 0 {
                if req.IntervalMs < 60000 {
                        rs.mu.Unlock()
                        return fmt.Errorf("interval must be at least 60000ms (1 minute)")
                }
                job.Interval = time.Duration(req.IntervalMs) * time.Millisecond
                // Restart the job if it's running
                if job.Enabled {
                        if job.cancel != nil {
                                job.cancel()
                        }
                        rs.mu.Unlock()
                        rs.startJob(ctx, job)
                        return nil
                }
        }

        rs.mu.Unlock()
        return nil
}

// StopAll stops all scheduled report jobs
func (rs *ReportScheduler) StopAll() {
        rs.mu.Lock()
        defer rs.mu.Unlock()

        for _, job := range rs.jobs {
                if job.cancel != nil {
                        job.cancel()
                        job.cancel = nil
                }
                job.Enabled = false
        }
}
