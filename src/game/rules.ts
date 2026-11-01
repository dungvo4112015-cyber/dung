/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BoxCollider, PlayerPhysicsState, Vector3D } from './types';

export const PHYSICS_CONSTANTS = {
  GRAVITY: -24.0,
  WALK_SPEED: 8.5,
  SPRINT_SPEED: 14.0,
  SLIDE_SPEED: 17.0,
  WALL_RUN_SPEED: 12.5,
  DASH_SPEED: 26.0,
  MAX_FALL_SPEED: -32.0,
  ACCELERATION_GROUND: 45.0,
  ACCELERATION_AIR: 16.0,
  FRICTION_GROUND: 10.0,
  FRICTION_SLIDE: 2.2,
  FRICTION_AIR: 0.8,
  JUMP_FORCE: 10.5,
  DOUBLE_JUMP_FORCE: 10.0,
  WALL_JUMP_UP_FORCE: 9.0,
  WALL_JUMP_OUT_FORCE: 8.5,
  WALL_RUN_MAX_DURATION: 1.8,
  WALL_RUN_GRAVITY: -4.5,
  COYOTE_TIME: 0.14,
  JUMP_BUFFER: 0.12,
  DASH_DURATION: 0.18,
  DASH_COOLDOWN: 1.0,
  PLAYER_STANDING_HEIGHT: 1.8,
  PLAYER_SLIDING_HEIGHT: 0.9,
  PLAYER_RADIUS: 0.4,
};

/**
 * Determines whether a jump can be performed, and what type (ground jump, wall jump, or double jump).
 */
export function canPerformJump(
  isGrounded: boolean,
  coyoteTimer: number,
  isWallRunning: boolean,
  jumpsRemaining: number
): { canJump: boolean; jumpType: 'ground' | 'wall' | 'double' | 'none' } {
  if (isWallRunning) {
    return { canJump: true, jumpType: 'wall' };
  }
  if (isGrounded || coyoteTimer > 0) {
    return { canJump: true, jumpType: 'ground' };
  }
  if (jumpsRemaining > 0) {
    return { canJump: true, jumpType: 'double' };
  }
  return { canJump: false, jumpType: 'none' };
}

/**
 * Checks if a 3D point is within an AABB BoxCollider expanded by player radius/height.
 */
export function checkPointInBox(point: Vector3D, box: BoxCollider): boolean {
  const minX = box.x - box.width / 2;
  const maxX = box.x + box.width / 2;
  const minY = box.y - box.height / 2;
  const maxY = box.y + box.height / 2;
  const minZ = box.z - box.depth / 2;
  const maxZ = box.z + box.depth / 2;

  return (
    point.x >= minX &&
    point.x <= maxX &&
    point.y >= minY &&
    point.y <= maxY &&
    point.z >= minZ &&
    point.z <= maxZ
  );
}

/**
 * Resolves player collision against an AABB box.
 * Returns adjusted position and collision normal flags.
 */
export function resolveBoxCollision(
  pos: Vector3D,
  vel: Vector3D,
  playerRadius: number,
  playerHeight: number,
  box: BoxCollider
): {
  pos: Vector3D;
  vel: Vector3D;
  hitGround: boolean;
  hitCeiling: boolean;
  hitWall: boolean;
  wallNormal: { x: number; z: number } | null;
  triggerType?: string;
} {
  const halfW = box.width / 2;
  const halfH = box.height / 2;
  const halfD = box.depth / 2;

  const boxMinX = box.x - halfW;
  const boxMaxX = box.x + halfW;
  const boxMinY = box.y - halfH;
  const boxMaxY = box.y + halfH;
  const boxMinZ = box.z - halfD;
  const boxMaxZ = box.z + halfD;

  const playerMinY = pos.y;
  const playerMaxY = pos.y + playerHeight;

  // Check overall bounding overlap with radius
  const overlapX = pos.x + playerRadius > boxMinX && pos.x - playerRadius < boxMaxX;
  const overlapY = playerMaxY > boxMinY && playerMinY < boxMaxY;
  const overlapZ = pos.z + playerRadius > boxMinZ && pos.z - playerRadius < boxMaxZ;

  if (!overlapX || !overlapY || !overlapZ) {
    return {
      pos,
      vel,
      hitGround: false,
      hitCeiling: false,
      hitWall: false,
      wallNormal: null,
    };
  }

  // Trigger non-solid interactables
  if (box.type === 'checkpoint' || box.type === 'finish' || box.type === 'hazard') {
    return {
      pos,
      vel,
      hitGround: false,
      hitCeiling: false,
      hitWall: false,
      wallNormal: null,
      triggerType: box.type,
    };
  }

  // Calculate penetrations along each axis
  const penX1 = pos.x + playerRadius - boxMinX; // entering from minX
  const penX2 = boxMaxX - (pos.x - playerRadius); // entering from maxX
  const penX = penX1 < penX2 ? penX1 : -penX2;

  const penY1 = playerMaxY - boxMinY; // hitting box ceiling with head
  const penY2 = boxMaxY - playerMinY; // landing on box top with feet
  const penY = penY1 < penY2 ? penY1 : -penY2;

  const penZ1 = pos.z + playerRadius - boxMinZ;
  const penZ2 = boxMaxZ - (pos.z - playerRadius);
  const penZ = penZ1 < penZ2 ? penZ1 : -penZ2;

  const absX = Math.abs(penX);
  const absY = Math.abs(penY);
  const absZ = Math.abs(penZ);

  const newPos = { ...pos };
  const newVel = { ...vel };
  let hitGround = false;
  let hitCeiling = false;
  let hitWall = false;
  let wallNormal: { x: number; z: number } | null = null;

  // Find minimum penetration axis to push out
  if (absY < absX && absY < absZ) {
    if (penY < 0) {
      // Landing on top of the box
      newPos.y = boxMaxY;
      if (newVel.y < 0) newVel.y = 0;
      hitGround = true;
    } else {
      // Bumping head into ceiling
      newPos.y = boxMinY - playerHeight;
      if (newVel.y > 0) newVel.y = 0;
      hitCeiling = true;
    }
  } else if (absX < absZ) {
    // Push out along X
    if (penX > 0) {
      newPos.x = boxMinX - playerRadius;
      wallNormal = { x: -1, z: 0 };
    } else {
      newPos.x = boxMaxX + playerRadius;
      wallNormal = { x: 1, z: 0 };
    }
    newVel.x = 0;
    hitWall = true;
  } else {
    // Push out along Z
    if (penZ > 0) {
      newPos.z = boxMinZ - playerRadius;
      wallNormal = { x: 0, z: -1 };
    } else {
      newPos.z = boxMaxZ + playerRadius;
      wallNormal = { x: 0, z: 1 };
    }
    newVel.z = 0;
    hitWall = true;
  }

  return {
    pos: newPos,
    vel: newVel,
    hitGround,
    hitCeiling,
    hitWall,
    wallNormal,
    triggerType: box.type,
  };
}

