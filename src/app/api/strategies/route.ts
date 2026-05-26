import { NextResponse } from 'next/server';
import { mockThresholds, mockPatterns, mockRiskDimensions, mockConsensusVotes, mockPredictionData, mockAdaptiveHistory } from '@/lib/mock-data';

export async function GET() {
  return NextResponse.json({
    thresholds: mockThresholds,
    patterns: mockPatterns,
    riskDimensions: mockRiskDimensions,
    consensusVotes: mockConsensusVotes,
    predictions: mockPredictionData,
    adaptiveHistory: mockAdaptiveHistory,
  });
}

export async function PUT(request: Request) {
  const body = await request.json();

  return NextResponse.json({
    message: 'Estrategia actualizada exitosamente',
    updated: body,
  });
}
