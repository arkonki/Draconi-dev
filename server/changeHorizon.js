// Change-event ids are handed out when a row is written, not when its transaction commits, so a
// lower id can become visible after a higher one. A reader that moved its cursor to the highest id
// it could see would then skip the late event for good.
//
// The horizon is the highest id below which nothing can still appear. Each call notes the last id
// handed out and the next transaction id; every id up to that point belongs to a transaction that
// already had its transaction id. Once all transactions older than the noted one have finished,
// those ids are settled and the horizon moves up to them.
export function createChangeEventHorizon({ readLastAllocatedId, readSnapshot, maxCheckpoints = 256 }) {
  const checkpoints = [];
  let safeId = null;
  let inFlight = null;

  const advance = async () => {
    // The id must be read before the snapshot: the argument above depends on that order.
    const allocatedId = await readLastAllocatedId();
    const { xmin, xmax } = await readSnapshot();
    const newest = checkpoints.at(-1)?.id ?? safeId ?? -1;
    if (allocatedId > newest && checkpoints.length < maxCheckpoints) {
      checkpoints.push({ id: allocatedId, xmax });
    }
    while (checkpoints.length > 0 && checkpoints[0].xmax <= xmin) {
      safeId = Math.max(safeId ?? 0, checkpoints.shift().id);
    }
    return { safeId, pending: checkpoints.length > 0 };
  };

  /** `safeId` is null until the first checkpoint settles; `pending` means newer ids are still waiting. */
  return () => {
    if (!inFlight) {
      inFlight = advance().finally(() => {
        inFlight = null;
      });
    }
    return inFlight;
  };
}
