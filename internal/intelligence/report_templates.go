package intelligence

import (
        "context"
        "fmt"
        "time"

        "github.com/google/uuid"
        "github.com/zerodha/logf"
)

// ScheduledReportTemplates provides pre-configured report scheduling templates
type ScheduledReportTemplates struct {
        scheduler *ReportScheduler
        log       logf.Logger
}

// NewScheduledReportTemplates creates a new template manager
func NewScheduledReportTemplates(scheduler *ReportScheduler, log logf.Logger) *ScheduledReportTemplates {
        return &ScheduledReportTemplates{
                scheduler: scheduler,
                log:       log,
        }
}

// Template represents a pre-configured report schedule template
type Template struct {
        ID          string        `json:"id"`
        Name        string        `json:"name"`
        Description string        `json:"description"`
        ReportType  string        `json:"reportType"`
        Interval    time.Duration `json:"interval"`
        Category    string        `json:"category"` // "daily", "hourly", "weekly", "realtime"
}

// DefaultTemplates returns the built-in report schedule templates
func DefaultTemplates() []Template {
        return []Template{
                {
                        ID:          "tpl-hourly-threat",
                        Name:        "Hourly Threat Summary",
                        Description: "Generates a threat summary every hour from live OSINT data",
                        ReportType:  "threat_summary",
                        Interval:    1 * time.Hour,
                        Category:    "hourly",
                },
                {
                        ID:          "tpl-hourly-risk",
                        Name:        "Hourly Risk Analysis",
                        Description: "Analyzes entity risk scores every hour",
                        ReportType:  "risk_analysis",
                        Interval:    1 * time.Hour,
                        Category:    "hourly",
                },
                {
                        ID:          "tpl-daily-full",
                        Name:        "Daily Full Intelligence Report",
                        Description: "Comprehensive daily intelligence report combining all data sources",
                        ReportType:  "full_intelligence",
                        Interval:    24 * time.Hour,
                        Category:    "daily",
                },
                {
                        ID:          "tpl-daily-pattern",
                        Name:        "Daily Pattern Analysis",
                        Description: "Daily analysis of detected patterns across all message sources",
                        ReportType:  "pattern_report",
                        Interval:    24 * time.Hour,
                        Category:    "daily",
                },
                {
                        ID:          "tpl-6hr-threat",
                        Name:        "6-Hour Threat Monitor",
                        Description: "Semi-daily threat monitoring for high-activity periods",
                        ReportType:  "threat_summary",
                        Interval:    6 * time.Hour,
                        Category:    "daily",
                },
                {
                        ID:          "tpl-6hr-maritime",
                        Name:        "6-Hour Maritime Threat Monitor",
                        Description: "Maritime zone intelligence, vessel activity, and chokepoint analysis every 6 hours",
                        ReportType:  "maritime_threat",
                        Interval:    6 * time.Hour,
                        Category:    "daily",
                },
                {
                        ID:          "tpl-daily-maritime",
                        Name:        "Daily Maritime Threat Report",
                        Description: "Comprehensive daily report on maritime zone intelligence, vessel tracking, and chokepoint analysis",
                        ReportType:  "maritime_threat",
                        Interval:    24 * time.Hour,
                        Category:    "daily",
                },
        }
}

// ApplyTemplate creates a scheduled job from a template
func (srt *ScheduledReportTemplates) ApplyTemplate(ctx context.Context, templateID string, enabled bool) (*ScheduledReportJob, error) {
        var selected *Template
        for _, t := range DefaultTemplates() {
                if t.ID == templateID {
                        selected = &t
                        break
                }
        }
        if selected == nil {
                return nil, fmt.Errorf("template %s not found", templateID)
        }

        req := ScheduleReportRequest{
                Name:       selected.Name,
                ReportType: selected.ReportType,
                IntervalMs: int64(selected.Interval / time.Millisecond),
                Enabled:    enabled,
        }

        job, err := srt.scheduler.CreateJob(ctx, req)
        if err != nil {
                return nil, fmt.Errorf("failed to create job from template: %w", err)
        }

        srt.log.Info("Report schedule created from template", "template", templateID, "jobId", job.ID)
        return job, nil
}

