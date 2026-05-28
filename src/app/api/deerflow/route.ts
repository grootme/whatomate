import { NextResponse } from 'next/server';
import { fetchService } from '@/lib/intelligence/service-client';

// Default data that matches the DeerFlowData interface in the frontend
const defaultRuns = [
  {
    id: 'run-001',
    query: 'Impact of transformer architectures on multi-modal AI systems in 2024',
    status: 'completed',
    model: 'gpt-4o',
    startTime: new Date(Date.now() - 7200000).toISOString(),
    duration: '4m 32s',
    result: 'Transformer architectures have fundamentally reshaped multi-modal AI in 2024. Key developments include: unified transformer models, cross-attention mechanisms for modality fusion, and efficient architectures like Mamba.',
    citations: [],
  },
];

const defaultAgents = [
  { id: 'agent-lead', name: 'Lead Researcher', type: 'lead', status: 'idle', description: 'Orchestrates research workflow', tasksCompleted: 0, lastActive: 'Never' },
];

const defaultSkills = [
  { id: 'sk-web-search', name: 'Web Search', description: 'Search the web for information', type: 'tool', enabled: true },
];

const defaultModels = [
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
  'anthropic/claude-3.5-sonnet',
  'anthropic/claude-3-haiku',
];

export async function GET() {
  // Check if Hermes is available for research tasks
  const status = await fetchService<Record<string, unknown>>('hermes', '/status');

  const isOnline = !status.error;

  return NextResponse.json({
    runs: defaultRuns,
    agents: defaultAgents,
    skills: defaultSkills,
    availableModels: defaultModels,
    status: isOnline ? 'online' : 'offline',
    available: isOnline,
    hermesStatus: status.data ?? { status: 'unavailable' },
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const topic = body.topic ?? body.query;

    // Execute research via Hermes agent
    const result = await fetchService<Record<string, unknown>>('hermes', '/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task: `Investigar: ${topic}`,
        tools: ['deerflow_research'],
      }),
    });

    return NextResponse.json({
      run: {
        id: `run-${Date.now()}`,
        query: topic,
        status: result.error ? 'failed' : 'completed',
        model: body.model ?? 'openai/gpt-4o',
        startTime: new Date().toISOString(),
        duration: '—',
        result: result.data ? String(result.data) : undefined,
        citations: [],
      },
      error: result.error,
    });
  } catch (error) {
    return NextResponse.json({
      run: {
        id: `run-${Date.now()}`,
        query: 'Unknown',
        status: 'failed',
        model: 'openai/gpt-4o',
        startTime: new Date().toISOString(),
        duration: '0s',
        result: undefined,
        citations: [],
      },
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
