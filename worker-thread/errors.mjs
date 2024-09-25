export class TimeoutError extends Error {}

export class ProcessError extends Error {
  constructor(task, event) {
    super('Process error');

    this.task = task;
    this.event = event;
  }
}