// ApplyAllTemplates creates jobs for all default templates
func (srt *ScheduledReportTemplates) ApplyAllTemplates(ctx context.Context, enabled bool) ([]*ScheduledReportJob, error) {
        var jobs []*ScheduledReportJob
        for _, t := range DefaultTemplates() {
                job, err := srt.ApplyTemplate(ctx, t.ID, enabled)
                if err != nil {
                        srt.log.Error("Failed to apply template", "template", t.ID, "error", err)
                        continue
                }
                jobs = append(jobs, job)
        }
        return jobs, nil
}

// ReportExecution represents a record of a report generation execution
type ReportExecution struct {
        ID          string    `json:"id"`
        JobID       string    `json:"jobId"`
        ReportType  string    `json:"reportType"`
        ReportID    string    `json:"reportId"`
        Severity    string    `json:"severity"`
        StartedAt   time.Time `json:"startedAt"`
        CompletedAt time.Time `json:"completedAt"`
        DurationMs  int64     `json:"durationMs"`
        Success     bool      `json:"success"`
        Error       string    `json:"error,omitempty"`
}

// ReportExecutionLog tracks report generation executions
type ReportExecutionLog struct {
        executions []ReportExecution
        maxSize    int
}

// NewReportExecutionLog creates a new execution log
func NewReportExecutionLog(maxSize int) *ReportExecutionLog {
        if maxSize <= 0 {
                maxSize = 100
        }
        return &ReportExecutionLog{
                executions: make([]ReportExecution, 0),
                maxSize:    maxSize,
        }
}

// Record adds a new execution record
func (rel *ReportExecutionLog) Record(exec ReportExecution) {
        rel.executions = append(rel.executions, exec)
        if len(rel.executions) > rel.maxSize {
                rel.executions = rel.executions[len(rel.executions)-rel.maxSize:]
        }
}

// NewExecution creates a new execution record for a job
func NewExecution(jobID, reportType string) ReportExecution {
        return ReportExecution{
                ID:         uuid.New().String(),
                JobID:      jobID,
                ReportType: reportType,
                StartedAt:  time.Now(),
        }
}

// Complete marks the execution as completed
func (re *ReportExecution) Complete(report *Report) {
        re.CompletedAt = time.Now()
        re.DurationMs = re.CompletedAt.Sub(re.StartedAt).Milliseconds()
        re.ReportID = report.ID
        re.Severity = report.Severity
        re.Success = true
}

// Fail marks the execution as failed
func (re *ReportExecution) Fail(err error) {
        re.CompletedAt = time.Now()
        re.DurationMs = re.CompletedAt.Sub(re.StartedAt).Milliseconds()
        re.Success = false
        if err != nil {
                re.Error = err.Error()
        }
}

// GetRecent returns the most recent executions
func (rel *ReportExecutionLog) GetRecent(limit int) []ReportExecution {
        if limit > len(rel.executions) {
                limit = len(rel.executions)
        }
        result := make([]ReportExecution, limit)
        copy(result, rel.executions[len(rel.executions)-limit:])
        return result
}

// GetStats returns execution statistics
func (rel *ReportExecutionLog) GetStats() map[string]interface{} {
        total := len(rel.executions)
        successCount := 0
        failCount := 0
        var totalDuration int64

        for _, e := range rel.executions {
                if e.Success {
                        successCount++
                } else {
                        failCount++
                }
                totalDuration += e.DurationMs
        }

        avgDuration := int64(0)
        if total > 0 {
                avgDuration = totalDuration / int64(total)
        }

        return map[string]interface{}{
                "totalExecutions": total,
                "successCount":    successCount,
                "failureCount":    failCount,
                "avgDurationMs":   avgDuration,
        }
}
