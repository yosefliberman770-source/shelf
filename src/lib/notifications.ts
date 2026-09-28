// Local reminders. Shelf has no push server: reminders are computed from the
// reading engine and delivered through the browser's Notification API while
// the app is open (or installed). Each type is independently configurable.
import { useEffect } from 'react';
import { addDays, diffDays, weekday } from '../engine/dates';
import { itemForecast, projectForecast } from '../engine/forecast';
import { goalProgress } from '../engine/goals';
import type { LibraryIndex } from '../engine/model';
import { overview } from '../engine/stats';
import { fmtNum, fmtUnits } from '../engine/units';

export interface Reminder {
  key: string;
  type: string;
  title: string;
  body: string;
}

export function dueReminders(idx: LibraryIndex, now = new Date()): Reminder[] {
  const n = idx.settings.notifications;
  const today = idx.today;
  const out: Reminder[] = [];
  const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const readToday = idx.sessions.some((s) => s.date === today);
  const nonReading = idx.planningRules.weekdays.includes(weekday(today)) || idx.planningRules.dates.includes(today);

  if (n.daily.enabled && hm >= n.daily.time && !readToday && !nonReading)
    out.push({ key: `daily:${today}`, type: 'daily', title: 'Time to read', body: 'You haven’t logged any reading today yet.' });

  if (n.goal && hm >= n.daily.time) {
    for (const g of idx.snap.goals.filter((x) => x.active && x.period === 'daily')) {
      const p = goalProgress(idx, g);
      if (p.ratio < 1) out.push({ key: `goal:${g.id}:${today}`, type: 'goal', title: 'Daily goal', body: `${fmtNum(p.value)} of ${fmtNum(p.target)} ${g.metric} so far today.` });
    }
  }

  const reading = idx.itemList().filter((i) => i.status === 'reading');
  if (n.behind)
    for (const it of reading) {
      const f = itemForecast(idx, it);
      if (f.status === 'behind') out.push({ key: `behind:${it.id}:${today}`, type: 'behind', title: 'Behind schedule', body: `${it.title}: ${-(f.delta ?? 0)} reading days behind. Needed pace: ${fmtUnits(it, f.requiredPace)} per day.` });
    }
  if (n.finishLine)
    for (const it of reading) {
      const f = itemForecast(idx, it);
      if ((f.percent ?? 0) >= idx.settings.finishLineThreshold && f.remaining)
        out.push({ key: `finish:${it.id}:${today}`, type: 'finish', title: 'Almost there', body: `You're ${fmtUnits(it, f.remaining)} from finishing ${it.title}.` });
    }
  if (n.weekly.enabled && weekday(today) === n.weekly.weekday) {
    const ov = overview(idx, { from: addDays(today, -6), to: today });
    out.push({ key: `weekly:${today}`, type: 'weekly', title: 'Your week in reading', body: `${ov.activeDays} active days · ${fmtNum(ov.pages)} pages · ${fmtNum(ov.minutes / 60, 1)} hours.` });
  }
  if (n.projectDeadline.enabled)
    for (const p of idx.snap.projects.filter((x) => x.status === 'active' && x.deadline)) {
      const d = diffDays(today, p.deadline!);
      if (d >= 0 && d <= n.projectDeadline.daysBefore) {
        const f = projectForecast(idx, p.id);
        out.push({ key: `project:${p.id}:${today}`, type: 'project', title: `${p.name} due in ${d} day${d === 1 ? '' : 's'}`, body: `${fmtNum(f.remaining)} pages remaining${f.requiredPace ? ` · ${fmtNum(f.requiredPace)} pages/day needed` : ''}.` });
      }
    }
  return out;
}

const SENT = 'shelf.sentReminders';

function sentSet(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SENT) ?? '[]'));
  } catch {
    return new Set();
  }
}

export function useNotifications(idx: LibraryIndex) {
  useEffect(() => {
    const check = () => {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      const sent = sentSet();
      for (const r of dueReminders(idx)) {
        if (sent.has(r.key)) continue;
        try {
          new Notification(r.title, { body: r.body, tag: r.key, icon: `${import.meta.env.BASE_URL}icon-192.png` });
        } catch {
          /* some browsers only allow notifications from a service worker */
        }
        sent.add(r.key);
      }
      try {
        localStorage.setItem(SENT, JSON.stringify([...sent].slice(-300)));
      } catch {
        /* storage unavailable */
      }
    };
    check();
    const t = setInterval(check, 60_000);
    return () => clearInterval(t);
  }, [idx]);
}
