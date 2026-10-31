/* ============================================================
   script.js — Roblox Game Analytics Dashboard
   Data source: dataset_roblox_final.csv
   Dependencies: Chart.js 4, PapaParse 5
   ============================================================ */

"use strict";

// ── Chart palette (flat, no gradients) ──────────────────────
const PALETTE = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#6366f1",
  "#14b8a6", "#fb923c", "#a855f7", "#22c55e", "#e11d48"
];

// ── Shared Chart.js defaults ─────────────────────────────────
Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
Chart.defaults.font.size   = 12;
Chart.defaults.color       = "#6b7280";

// ── Module-level state ───────────────────────────────────────
let allData        = [];         // full parsed dataset
let charts         = {};         // Chart.js instances keyed by canvas id
let currentData    = [];         // data currently displayed (after genre filter)
let tableSortCol   = "activePlayers";
let tableSortDir   = "desc";     // "asc" | "desc"
let tablePage      = 1;
const PAGE_SIZE    = 15;

// ── Utility: format large numbers ───────────────────────────
function fmt(n) {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "B";
  if (n >= 1_000_000)     return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000)         return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

// ── Utility: sum a numeric field ────────────────────────────
function sum(arr, key) {
  return arr.reduce((acc, d) => acc + (d[key] || 0), 0);
}

// ── Utility: shorten a game name for axis labels ─────────────
function shortName(name, maxLen = 22) {
  // Strip emoji and leading/trailing whitespace
  const clean = name.replace(/[^\p{L}\p{N}\s:!?'&\-]/gu, "").trim();
  return clean.length > maxLen ? clean.slice(0, maxLen - 1) + "…" : clean;
}

// ── Build the genre filter <select> ─────────────────────────
function buildGenreFilter(data) {
  const genres = [...new Set(data.map(d => d.genre))].sort();
  const select = document.getElementById("genreFilter");

  genres.forEach(g => {
    const opt = document.createElement("option");
    opt.value = g;
    opt.textContent = g;
    select.appendChild(opt);
  });

  select.addEventListener("change", () => {
    const filtered = applyFilter(select.value);
    tablePage = 1;                // reset to first page on filter change
    renderAll(filtered);
  });
}

// ── Filter data by genre ─────────────────────────────────────
function applyFilter(genre) {
  if (!genre || genre === "all") return allData;
  return allData.filter(d => d.genre === genre);
}

// ── KPI Cards ────────────────────────────────────────────────
function renderKPIs(data) {
  document.getElementById("kpi-players").textContent   = fmt(sum(data, "activePlayers"));
  document.getElementById("kpi-visits").textContent    = fmt(sum(data, "visits"));
  document.getElementById("kpi-likes").textContent     = fmt(sum(data, "likes"));
  document.getElementById("kpi-favorites").textContent = fmt(sum(data, "favorites"));
}

// ── Horizontal Bar Chart factory ────────────────────────────
function makeHBarChart(canvasId, labels, values, color) {
  const ctx = document.getElementById(canvasId).getContext("2d");

  if (charts[canvasId]) {
    charts[canvasId].destroy();
  }

  charts[canvasId] = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: color || PALETTE[0],
        borderRadius: 5,
        borderSkipped: false,
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => " " + fmt(ctx.parsed.x)
          }
        }
      },
      scales: {
        x: {
          grid: { color: "#f3f4f6" },
          border: { display: false },
          ticks: { callback: v => fmt(v) }
        },
        y: {
          grid: { display: false },
          border: { display: false },
          ticks: { font: { size: 11 } }
        }
      }
    }
  });
}

// ── Doughnut Chart (genre distribution) ─────────────────────
function makeDonutChart(canvasId, labels, values) {
  const ctx = document.getElementById(canvasId).getContext("2d");

  if (charts[canvasId]) {
    charts[canvasId].destroy();
  }

  charts[canvasId] = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: PALETTE.slice(0, labels.length),
        borderWidth: 2,
        borderColor: "#ffffff",
        hoverOffset: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "60%",
      plugins: {
        legend: {
          position: "right",
          labels: { boxWidth: 12, padding: 10, font: { size: 11 } }
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${fmt(ctx.parsed)}`
          }
        }
      }
    }
  });
}

// ── Grouped Bar: Likes vs Favorites ─────────────────────────
function makeGroupedBarChart(canvasId, labels, likesData, favsData) {
  const ctx = document.getElementById(canvasId).getContext("2d");

  if (charts[canvasId]) {
    charts[canvasId].destroy();
  }

  charts[canvasId] = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Likes",
          data: likesData,
          backgroundColor: PALETTE[0],
          borderRadius: 4,
          borderSkipped: false,
        },
        {
          label: "Favorites",
          data: favsData,
          backgroundColor: PALETTE[1],
          borderRadius: 4,
          borderSkipped: false,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "top",
          labels: { boxWidth: 12, padding: 12 }
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.parsed.y)}`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { font: { size: 10 }, maxRotation: 45, minRotation: 30 }
        },
        y: {
          grid: { color: "#f3f4f6" },
          border: { display: false },
          ticks: { callback: v => fmt(v) }
        }
      }
    }
  });
}

