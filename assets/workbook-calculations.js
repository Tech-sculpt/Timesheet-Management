(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WorkbookCalculations = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  function dateParts(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!match) return null;
    return { year: +match[1], month: +match[2], day: +match[3] };
  }

  function excelWeekNum(value) {
    const p = dateParts(value);
    if (!p) return 0;
    const current = Date.UTC(p.year, p.month - 1, p.day);
    const first = Date.UTC(p.year, 0, 1);
    const mondayOffset = (new Date(first).getUTCDay() + 6) % 7;
    return Math.floor(((current - first) / 86400000 + mondayOffset) / 7) + 1;
  }

  function isWeekday(value) {
    const p = dateParts(value);
    if (!p) return false;
    const day = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
    return day !== 0 && day !== 6;
  }

  function networkDays(from, to, holidays) {
    if (!dateParts(from) || !dateParts(to) || from > to) return 0;
    const off = new Set((holidays || []).map(h => typeof h === 'string' ? h : h.date));
    const start = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8));
    const end = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8));
    let count = 0;
    for (let ms = start; ms <= end; ms += 86400000) {
      const d = new Date(ms);
      if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
      if (!off.has(d.toISOString().slice(0, 10))) count++;
    }
    return count;
  }

  function same(a, b) { return String(a || '').toLowerCase() === String(b || '').toLowerCase(); }
  function worked(e) { return !same(e.type, 'Leave') && !same(e.type, 'Statutory Holiday'); }
  function inPeriod(e, from, to) { return e.date >= from && e.date <= to; }
  function sum(rows, hours) { return rows.reduce((value, row) => value + hours(row), 0); }

  function metrics(entries, from, to, hours, predicate) {
    const rows = entries.filter(e => inPeriod(e, from, to) && (!predicate || predicate(e)));
    const work = rows.filter(worked);
    const total = sum(work, hours);
    const chargeable = sum(work.filter(e => same(e.type, 'Chargeable')), hours);
    const nonChargeable = sum(work.filter(e => same(e.type, 'Non-Chargeable')), hours);
    const audit = sum(work.filter(e => same(e.assignment, 'Audit')), hours);
    const internal = sum(work.filter(e => same(e.client, 'Internal')), hours);
    return { rows, work, total, chargeable, nonChargeable, audit, internal,
      reconciliation: chargeable + nonChargeable - total,
      billingRate: total ? chargeable / total : 0 };
  }

  function annualTarget(roster, personId, entity, from, to, holidays) {
    const year = +from.slice(0, 4);
    const annual = roster.filter(p => p.active !== false && (!personId || p.id === personId) && (!entity || same(p.entity, entity)))
      .reduce((value, p) => value + (+p.annualTarget || (+p.monthlyTarget || 0) * 12), 0);
    const yearDays = networkDays(`${year}-01-01`, `${year}-12-31`, holidays);
    return yearDays ? annual * networkDays(from, to, holidays) / yearDays : 0;
  }

  function employeeMetrics(entries, person, from, to, holidays, hours, hoursPerDay) {
    const base = metrics(entries, from, to, hours, e => e.personId === person.id);
    const leaveHours = sum(base.rows.filter(e => same(e.type, 'Leave')), hours);
    const required = networkDays(from, to, holidays) * hoursPerDay - leaveHours;
    return { ...base, leaveHours, required, variance: base.total - required,
      status: base.billingRate >= .75 ? 'GREEN' : base.billingRate >= .6 ? 'AMBER' : 'RED' };
  }

  function attendanceMetrics(entries, person, year, holidays, hours, hoursPerDay) {
    const holidaySet = new Set((holidays || []).map(h => typeof h === 'string' ? h : h.date));
    const rows = entries.filter(e => e.personId === person.id && e.date.startsWith(`${year}-`));
    const monthly = Array(12).fill(0);
    const kinds = { casual: 0, sick: 0, half: 0, statutory: 0, exam: 0, unpaid: 0 };
    const dailyWork = new Map();
    let actual = 0;
    for (const e of rows) {
      const weekday = isWeekday(e.date), holiday = holidaySet.has(e.date);
      const leave = same(e.type, 'Leave'), statutory = same(e.type, 'Statutory Holiday');
      if (weekday && ((leave && !holiday) || statutory)) monthly[+e.date.slice(5, 7) - 1]++;
      if (weekday && !holiday && leave) {
        const paid = same(e.workArea, 'Paid');
        if ((same(e.assignment, 'Casual Leave') || same(e.assignment, 'Annual Leave')) && paid) kinds.casual++;
        if (same(e.assignment, 'Sick Leave') && paid) kinds.sick++;
        if (same(e.assignment, 'Half Day Leave')) kinds.half += .5;
        if (same(e.assignment, 'Exam Leave')) kinds.exam++;
        if (same(e.workArea, 'Unpaid')) kinds.unpaid++;
      }
      if (weekday && statutory && same(e.assignment, 'Statutory Holiday')) kinds.statutory++;
      if (worked(e)) {
        const value = hours(e);
        if (weekday) actual += value;
        dailyWork.set(e.date, (dailyWork.get(e.date) || 0) + value);
      }
    }
    let overtime = 0;
    for (const [date, value] of dailyWork) overtime += !isWeekday(date) || holidaySet.has(date) ? value : Math.max(0, value - hoursPerDay);
    const paidDays = kinds.casual + kinds.sick + kinds.half + kinds.exam;
    const target = (+person.monthlyTarget || 160) * 12 - paidDays * hoursPerDay;
    return { monthly, kinds, leaveDays: monthly.reduce((a,b) => a+b, 0), target, actual,
      variance: actual - target, overtime, status: actual === 0 ? 'NO DATA' : actual >= target ? 'ON TARGET' : 'UNDER HOURS' };
  }

  function weeklyMetrics(entries, personId, selectedDate, holidays, hours = e => e.hours) {
    const p = dateParts(selectedDate);
    if (!p) return null;
    const start = new Date(Date.UTC(p.year, p.month - 1, p.day));
    start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
    const from = start.toISOString().slice(0, 10);
    const to = new Date(start.getTime() + 6 * 86400000).toISOString().slice(0, 10);
    return hoursRangeMetrics(entries, personId, from, to, holidays, hours);
  }

  function hoursRangeMetrics(entries, personId, from, to, holidays, hours = e => e.hours, asOf = null) {
    const valid = value => {
      const p = dateParts(value);
      return p && new Date(Date.UTC(p.year, p.month - 1, p.day)).toISOString().slice(0, 10) === value;
    };
    if (!valid(from) || !valid(to) || from > to) return null;
    const start = new Date(from + 'T00:00:00Z');
    const end = new Date(to + 'T00:00:00Z');
    const off = new Set((holidays || []).map(h => typeof h === 'string' ? h : h.date));
    const days = [];
    for (let ms = start.getTime(); ms <= end.getTime(); ms += 86400000) {
      const date = new Date(ms).toISOString().slice(0, 10);
      days.push({ date, scheduled: isWeekday(date) && !off.has(date) ? 8 : 0, leave: 0, actual: 0, chargeable: 0, nonChargeable: 0 });
    }
    const byDate = new Map(days.map(d => [d.date, d]));
    for (const e of entries) {
      if (e.personId !== personId) continue;
      const day = byDate.get(e.date);
      if (!day) continue;
      const value = Number(hours(e));
      if (!Number.isFinite(value) || value < 0) continue;
      if (!worked(e)) day.leave += value;
      else {
        day.actual += value;
        if (same(e.type, 'Chargeable')) day.chargeable += value;
        if (same(e.type, 'Non-Chargeable')) day.nonChargeable += value;
      }
    }
    const totals = { from, to, days, scheduled: 0, leave: 0, expected: 0, actual: 0, chargeable: 0, nonChargeable: 0, weekendDays: 0, weekendHours: 0, overtime: 0, shortfall: 0, attendedDays: 0, loggedExpected: 0, loggedShortfall: 0, missingDays: 0, missingHours: 0 };
    for (const day of days) {
      day.weekendHours = !isWeekday(day.date) ? day.actual : 0;
      if (day.weekendHours > 0) totals.weekendDays++;
      totals.weekendHours += day.weekendHours;
      day.leave = Math.min(day.scheduled, day.leave);
      day.expected = day.scheduled - day.leave;
      day.overtime = Math.max(0, day.actual - day.expected);
      day.shortfall = Math.max(0, day.expected - day.actual);
      day.loggedExpected = day.actual > 0 ? day.expected : 0;
      day.loggedShortfall = day.actual > 0 ? day.shortfall : 0;
      day.missingHours = day.actual === 0 && (!asOf || day.date < asOf) ? day.expected : 0;
      if (day.missingHours > 0) totals.missingDays++;
      if (day.scheduled && day.actual > 0) totals.attendedDays++;
      for (const key of ['scheduled', 'leave', 'expected', 'actual', 'chargeable', 'nonChargeable', 'overtime', 'shortfall', 'loggedExpected', 'loggedShortfall', 'missingHours']) totals[key] += day[key];
    }
    totals.variance = totals.actual - totals.expected;
    return totals;
  }

  return { excelWeekNum, isWeekday, networkDays, metrics, annualTarget, employeeMetrics, attendanceMetrics, weeklyMetrics, hoursRangeMetrics, worked, same };
});