/**
 * Calculates wall-running validity and orientation.
 */
export function evaluateWallRun(
  isGrounded: boolean,
  wallNormal: { x: number; z: number } | null,
  lookYaw: number,
  vel: Vector3D
): { canWallRun: boolean; side: 'left' | 'right' | null; forwardDir: { x: number; z: number } } {
  if (isGrounded || !wallNormal) {
    return { canWallRun: false, side: null, forwardDir: { x: 0, z: 0 } };
  }

  // Wall tangent directions
  const tangent1 = { x: -wallNormal.z, z: wallNormal.x };
  const tangent2 = { x: wallNormal.z, z: -wallNormal.x };

  // Player forward vector from yaw
  const forward = {
    x: -Math.sin(lookYaw),
    z: -Math.cos(lookYaw),
  };

  // Dot products to find which tangent matches player heading
  const dot1 = forward.x * tangent1.x + forward.z * tangent1.z;
  const dot2 = forward.x * tangent2.x + forward.z * tangent2.z;

  const chosenTangent = dot1 > dot2 ? tangent1 : tangent2;
  const forwardAlignment = Math.max(dot1, dot2);

  // Must be somewhat moving parallel to wall (cos > 0.25)
  if (forwardAlignment < 0.25) {
    return { canWallRun: false, side: null, forwardDir: { x: 0, z: 0 } };
  }

  // Cross product of forward and wallNormal determines left/right side
  const cross = forward.x * wallNormal.z - forward.z * wallNormal.x;
  const side = cross > 0 ? 'left' : 'right';

  return {
    canWallRun: true,
    side,
    forwardDir: chosenTangent,
  };
}

/**
 * Calculates medal based on clear time compared to target thresholds.
 */
export function calculateMedal(
  timeSeconds: number,
  targetTimes: { gold: number; silver: number; bronze: number }
): 'gold' | 'silver' | 'bronze' | 'none' {
  if (timeSeconds <= targetTimes.gold) return 'gold';
  if (timeSeconds <= targetTimes.silver) return 'silver';
  if (timeSeconds <= targetTimes.bronze) return 'bronze';
  return 'none';
}

/**
 * Formats time in mm:ss.SS
 */
export function formatGameTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const hundredths = Math.floor((seconds % 1) * 100);

  const mm = mins.toString().padStart(2, '0');
  const ss = secs.toString().padStart(2, '0');
  const cs = hundredths.toString().padStart(2, '0');

  return `${mm}:${ss}.${cs}`;
}

/**
 * Calculates yaw angle so that character faces target (dx, dz) in 3D world space.
 * Forward convention in Three.js camera: (-sin(yaw), -cos(yaw)).
 */
export function calculateYawTowards(
  from: { x: number; z: number },
  target: { x: number; z: number }
): number {
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  if (Math.abs(dx) < 0.0001 && Math.abs(dz) < 0.0001) {
    return 0;
  }
  return Math.atan2(-dx, -dz);
}

