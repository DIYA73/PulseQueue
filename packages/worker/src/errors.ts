export class StepFailed extends Error {
  constructor(
    public readonly stepName: string,
    public readonly cause: unknown,
  ) {
    super(`Step "${stepName}" failed`);
    this.name = 'StepFailed';
  }
}

export class WorkflowSuspended extends Error {
  constructor(public readonly reason: string) {
    super(`Workflow suspended: ${reason}`);
    this.name = 'WorkflowSuspended';
  }
}
