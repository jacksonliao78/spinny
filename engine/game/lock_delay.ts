type LockDelayState = {
  lockTimerMs: number;
  lockDelayResetsUsed: number;
  hasTouchedGround: boolean;
};

const lockDelayShouldLock = (state: LockDelayState, lockDelayMs: number, maxLockResets: number): boolean => {
  return state.lockTimerMs >= lockDelayMs || state.lockDelayResetsUsed >= maxLockResets;
};

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
