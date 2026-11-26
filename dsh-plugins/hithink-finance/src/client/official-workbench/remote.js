export async function readOfficialBoard(open, signal) {
  if (signal.aborted) return undefined;
  let handle;
  const dispose = () => {
    handle?.dispose();
    handle = undefined;
  };
  signal.addEventListener('abort', dispose, { once: true });
  try {
    const stream = await open();
    if (typeof stream?.dispose !== 'function') throw new Error('Official board stream unavailable');
    handle = stream;
    if (signal.aborted) return undefined;
    for await (const result of stream) return result;
    if (!signal.aborted) throw new Error('Official board stream ended before returning data');
  } finally {
    signal.removeEventListener('abort', dispose);
    dispose();
  }
}
