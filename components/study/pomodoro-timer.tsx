'use client';

/**
 * Pomodoro timer for the classroom header.
 *
 * Counts focus / break blocks, plays a short chime and shows a notification at
 * the end of each block, and (optionally) writes a study summary of the
 * current course into the Obsidian vault when a focus block ends.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, NotebookPen, Timer, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useStageStore } from '@/lib/store';
import { POMODORO_PRESETS, usePomodoroStore } from '@/lib/store/pomodoro';
import { buildMarkdown, collectSceneScripts } from '@/lib/export/use-export-script';
import { cn } from '@/lib/utils';

function formatClock(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function playChime() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [880, 660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const t0 = ctx.currentTime + i * 0.25;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
      osc.start(t0);
      osc.stop(t0 + 0.24);
    });
    setTimeout(() => void ctx.close(), 1200);
  } catch {
    // Audio is a nicety; ignore failures.
  }
}

function notify(title: string, body: string) {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  } catch {
    // Notifications are optional.
  }
}

export function PomodoroTimer({ compact = false }: { compact?: boolean }) {
  const { t, locale } = useI18n();
  const stage = useStageStore((s) => s.stage);
  const scenes = useStageStore((s) => s.scenes);

  const focusMin = usePomodoroStore((s) => s.focusMin);
  const phase = usePomodoroStore((s) => s.phase);
  const running = usePomodoroStore((s) => s.running);
  const autoSummary = usePomodoroStore((s) => s.autoSummary);
  const log = usePomodoroStore((s) => (stage?.id ? s.logs[stage.id] : undefined));
  const store = usePomodoroStore;

  const [left, setLeft] = useState(() => store.getState().remaining());
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const saveSummary = useCallback(
    async (silent = false) => {
      if (savingRef.current) return;
      const { stage: st, scenes: sc, currentSceneId: cur } = useStageStore.getState();
      if (!st?.id) return;
      const scripts = collectSceneScripts([...sc], (order) => t('export.slideFallback', { order }));
      if (scripts.length === 0) {
        if (!silent) toast.warning(t('study.nothingToSummarize'));
        return;
      }
      const pomo = store.getState();
      const entry = pomo.logs[st.id] ?? { focusSeconds: 0, completedBlocks: 0 };
      // Include the time of a focus block that is still running.
      const liveFocus =
        pomo.running && pomo.phase === 'focus' && pomo.stageId === st.id
          ? pomo.remainingSec - pomo.remaining()
          : 0;
      savingRef.current = true;
      setSaving(true);
      try {
        const res = await fetch('/api/study/obsidian-summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            courseTitle: st.name,
            transcript: buildMarkdown(st.name || 'Aula', scripts),
            currentSceneTitle: sc.find((s) => s.id === cur)?.title,
            focusMinutes: Math.round((entry.focusSeconds + liveFocus) / 60),
            completedBlocks: entry.completedBlocks,
            language: locale,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          file?: string;
          error?: string;
          message?: string;
        };
        if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
        store.getState().clearLog(st.id);
        toast.success(t('study.summarySaved', { file: data.file ?? '' }));
      } catch (error) {
        toast.error(t('study.summaryFailed', { error: (error as Error).message }));
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [locale, store, t],
  );

  // Tick once a second; close the phase when it reaches zero.
  useEffect(() => {
    const id = window.setInterval(() => {
      const s = store.getState();
      const remaining = s.remaining();
      setLeft(remaining);
      if (s.running && remaining <= 0) {
        const ended = s.completePhase();
        setLeft(store.getState().remaining());
        playChime();
        if (ended === 'focus') {
          toast.success(t('study.focusDone'));
          notify(t('study.title'), t('study.focusDone'));
          if (store.getState().autoSummary) void saveSummary(true);
        } else {
          toast(t('study.breakDone'));
          notify(t('study.title'), t('study.breakDone'));
        }
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [saveSummary, store, t]);

  const onStart = () => {
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        void Notification.requestPermission();
      }
    } catch {
      // ignore
    }
    store.getState().start(stage?.id ?? null);
    setLeft(store.getState().remaining());
  };

  const focusTotalMin = Math.round((log?.focusSeconds ?? 0) / 60);
  const canSummarize = scenes.length > 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-1.5 rounded-full px-2 py-1.5 text-xs font-medium tabular-nums transition-all',
            running
              ? phase === 'focus'
                ? 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40'
                : 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40'
              : 'text-gray-400 dark:text-gray-500 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200',
          )}
          aria-label={t('study.title')}
          title={t('study.title')}
        >
          <Timer className="w-4 h-4" />
          {(running || left !== focusMin * 60) && !compact ? (
            <span>{formatClock(left)}</span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-72 p-4 space-y-4 bg-white dark:bg-zinc-900 text-gray-900 dark:text-gray-100 border-gray-200 dark:border-zinc-700 shadow-xl">
        <div className="text-center">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {phase === 'focus' ? t('study.focus') : t('study.break')}
          </div>
          <div className="text-4xl font-semibold tabular-nums">{formatClock(left)}</div>
        </div>

        <div className="flex justify-center gap-2">
          {running ? (
            <button
              className="flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
              onClick={() => {
                store.getState().pause();
                setLeft(store.getState().remaining());
              }}
            >
              <Pause className="w-4 h-4" /> {t('study.pause')}
            </button>
          ) : (
            <button
              className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90"
              onClick={onStart}
            >
              <Play className="w-4 h-4" /> {t('study.start')}
            </button>
          )}
          <button
            className="flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
            onClick={() => {
              store.getState().reset();
              setLeft(store.getState().remaining());
            }}
          >
            <RotateCcw className="w-4 h-4" /> {t('study.reset')}
          </button>
        </div>

        <div className="flex justify-center gap-1">
          {POMODORO_PRESETS.map((p) => (
            <button
              key={p.focusMin}
              disabled={running}
              onClick={() => {
                store.getState().setPreset(p);
                setLeft(p.focusMin * 60);
              }}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs disabled:opacity-50',
                focusMin === p.focusMin && 'border-primary text-primary',
              )}
            >
              {p.focusMin}/{p.breakMin}
            </button>
          ))}
        </div>

        <div className="text-xs text-muted-foreground text-center">
          {t('study.sessionStats', {
            minutes: focusTotalMin,
            blocks: log?.completedBlocks ?? 0,
          })}
        </div>

        <label className="flex items-center justify-between gap-2 text-sm">
          <span>{t('study.autoSummary')}</span>
          <Switch
            checked={autoSummary}
            onCheckedChange={(v) => store.getState().setAutoSummary(v)}
          />
        </label>

        <button
          disabled={!canSummarize || saving}
          onClick={() => void saveSummary(false)}
          className="flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <NotebookPen className="w-4 h-4" />
          )}
          {t('study.saveSummary')}
        </button>
      </PopoverContent>
    </Popover>
  );
}
