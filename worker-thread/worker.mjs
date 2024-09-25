import { parentPort, MessagePort } from 'node:worker_threads';

/**
 * @type {MessageChannel['port2']}
 */
let port = undefined;

parentPort.once('message', (event) => {
  if ('port' in event && event.port instanceof MessagePort) {
    port = event.port;

    main();
  }
});

function main() {
  let abortController = new AbortController();

  async function getPokemon(task) {
    abortController = new AbortController();

    const res = await fetch(
      `https://pokeapi.co/api/v2/pokemon/${task.name}`,
      { signal: abortController.signal },
    );

    port.postMessage(await res.json())
  }

  function onMessage(event) {
    getPokemon(event.data);
  }

  function onMessageError() {
    abortController.abort();
  }

  function onClose() {
    abortController.abort();
  }

  port.addEventListener('message', onMessage);

  port.addEventListener('messageerror', onMessageError)

  port.addEventListener('close', onClose)
}

