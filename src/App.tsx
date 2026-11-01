/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { CameraMode, GameState, PlayerPhysicsState, RunStats, Vector3D } from './game/types';
import { LEVELS } from './game/levels';
import { ParkourRenderer } from './game/renderer';
import {
  calculateMedal,
  calculateYawTowards,
  canPerformJump,
  evaluateWallRun,
  PHYSICS_CONSTANTS,
  resolveBoxCollision,
} from './game/rules';
import { sounds } from './game/sound';
import { HUD } from './components/HUD';
import { GameOverModal, PauseModal, TitleScreen, VictoryModal } from './components/Modals';

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<ParkourRenderer | null>(null);

  // High-level game state
  const [gameState, setGameState] = useState<GameState>('title');
  const [currentLevelId, setCurrentLevelId] = useState<number>(1);
  const cameraMode: CameraMode = 'third_person';
  const [mouseControlMode, setMouseControlMode] = useState<'mouse_follow' | 'pointer_lock'>('pointer_lock');
  const [isPointerLocked, setIsPointerLocked] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [defeatReason, setDefeatReason] = useState<'fall' | 'trap'>('fall');

  // HUD-bound throttled state (updated at ~10Hz or on discrete events)
  const [hudState, setHudState] = useState({
    speed: 0,
    elapsedTime: 0,
    dashCharges: 1,
    maxDashCharges: 1,
    dashCooldownProgress: 0,
    jumpsRemaining: 2,
    maxJumps: 2,
    currentAction: 'idle' as PlayerPhysicsState['currentAction'],
    wallRunSide: null as 'left' | 'right' | null,
  });

  // Run outcome statistics
  const [runStats, setRunStats] = useState<RunStats | null>(null);

  // Active level reference
  const currentLevel = LEVELS.find((l) => l.id === currentLevelId) || LEVELS[0];

  // Mutable game simulation state held in ref (decoupled from React renders)
  const simRef = useRef({
    gameState: 'title' as GameState,
    level: currentLevel,
    player: {
      position: { ...currentLevel.spawnPoint },
      velocity: { x: 0, y: 0, z: 0 },
      rotation: { yaw: currentLevel.spawnYaw, pitch: 0 },
      isGrounded: true,
      isWallRunning: false,
      wallNormal: null as { x: number; z: number } | null,
      wallRunSide: null as 'left' | 'right' | null,
      wallRunTimer: 0,
      isSliding: false,
      slideTimer: 0,
      isDashing: false,
      dashTimer: 0,
      dashCooldown: 0,
      dashCharges: 1,
      maxDashCharges: 1,
      coyoteTimer: 0,
      jumpBufferTimer: 0,
      jumpsRemaining: 2,
      maxJumps: 2,
      currentAction: 'idle' as PlayerPhysicsState['currentAction'],
      height: PHYSICS_CONSTANTS.PLAYER_STANDING_HEIGHT,
      radius: PHYSICS_CONSTANTS.PLAYER_RADIUS,
      speed: 0,
      stats: {
        jumps: 0,
        wallRuns: 0,
        slides: 0,
        dashes: 0,
        maxSpeedReached: 0,
      },
    } as PlayerPhysicsState,
    checkpointPos: { ...currentLevel.spawnPoint },
    checkpointYaw: currentLevel.spawnYaw,
    elapsedTime: 0,
    keys: new Set<string>(),
    mouseControlMode: 'mouse_follow' as 'mouse_follow' | 'pointer_lock',
    mouseNdcX: 0,
    mouseNdcY: 0,
    mouseDeltaX: 0,
    mouseDeltaY: 0,
    isLeftMouseDown: false,
    isPointerLocked: false,
    lastTime: performance.now(),
    lastHudUpdate: 0,
    footstepTimer: 0,
  });

  // Keep ref in sync with active level
  useEffect(() => {
    simRef.current.level = currentLevel;
    simRef.current.checkpointPos = { ...currentLevel.spawnPoint };
    simRef.current.checkpointYaw = currentLevel.spawnYaw;
    if (rendererRef.current) {
      rendererRef.current.loadLevel(currentLevel);
    }
  }, [currentLevelId, currentLevel]);

  // Mirror game state to document.body.dataset.state for ultra-mode / accessibility
  useEffect(() => {
    document.body.dataset.state = gameState;
    simRef.current.gameState = gameState;

    if (rendererRef.current) {
      rendererRef.current.isTitleScreen = gameState === 'title';
    }

    if (gameState === 'playing') {
      sounds.startAmbientBeat();
    } else {
      sounds.stopAmbientBeat();
    }
  }, [gameState]);

  // Main Three.js mount and loop
  useEffect(() => {
    if (!mountRef.current) return;

    // Check for autostart
    const urlParams = new URLSearchParams(window.location.search);
    const autostart = urlParams.get('autostart') === '1';

    const parkourRenderer = new ParkourRenderer(mountRef.current);
    rendererRef.current = parkourRenderer;
    parkourRenderer.loadLevel(simRef.current.level);

    if (autostart) {
      startGame();
    }

    let frameId = 0;
    let isRunning = true;

    // Game physics tick
    const tick = (now: number) => {
      if (!isRunning) return;

      const sim = simRef.current;
      const rawDt = (now - sim.lastTime) / 1000;
      sim.lastTime = now;
      const dt = Math.min(rawDt, 0.05);

      // Handle animated platforms
      parkourRenderer.updateAnimatedPlatforms(now * 0.001);

      if (sim.gameState === 'playing') {
        sim.elapsedTime += dt;
        updatePhysics(sim, dt);
      }

      // Update camera and 3D player mesh
      parkourRenderer.updateCamera(sim.player, dt);
      parkourRenderer.updatePlayerMesh(sim.player, now * 0.001);

      // Throttle React HUD updates to ~10-15Hz
      if (now - sim.lastHudUpdate > 80) {
        sim.lastHudUpdate = now;
        setHudState({
          speed: sim.player.speed,
          elapsedTime: sim.elapsedTime,
          dashCharges: sim.player.dashCharges,
          maxDashCharges: sim.player.maxDashCharges,
          dashCooldownProgress: 1 - sim.player.dashCooldown / PHYSICS_CONSTANTS.DASH_COOLDOWN,
          jumpsRemaining: sim.player.jumpsRemaining,
          maxJumps: sim.player.maxJumps,
          currentAction: sim.player.currentAction,
          wallRunSide: sim.player.wallRunSide,
        });
      }

      // Render frame
      parkourRenderer.render();

      // Pacing for Software WebGL vs GPU
      if (parkourRenderer.isSoftwareGl) {
        // afterDraw sync fence
        const gl = parkourRenderer.renderer.getContext() as WebGL2RenderingContext;
        const sync = gl.fenceSync?.(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();

        const poll = () => {
          if (!isRunning) return;
          const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (state === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(() => tick(performance.now()), 70);
          }
        };
        frameId = window.setTimeout(poll, 5);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    frameId = requestAnimationFrame(tick);

    return () => {
      isRunning = false;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      parkourRenderer.destroy();
      sounds.stopAmbientBeat();
    };
  }, []);

  // Update physics function
  const updatePhysics = (sim: typeof simRef.current, dt: number) => {
    const p = sim.player;
    const keys = sim.keys;

    // 1. Mouse rotation & aim (Fixed in center of character)
    p.rotation.yaw -= sim.mouseDeltaX * 0.0024;
    p.rotation.pitch -= sim.mouseDeltaY * 0.0022;
    p.rotation.pitch = Math.max(-Math.PI / 2.4, Math.min(Math.PI / 2.4, p.rotation.pitch));
    sim.mouseDeltaX = 0;
    sim.mouseDeltaY = 0;

    // 2. Dash cooldown recovery
    if (p.dashCooldown > 0) {
      p.dashCooldown = Math.max(0, p.dashCooldown - dt);
      if (p.dashCooldown === 0 && p.dashCharges < p.maxDashCharges) {
        p.dashCharges++;
      }
    }

    // 3. Movement intent vectors (WASD or Hold Left Click towards center reticle)
    let moveForward = 0;
    let moveRight = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp') || sim.isLeftMouseDown) {
      moveForward += 1;
    }
    if (keys.has('KeyS') || keys.has('ArrowDown')) moveForward -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) moveRight += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) moveRight -= 1;

    const isSprinting = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const isSlideKeyDown = keys.has('KeyC') || keys.has('ControlLeft') || keys.has('ControlRight');

    // Calculate heading forward/right unit vectors
    const sinYaw = Math.sin(p.rotation.yaw);
    const cosYaw = Math.cos(p.rotation.yaw);

    const fwdX = -sinYaw;
    const fwdZ = -cosYaw;
    const rightX = cosYaw;
    const rightZ = -sinYaw;

    let wishX = fwdX * moveForward + rightX * moveRight;
    let wishZ = fwdZ * moveForward + rightZ * moveRight;
    const wishLen = Math.sqrt(wishX * wishX + wishZ * wishZ);
    if (wishLen > 0.001) {
      wishX /= wishLen;
      wishZ /= wishLen;
    }

    // Slide state handling
    if (isSlideKeyDown && p.isGrounded && !p.isSliding && p.speed > 4.5) {
      p.isSliding = true;
      p.slideTimer = 1.0;
      p.height = PHYSICS_CONSTANTS.PLAYER_SLIDING_HEIGHT;
      p.stats.slides++;
      sounds.playSlide();
      // Boost initial slide speed
      p.velocity.x = wishX * PHYSICS_CONSTANTS.SLIDE_SPEED;
      p.velocity.z = wishZ * PHYSICS_CONSTANTS.SLIDE_SPEED;
    }

    if (p.isSliding) {
      p.slideTimer -= dt;
      if (p.slideTimer <= 0 || !isSlideKeyDown || p.speed < 2.0) {
        p.isSliding = false;
        p.height = PHYSICS_CONSTANTS.PLAYER_STANDING_HEIGHT;
      }
    }

    // Dash state handling
    if (p.isDashing) {
      p.dashTimer -= dt;
      if (p.dashTimer <= 0) {
        p.isDashing = false;
      }
    }

    // 4. Horizontal velocity updates
    if (!p.isDashing) {
      if (p.isSliding) {
        // Sliding: low friction, retain momentum
        const friction = Math.exp(-PHYSICS_CONSTANTS.FRICTION_SLIDE * dt);
        p.velocity.x *= friction;
        p.velocity.z *= friction;
      } else if (p.isWallRunning) {
        // Wall run speed
        p.wallRunTimer -= dt;
        if (p.wallRunTimer <= 0) {
          p.isWallRunning = false;
        }
      } else if (p.isGrounded) {
        // Ground running / sprinting
        const targetSpeed = isSprinting ? PHYSICS_CONSTANTS.SPRINT_SPEED : PHYSICS_CONSTANTS.WALK_SPEED;
        const targetVelX = wishX * targetSpeed;
        const targetVelZ = wishZ * targetSpeed;

        const accel = PHYSICS_CONSTANTS.ACCELERATION_GROUND * dt;
        p.velocity.x += (targetVelX - p.velocity.x) * Math.min(accel, 1);
        p.velocity.z += (targetVelZ - p.velocity.z) * Math.min(accel, 1);

        // Footsteps
        if (wishLen > 0.1 && p.speed > 2.0) {
          sim.footstepTimer += dt;
          const interval = isSprinting ? 0.28 : 0.38;
          if (sim.footstepTimer >= interval) {
            sim.footstepTimer = 0;
            sounds.playFootstep();
          }
        }
      } else {
        // Air control
        const airAccel = PHYSICS_CONSTANTS.ACCELERATION_AIR * dt;
        p.velocity.x += wishX * airAccel;
        p.velocity.z += wishZ * airAccel;

        // Air drag
        const airDrag = Math.exp(-PHYSICS_CONSTANTS.FRICTION_AIR * dt);
        p.velocity.x *= airDrag;
        p.velocity.z *= airDrag;
      }
    }

    // 5. Vertical velocity & Gravity
    if (p.isWallRunning) {
      p.velocity.y += PHYSICS_CONSTANTS.WALL_RUN_GRAVITY * dt;
      p.velocity.y = Math.max(p.velocity.y, -3.5); // float along wall
    } else if (!p.isDashing) {
      p.velocity.y += PHYSICS_CONSTANTS.GRAVITY * dt;
      p.velocity.y = Math.max(p.velocity.y, PHYSICS_CONSTANTS.MAX_FALL_SPEED);
    }

    // 6. Timers: Coyote time & Jump buffer
    if (p.isGrounded) {
      p.coyoteTimer = PHYSICS_CONSTANTS.COYOTE_TIME;
    } else {
      p.coyoteTimer = Math.max(0, p.coyoteTimer - dt);
    }

    if (p.jumpBufferTimer > 0) {
      p.jumpBufferTimer -= dt;
      if (tryExecuteJump(p)) {
        p.jumpBufferTimer = 0;
      }
    }

    // 7. Integrate position
    p.position.x += p.velocity.x * dt;
    p.position.y += p.velocity.y * dt;
    p.position.z += p.velocity.z * dt;

    p.speed = Math.sqrt(p.velocity.x * p.velocity.x + p.velocity.z * p.velocity.z);
    if (p.speed > p.stats.maxSpeedReached) {
      p.stats.maxSpeedReached = p.speed;
    }

    // 8. Collision detection & Resolution against level colliders
    let wasGrounded = p.isGrounded;
    p.isGrounded = false;
    let contactWallNormal: { x: number; z: number } | null = null;

    for (const box of sim.level.colliders) {
      const res = resolveBoxCollision(p.position, p.velocity, p.radius, p.height, box);

      if (res.triggerType === 'finish') {
        triggerVictory(sim);
        return;
      }

      if (res.triggerType === 'hazard') {
        triggerDefeat(sim, 'trap');
        return;
      }

      if (res.triggerType === 'checkpoint') {
        const cpIdx = box.metadata?.checkpointIndex || 1;
        if (box.x !== sim.checkpointPos.x || box.z !== sim.checkpointPos.z) {
          sim.checkpointPos = { x: box.x, y: box.y + 1.2, z: box.z };
          sounds.playCheckpoint();
        }
      }

      if (res.hitGround) {
        p.isGrounded = true;
        p.jumpsRemaining = p.maxJumps;
        p.position = res.pos;
        p.velocity = res.vel;

        // Bounce Pad trigger
        if (box.type === 'bounce') {
          const bouncePower = box.metadata?.bounceStrength || 20;
          p.velocity.y = bouncePower;
          p.isGrounded = false;
          p.jumpsRemaining = p.maxJumps;
          sounds.playBounce();
        }

        // Speed Strip trigger
        if (box.type === 'speed') {
          const boost = box.metadata?.speedBoost || 16;
          p.velocity.x = fwdX * boost;
          p.velocity.z = fwdZ * boost;
          sounds.playDash();
        }
      }

      if (res.hitWall) {
        p.position = res.pos;
        p.velocity = res.vel;
        contactWallNormal = res.wallNormal;
      }

      if (res.hitCeiling) {
        p.position = res.pos;
        p.velocity = res.vel;
      }
    }

    // Land audio
    if (!wasGrounded && p.isGrounded) {
      sounds.playLand();
      p.isWallRunning = false;
      p.jumpsRemaining = p.maxJumps;
    }

    // 9. Wall Run evaluation
    if (!p.isGrounded && contactWallNormal) {
      const wallEval = evaluateWallRun(p.isGrounded, contactWallNormal, p.rotation.yaw, p.velocity);
      if (wallEval.canWallRun && !p.isWallRunning) {
        p.isWallRunning = true;
        p.wallNormal = contactWallNormal;
        p.wallRunSide = wallEval.side;
        p.wallRunTimer = PHYSICS_CONSTANTS.WALL_RUN_MAX_DURATION;
        p.jumpsRemaining = p.maxJumps; // Wall-run restores mid-air jump
        p.stats.wallRuns++;
        sounds.playWallRun();

        // Guide velocity along wall
        p.velocity.x = wallEval.forwardDir.x * PHYSICS_CONSTANTS.WALL_RUN_SPEED;
        p.velocity.z = wallEval.forwardDir.z * PHYSICS_CONSTANTS.WALL_RUN_SPEED;
        p.velocity.y = 2.5; // slight initial lift
      }
    } else if (p.isGrounded) {
      p.isWallRunning = false;
    }

    // 10. Update current action badge
    if (p.isDashing) p.currentAction = 'dashing';
    else if (p.isSliding) p.currentAction = 'sliding';
    else if (p.isWallRunning) p.currentAction = 'wallrunning';
    else if (p.currentAction === 'double_jumping' && !p.isGrounded && p.velocity.y > 0) {
      // Maintain double_jumping action while ascending
    } else if (!p.isGrounded) p.currentAction = p.velocity.y > 0 ? 'jumping' : 'falling';
    else if (isSprinting && p.speed > 4) p.currentAction = 'sprinting';
    else if (p.speed > 0.5) p.currentAction = 'running';
    else p.currentAction = 'idle';

    // 11. Abyss fall reset check
    if (p.position.y < -16) {
      triggerDefeat(sim, 'fall');
    }
  };

  const performGroundJump = (p: PlayerPhysicsState) => {
    p.velocity.y = PHYSICS_CONSTANTS.JUMP_FORCE;
    p.isGrounded = false;
    p.coyoteTimer = 0;
    p.jumpBufferTimer = 0;
    p.jumpsRemaining = 1;
    p.currentAction = 'jumping';
    p.stats.jumps++;
    sounds.playJump();
  };

  const performDoubleJump = (p: PlayerPhysicsState) => {
    p.velocity.y = PHYSICS_CONSTANTS.DOUBLE_JUMP_FORCE;
    p.isGrounded = false;
    p.coyoteTimer = 0;
    p.jumpBufferTimer = 0;
    p.jumpsRemaining = 0;
    p.currentAction = 'double_jumping';
    p.stats.jumps++;
    sounds.playDoubleJump();
    rendererRef.current?.spawnDoubleJumpRing(p.position);
  };

  const performWallJump = (p: PlayerPhysicsState) => {
    if (!p.wallNormal) return;
    p.velocity.y = PHYSICS_CONSTANTS.WALL_JUMP_UP_FORCE;
    p.velocity.x += p.wallNormal.x * PHYSICS_CONSTANTS.WALL_JUMP_OUT_FORCE;
    p.velocity.z += p.wallNormal.z * PHYSICS_CONSTANTS.WALL_JUMP_OUT_FORCE;
    p.isWallRunning = false;
    p.jumpBufferTimer = 0;
    p.jumpsRemaining = 1;
    p.currentAction = 'jumping';
    p.stats.jumps++;
    sounds.playJump();
  };

  const tryExecuteJump = (p: PlayerPhysicsState): boolean => {
    const jumpCheck = canPerformJump(p.isGrounded, p.coyoteTimer, p.isWallRunning, p.jumpsRemaining);
    if (!jumpCheck.canJump) return false;

    if (jumpCheck.jumpType === 'wall' && p.wallNormal) {
      performWallJump(p);
      return true;
    }
    if (jumpCheck.jumpType === 'ground') {
      performGroundJump(p);
      return true;
    }
    if (jumpCheck.jumpType === 'double') {
      performDoubleJump(p);
      return true;
    }
    return false;
  };

  const performAirDash = (p: PlayerPhysicsState) => {
    if (p.dashCharges <= 0 || p.isDashing) return;
    p.dashCharges--;
    p.dashCooldown = PHYSICS_CONSTANTS.DASH_COOLDOWN;
    p.isDashing = true;
    p.dashTimer = PHYSICS_CONSTANTS.DASH_DURATION;
    p.stats.dashes++;

    const sinYaw = Math.sin(p.rotation.yaw);
    const cosYaw = Math.cos(p.rotation.yaw);
    p.velocity.x = -sinYaw * PHYSICS_CONSTANTS.DASH_SPEED;
    p.velocity.z = -cosYaw * PHYSICS_CONSTANTS.DASH_SPEED;
    p.velocity.y = 2.0; // slight upward recovery
    sounds.playDash();
  };

  const triggerVictory = (sim: typeof simRef.current) => {
    document.exitPointerLock?.();
    const medal = calculateMedal(sim.elapsedTime, sim.level.targetTimes);
    setRunStats({
      levelId: sim.level.id,
      levelName: sim.level.name,
      elapsedTime: sim.elapsedTime,
      medal,
      jumps: sim.player.stats.jumps,
      wallRuns: sim.player.stats.wallRuns,
      slides: sim.player.stats.slides,
      dashes: sim.player.stats.dashes,
      maxSpeed: sim.player.stats.maxSpeedReached,
      isVictory: true,
    });
    setGameState('gameover');
    sounds.playVictory();
  };

  const triggerDefeat = (sim: typeof simRef.current, reason: 'fall' | 'trap' = 'fall') => {
    document.exitPointerLock?.();
    setDefeatReason(reason);
    if (reason === 'trap') {
      sounds.playTrapDeath();
    } else {
      sounds.playFall();
    }
    setGameState('gameover');
    setRunStats(null); // Indicates fall / incomplete
  };

  // Input listeners
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Space / Enter on Title starts the game immediately
      if (simRef.current.gameState === 'title') {
        if (e.code === 'Space' || e.code === 'Enter') {
          e.preventDefault();
          startGame();
          return;
        }
      }

      // Space on GameOver respawns
      if (simRef.current.gameState === 'gameover' && !runStats?.isVictory) {
        if (e.code === 'Space' || e.code === 'KeyR') {
          e.preventDefault();
          respawnCheckpoint();
          return;
        }
      }

      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (simRef.current.gameState === 'playing') {
          pauseGame();
        } else if (simRef.current.gameState === 'paused') {
          resumeGame();
        }
        return;
      }

      if (e.code === 'KeyR' && simRef.current.gameState === 'playing') {
        restartLevel();
        return;
      }

      if (e.code === 'KeyM') {
        toggleMute();
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        simRef.current.player.jumpBufferTimer = PHYSICS_CONSTANTS.JUMP_BUFFER;
        tryExecuteJump(simRef.current.player);
      }

      if (e.code === 'KeyE') {
        performAirDash(simRef.current.player);
      }

      simRef.current.keys.add(e.code);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      simRef.current.keys.delete(e.code);
      // Variable jump cut when releasing space while ascending
      if (e.code === 'Space' && simRef.current.player.velocity.y > 0) {
        simRef.current.player.velocity.y *= 0.5;
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      // Direct high-precision center mouse delta
      simRef.current.mouseDeltaX += e.movementX;
      simRef.current.mouseDeltaY += e.movementY;
    };

    const onMouseDown = (e: MouseEvent) => {
      if (simRef.current.gameState === 'playing') {
        if (e.button === 0) {
          // Left click: walk/run towards center crosshair direction
          simRef.current.isLeftMouseDown = true;
          if (!document.pointerLockElement) {
            try {
              document.body.requestPointerLock?.();
            } catch {
              // Ignored
            }
          }
        } else if (e.button === 2) {
          // Right click: Air Dash towards center crosshair
          performAirDash(simRef.current.player);
        }
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) {
        simRef.current.isLeftMouseDown = false;
      }
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault(); // Prevent context menu during right click dash
    };

    const onPointerLockChange = () => {
      const locked = !!document.pointerLockElement;
      simRef.current.isPointerLocked = locked;
      setIsPointerLocked(locked);
    };

    const onBlur = () => {
      simRef.current.keys.clear();
      simRef.current.isLeftMouseDown = false;
      simRef.current.mouseDeltaX = 0;
      simRef.current.mouseDeltaY = 0;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    window.addEventListener('blur', onBlur);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      window.removeEventListener('blur', onBlur);
    };
  }, [runStats]);

  // Actions
  const startGame = () => {
    const sim = simRef.current;
    sim.player.position = { ...sim.level.spawnPoint };
    sim.player.velocity = { x: 0, y: 0, z: 0 };
    sim.player.rotation.yaw = sim.level.spawnYaw;
    sim.player.rotation.pitch = 0;
    sim.player.isGrounded = true;
    sim.player.isWallRunning = false;
    sim.player.isSliding = false;
    sim.player.isDashing = false;
    sim.player.dashCharges = 1;
    sim.player.jumpsRemaining = 2;
    sim.player.maxJumps = 2;
    sim.player.stats = { jumps: 0, wallRuns: 0, slides: 0, dashes: 0, maxSpeedReached: 0 };
    sim.checkpointPos = { ...sim.level.spawnPoint };
    sim.checkpointYaw = sim.level.spawnYaw;
    sim.elapsedTime = 0;
    sim.keys.clear();

    setRunStats(null);
    setGameState('playing');

    // Only request pointer lock if mode is pointer_lock
    if (sim.mouseControlMode === 'pointer_lock') {
      try {
        document.body.requestPointerLock?.();
      } catch {
        // Ignored if forbidden
      }
    }
  };

  const respawnCheckpoint = () => {
    const sim = simRef.current;
    sim.player.position = { ...sim.checkpointPos };
    sim.player.velocity = { x: 0, y: 0, z: 0 };
    sim.player.rotation.yaw = sim.checkpointYaw;
    sim.player.rotation.pitch = 0;
    sim.player.isGrounded = true;
    sim.player.isWallRunning = false;
    sim.player.isSliding = false;
    sim.player.isDashing = false;
    sim.player.dashCharges = 1;
    sim.player.jumpsRemaining = 2;
    sim.player.maxJumps = 2;

    setGameState('playing');
    if (sim.mouseControlMode === 'pointer_lock') {
      try {
        document.body.requestPointerLock?.();
      } catch {
        // Ignored
      }
    }
  };

  const restartLevel = () => {
    startGame();
  };

  const nextLevel = () => {
    const nextIdx = (currentLevelId % LEVELS.length) + 1;
    setCurrentLevelId(nextIdx);
    setTimeout(() => {
      startGame();
    }, 50);
  };

  const pauseGame = () => {
    document.exitPointerLock?.();
    setGameState('paused');
  };

  const resumeGame = () => {
    setGameState('playing');
    if (simRef.current.mouseControlMode === 'pointer_lock') {
      try {
        document.body.requestPointerLock?.();
      } catch {
        // Ignored
      }
    }
  };

  const quitToTitle = () => {
    document.exitPointerLock?.();
    setGameState('title');
  };

  const toggleCameraMode = () => {
    // Camera is strictly locked to third-person (Camera số 3)
    if (rendererRef.current) {
      rendererRef.current.cameraMode = 'third_person';
    }
  };

  const toggleMouseControlMode = () => {
    const nextMode = mouseControlMode === 'mouse_follow' ? 'pointer_lock' : 'mouse_follow';
    setMouseControlMode(nextMode);
    simRef.current.mouseControlMode = nextMode;
    if (nextMode === 'mouse_follow') {
      document.exitPointerLock?.();
    } else {
      try {
        document.body.requestPointerLock?.();
      } catch {
        // Ignored
      }
    }
  };

  const requestPointerLock = () => {
    try {
      document.body.requestPointerLock?.();
    } catch {
      // Ignored
    }
  };

  const toggleMute = () => {
    const muted = sounds.toggleMute();
    setIsMuted(muted);
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 font-sans select-none">
      {/* 3D WebGL Canvas Mount (Isolated from React HUD reconciliations) */}
      <div
        ref={mountRef}
        onClick={requestPointerLock}
        className="absolute inset-0 w-full h-full cursor-crosshair"
      />

      {/* In-Game HUD (Only during active playing or paused) */}
      {gameState === 'playing' && (
        <HUD
          currentLevel={currentLevel}
          elapsedTime={hudState.elapsedTime}
          speed={hudState.speed}
          dashCharges={hudState.dashCharges}
          maxDashCharges={hudState.maxDashCharges}
          dashCooldownProgress={hudState.dashCooldownProgress}
          jumpsRemaining={hudState.jumpsRemaining}
          maxJumps={hudState.maxJumps}
          currentAction={hudState.currentAction}
          wallRunSide={hudState.wallRunSide}
          cameraMode={cameraMode}
          mouseControlMode={mouseControlMode}
          isPointerLocked={isPointerLocked}
          isMuted={isMuted}
          onToggleCamera={toggleCameraMode}
          onToggleMouseControlMode={toggleMouseControlMode}
          onRequestPointerLock={requestPointerLock}
          onToggleMute={toggleMute}
          onPause={pauseGame}
          onRestart={restartLevel}
        />
      )}

      {/* Title Screen Overlay */}
      {gameState === 'title' && (
        <TitleScreen
          levels={LEVELS}
          selectedLevelId={currentLevelId}
          onSelectLevel={setCurrentLevelId}
          onStartGame={startGame}
          cameraMode={cameraMode}
          onToggleCamera={toggleCameraMode}
        />
      )}

      {/* Pause Modal */}
      {gameState === 'paused' && (
        <PauseModal onResume={resumeGame} onRestart={restartLevel} onQuitToTitle={quitToTitle} />
      )}

      {/* Game Over / Victory Modal */}
      {gameState === 'gameover' && (
        <>
          {runStats?.isVictory ? (
            <VictoryModal
              stats={runStats}
              hasNextLevel={currentLevelId < LEVELS.length}
              onNextLevel={nextLevel}
              onReplay={restartLevel}
              onQuitToTitle={quitToTitle}
            />
          ) : (
            <GameOverModal
              reason={defeatReason}
              onRespawn={respawnCheckpoint}
              onRestart={restartLevel}
              onQuitToTitle={quitToTitle}
            />
          )}
        </>
      )}
    </div>
  );
}
