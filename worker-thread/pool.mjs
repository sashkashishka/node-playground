import { EventEmitter } from 'node:events'
import { Worker as NodeWorker, MessageChannel } from 'node:worker_threads';
import { availableParallelism } from 'node:os';

import { ProcessError, TimeoutError } from './errors.mjs';

class Counter {
  constructor() {
    this.count = 0;
  }

  inc() {
    this.count += 1;
  }

  dec() {
    this.count -= 1;
  }
}

export class Task {
  constructor(name, metadata) {
    this.name = name;
    this.metadata = metadata;
  }
}

export class TaskPool extends EventEmitter {
  constructor() {
    super();
    this.queue = [];
  }

  add(name, metadata) {
    const task = new Task(name, metadata);
    this.queue.push(task);

    this.emit('task', task);
  }

  pop() {
    return this.queue.shift();
  }
}

export class Worker {
  /**
   * @type {NodeWorker}
   */
  #worker = undefined;
  /**
   * @type {MessageChannel}
   */
  #channel = undefined;

  #timeout = 3000;
  #concurrency = 5;
  #counter = undefined;

  constructor(file, { name, concurrency = 5, timeout = 3000 }) {
    this.name = name;
    this.#channel = new MessageChannel();
    this.#worker = new NodeWorker(file, { name });
    this.#counter = new Counter();
    this.#concurrency = concurrency;
    this.#timeout = timeout;

    this.#worker.postMessage({ port: this.#channel.port2 }, [this.#channel.port2])
  }

  isIdle() {
    return this.#counter.count < this.#concurrency;
  }

  stop() {
    return this.#worker.terminate();
  }

  /**
   * @argument {Task} task
   */
  run(task) {
    this.#counter.inc();

    const { promise, resolve, reject } = Promise.withResolvers();

    this.#channel.port1.postMessage(task);

    const handleMessage = (event) => resolve(event);
    const handleMessageError = event => reject(new ProcessError(task, event))

    this.#channel.port1.on('message', handleMessage);

    this.#channel.port1.on('messageerror', handleMessageError);

    const timer = setTimeout(() => {
      reject(new TimeoutError())
    }, this.#timeout);


    return promise.finally(() => {
      this.#counter.dec();
      clearTimeout(timer);
      this.#channel.port1.off('message', handleMessage)
      this.#channel.port1.off('messageerror', handleMessageError)
    });
  }
}


export class WorkerPool extends EventEmitter {
  #concurrency = 3;
  #counter = undefined;
  /**
   * @type {TaskPool}
   */
  #taskPool = undefined
  /**
   * @type {Array<Worker>}
   */
  #workerPool = [];
  #workerFile = '';

  constructor(taskPool, { workerFile, concurrency = availableParallelism() }) {
    super();
    this.#taskPool = taskPool;
    this.#workerFile = workerFile;
    this.#concurrency = concurrency;
    this.#counter = new Counter();

    this.#createWorkerPool();
    this.#taskPool.on('task', this.process.bind(this));
  }

  async #run(task) {
    this.#counter.inc();

    try {
      const worker = this.#getIdleWorker()

      const result = await worker.run(task);

      this.emit('result', { result, name: worker.name });
    } catch (error) {
      this.emit('error', { task, error });
    } finally {
      this.#counter.dec();
      this.process();
    }
  }

  process() {
    if (this.#concurrency <= this.#counter.count) return;

    if (!this.#getIdleWorker()) return;

    const task = this.#taskPool.pop();

    if (!task) {
      if (this.#counter.count === 0) {
        this.emit('idle');
      }

      return;
    }

    this.#run(task);
  }

  stop() {
    return Promise.all(this.#workerPool.map(w => w.stop()))
  }

  #getIdleWorker() {
    return this.#workerPool.find(w => w.isIdle());
  }

  #createWorkerPool() {
    this.#workerPool = Array.from({ length: this.#concurrency })
      .map((_v, i) => new Worker(this.#workerFile, { name: `worker #${i}` }));
  }
}
