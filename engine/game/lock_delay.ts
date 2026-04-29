type LockDelayState = {
  lockTimerMs: number;
  lockDelayResetsUsed: number;
  hasTouchedGround: boolean;
};

/** A piece locks when its timer expires or the player has spent all grounded reset actions. */
const lockDelayShouldLock = (state: LockDelayState, lockDelayMs: number, maxLockResets: number): boolean => {
  return state.lockTimerMs >= lockDelayMs || state.lockDelayResetsUsed >= maxLockResets;
};

/** Moving farther along gravity is meaningful progress and fully refreshes lock delay. */
const applyDownwardAdvanceLockDelayTransition = (
  state: LockDelayState,
  reachedNewLow: boolean,
  isGrounded: boolean,
): LockDelayState => {
  const next = { ...state };
  if (reachedNewLow) {
    next.lockDelayResetsUsed = 0;
    next.lockTimerMs = 0;
    next.hasTouchedGround = false;
  }
  if (isGrounded) next.hasTouchedGround = true;
  return next;
};

/** Lateral moves/rotations reset lock delay only while grounded and only up to the reset cap. */
const applyGroundedActionLockDelayTransition = (
  state: LockDelayState,
  reachedNewLow: boolean,
  isGrounded: boolean,
  maxLockResets: number,
): LockDelayState => {
  const next = { ...state };
  if (reachedNewLow) {
    next.lockDelayResetsUsed = 0;
    next.lockTimerMs = 0;
    next.hasTouchedGround = false;
  }
  if (isGrounded) next.hasTouchedGround = true;
  if (next.hasTouchedGround && !reachedNewLow && next.lockDelayResetsUsed < maxLockResets) {
    next.lockTimerMs = 0;
    next.lockDelayResetsUsed += 1;
  }
  return next;
};

export {
  lockDelayShouldLock,
  applyDownwardAdvanceLockDelayTransition,
  applyGroundedActionLockDelayTransition,
};
export type { LockDelayState };
