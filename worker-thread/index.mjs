import { performance } from 'node:perf_hooks';
import path from 'node:path';
import { TaskPool, WorkerPool } from "./pool.mjs";

const taskPool = new TaskPool();
const workerPool = new WorkerPool(
  taskPool,
  {
    workerFile: path.resolve(import.meta.dirname, './worker.mjs'),
  },
);

const start = performance.now();

workerPool.on('result', (data) => console.log('complete', data));
workerPool.on('error', (data) => console.log('error', data));
workerPool.on('idle', () => {
  const end = performance.now();
  console.log(`[WORKER] ${end - start}ms.`);

  workerPool.stop()
});

const POKEMON_LIST = [
  'pikachu',
  "charmander",
  "charmeleon",
  "charizard",
  "sunkern",
  "sunflora",
  "tropius",
  "helioptile",
  "heliolisk",
  "houndoom-mega",
  "charizard-gmax"
]

const TASK_AMOUNT = 1000;

Array.from({ length: TASK_AMOUNT }).forEach((v, i) => taskPool.add(POKEMON_LIST[i % POKEMON_LIST.length]))
