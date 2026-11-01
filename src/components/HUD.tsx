/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { CameraMode, LevelDefinition, ParkourAction } from '../game/types';
import { formatGameTime } from '../game/rules';

interface HUDProps {
  currentLevel: LevelDefinition;
  elapsedTime: number;
  speed: number;
  dashCharges: number;
  maxDashCharges: number;
  dashCooldownProgress: number; // 0 to 1
  currentAction: ParkourAction;
  wallRunSide: 'left' | 'right' | null;
  cameraMode: CameraMode;
  mouseControlMode: 'mouse_follow' | 'pointer_lock';
  isPointerLocked: boolean;
  jumpsRemaining: number;
  maxJumps: number;
  isMuted: boolean;
  onToggleCamera: () => void;
  onToggleMouseControlMode: () => void;
  onRequestPointerLock: () => void;
  onToggleMute: () => void;
  onPause: () => void;
  onRestart: () => void;
}

export const HUD: React.FC<HUDProps> = ({
  currentLevel,
  elapsedTime,
  speed,
  dashCharges,
  maxDashCharges,
  dashCooldownProgress,
  jumpsRemaining,
  maxJumps,
  currentAction,
  wallRunSide,
  cameraMode,
  mouseControlMode,
  isPointerLocked,
  isMuted,
  onToggleCamera,
  onToggleMouseControlMode,
  onRequestPointerLock,
  onToggleMute,
  onPause,
  onRestart,
}) => {
  const kmh = Math.round(speed * 3.6);

  // Friendly action badge label
  let actionBadge = null;
  if (currentAction === 'double_jumping') {
    actionBadge = 'NHẢY KÉP [2X JUMP]';
  } else if (currentAction === 'wallrunning') {
    actionBadge = `CHẠY TƯỜNG [${wallRunSide === 'left' ? 'TRÁI' : 'PHẢI'}]`;
  } else if (currentAction === 'sliding') {
    actionBadge = 'TRƯỢT DỐC';
  } else if (currentAction === 'dashing') {
    actionBadge = 'LƯỚT KHÔNG TRUNG';
  } else if (currentAction === 'sprinting') {
    actionBadge = 'BỨT TỐC';
  }

  return (
    <div className="fixed inset-0 pointer-events-none select-none text-slate-100 font-sans z-10 flex flex-col justify-between p-6">
      {/* Top row: Left Info & Right Utilities */}
      <div className="flex justify-between items-start w-full gap-2">
        {/* Left: Speedometer & Level Header */}
        <div className="flex flex-col gap-1 bg-slate-950/85 border border-slate-800 rounded-lg p-2.5 sm:p-3.5 shadow-lg max-w-[200px] sm:max-w-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] sm:text-xs uppercase tracking-wider text-slate-300 font-mono font-bold truncate">
              {currentLevel.name}
            </span>
            <span className="text-[10px] sm:text-xs font-mono px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shrink-0">
              MÀN {currentLevel.id}
            </span>
          </div>

          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span
              className="text-3xl sm:text-4xl font-extrabold tracking-tight font-mono text-cyan-400 tabular-nums"
              style={{ textShadow: '0 0 12px rgba(6,182,212,0.4)' }}
            >
              {kmh}
            </span>
            <span className="text-[10px] sm:text-xs text-slate-400 font-mono uppercase">KM/H</span>
          </div>

          {/* Time readout */}
          <div className="flex items-center justify-between text-[11px] sm:text-xs font-mono pt-1 border-t border-slate-800/80 text-slate-300">
            <span>THỜI GIAN:</span>
            <span className="font-bold text-slate-100 tabular-nums">{formatGameTime(elapsedTime)}</span>
          </div>
        </div>

        {/* Right: Quick action buttons */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Mouse Control Mode Toggle */}
          <button
            type="button"
            onClick={onToggleMouseControlMode}
            className="hidden sm:flex items-center gap-1.5 px-3 py-2 bg-slate-900/85 hover:bg-slate-800 border border-cyan-800/60 rounded-md text-xs font-mono text-cyan-300 transition-colors shadow"
            title="Đổi cách điều khiển chuột"
          >
            <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5" />
            </svg>
            <span>{mouseControlMode === 'mouse_follow' ? 'ĐI THEO CHUỘT' : 'KHÓA GÓC NHÌN'}</span>
          </button>

          {/* Camera Mode: Always Third Person (Camera số 3) */}
          <div
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-900/85 border border-slate-700/80 rounded-md text-xs font-mono text-cyan-300 shadow select-none"
            title="Góc nhìn thứ 3 luôn luôn cố định"
          >
            <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
            <span>CAMERA SỐ 3 (3RD PERS)</span>
          </div>

          {/* Mute toggle */}
          <button
            type="button"
            onClick={onToggleMute}
            className="p-2 bg-slate-900/85 hover:bg-slate-800 border border-slate-700/80 rounded-md text-slate-300 hover:text-white transition-colors shadow"
            title="Âm thanh [M]"
          >
            {isMuted ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                />
              </svg>
            )}
          </button>

          {/* Restart */}
          <button
            type="button"
            onClick={onRestart}
            className="p-2 bg-slate-900/85 hover:bg-slate-800 border border-slate-700/80 rounded-md text-slate-300 hover:text-white transition-colors shadow"
            title="Chơi lại [R]"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>

          {/* Pause */}
          <button
            type="button"
            onClick={onPause}
            className="p-2 bg-slate-900/85 hover:bg-slate-800 border border-slate-700/80 rounded-md text-slate-300 hover:text-white transition-colors shadow"
            title="Tạm dừng [Esc/P]"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6" />
            </svg>
          </button>
        </div>
      </div>

      {/* Lock banner if pointer is not yet captured */}
      {!isPointerLocked && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 pointer-events-auto">
          <button
            type="button"
            onClick={onRequestPointerLock}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900/95 border border-cyan-500/60 text-cyan-300 hover:text-white hover:border-cyan-400 text-xs font-mono shadow-2xl transition animate-bounce cursor-pointer"
          >
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            <span>NHẤP CHUỘT VÀO ĐÂY ĐỂ KHÓA TÂM VÀO GIỮA NHÂN VẬT</span>
          </button>
        </div>
      )}

      {/* Center: Minimal Reticle Dot Fixed in Center of Character & Dynamic Action Tag */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        {/* Fixed Center Crosshair on Character */}
        <div className="relative flex items-center justify-center w-8 h-8">
          {/* Subtle outer circle */}
          <div className="w-6 h-6 rounded-full border border-cyan-400/40 flex items-center justify-center" />
          {/* 4 Micro ticks */}
          <div className="absolute top-0 w-[1.5px] h-1.5 bg-cyan-400" />
          <div className="absolute bottom-0 w-[1.5px] h-1.5 bg-cyan-400" />
          <div className="absolute left-0 h-[1.5px] w-1.5 bg-cyan-400" />
          <div className="absolute right-0 h-[1.5px] w-1.5 bg-cyan-400" />
          {/* Center pinpoint */}
          <div className="w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_8px_rgba(6,182,212,1)]" />
        </div>

        {/* Dynamic Action Badge */}
        {actionBadge && (
          <div className="mt-8 px-3 py-1 rounded bg-orange-500/90 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg animate-pulse">
            {actionBadge}
          </div>
        )}
      </div>

      {/* Bottom Center: Dash Meter & Flat Control Hints */}
      <div className="flex flex-col items-center gap-3 w-full pb-2">
        {/* Dash charges bar */}
        <div className="flex items-center gap-2 bg-slate-950/80 border border-slate-800/80 px-4 py-2 rounded-full shadow-lg">
          <span className="text-[11px] font-mono uppercase text-slate-400 font-semibold">LƯỚT [E/CHUỘT PHẢI]</span>
          <div className="flex items-center gap-1.5">
            {Array.from({ length: maxDashCharges }).map((_, i) => (
              <div
                key={i}
                className={`w-7 h-2 rounded-sm transition-all duration-150 ${
                  i < dashCharges
                    ? 'bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.8)]'
                    : 'bg-slate-800 border border-slate-700'
                }`}
              />
            ))}
          </div>
          {dashCooldownProgress > 0 && dashCharges < maxDashCharges && (
            <div className="w-10 h-1 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-cyan-500 transition-all duration-75"
                style={{ width: `${Math.round(dashCooldownProgress * 100)}%` }}
              />
            </div>
          )}

          {/* Separator */}
          <div className="w-px h-3.5 bg-slate-800" />

          {/* Double Jump Pips */}
          <span className="text-[11px] font-mono uppercase text-slate-400 font-semibold pl-1">NHẢY (2X)</span>
          <div className="flex items-center gap-1.5">
            {Array.from({ length: maxJumps }).map((_, i) => (
              <div
                key={i}
                className={`w-4 h-4 rounded-full border text-[10px] font-mono font-black flex items-center justify-center transition-all ${
                  i < jumpsRemaining
                    ? 'bg-amber-400 border-amber-300 text-slate-950 shadow-[0_0_8px_rgba(251,191,36,0.9)] scale-105'
                    : 'bg-slate-900 border-slate-800 text-slate-600'
                }`}
              >
                {i + 1}
              </div>
            ))}
          </div>
        </div>

        {/* Flat borderless control bar */}
        <div className="hidden sm:block text-[11px] font-mono text-slate-300 tracking-wide text-center bg-slate-950/70 border border-slate-800/80 px-4 py-1.5 rounded-full shadow">
          <span className="text-cyan-400 font-bold">MŨI TÊN CHUỘT</span> Định hướng ·{' '}
          <span className="text-white font-bold">GIỮ CHUỘT TRÁI / W</span> Đi tới ·{' '}
          <span className="text-amber-400 font-bold">SPACE</span> Nhảy x2 (Nhảy đà + Nhảy kép) ·{' '}
          <span className="text-slate-300 font-semibold">SHIFT</span> Bứt tốc ·{' '}
          <span className="text-slate-300 font-semibold">C</span> Trượt ·{' '}
          <span className="text-slate-300 font-semibold">CHUỘT PHẢI / E</span> Lướt ·{' '}
          <span className="text-slate-400">ESC Tạm dừng</span>
        </div>

        {/* Mobile touch controls row */}
        <div className="flex sm:hidden items-center justify-between w-full px-2 pointer-events-auto">
          {/* Left movement touch triggers */}
          <div className="flex gap-2">
            <button
              type="button"
              onTouchStart={() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }))}
              onTouchEnd={() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }))}
              onMouseDown={() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }))}
              onMouseUp={() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }))}
              className="w-12 h-12 rounded-lg bg-slate-900/90 border border-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center active:bg-orange-500 active:text-slate-950 transition"
              aria-label="Tiến lên"
            >
              ▲
            </button>
            <button
              type="button"
              onTouchStart={() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC' }))}
              onTouchEnd={() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyC' }))}
              onMouseDown={() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC' }))}
              onMouseUp={() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyC' }))}
              className="px-3 h-12 rounded-lg bg-slate-900/90 border border-slate-700 text-slate-200 font-mono text-[11px] font-bold flex items-center justify-center active:bg-orange-500 active:text-slate-950 transition"
            >
              TRƯỢT
            </button>
          </div>

          {/* Right action touch triggers */}
          <div className="flex gap-2">
            <button
              type="button"
              onTouchStart={() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }))}
              onTouchEnd={() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' }))}
              onMouseDown={() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }))}
              onMouseUp={() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' }))}
              className="px-3 h-12 rounded-lg bg-cyan-950/80 border border-cyan-700 text-cyan-300 font-mono text-[11px] font-bold flex items-center justify-center active:bg-cyan-500 active:text-slate-950 transition"
            >
              LƯỚT
            </button>
            <button
              type="button"
              onTouchStart={() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }))}
              onTouchEnd={() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }))}
              onMouseDown={() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }))}
              onMouseUp={() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }))}
              className="w-16 h-12 rounded-lg bg-orange-500 border border-orange-400 text-slate-950 font-black text-xs flex items-center justify-center active:bg-orange-400 shadow-lg"
              aria-label="Nhảy 2 lần"
            >
              NHẢY 2X
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
