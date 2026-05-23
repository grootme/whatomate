// Instrumentation disabled — Go backend and PostgreSQL are not available in this environment.
// Next.js runs as a proxy only, forwarding API calls to the Hermes/DeerFlow/Cognitive services.

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('[Whatomate] Running in proxy-only mode (no Go backend)');
  }
}