// ── Top-10 helper ────────────────────────────────────────────
function top10By(data, field) {
  return [...data].sort((a, b) => b[field] - a[field]).slice(0, 10);
}

// ── Render all charts ────────────────────────────────────────
function renderCharts(data) {
  // ── Active Players (top 10)
  const tp = top10By(data, "activePlayers");
  makeHBarChart(
    "chartActivePlayers",
    tp.map(d => shortName(d.name)),
    tp.map(d => d.activePlayers),
    PALETTE[0]
  );

  // ── Visits (top 10)
  const tv = top10By(data, "visits");
  makeHBarChart(
    "chartVisits",
    tv.map(d => shortName(d.name)),
    tv.map(d => d.visits),
    PALETTE[2]
  );

  // ── Likes (top 10)
  const tl = top10By(data, "likes");
  makeHBarChart(
    "chartLikes",
    tl.map(d => shortName(d.name)),
    tl.map(d => d.likes),
    PALETTE[3]
  );

  // ── Favorites (top 10)
  const tf = top10By(data, "favorites");
  makeHBarChart(
    "chartFavorites",
    tf.map(d => shortName(d.name)),
    tf.map(d => d.favorites),
    PALETTE[4]
  );

  // ── Genre donut — sum activePlayers per genre
  const genreMap = {};
  data.forEach(d => {
    genreMap[d.genre] = (genreMap[d.genre] || 0) + d.activePlayers;
  });
  const sortedGenres = Object.entries(genreMap)
    .sort((a, b) => b[1] - a[1]);
  makeDonutChart(
    "chartGenrePlayers",
    sortedGenres.map(([g]) => g),
    sortedGenres.map(([, v]) => v)
  );

  // ── Likes vs Favorites grouped bar (top 15 by likes)
  const top15 = [...data].sort((a, b) => b.likes - a.likes).slice(0, 15);
  makeGroupedBarChart(
    "chartLikesFav",
    top15.map(d => shortName(d.name, 16)),
    top15.map(d => d.likes),
    top15.map(d => d.favorites)
  );
}

// ── Sort helper ───────────────────────────────────────────────
function sortData(data, col, dir) {
  return [...data].sort((a, b) => {
    const va = a[col];
    const vb = b[col];
    if (typeof va === "string") {
      return dir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    }
    return dir === "asc" ? va - vb : vb - va;
  });
}

