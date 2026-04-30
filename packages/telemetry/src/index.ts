import { NodeTracerProvider }     from '@opentelemetry/sdk-trace-node';
import { BatchSpanProcessor,
         ConsoleSpanExporter }    from '@opentelemetry/sdk-trace-node';
import { OTLPTraceExporter }      from '@opentelemetry/exporter-trace-otlp-http';
import { Resource }               from '@opentelemetry/resources';

export { trace, context, SpanStatusCode } from '@opentelemetry/api';

/**
 * Call once at process startup — before any other imports that need tracing.
 *
 * When OTEL_EXPORTER_OTLP_ENDPOINT is set (e.g. http://localhost:4318),
 * traces are sent to Jaeger / any OTLP-compatible backend.
 * Otherwise they are printed to the console (handy for local dev).
 */
export function initTelemetry(serviceName: string): void {
  const exporter = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
    ? new OTLPTraceExporter({
        url: `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
      })
    : new ConsoleSpanExporter();

  const provider = new NodeTracerProvider({
    resource: new Resource({ 'service.name': serviceName }),
    spanProcessors: [new BatchSpanProcessor(exporter)],
  });

  provider.register();

  // Flush remaining spans on shutdown
  process.once('SIGTERM', () => provider.shutdown());
  process.once('SIGINT',  () => provider.shutdown());

  console.log(
    `[telemetry] service="${serviceName}" → ${
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'console'
    }`,
  );
}
