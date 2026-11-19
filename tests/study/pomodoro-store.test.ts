import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePomodoroStore } from '@/lib/store/pomodoro';

describe('pomodoro store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-19T10:00:00Z'));
    usePomodoroStore.setState({ logs: {}, stageId: null });
    usePomodoroStore.getState().setPreset({ focusMin: 25, breakMin: 5 });
  });
  afterEach(() => vi.useRealTimers());

  it('counts down from an absolute end time', () => {
    usePomodoroStore.getState().start('course-1');
    vi.advanceTimersByTime(60_000);
    expect(usePomodoroStore.getState().remaining()).toBe(24 * 60);
  });

  it('logs partial focus time on pause and resumes from where it stopped', () => {
    const s = usePomodoroStore.getState();
    s.start('course-1');
    vi.advanceTimersByTime(10 * 60_000);
    usePomodoroStore.getState().pause();
    expect(usePomodoroStore.getState().logs['course-1']).toEqual({
      focusSeconds: 600,
      completedBlocks: 0,
    });
    expect(usePomodoroStore.getState().remaining()).toBe(15 * 60);
  });

  it('closing a focus block counts it and starts the break', () => {
    usePomodoroStore.getState().start('course-1');
    vi.advanceTimersByTime(25 * 60_000);
    const ended = usePomodoroStore.getState().completePhase();
    const st = usePomodoroStore.getState();
    expect(ended).toBe('focus');
    expect(st.phase).toBe('break');
    expect(st.running).toBe(true);
    expect(st.logs['course-1']).toEqual({ focusSeconds: 1500, completedBlocks: 1 });
  });

  it('closing a break returns to an idle focus block', () => {
    usePomodoroStore.getState().start('course-1');
    vi.advanceTimersByTime(25 * 60_000);
    usePomodoroStore.getState().completePhase();
    vi.advanceTimersByTime(5 * 60_000);
    expect(usePomodoroStore.getState().completePhase()).toBe('break');
    const st = usePomodoroStore.getState();
    expect(st.phase).toBe('focus');
    expect(st.running).toBe(false);
    expect(st.remaining()).toBe(25 * 60);
  });
});
