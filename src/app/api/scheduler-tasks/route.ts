import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/intelligence/auth';
import {
  getSchedulerStatus,
  runTask,
  runPendingTasks,
  updateTaskConfig,
} from '@/lib/intelligence/scheduler';

// ===== GET /api/scheduler-tasks =====
// Returns scheduler status (all tasks, intervals, last/next runs, enabled state)

async function _GET() {
  const status = getSchedulerStatus();

  return NextResponse.json({
    tasks: status,
    totalTasks: status.length,
    enabledTasks: status.filter((t) => t.enabled).length,
    disabledTasks: status.filter((t) => !t.enabled).length,
  });
}

// ===== POST /api/scheduler-tasks =====
// Run a specific task or all pending tasks
// Body: { taskId?: string } — if taskId provided, run that task; otherwise run all pending

async function _POST(request: Request) {
  let body: { taskId?: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const { taskId } = body;

  if (taskId) {
    // Run a specific task
    const result = await runTask(taskId);

    if (!result.success) {
      return NextResponse.json(
        {
          error: result.error || `Task "${taskId}" failed`,
          taskId: result.taskId,
          durationMs: result.durationMs,
        },
        { status: 422 },
      );
    }

    return NextResponse.json({
      message: `Task "${taskId}" executed successfully`,
      result,
    });
  }

  // Run all pending tasks
  const results = await runPendingTasks();

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  return NextResponse.json({
    message: `Executed ${results.length} pending task(s)`,
    totalExecuted: results.length,
    succeeded,
    failed,
    results,
  });
}

// ===== PUT /api/scheduler-tasks =====
// Update task configuration
// Body: { taskId: string, enabled?: boolean, intervalMs?: number }

async function _PUT(request: Request) {
  let body: {
    taskId?: string;
    enabled?: boolean;
    intervalMs?: number;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const { taskId, enabled, intervalMs } = body;

  if (!taskId || typeof taskId !== 'string') {
    return NextResponse.json(
      { error: 'Field "taskId" is required and must be a string' },
      { status: 400 },
    );
  }

  if (enabled === undefined && intervalMs === undefined) {
    return NextResponse.json(
      { error: 'At least one of "enabled" or "intervalMs" must be provided' },
      { status: 400 },
    );
  }

  if (intervalMs !== undefined && (typeof intervalMs !== 'number' || intervalMs <= 0)) {
    return NextResponse.json(
      { error: 'Field "intervalMs" must be a positive number' },
      { status: 400 },
    );
  }

  const updated = updateTaskConfig(taskId, { enabled, intervalMs });

  if (!updated) {
    return NextResponse.json(
      { error: `Task "${taskId}" not found in scheduler configuration` },
      { status: 404 },
    );
  }

  // Return the updated status
  const status = getSchedulerStatus();
  const updatedTask = status.find((t) => t.id === taskId);

  return NextResponse.json({
    message: `Task "${taskId}" configuration updated`,
    task: updatedTask,
  });
}

export const GET = withAuth(_GET);
export const POST = withAuth(_POST);
export const PUT = withAuth(_PUT);
