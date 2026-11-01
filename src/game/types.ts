/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type GameState = 'title' | 'playing' | 'paused' | 'gameover';

export type CameraMode = 'third_person' | 'first_person';

export type ParkourAction = 'idle' | 'running' | 'sprinting' | 'jumping' | 'double_jumping' | 'falling' | 'sliding' | 'wallrunning' | 'dashing' | 'vaulting';

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface BoxCollider {
  id: string;
  type: 'ground' | 'wall' | 'bounce' | 'speed' | 'obstacle' | 'checkpoint' | 'finish' | 'hazard';
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  color?: string;
  metadata?: {
    bounceStrength?: number;
    speedBoost?: number;
    checkpointIndex?: number;
    hazardType?: 'spikes' | 'laser' | 'saw' | 'shock';
    wallNormal?: { x: number; z: number };
    moving?: {
      axis: 'x' | 'y' | 'z';
      distance: number;
      speed: number;
    };
    rotating?: {
      axis: 'x' | 'y' | 'z';
      speed: number;
    };
  };
}

export interface PlayerPhysicsState {
  position: Vector3D;
  velocity: Vector3D;
  rotation: { yaw: number; pitch: number };
  isGrounded: boolean;
  isWallRunning: boolean;
  wallNormal: { x: number; z: number } | null;
  wallRunSide: 'left' | 'right' | null;
  wallRunTimer: number;
  isSliding: boolean;
  slideTimer: number;
  isDashing: boolean;
  dashTimer: number;
  dashCooldown: number;
  dashCharges: number;
  maxDashCharges: number;
  coyoteTimer: number;
  jumpBufferTimer: number;
  jumpsRemaining: number;
  maxJumps: number;
  currentAction: ParkourAction;
  height: number; // dynamically shrinks when sliding (1.8m -> 0.9m)
  radius: number; // collision radius (0.4m)
  speed: number;
  stats: {
    jumps: number;
    wallRuns: number;
    slides: number;
    dashes: number;
    maxSpeedReached: number;
  };
}

export interface LevelDefinition {
  id: number;
  slug: string;
  name: string;
  subtitle: string;
  description: string;
  targetTimes: {
    gold: number; // seconds
    silver: number;
    bronze: number;
  };
  spawnPoint: Vector3D;
  spawnYaw: number;
  finishPoint: Vector3D;
  colliders: BoxCollider[];
  skyTheme: 'dawn' | 'zenith' | 'sunset' | 'cyber' | 'emerald' | 'crimson' | 'midnight' | 'neon';
}

export interface RunStats {
  levelId: number;
  levelName: string;
  elapsedTime: number;
  medal: 'gold' | 'silver' | 'bronze' | 'none';
  jumps: number;
  wallRuns: number;
  slides: number;
  dashes: number;
  maxSpeed: number;
  isVictory: boolean;
}
