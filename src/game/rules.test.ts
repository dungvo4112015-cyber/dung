/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkPointInBox,
  resolveBoxCollision,
  evaluateWallRun,
  calculateMedal,
  formatGameTime,
  calculateYawTowards,
  canPerformJump,
  PHYSICS_CONSTANTS,
} from './rules';
import { BoxCollider } from './types';

test('checkPointInBox detects containment inside box bounds', () => {
  const box: BoxCollider = {
    id: 'b1',
    type: 'ground',
    x: 0,
    y: 0,
    z: 0,
    width: 10,
    height: 2,
    depth: 10,
  };

  assert.equal(checkPointInBox({ x: 0, y: 0, z: 0 }, box), true);
  assert.equal(checkPointInBox({ x: 4, y: 0.9, z: 4 }, box), true);
  assert.equal(checkPointInBox({ x: 6, y: 0, z: 0 }, box), false);
  assert.equal(checkPointInBox({ x: 0, y: 2.1, z: 0 }, box), false);
});

test('resolveBoxCollision lands player squarely on top of box', () => {
  const floorBox: BoxCollider = {
    id: 'floor',
    type: 'ground',
    x: 0,
    y: 0,
    z: 0,
    width: 20,
    height: 2, // top is at y = 1
    depth: 20,
  };

  // Player falling down towards floor
  const playerPos = { x: 0, y: 0.95, z: 0 };
  const playerVel = { x: 0, y: -5, z: 0 };

  const res = resolveBoxCollision(
    playerPos,
    playerVel,
    PHYSICS_CONSTANTS.PLAYER_RADIUS,
    PHYSICS_CONSTANTS.PLAYER_STANDING_HEIGHT,
    floorBox
  );

  assert.equal(res.hitGround, true);
  assert.equal(res.pos.y, 1.0); // clamped to top of box (y = 1)
  assert.equal(res.vel.y, 0); // vertical downward velocity stopped
});

test('resolveBoxCollision stops horizontal penetration against wall', () => {
  const wallBox: BoxCollider = {
    id: 'wall',
    type: 'wall',
    x: 10,
    y: 5,
    z: 0,
    width: 2, // left edge is at x = 9
    height: 10,
    depth: 10,
  };

  // Player running towards wall from x = 8.8 with radius = 0.4 (penetrating into 9.2)
  const playerPos = { x: 8.8, y: 5, z: 0 };
  const playerVel = { x: 6, y: 0, z: 0 };

  const res = resolveBoxCollision(
    playerPos,
    playerVel,
    0.4,
    1.8,
    wallBox
  );

  assert.equal(res.hitWall, true);
  assert.equal(res.pos.x, 8.6); // 9.0 - 0.4
  assert.equal(res.vel.x, 0);
  assert.notEqual(res.wallNormal, null);
  assert.equal(res.wallNormal?.x, -1);
});

test('evaluateWallRun validates wall alignment and side', () => {
  const wallNormal = { x: 1, z: 0 }; // Wall is facing +X (running along Z axis)
  const lookYaw = Math.PI; // Looking in +Z direction (forward: x=0, z=1)
  const vel = { x: 0, y: 0, z: 10 };

  const res = evaluateWallRun(false, wallNormal, lookYaw, vel);
  assert.equal(res.canWallRun, true);
  assert.ok(res.side === 'left' || res.side === 'right');
  assert.equal(res.forwardDir.z !== 0, true);

  // Grounded player cannot wall run
  const groundedRes = evaluateWallRun(true, wallNormal, lookYaw, vel);
  assert.equal(groundedRes.canWallRun, false);
});

test('calculateMedal evaluates time against thresholds correctly', () => {
  const targets = { gold: 20, silver: 30, bronze: 45 };

  assert.equal(calculateMedal(18.5, targets), 'gold');
  assert.equal(calculateMedal(20.0, targets), 'gold');
  assert.equal(calculateMedal(25.4, targets), 'silver');
  assert.equal(calculateMedal(35.0, targets), 'bronze');
  assert.equal(calculateMedal(50.0, targets), 'none');
});

test('formatGameTime produces accurate two-digit padded strings', () => {
  assert.equal(formatGameTime(65.42), '01:05.42');
  assert.equal(formatGameTime(9.08), '00:09.08');
  assert.equal(formatGameTime(0), '00:00.00');
});

test('calculateYawTowards points directly to target coordinate', () => {
  // Target directly forward (-Z)
  const yawForward = calculateYawTowards({ x: 0, z: 0 }, { x: 0, z: -10 });
  assert.ok(Math.abs(yawForward - 0) < 0.001);

  // Target directly right (+X)
  const yawRight = calculateYawTowards({ x: 0, z: 0 }, { x: 10, z: 0 });
  assert.ok(Math.abs(yawRight - (-Math.PI / 2)) < 0.001);

  // Target directly left (-X)
  const yawLeft = calculateYawTowards({ x: 0, z: 0 }, { x: -10, z: 0 });
  assert.ok(Math.abs(yawLeft - (Math.PI / 2)) < 0.001);

  // Target backward (+Z)
  const yawBack = calculateYawTowards({ x: 0, z: 0 }, { x: 0, z: 10 });
  assert.ok(Math.abs(Math.abs(yawBack) - Math.PI) < 0.001);
});

test('canPerformJump supports ground jump, double jump in air, and wall jump', () => {
  // 1. On ground -> ground jump
  const groundRes = canPerformJump(true, 0, false, 2);
  assert.equal(groundRes.canJump, true);
  assert.equal(groundRes.jumpType, 'ground');

  // 2. In coyote time -> ground jump
  const coyoteRes = canPerformJump(false, 0.1, false, 2);
  assert.equal(coyoteRes.canJump, true);
  assert.equal(coyoteRes.jumpType, 'ground');

  // 3. In mid-air with 1 jump remaining -> double jump
  const doubleJumpRes = canPerformJump(false, 0, false, 1);
  assert.equal(doubleJumpRes.canJump, true);
  assert.equal(doubleJumpRes.jumpType, 'double');

  // 4. In mid-air with 0 jumps remaining -> cannot jump
  const exhaustedRes = canPerformJump(false, 0, false, 0);
  assert.equal(exhaustedRes.canJump, false);
  assert.equal(exhaustedRes.jumpType, 'none');

  // 5. On wall -> wall jump
  const wallRes = canPerformJump(false, 0, true, 0);
  assert.equal(wallRes.canJump, true);
  assert.equal(wallRes.jumpType, 'wall');
});

test('resolveBoxCollision detects lethal hazard collision', () => {
  const spikeTrap: BoxCollider = {
    id: 'trap_1',
    type: 'hazard',
    x: 0,
    y: 1.0,
    z: -20,
    width: 6,
    height: 1,
    depth: 4,
    metadata: { hazardType: 'spikes' },
  };

  // Player enters hazard volume
  const playerPos = { x: 0, y: 0.8, z: -20 };
  const playerVel = { x: 0, y: -2, z: -5 };

  const res = resolveBoxCollision(playerPos, playerVel, 0.4, 1.8, spikeTrap);
  assert.equal(res.triggerType, 'hazard');
});



