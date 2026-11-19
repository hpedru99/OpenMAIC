/**
 * Pomodoro study timer state (per-browser convenience).
 *
 * Time is tracked by an absolute `endsAt` timestamp, so the countdown stays
 * correct when the tab sleeps or the component remounts. Focus time is
 * accumulated per course (stage id) so the Obsidian summary can report how
 * long the learner studied in this session.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type PomodoroPhase = 'focus' | 'break';

export interface PomodoroPreset {
  focusMin: number;
  breakMin: number;
}

export const POMODORO_PRESETS: readonly PomodoroPreset[] = [
  { focusMin: 15, breakMin: 3 },
  { focusMin: 25, breakMin: 5 },
  { focusMin: 50, breakMin: 10 },
];

export interface CourseStudyLog {
  /** Focus seconds counted since the last summary was saved. */
  focusSeconds: number;
  /** Focus blocks completed since the last summary was saved. */
  completedBlocks: number;
}

interface PomodoroState {
  focusMin: number;
  breakMin: number;
  phase: PomodoroPhase;
  running: boolean;
  /** Epoch ms when the current phase ends (only while running). */
  endsAt: number | null;
  /** Seconds left when paused. */
  remainingSec: number;
  /** Course the running focus block belongs to. */
  stageId: string | null;
  autoSummary: boolean;
  logs: Record<string, CourseStudyLog>;

  setPreset: (preset: PomodoroPreset) => void;
  start: (stageId: string | null) => void;
  pause: () => void;
  reset: () => void;
  setAutoSummary: (value: boolean) => void;
  /** Close the current phase; returns the phase that just ended. */
  completePhase: () => PomodoroPhase;
  /** Seconds left right now. */
  remaining: () => number;
  clearLog: (stageId: string) => void;
}

function addFocus(
  logs: Record<string, CourseStudyLog>,
  stageId: string | null,
  seconds: number,
  blocks: number,
): Record<string, CourseStudyLog> {
  if (!stageId || seconds <= 0) return logs;
  const prev = logs[stageId] ?? { focusSeconds: 0, completedBlocks: 0 };
  return {
    ...logs,
    [stageId]: {
      focusSeconds: prev.focusSeconds + Math.round(seconds),
      completedBlocks: prev.completedBlocks + blocks,
    },
  };
}

export const usePomodoroStore = create<PomodoroState>()(
  persist(
    (set, get) => ({
      focusMin: 25,
      breakMin: 5,
      phase: 'focus',
      running: false,
      endsAt: null,
      remainingSec: 25 * 60,
      stageId: null,
      autoSummary: true,
      logs: {},

      setPreset: ({ focusMin, breakMin }) =>
        set({
          focusMin,
          breakMin,
          phase: 'focus',
          running: false,
          endsAt: null,
          remainingSec: focusMin * 60,
        }),

      start: (stageId) => {
        const { running, remainingSec } = get();
        if (running) return;
        set({
          running: true,
          endsAt: Date.now() + remainingSec * 1000,
          stageId: stageId ?? get().stageId,
        });
      },

      pause: () => {
        const s = get();
        if (!s.running) return;
        const left = s.remaining();
        const studied = s.phase === 'focus' ? s.remainingSec - left : 0;
        set({
          running: false,
          endsAt: null,
          remainingSec: left,
          logs: addFocus(s.logs, s.stageId, studied, 0),
        });
      },

      reset: () => {
        const s = get();
        const left = s.remaining();
        const studied = s.phase === 'focus' && s.running ? s.remainingSec - left : 0;
        set({
          phase: 'focus',
          running: false,
          endsAt: null,
          remainingSec: s.focusMin * 60,
          logs: addFocus(s.logs, s.stageId, studied, 0),
        });
      },

      setAutoSummary: (value) => set({ autoSummary: value }),

      completePhase: () => {
        const s = get();
        const ended = s.phase;
        if (ended === 'focus') {
          set({
            phase: 'break',
            running: true,
            endsAt: Date.now() + s.breakMin * 60 * 1000,
            remainingSec: s.breakMin * 60,
            logs: addFocus(s.logs, s.stageId, s.remainingSec, 1),
          });
        } else {
          set({
            phase: 'focus',
            running: false,
            endsAt: null,
            remainingSec: s.focusMin * 60,
          });
        }
        return ended;
      },

      remaining: () => {
        const { running, endsAt, remainingSec } = get();
        if (!running || endsAt === null) return remainingSec;
        return Math.max(0, Math.round((endsAt - Date.now()) / 1000));
      },

      clearLog: (stageId) => {
        const logs = { ...get().logs };
        delete logs[stageId];
        set({ logs });
      },
    }),
    {
      name: 'openmaic-pomodoro',
      version: 1,
      // `remainingSec` while running is the phase start value; on reload the
      // countdown resumes from `endsAt`.
    },
  ),
);
