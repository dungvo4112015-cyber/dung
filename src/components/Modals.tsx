/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { CameraMode, LevelDefinition, RunStats } from '../game/types';
import { formatGameTime } from '../game/rules';

interface TitleScreenProps {
  levels: LevelDefinition[];
  selectedLevelId: number;
  onSelectLevel: (id: number) => void;
  onStartGame: () => void;
  cameraMode: CameraMode;
  onToggleCamera: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  levels,
  selectedLevelId,
  onSelectLevel,
  onStartGame,
  cameraMode,
  onToggleCamera,
}) => {
  const currentSelectedLevel = levels.find((l) => l.id === selectedLevelId) || levels[0];

  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-between items-center p-8 bg-gradient-to-b from-slate-950/60 via-transparent to-slate-950/90 text-slate-100 select-none">
      {/* Top Title Lockup with custom SVG emblem */}
      <div className="flex flex-col items-center mt-6 text-center">
        <div className="flex items-center gap-3 mb-2">
          {/* Custom SVG Geometric Runner Emblem */}
          <svg className="w-10 h-10 text-orange-500" viewBox="0 0 32 32" fill="none">
            <rect x="6" y="6" width="20" height="20" rx="4" stroke="currentColor" strokeWidth="2.5" />
            <path d="M10 22L16 10L22 22" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="16" cy="14" r="2.5" fill="#f97316" />
          </svg>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight font-sans text-white uppercase">
            Acro<span className="text-orange-500">Minimal</span>
          </h1>
        </div>
        <p className="text-sm md:text-base font-light text-slate-300 tracking-wide max-w-md">
          Trò chơi parkour 3D phong cách tối giản: tốc độ, nhịp điệu và sự chính xác tuyệt đối.
        </p>
      </div>

      {/* Center Stage & Level Selection Box */}
      <div className="w-full max-w-3xl bg-slate-900/95 border border-slate-800 rounded-xl p-4 sm:p-6 shadow-2xl flex flex-col gap-3.5 backdrop-blur-none">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono uppercase tracking-widest text-slate-400">CHỌN MÀN CHƠI</span>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 font-bold">
              50 MÀN THỬ THÁCH
            </span>
          </div>

          {/* Chapter Quick Filter Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            {[
              { id: 0, label: 'TẤT CẢ (50)' },
              { id: 1, label: 'CHƯƠNG 1 (1-10)' },
              { id: 2, label: 'CHƯƠNG 2 (11-20)' },
              { id: 3, label: 'CHƯƠNG 3 (21-30)' },
              { id: 4, label: 'CHƯƠNG 4 (31-40)' },
              { id: 5, label: 'CHƯƠNG 5 (41-50)' },
            ].map((tab) => {
              const currentChapter = Math.ceil(selectedLevelId / 10);
              const isActive = tab.id === 0 ? false : tab.id === currentChapter;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    if (tab.id !== 0) {
                      const firstLevelOfChap = (tab.id - 1) * 10 + 1;
                      onSelectLevel(firstLevelOfChap);
                    }
                  }}
                  className={`px-2 py-1 rounded text-[10px] font-mono whitespace-nowrap transition cursor-pointer ${
                    isActive
                      ? 'bg-orange-500 text-slate-950 font-bold shadow'
                      : 'bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Level Cards Grid with smooth scroll */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 max-h-[220px] sm:max-h-[260px] overflow-y-auto pr-1">
          {levels.map((lvl) => {
            const isSelected = lvl.id === selectedLevelId;
            const chapterNum = Math.ceil(lvl.id / 10);
            return (
              <button
                key={lvl.id}
                type="button"
                onClick={() => onSelectLevel(lvl.id)}
                className={`flex flex-col items-start p-2 rounded-lg border text-left transition-all cursor-pointer ${
                  isSelected
                    ? 'border-orange-500 bg-orange-500/15 text-white shadow-md ring-1 ring-orange-500/60'
                    : 'border-slate-800/90 bg-slate-950/70 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span
                    className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-bold ${
                      isSelected ? 'bg-orange-500 text-slate-950' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    MÀN {lvl.id}
                  </span>
                  <span className="text-[9px] font-mono text-slate-400">C{chapterNum}</span>
                </div>
                <div className="font-bold text-xs leading-tight text-white line-clamp-1">{lvl.name}</div>
                <div className="text-[9px] text-slate-400 mt-0.5 line-clamp-1">{lvl.subtitle}</div>
              </button>
            );
          })}
        </div>

        {/* Selected Level Detail Briefing */}
        <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-3 text-xs text-slate-300 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="font-bold text-white text-sm">
              MÀN {currentSelectedLevel.id}: {currentSelectedLevel.name}
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/40">
              CHƯƠNG {Math.ceil(currentSelectedLevel.id / 10)}
            </span>
          </div>
          <div className="text-slate-300 text-xs">{currentSelectedLevel.description}</div>
          <div className="flex items-center gap-4 text-[11px] font-mono text-slate-400 pt-1 border-t border-slate-800/80">
            <span className="text-amber-300 font-bold">MỤC TIÊU VÀNG: &lt; {currentSelectedLevel.targetTimes.gold}s</span>
            <span>BẠC: &lt; {currentSelectedLevel.targetTimes.silver}s</span>
            <span>ĐỒNG: &lt; {currentSelectedLevel.targetTimes.bronze}s</span>
          </div>
        </div>

        {/* Mode & Start Row */}
        <div className="flex items-center gap-3">
          <div
            className="px-3.5 py-2.5 bg-slate-900/80 text-slate-300 border border-slate-800 rounded-lg text-xs font-mono flex items-center gap-2 select-none shrink-0"
            title="Luôn cố định góc nhìn thứ 3"
          >
            <span>CAMERA:</span>
            <span className="font-bold text-cyan-400">
              SỐ 3 (3RD PERS)
            </span>
          </div>

          <button
            type="button"
            data-start="true"
            onClick={onStartGame}
            className="flex-1 py-2.5 px-6 bg-orange-500 hover:bg-orange-400 active:bg-orange-600 text-slate-950 font-black text-sm uppercase tracking-wider rounded-lg transition-all shadow-lg flex items-center justify-center gap-2 group cursor-pointer"
          >
            <span>BẮT ĐẦU CHẠY MÀN {currentSelectedLevel.id}</span>
            <svg
              className="w-4 h-4 transform group-hover:translate-x-1 transition-transform"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </div>
      </div>

      {/* Bottom borderless hints */}
      <div className="flex flex-col items-center gap-1 text-center">
        <div className="text-xs font-mono text-cyan-300 tracking-wide">
          <span className="font-bold text-white">MŨI TÊN CHUỘT:</span> Di chuyển chuột để đổi hướng · Giữ Chuột Trái hoặc W để chạy tới
        </div>
        <div className="text-[11px] font-mono text-slate-400 tracking-wider">
          NHẤN <span className="text-white font-semibold">SPACE</span> HOẶC{' '}
          <span className="text-white font-semibold">ENTER</span> ĐỂ VÀO MÀN NGAY
        </div>
      </div>
    </div>
  );
};

interface PauseModalProps {
  onResume: () => void;
  onRestart: () => void;
  onQuitToTitle: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({ onResume, onRestart, onQuitToTitle }) => {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-6 bg-slate-950/75 select-none text-slate-100">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl flex flex-col gap-4 text-center">
        <h2 className="text-xl font-bold tracking-tight uppercase text-white">TẠM DỪNG TRÒ CHƠI</h2>
        <p className="text-xs text-slate-400">Trò chơi đang dừng. Bạn muốn tiếp tục hành trình?</p>

        <div className="flex flex-col gap-2 mt-2">
          <button
            type="button"
            onClick={onResume}
            className="w-full py-2.5 bg-orange-500 hover:bg-orange-400 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-lg transition shadow"
          >
            TIẾP TỤC (ESC)
          </button>
          <button
            type="button"
            onClick={onRestart}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs uppercase tracking-wider rounded-lg transition"
          >
            CHẠY LẠI MÀN NÀY (R)
          </button>
          <button
            type="button"
            onClick={onQuitToTitle}
            className="w-full py-2.5 bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs font-mono uppercase tracking-wider rounded-lg transition border border-slate-800"
          >
            VỀ MENU CHÍNH
          </button>
        </div>
      </div>
    </div>
  );
};

interface VictoryModalProps {
  stats: RunStats;
  hasNextLevel: boolean;
  onNextLevel: () => void;
  onReplay: () => void;
  onQuitToTitle: () => void;
}

export const VictoryModal: React.FC<VictoryModalProps> = ({
  stats,
  hasNextLevel,
  onNextLevel,
  onReplay,
  onQuitToTitle,
}) => {
  const medalColor = {
    gold: 'text-amber-400 border-amber-400/40 bg-amber-400/10',
    silver: 'text-slate-300 border-slate-300/40 bg-slate-300/10',
    bronze: 'text-amber-700 border-amber-700/40 bg-amber-700/10',
    none: 'text-slate-400 border-slate-700 bg-slate-800/40',
  }[stats.medal];

  const medalLabel = {
    gold: 'HUY CHƯƠNG VÀNG',
    silver: 'HUY CHƯƠNG BẠC',
    bronze: 'HUY CHƯƠNG ĐỒNG',
    none: 'HOÀN THÀNH MÀN',
  }[stats.medal];

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-6 bg-slate-950/80 select-none text-slate-100">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl flex flex-col gap-5 text-center">
        <div>
          <div className="inline-block px-3 py-1 rounded-full text-xs font-mono font-bold uppercase tracking-wider border mb-2 text-cyan-400 border-cyan-400/30 bg-cyan-400/10">
            CHINH PHỤC THÀNH CÔNG
          </div>
          <h2 className="text-2xl font-black tracking-tight uppercase text-white">{stats.levelName}</h2>
        </div>

        {/* Medal Badge */}
        <div className={`py-2 px-4 rounded-lg border font-mono font-bold text-sm ${medalColor}`}>
          {medalLabel}
        </div>

        {/* Run Stats Grid */}
        <div className="grid grid-cols-2 gap-2 text-left">
          <div className="bg-slate-950/70 border border-slate-800 p-2.5 rounded-lg">
            <div className="text-[10px] font-mono uppercase text-slate-400">Thời gian về đích</div>
            <div className="text-lg font-bold font-mono text-white tabular-nums">
              {formatGameTime(stats.elapsedTime)}
            </div>
          </div>
          <div className="bg-slate-950/70 border border-slate-800 p-2.5 rounded-lg">
            <div className="text-[10px] font-mono uppercase text-slate-400">Tốc độ cực đại</div>
            <div className="text-lg font-bold font-mono text-cyan-400 tabular-nums">
              {Math.round(stats.maxSpeed * 3.6)} <span className="text-xs">KM/H</span>
            </div>
          </div>
          <div className="bg-slate-950/70 border border-slate-800 p-2.5 rounded-lg">
            <div className="text-[10px] font-mono uppercase text-slate-400">Cú chạy tường</div>
            <div className="text-lg font-bold font-mono text-orange-400 tabular-nums">{stats.wallRuns}</div>
          </div>
          <div className="bg-slate-950/70 border border-slate-800 p-2.5 rounded-lg">
            <div className="text-[10px] font-mono uppercase text-slate-400">Số bước nhảy & lướt</div>
            <div className="text-lg font-bold font-mono text-slate-200 tabular-nums">
              {stats.jumps + stats.dashes}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2 mt-1">
          {hasNextLevel ? (
            <button
              type="button"
              data-start="true"
              onClick={onNextLevel}
              className="w-full py-3 bg-orange-500 hover:bg-orange-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-lg transition shadow-lg cursor-pointer"
            >
              MÀN TIẾP THEO
            </button>
          ) : (
            <button
              type="button"
              data-start="true"
              onClick={onReplay}
              className="w-full py-3 bg-orange-500 hover:bg-orange-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-lg transition shadow-lg cursor-pointer"
            >
              CHƠI LẠI
            </button>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onReplay}
              className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold uppercase rounded-lg transition"
            >
              CHẠY LẠI
            </button>
            <button
              type="button"
              onClick={onQuitToTitle}
              className="flex-1 py-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 text-xs font-mono uppercase rounded-lg transition"
            >
              MENU CHÍNH
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface GameOverModalProps {
  reason?: 'fall' | 'trap';
  onRespawn: () => void;
  onRestart: () => void;
  onQuitToTitle: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  reason = 'fall',
  onRespawn,
  onRestart,
  onQuitToTitle,
}) => {
  const isTrap = reason === 'trap';
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-6 bg-slate-950/85 select-none text-slate-100">
      <div
        className={`w-full max-w-sm bg-slate-900 border ${
          isTrap ? 'border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.4)]' : 'border-red-500/30'
        } rounded-xl p-6 shadow-2xl flex flex-col gap-4 text-center`}
      >
        <div
          className={`w-12 h-12 mx-auto rounded-full ${
            isTrap ? 'bg-red-500/25 text-red-400 ring-2 ring-red-500/60 animate-bounce' : 'bg-red-500/20 text-red-400'
          } flex items-center justify-center`}
        >
          {isTrap ? (
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          ) : (
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 14l-7 7m0 0l-7-7m7 7V3"
              />
            </svg>
          )}
        </div>

        <div>
          <h2 className="text-xl font-black uppercase text-white tracking-wide">
            {isTrap ? 'BỊ BẪY TIÊU DIỆT!' : 'RƠI KHỎI ĐƯỜNG ĐUA'}
          </h2>
          <p className="text-xs text-slate-300 mt-1">
            {isTrap
              ? 'Bạn đã va phải cơ quan bẫy chết người (Chông nhọn / Tia laser)! Hãy nhảy kép hoặc trượt dốc để né tránh.'
              : 'Hãy căn chỉnh thời điểm nhảy đà và trượt dốc chính xác hơn!'}
          </p>
        </div>

        <div className="flex flex-col gap-2 mt-2">
          <button
            type="button"
            data-start="true"
            onClick={onRespawn}
            className="w-full py-2.5 bg-orange-500 hover:bg-orange-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-lg transition shadow-lg cursor-pointer"
          >
            HỒI SINH TẠI CHECKPOINT (SPACE / R)
          </button>
          <button
            type="button"
            onClick={onRestart}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs uppercase tracking-wider rounded-lg transition"
          >
            CHẠY LẠI TỪ ĐẦU
          </button>
          <button
            type="button"
            onClick={onQuitToTitle}
            className="w-full py-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 text-xs font-mono uppercase tracking-wider rounded-lg transition"
          >
            VỀ MENU CHÍNH
          </button>
        </div>
      </div>
    </div>
  );
};
