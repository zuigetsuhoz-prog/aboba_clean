import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useT } from '../i18n';
import type { Lang } from '../types';

interface Props {
  lang: Lang;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function heatColor(count: number): string {
  if (count === 0)        return '#1a2535';
  if (count <= 20)        return '#1a3a5c';
  if (count <= 50)        return '#1a5c8a';
  if (count <= 100)       return '#1a7ab8';
  return '#4db8ff';
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{
      background: '#151f2e',
      borderRadius: '12px',
      padding: '16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
    }}>
      <span style={{ fontSize: '11px', color: '#6b7a99', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </span>
      <span style={{ fontSize: '28px', fontWeight: 700, color: '#e2e8f0', lineHeight: 1 }}>
        {value}
      </span>
      {sub && (
        <span style={{ fontSize: '11px', color: '#6b7a99' }}>{sub}</span>
      )}
    </div>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export function StatisticsScreen({ lang }: Props) {
  const t = useT(lang);
  const today = new Date();
  const todayStr = toDateStr(today);

  // ── Daily goal from localStorage ────────────────────────────────────────
  const [dailyGoal] = useState<number>(() => {
    const stored = localStorage.getItem('dailyGoal');
    return stored ? Math.max(1, parseInt(stored, 10)) || 50 : 50;
  });

  // ── Load all study log entries ───────────────────────────────────────────
  const logEntries = useLiveQuery(() => db.studyLog.toArray(), []) ?? [];

  // Map date -> wordsStudied
  const logMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of logEntries) {
      m[e.date] = (m[e.date] ?? 0) + e.wordsStudied;
    }
    return m;
  }, [logEntries]);

  // ── Total all-time reviews (sum of all word.reviewCount) ─────────────────
  const totalReviews = useLiveQuery(async () => {
    const words = await db.words.toArray();
    return words.reduce((sum, w) => sum + (w.reviewCount ?? 0), 0);
  }, []) ?? 0;

  // ── Today's words ────────────────────────────────────────────────────────
  const todayCount = logMap[todayStr] ?? 0;

  // ── Best day ─────────────────────────────────────────────────────────────
  const bestDay = useMemo(() =>
    Math.max(0, ...Object.values(logMap)), [logMap]);