// ── Render data table (with sort + pagination) ───────────────
function renderTable(data) {
  currentData = data;

  const sorted  = sortData(data, tableSortCol, tableSortDir);
  const total   = sorted.length;
  const pages   = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Clamp current page
  if (tablePage > pages) tablePage = pages;

  const start   = (tablePage - 1) * PAGE_SIZE;
  const pageRows = sorted.slice(start, start + PAGE_SIZE);
  const maxPop  = Math.max(...data.map(d => d.popularity_score), 1);

  // ── Update sort indicator on headers ──
  document.querySelectorAll(".data-table th.sortable").forEach(th => {
    th.classList.remove("sort-asc", "sort-desc");
    const icon = th.querySelector(".sort-icon");
    icon.innerHTML = "&#8597;";
    if (th.dataset.col === tableSortCol) {
      th.classList.add(tableSortDir === "asc" ? "sort-asc" : "sort-desc");
      icon.innerHTML = tableSortDir === "asc" ? "&#8593;" : "&#8595;";
    }
  });

  // ── Render rows ──
  const tbody = document.getElementById("tableBody");
  tbody.innerHTML = "";

  pageRows.forEach(d => {
    const pct = ((d.popularity_score / maxPop) * 100).toFixed(1);
    const tr  = document.createElement("tr");
    tr.innerHTML = `
      <td class="py-2 px-3 font-medium text-gray-800 max-w-[200px] truncate" title="${d.name}">${d.name}</td>
      <td class="py-2 px-3"><span class="genre-badge">${d.genre}</span></td>
      <td class="py-2 px-3 text-right tabular-nums">${fmt(d.activePlayers)}</td>
      <td class="py-2 px-3 text-right tabular-nums">${fmt(d.visits)}</td>
      <td class="py-2 px-3 text-right tabular-nums">${fmt(d.likes)}</td>
      <td class="py-2 px-3 text-right tabular-nums">${fmt(d.favorites)}</td>
      <td class="py-2 px-3 min-w-[120px]">
        <div class="pop-bar-wrap">
          <div class="pop-bar-bg">
            <div class="pop-bar-fill" style="width:${pct}%"></div>
          </div>
          <span class="text-xs text-gray-500 tabular-nums">${d.popularity_score.toFixed(1)}</span>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // ── Render pagination ──
  renderPagination(total, pages);
}

// ── Render pagination controls ───────────────────────────────
function renderPagination(total, pages) {
  const container = document.getElementById("tablePagination");
  container.innerHTML = "";

  // Info text
  const start  = (tablePage - 1) * PAGE_SIZE + 1;
  const end    = Math.min(tablePage * PAGE_SIZE, total);
  const info   = document.createElement("span");
  info.className = "pagination-info";
  info.textContent = `Showing ${start}–${end} of ${total} games`;
  container.appendChild(info);

  // Controls
  const controls = document.createElement("div");
  controls.className = "pagination-controls";

  // Prev button
  const prev = document.createElement("button");
  prev.className = "page-btn";
  prev.innerHTML = "&#8592;";
  prev.disabled  = tablePage === 1;
  prev.addEventListener("click", () => { tablePage--; renderTable(currentData); });
  controls.appendChild(prev);

  // Page number buttons (max 5 visible)
  const delta = 2;
  let pageNums = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || (i >= tablePage - delta && i <= tablePage + delta)) {
      pageNums.push(i);
    }
  }

  let last = 0;
  pageNums.forEach(p => {
    if (last && p - last > 1) {
      const ellipsis = document.createElement("span");
      ellipsis.className = "page-btn";
      ellipsis.style.border = "none";
      ellipsis.style.cursor = "default";
      ellipsis.textContent = "…";
      controls.appendChild(ellipsis);
    }
    const btn = document.createElement("button");
    btn.className = "page-btn" + (p === tablePage ? " active" : "");
    btn.textContent = p;
    btn.addEventListener("click", () => { tablePage = p; renderTable(currentData); });
    controls.appendChild(btn);
    last = p;
  });

  // Next button
  const next = document.createElement("button");
  next.className = "page-btn";
  next.innerHTML = "&#8594;";
  next.disabled  = tablePage === pages;
  next.addEventListener("click", () => { tablePage++; renderTable(currentData); });
  controls.appendChild(next);

  container.appendChild(controls);
}

// ── Wire up sortable column headers ──────────────────────────
function initTableSort() {
  document.querySelectorAll(".data-table th.sortable").forEach(th => {
    th.addEventListener("click", () => {
      const col = th.dataset.col;
      if (tableSortCol === col) {
        tableSortDir = tableSortDir === "asc" ? "desc" : "asc";
      } else {
        tableSortCol = col;
        tableSortDir = col === "name" || col === "genre" ? "asc" : "desc";
      }
      tablePage = 1;
      renderTable(currentData);
    });
  });
}

// ── Master render function ────────────────────────────────────
function renderAll(data) {
  renderKPIs(data);
  renderCharts(data);
  renderTable(data);
}

// ── CSV load & parse ─────────────────────────────────────────
function loadCSV() {
  Papa.parse("dataset_roblox_final.csv", {
    download: true,
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true,
    complete(results) {
      allData = results.data.map(row => ({
        game_id:          row.game_id,
        name:             String(row.name || "").trim(),
        creator:          String(row.creator || "").trim(),
        genre:            String(row.genre || "Unknown").trim(),
        activePlayers:    Number(row.activePlayers)    || 0,
        visits:           Number(row.visits)           || 0,
        favorites:        Number(row.favorites)        || 0,
        likes:            Number(row.likes)            || 0,
        dislikes:         Number(row.dislikes)         || 0,
        lastUpdated:      row.lastUpdated,
        popularity_score: Number(row.popularity_score) || 0,
      }));

      buildGenreFilter(allData);
      initTableSort();
      renderAll(allData);
    },
    error(err) {
      console.error("Failed to load CSV:", err);
    }
  });
}

// ── Boot ─────────────────────────────────────────────────────
loadCSV();
