import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// ===== GET /api/predictions =====
// Returns recent predictions, accuracy stats, and upcoming predictions

async function _GET() {
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Recent predictions (last 24h)
  const recentPredictions = await db.prediction.findMany({
    where: {
      predictedAt: { gte: twentyFourHoursAgo },
    },
    orderBy: { predictedAt: 'desc' },
  });

  // Predictions where actualValue is set — for accuracy computation
  const validatedPredictions = await db.prediction.findMany({
    where: {
      actualValue: { not: null },
    },
    orderBy: { targetTime: 'desc' },
    take: 500,
  });

  // Compute MAE (Mean Absolute Error)
  let mae = 0;
  let mape = 0;
  let mapeCount = 0;

  if (validatedPredictions.length > 0) {
    const totalAbsError = validatedPredictions.reduce((sum, p) => {
      const actual = p.actualValue ?? 0;
      return sum + Math.abs(actual - p.value);
    }, 0);
    mae = totalAbsError / validatedPredictions.length;

    // Compute MAPE (Mean Absolute Percentage Error) — only for predictions where value > 0
    const mapeEligible = validatedPredictions.filter((p) => p.value > 0);
    mapeCount = mapeEligible.length;

    if (mapeEligible.length > 0) {
      const totalAbsPctError = mapeEligible.reduce((sum, p) => {
        const actual = p.actualValue ?? 0;
        return sum + Math.abs((actual - p.value) / p.value);
      }, 0);
      mape = (totalAbsPctError / mapeEligible.length) * 100;
    }
  }

  // Upcoming predictions (targetTime in the future)
  const upcomingPredictions = await db.prediction.findMany({
    where: {
      targetTime: { gt: now },
      actualValue: null,
    },
    orderBy: { targetTime: 'asc' },
    take: 50,
  });

  return NextResponse.json({
    recent: recentPredictions,
    accuracy: {
      totalValidated: validatedPredictions.length,
      mae: Math.round(mae * 100) / 100,
      mape: Math.round(mape * 100) / 100,
      mapeEligibleCount: mapeCount,
    },
    upcoming: upcomingPredictions,
  });
}

// ===== POST /api/predictions =====
// Create a new prediction manually
// Body: { metric: string, period: 'hour'|'day'|'week', value: number, confidence: number }

async function _POST(request: Request) {
  let body: {
    metric?: string;
    period?: string;
    value?: number;
    confidence?: number;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const { metric, period, value, confidence } = body;

  // Validate required fields
  if (!metric || typeof metric !== 'string') {
    return NextResponse.json(
      { error: 'Field "metric" is required and must be a string' },
      { status: 400 },
    );
  }

  const validPeriods = ['hour', 'day', 'week'];
  if (!period || !validPeriods.includes(period)) {
    return NextResponse.json(
      { error: 'Field "period" is required and must be one of: hour, day, week' },
      { status: 400 },
    );
  }

  if (value === undefined || typeof value !== 'number') {
    return NextResponse.json(
      { error: 'Field "value" is required and must be a number' },
      { status: 400 },
    );
  }

  if (confidence === undefined || typeof confidence !== 'number') {
    return NextResponse.json(
      { error: 'Field "confidence" is required and must be a number' },
      { status: 400 },
    );
  }

  // Auto-set predictedAt to now and targetTime based on period
  const predictedAt = new Date();

  let targetTime: Date;
  switch (period) {
    case 'hour':
      targetTime = new Date(predictedAt.getTime() + 60 * 60 * 1000);
      break;
    case 'day':
      targetTime = new Date(predictedAt.getTime() + 24 * 60 * 60 * 1000);
      break;
    case 'week':
      targetTime = new Date(predictedAt.getTime() + 7 * 24 * 60 * 60 * 1000);
      break;
    default:
      targetTime = new Date(predictedAt.getTime() + 60 * 60 * 1000);
  }

  const prediction = await db.prediction.create({
    data: {
      metric,
      period,
      predictedAt,
      targetTime,
      value,
      confidence,
    },
  });

  return NextResponse.json(prediction, { status: 201 });
}

export { _GET as GET, _POST as POST };
