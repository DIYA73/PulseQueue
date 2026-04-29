import type { WorkflowDefinition } from '@pulsequeue/core';

const registry = new Map<string, WorkflowDefinition>();

export function register(def: WorkflowDefinition): void {
  registry.set(def.name, def);
}

export function lookup(name: string): WorkflowDefinition | undefined {
  return registry.get(name);
}
