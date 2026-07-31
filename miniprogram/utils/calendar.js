function pad(n) {
  return String(n).padStart(2, "0");
}

function monthLabel(y, m) {
  return `${y}年${m}月`;
}

function buildMonthGrid(year, month, markedSet, selected) {
  const first = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  // Monday-first: Mon=0 ... Sun=6
  const startPad = (first.getDay() + 6) % 7;
  const cells = [];
  for (let i = 0; i < startPad; i++) {
    cells.push({ key: `e-${i}`, empty: true });
  }
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const marked =
    markedSet && typeof markedSet.has === "function"
      ? markedSet
      : new Set(Array.isArray(markedSet) ? markedSet : []);
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${year}-${pad(month)}-${pad(d)}`;
    cells.push({
      key: date,
      empty: false,
      day: d,
      date,
      marked: marked.has(date),
      today: date === todayKey,
      selected: date === selected,
    });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ key: `t-${cells.length}`, empty: true });
  }
  return cells;
}

/** 按周分行，避免小程序 flex-wrap 百分比宽度造成中间大空白 */
function buildMonthRows(year, month, markedSet, selected) {
  const cells = buildMonthGrid(year, month, markedSet, selected);
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push({
      key: `row-${year}-${month}-${i}`,
      days: cells.slice(i, i + 7),
    });
  }
  return rows;
}

module.exports = { pad, monthLabel, buildMonthGrid, buildMonthRows };