  // ── Streak calculation ────────────────────────────────────────────────────
  const currentStreak = useMemo(() => {
    let streak = 0;
    let d = new Date(today);
    // If today has 0 words, start checking from yesterday (streak still alive until midnight)
    if ((logMap[toDateStr(d)] ?? 0) === 0) {
      d = addDays(d, -1);
    }
    while (true) {
      const key = toDateStr(d);
      if ((logMap[key] ?? 0) > 0) {
        streak++;
        d = addDays(d, -1);
      } else {
        break;
      }
    }
    return streak;
  }, [logMap]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Heatmap: last 91 days (13 weeks) ─────────────────────────────────────
  const heatmapDays = useMemo(() => {
    const days: { date: string; count: number; d: Date }[] = [];
    for (let i = 90; i >= 0; i--) {
      const d = addDays(today, -i);
      const date = toDateStr(d);
      days.push({ date, count: logMap[date] ?? 0, d });
    }
    return days;
  }, [logMap]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build month labels for heatmap
  const monthLabels = useMemo(() => {
    const labels: { label: string; col: number }[] = [];
    let lastMonth = -1;
    // heatmapDays goes left to right in 7-row columns
    for (let col = 0; col < 13; col++) {
      const dayIdx = col * 7;
      if (dayIdx >= heatmapDays.length) break;
      const m = heatmapDays[dayIdx].d.getMonth();
      if (m !== lastMonth) {
        const monthName = heatmapDays[dayIdx].d.toLocaleDateString('en-US', { month: 'short' });
        labels.push({ label: monthName, col });
        lastMonth = m;
      }
    }
    return labels;
  }, [heatmapDays]);

  // ── Monthly calendar ─────────────────────────────────────────────────────
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const calDays = useMemo(() => {
    const { year, month } = calMonth;
    const firstDay = new Date(year, month, 1);
    // Monday-first: 0=Mon ... 6=Sun
    let startDow = firstDay.getDay(); // 0=Sun
    startDow = startDow === 0 ? 6 : startDow - 1;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return { startDow, daysInMonth, firstDay };
  }, [calMonth]);

  // ── Activity by day of week ───────────────────────────────────────────────
  const weekdayData = useMemo(() => {
    // Mon=0 ... Sun=6
    const sums = [0, 0, 0, 0, 0, 0, 0];
    const counts = [0, 0, 0, 0, 0, 0, 0];
    for (const { date, count } of heatmapDays) {
      const dow = new Date(date).getDay(); // 0=Sun
      const idx = dow === 0 ? 6 : dow - 1; // Mon=0
      sums[idx] += count;
      if (count > 0) counts[idx]++;
    }
    return sums.map((sum, i) => ({
      avg: counts[i] > 0 ? sum / counts[i] : 0,
    }));
  }, [heatmapDays]);

  const maxWeekdayAvg = Math.max(1, ...weekdayData.map(d => d.avg));

  // ── Render ────────────────────────────────────────────────────────────────
  const CELL = 11;
  const GAP = 3;

  return (
    <div style={{ background: '#0f1623', minHeight: '100%', color: '#e2e8f0' }}>
      {/* Header */}
      <header style={{
        padding: '12px 16px',
        background: '#0f1623',
        borderBottom: '1px solid #1e2d45',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        <h1 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>{t.statsTitle}</h1>
      </header>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '720px', margin: '0 auto' }}>

        {/* 1. Stat cards 2x2 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <StatCard label={t.statStreak} value={currentStreak} sub={t.statStreakUnit} />
          <StatCard label={t.statToday} value={todayCount} />
          <StatCard label={t.statBestDay} value={bestDay} />
          <StatCard label={t.statTotal} value={totalReviews} />
        </div>

        {/* 2. Daily goal progress */}
        <div style={{ background: '#151f2e', borderRadius: '12px', padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#94a3b8' }}>{t.dailyGoal}</span>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#e2e8f0' }}>
              {t.dailyGoalProgress(todayCount, dailyGoal)}
            </span>
          </div>
          <div style={{ height: '8px', background: '#1e2d45', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${Math.min(100, (todayCount / dailyGoal) * 100)}%`,
              background: todayCount >= dailyGoal ? '#22c55e' : '#1a7ab8',
              borderRadius: '4px',
              transition: 'width 0.4s ease',
            }} />
          </div>
        </div>

        {/* 3. Heatmap */}
        <div style={{ background: '#151f2e', borderRadius: '12px', padding: '16px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#94a3b8', marginBottom: '10px' }}>
            {t.heatmapTitle}
          </p>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ display: 'inline-block' }}>
              {/* Month labels */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: `repeat(13, ${CELL}px)`,
                gap: `${GAP}px`,
                marginBottom: '4px',
                position: 'relative',
                height: '14px',
              }}>
                {monthLabels.map(({ label, col }) => (
                  <span
                    key={col}
                    style={{
                      gridColumn: col + 1,
                      fontSize: '10px',
                      color: '#6b7a99',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {label}
                  </span>
                ))}
              </div>

              {/* Grid: 13 cols x 7 rows */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: `repeat(13, ${CELL}px)`,
                gridTemplateRows: `repeat(7, ${CELL}px)`,
                gap: `${GAP}px`,
                gridAutoFlow: 'column',
              }}>
                {heatmapDays.map(({ date, count }) => (
                  <div
                    key={date}
                    title={`${date}: ${count}`}
                    style={{
                      width: CELL,
                      height: CELL,
                      borderRadius: '2px',
                      background: heatColor(count),
                    }}
                  />
                ))}
              </div>

              {/* Legend */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px' }}>
                <span style={{ fontSize: '10px', color: '#6b7a99' }}>{t.heatmapLegend0}</span>
                {[0, 10, 30, 60, 110].map(v => (
                  <div key={v} style={{
                    width: CELL, height: CELL, borderRadius: '2px',
                    background: heatColor(v),
                    flexShrink: 0,
                  }} />
                ))}
                <span style={{ fontSize: '10px', color: '#6b7a99' }}>{t.heatmapLegend100}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 4. Monthly calendar */}
        <div style={{ background: '#151f2e', borderRadius: '12px', padding: '16px' }}>
          {/* Nav */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <button
              onClick={() => setCalMonth(m => {
                const d = new Date(m.year, m.month - 1, 1);
                return { year: d.getFullYear(), month: d.getMonth() };
              })}
              style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '18px', padding: '4px 8px' }}
            >‹</button>
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0' }}>
              {new Date(calMonth.year, calMonth.month, 1).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', { month: 'long', year: 'numeric' })}
            </span>
            <button
              onClick={() => setCalMonth(m => {
                const d = new Date(m.year, m.month + 1, 1);
                return { year: d.getFullYear(), month: d.getMonth() };
              })}
              style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '18px', padding: '4px 8px' }}
            >›</button>
          </div>

          {/* Weekday headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: '4px' }}>
            {t.weekdays.map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: '11px', color: '#6b7a99', padding: '2px 0' }}>{d}</div>
            ))}
          </div>

          {/* Days grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
            {/* Leading empty cells */}
            {Array.from({ length: calDays.startDow }).map((_, i) => (
              <div key={`e${i}`} />
            ))}
            {Array.from({ length: calDays.daysInMonth }).map((_, i) => {
              const dayNum = i + 1;
              const dateStr = `${calMonth.year}-${String(calMonth.month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
              const count = logMap[dateStr] ?? 0;
              const isToday = dateStr === todayStr;
              return (
                <div
                  key={dayNum}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    padding: '4px 2px',
                    borderRadius: '6px',
                    background: isToday ? '#1e3a5f' : 'transparent',
                  }}
                >
                  <span style={{
                    fontSize: '12px',
                    color: isToday ? '#60a5fa' : '#94a3b8',
                    fontWeight: isToday ? 700 : 400,
                  }}>{dayNum}</span>
                  <div style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    marginTop: '2px',
                    background: count > 0 ? heatColor(count) : 'transparent',
                  }} />
                </div>
              );
            })}
          </div>
        </div>

        {/* 5. Activity by day of week */}
        <div style={{ background: '#151f2e', borderRadius: '12px', padding: '16px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: '#94a3b8', marginBottom: '12px' }}>
            {t.weekdayChart}
          </p>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '80px' }}>
            {weekdayData.map((d, i) => {
              const heightPct = (d.avg / maxWeekdayAvg) * 100;
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', height: '100%', justifyContent: 'flex-end' }}>
                  <div style={{
                    width: '100%',
                    height: `${Math.max(2, heightPct)}%`,
                    background: '#1a7ab8',
                    borderRadius: '3px 3px 0 0',
                    transition: 'height 0.3s ease',
                  }} />
                  <span style={{ fontSize: '10px', color: '#6b7a99' }}>{t.weekdays[i]}</span>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
