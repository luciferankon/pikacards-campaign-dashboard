// ============================================
// STRATEGY IMPACT TRACKER — tracker.js
// Fetches data.json, calculates pre/post strategy
// impact, builds WoW table, strategies panel, charts
// ============================================

async function fetchWeeklyData() {
  try {
    const res = await fetch('data.json?t=' + Date.now());
    if (!res.ok) throw new Error('Fetch failed: ' + res.status);
    return await res.json();
  } catch (err) {
    console.error('Data fetch error:', err);
    return null;
  }
}

function calculateWoWChange(currentValue, prevValue) {
  if (prevValue === null || prevValue === 0) return null;
  return ((currentValue - prevValue) / prevValue) * 100;
}

function updateTrackerKPIs(data) {
  if (!data || !data.weeks || data.weeks.length === 0) return;

  // Update status bar
  const now = new Date();
  const activationDate = data.strategies && data.strategies.length > 0
    ? new Date(data.strategies[0].implemented).toLocaleDateString('en-AU', {day:'numeric',month:'short',year:'numeric'})
    : 'N/A';

  document.getElementById('tracker-status').innerHTML =
    '<span style="color:var(--green); font-weight:600;">📊 Live Data — Last refreshed: ' +
    now.toLocaleDateString('en-AU', {day:'numeric',month:'short',year:'numeric'}) +
    ' at ' + now.toLocaleTimeString('en-AU', {hour:'2-digit',minute:'2-digit'}) +
    ' — Strategy Activated: ' + activationDate + '</span>';

  // Calculate pre-strategy and post-strategy averages
  const preWeeks = data.weeks.filter(w => !w.strategies_active);
  const postWeeks = data.weeks.filter(w => w.strategies_active);

  const beforeRevenue = preWeeks.length > 0
    ? preWeeks.reduce((s, w) => s + (w.shopify?.revenue || 0), 0) / preWeeks.length
    : 0;
  const beforeOrders = preWeeks.length > 0
    ? preWeeks.reduce((s, w) => s + (w.shopify?.orders || 0), 0) / preWeeks.length
    : 0;
  const beforeAOV = preWeeks.length > 0
    ? preWeeks.reduce((s, w) => s + (w.shopify?.aov || 0), 0) / preWeeks.length
    : 0;
  const beforeTotalItems = preWeeks.reduce((s, w) => s + (w.shopify?.items || 0), 0);
  const beforeTotalOrders = preWeeks.reduce((s, w) => s + (w.shopify?.orders || 0), 0);
  const beforeItems = beforeTotalOrders > 0 ? beforeTotalItems / beforeTotalOrders : 0;

  // Update BEFORE metrics
  document.getElementById('before-revenue').textContent = '$' + beforeRevenue.toLocaleString('en-US', {minimumFractionDigits:0, maximumFractionDigits:0});
  document.getElementById('before-orders').textContent = beforeOrders.toFixed(1);
  document.getElementById('before-aov').textContent = '$' + beforeAOV.toFixed(0);
  document.getElementById('before-items').textContent = beforeItems.toFixed(1);

  // Show AFTER section if post-strategy data exists
  if (postWeeks.length > 0) {
    const afterRevenue = postWeeks.reduce((s, w) => s + (w.shopify?.revenue || 0), 0) / postWeeks.length;
    const afterOrders = postWeeks.reduce((s, w) => s + (w.shopify?.orders || 0), 0) / postWeeks.length;
    const afterAOV = postWeeks.reduce((s, w) => s + (w.shopify?.aov || 0), 0) / postWeeks.length;
    const afterTotalItems = postWeeks.reduce((s, w) => s + (w.shopify?.items || 0), 0);
    const afterTotalOrders = postWeeks.reduce((s, w) => s + (w.shopify?.orders || 0), 0);
    const afterItems = afterTotalOrders > 0 ? afterTotalItems / afterTotalOrders : 0;

    const revenueDelta = calculateWoWChange(afterRevenue, beforeRevenue);
    const ordersDelta = calculateWoWChange(afterOrders, beforeOrders);
    const aovDelta = calculateWoWChange(afterAOV, beforeAOV);
    const itemsDelta = calculateWoWChange(afterItems, beforeItems);

    document.getElementById('after-section').style.display = 'block';
    document.getElementById('after-revenue').textContent = '$' + afterRevenue.toLocaleString('en-US', {minimumFractionDigits:0, maximumFractionDigits:0});
    document.getElementById('after-orders').textContent = afterOrders.toFixed(1);
    document.getElementById('after-aov').textContent = '$' + afterAOV.toFixed(0);
    document.getElementById('after-items').textContent = afterItems.toFixed(1);

    // Set delta color and text
    const setDelta = (elemId, delta) => {
      const elem = document.getElementById(elemId);
      const sign = delta > 0 ? '+' : '';
      const color = delta > 0 ? 'var(--green)' : 'var(--red)';
      elem.textContent = sign + delta.toFixed(1) + '%';
      elem.style.color = color;
    };

    setDelta('after-revenue-delta', revenueDelta);
    setDelta('after-orders-delta', ordersDelta);
    setDelta('after-aov-delta', aovDelta);
    setDelta('after-items-delta', itemsDelta);
  }
}

function buildWeekOnWeekTable(data) {
  const tbody = document.getElementById('wow-table-body');
  tbody.innerHTML = '';

  const strategyDate = data.strategies && data.strategies.length > 0
    ? new Date(data.strategies[0].implemented)
    : null;

  for (let i = 0; i < data.weeks.length; i++) {
    const week = data.weeks[i];
    const prevWeek = i > 0 ? data.weeks[i - 1] : null;

    const revenueDelta = prevWeek
      ? calculateWoWChange(week.shopify.revenue, prevWeek.shopify.revenue)
      : null;
    const ordersDelta = prevWeek
      ? calculateWoWChange(week.shopify.orders, prevWeek.shopify.orders)
      : null;
    const aovDelta = prevWeek
      ? calculateWoWChange(week.shopify.aov, prevWeek.shopify.aov)
      : null;

    const isActivationWeek = week.strategies_active &&
      (i === 0 || !data.weeks[i - 1].strategies_active);

    const tr = document.createElement('tr');
    if (week.strategies_active) {
      tr.style.background = 'rgba(250,204,21,0.04)';
    }
    if (isActivationWeek) {
      tr.style.borderLeft = '4px solid var(--accent)';
    }

    const formatDelta = (delta) => {
      if (delta === null) return '—';
      const sign = delta > 0 ? '+' : '';
      const color = delta > 0 ? 'color:var(--green)' : 'color:var(--red)';
      return `<span style="${color}; font-weight:600;">${sign}${delta.toFixed(1)}%</span>`;
    };

    tr.innerHTML = `
      <td><strong>${week.label}</strong>${isActivationWeek ? ' <span class="badge star">Strategy Start</span>' : ''}</td>
      <td>$${week.shopify.revenue.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
      <td>${formatDelta(revenueDelta)}</td>
      <td>${week.shopify.orders}</td>
      <td>${formatDelta(ordersDelta)}</td>
      <td>$${week.shopify.aov.toFixed(0)}</td>
      <td>${formatDelta(aovDelta)}</td>
      <td>${week.ga4?.sessions !== null ? week.ga4.sessions : '—'}</td>
      <td>${week.ga4?.conversion_rate !== null ? (week.ga4.conversion_rate.toFixed(2) + '%') : '—'}</td>
    `;
    tbody.appendChild(tr);
  }

  // Show GA4 notice if all GA4 fields are null
  const hasGA4Data = data.weeks.some(w =>
    w.ga4?.sessions !== null || w.ga4?.conversion_rate !== null
  );
  document.getElementById('ga4-notice').style.display = hasGA4Data ? 'none' : 'block';
}

function buildStrategiesPanel(data) {
  const grid = document.getElementById('strategies-grid');
  grid.innerHTML = '';

  if (!data.strategies || data.strategies.length === 0) return;

  const categoryColors = {
    'conversion': { bg: 'rgba(168,85,247,0.1)', border: 'var(--purple)', accent: 'var(--purple)' },
    'retention': { bg: 'rgba(6,182,212,0.1)', border: 'var(--cyan)', accent: 'var(--cyan)' },
    'traffic': { bg: 'rgba(59,130,246,0.1)', border: 'var(--blue)', accent: 'var(--blue)' }
  };

  data.strategies.forEach(strategy => {
    const colors = categoryColors[strategy.category] ||
      { bg: 'rgba(156,163,175,0.1)', border: 'var(--text-muted)', accent: 'var(--text-muted)' };

    const card = document.createElement('div');
    card.style.cssText = `
      background: ${colors.bg};
      border: 2px solid ${colors.border};
      border-radius: 12px;
      padding: 20px;
    `;
    card.innerHTML = `
      <div style="font-size:0.75rem; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-muted); margin-bottom:8px;">
        <span style="color:${colors.accent}; font-weight:700;">${strategy.category}</span>
      </div>
      <h4 style="margin-bottom:12px; color:${colors.accent}; font-weight:700;">${strategy.name}</h4>
      <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:12px; line-height:1.5;">
        ${strategy.description}
      </p>
      <div style="font-size:0.8rem; color:var(--text-muted); border-top:1px solid ${colors.border}; padding-top:12px; margin-top:12px;">
        <strong style="color:${colors.accent};">Implemented:</strong> ${new Date(strategy.implemented).toLocaleDateString('en-AU', {day:'numeric',month:'short',year:'numeric'})}
      </div>
    `;
    grid.appendChild(card);
  });
}

function initTrackerCharts(data) {
  if (!data || !data.weeks || data.weeks.length === 0) return;

  const labels = data.weeks.map(w => w.label);
  const revenues = data.weeks.map(w => w.shopify.revenue);
  const orders = data.weeks.map(w => w.shopify.orders);
  const aovs = data.weeks.map(w => w.shopify.aov);

  // Find strategy activation index
  const activationIdx = data.weeks.findIndex(w => w.strategies_active);

  // Calculate baseline for chart
  const preWeeks = data.weeks.filter(w => !w.strategies_active);
  const baselineRevenue = preWeeks.length > 0
    ? preWeeks.reduce((s, w) => s + w.shopify.revenue, 0) / preWeeks.length
    : null;

  // Color bars by pre/post strategy
  const barColors = data.weeks.map(w =>
    w.strategies_active ? '#facc15' : '#3b82f6'
  );

  // Revenue Trend Chart with Baseline
  const revenueCtx = document.getElementById('revenueTrendChart');
  if (revenueCtx) {
    const datasets = [
      {
        label: 'Weekly Revenue',
        data: revenues,
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34,197,94,0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 6,
        pointBackgroundColor: data.weeks.map(w =>
          w.strategies_active ? '#facc15' : '#22c55e'
        ),
        pointHoverRadius: 8,
      }
    ];

    if (baselineRevenue !== null) {
      datasets.push({
        label: 'Baseline Average ($' + baselineRevenue.toFixed(0) + ')',
        data: Array(labels.length).fill(baselineRevenue),
        borderColor: '#f97316',
        borderDash: [5, 5],
        pointRadius: 0,
        fill: false,
        tension: 0,
      });
    }

    new Chart(revenueCtx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        plugins: { legend: { position: 'top' } },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { callback: v => '$' + v.toLocaleString() },
            grid: { color: '#1e2130' }
          },
          x: { grid: { display: false } }
        }
      }
    });
  }

  // Orders Trend Chart — color by pre/post
  const ordersCtx = document.getElementById('ordersTrendChart');
  if (ordersCtx) {
    new Chart(ordersCtx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Orders',
          data: orders,
          backgroundColor: barColors,
          borderRadius: 6,
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: '#1e2130' } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  // Revenue + AOV Dual Axis Chart
  const dualCtx = document.getElementById('revenuAovChart');
  if (dualCtx) {
    new Chart(dualCtx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Revenue',
            data: revenues,
            backgroundColor: barColors,
            yAxisID: 'y',
            borderRadius: 6,
          },
          {
            label: 'AOV',
            data: aovs,
            type: 'line',
            borderColor: '#a855f7',
            backgroundColor: 'rgba(168,85,247,0.1)',
            yAxisID: 'y1',
            tension: 0.4,
            pointRadius: 6,
            pointBackgroundColor: '#a855f7',
          }
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'top' } },
        scales: {
          y: {
            type: 'linear',
            position: 'left',
            ticks: { callback: v => '$' + v.toLocaleString() },
            grid: { color: '#1e2130' },
            title: { display: true, text: 'Revenue' }
          },
          y1: {
            type: 'linear',
            position: 'right',
            ticks: { callback: v => '$' + v.toFixed(0) },
            grid: { drawOnChartArea: false },
            title: { display: true, text: 'AOV' }
          },
          x: { grid: { display: false } }
        }
      }
    });
  }
}

// ============================================
// TARGETS & METRICS TAB
// ============================================

// 12-week targets (weekly equivalents where applicable)
const TARGETS = {
  weekly_revenue: { name: 'Weekly Revenue', target: 1500, unit: '$', baseline: 916, format: v => '$' + v.toLocaleString('en-US',{maximumFractionDigits:0}), key: 'revenue' },
  orders: { name: 'Orders/Week', target: 6, unit: '', baseline: 3.7, format: v => v.toFixed(1), key: 'orders' },
  aov: { name: 'Avg Order Value', target: 250, unit: '$', baseline: 248, format: v => '$' + v.toFixed(0), key: 'aov' },
  items_per_order: { name: 'Items/Order', target: 5, unit: '', baseline: 3.5, format: v => v.toFixed(1), key: 'items_per_order' },
};

function buildTargetGauges(data) {
  const container = document.getElementById('target-gauges');
  if (!container) return;
  container.innerHTML = '';

  const weeks = data.weeks || [];
  const lastWeek = weeks.length > 0 ? weeks[weeks.length - 1] : null;
  const last4 = weeks.slice(-4);

  // Calculate rolling 4-week averages (or whatever weeks we have)
  const recentRevenue = last4.length > 0 ? last4.reduce((s,w) => s + w.shopify.revenue, 0) / last4.length : 0;
  const recentOrders = last4.length > 0 ? last4.reduce((s,w) => s + w.shopify.orders, 0) / last4.length : 0;
  const recentAOV = last4.length > 0 ? last4.reduce((s,w) => s + w.shopify.aov, 0) / last4.length : 0;
  const recentTotalItems = last4.reduce((s,w) => s + (w.shopify.items || 0), 0);
  const recentTotalOrders = last4.reduce((s,w) => s + (w.shopify.orders || 0), 0);
  const recentItems = recentTotalOrders > 0 ? recentTotalItems / recentTotalOrders : 0;

  // GA4 metrics from baseline (since we don't have weekly GA4 yet)
  const ga4 = data.baseline?.ga4 || {};

  const gauges = [
    { name: 'Weekly Revenue (4wk avg)', current: recentRevenue, target: 1500, baseline: data.baseline?.shopify?.avg_weekly_revenue || 916, format: v => '$'+v.toLocaleString('en-US',{maximumFractionDigits:0}), color: 'var(--accent)' },
    { name: 'Orders/Week (4wk avg)', current: recentOrders, target: 6, baseline: data.baseline?.shopify?.avg_weekly_orders || 3.7, format: v => v.toFixed(1), color: 'var(--blue)' },
    { name: 'Avg Order Value (4wk avg)', current: recentAOV, target: 250, baseline: data.baseline?.shopify?.avg_aov || 248, format: v => '$'+v.toFixed(0), color: 'var(--purple)' },
    { name: 'Items/Order (4wk avg)', current: recentItems, target: 5, baseline: 3.5, format: v => v.toFixed(1), color: 'var(--cyan)' },
    { name: 'GA4 Conversion Rate', current: ga4.avg_conversion_rate || null, target: 2.5, baseline: 1.29, format: v => v.toFixed(2)+'%', color: 'var(--green)', suffix: '%' },
    { name: 'Checkout Completion', current: ga4.checkout_completion_rate || null, target: 40, baseline: 27.7, format: v => v.toFixed(1)+'%', color: 'var(--orange)', suffix: '%' },
    { name: 'Organic Search Share', current: ga4.organic_share_pct || null, target: 15, baseline: 6.5, format: v => v.toFixed(1)+'%', color: 'var(--green)', suffix: '%' },
    { name: 'Monthly Sessions', current: ga4.avg_weekly_sessions ? ga4.avg_weekly_sessions * 4.33 : null, target: 1500, baseline: 980, format: v => v.toFixed(0)+'/mo', color: 'var(--blue)' },
  ];

  gauges.forEach(g => {
    const card = document.createElement('div');
    card.className = 'gauge-card';

    const hasData = g.current !== null && g.current !== undefined;
    const pctOfTarget = hasData ? Math.min((g.current / g.target) * 100, 100) : 0;
    const pctFromBaseline = hasData && g.baseline > 0 ? ((g.current - g.baseline) / g.baseline) * 100 : 0;

    let statusClass = 'no-data';
    let statusText = 'No data';
    if (hasData) {
      if (pctOfTarget >= 90) { statusClass = 'on-track'; statusText = 'On Track'; }
      else if (pctOfTarget >= 60) { statusClass = 'needs-work'; statusText = 'Needs Work'; }
      else { statusClass = 'behind'; statusText = 'Behind'; }
    }

    const barColor = statusClass === 'on-track' ? 'var(--green)' :
                     statusClass === 'needs-work' ? 'var(--orange)' :
                     statusClass === 'behind' ? 'var(--red)' : 'var(--text-muted)';

    const changeSign = pctFromBaseline >= 0 ? '+' : '';
    const changeColor = pctFromBaseline >= 0 ? 'var(--green)' : 'var(--red)';

    card.innerHTML = `
      <div class="gauge-header">
        <div class="gauge-name">${g.name}</div>
        <div class="gauge-status ${statusClass}">${statusText}</div>
      </div>
      <div class="gauge-values">
        <div class="gauge-current" style="color:${g.color}">${hasData ? g.format(g.current) : '—'}</div>
        <div class="gauge-target">Target: ${g.format(g.target)}</div>
      </div>
      <div class="gauge-bar-bg">
        <div class="gauge-bar-fill" style="width:${hasData ? pctOfTarget : 0}%; background:${barColor};"></div>
      </div>
      <div class="gauge-detail">
        Baseline: ${g.format(g.baseline)}${hasData ? ` — <span style="color:${changeColor}">${changeSign}${pctFromBaseline.toFixed(1)}% from baseline</span>` : ''}
      </div>
    `;
    container.appendChild(card);
  });
}

function buildTargetCharts(data) {
  const weeks = data.weeks || [];
  const labels = weeks.map(w => w.label);
  const revenues = weeks.map(w => w.shopify.revenue);
  const orders = weeks.map(w => w.shopify.orders);
  const aovs = weeks.map(w => w.shopify.aov);

  // Revenue vs Target chart
  const revCtx = document.getElementById('revenueTargetChart');
  if (revCtx) {
    new Chart(revCtx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Weekly Revenue',
            data: revenues,
            backgroundColor: revenues.map(r => r >= 1500 ? '#22c55e' : r >= 1000 ? '#facc15' : '#ef4444'),
            borderRadius: 6,
          },
          {
            label: 'Target ($1,500/wk)',
            data: Array(labels.length).fill(1500),
            type: 'line',
            borderColor: '#22c55e',
            borderDash: [5, 5],
            pointRadius: 0,
            fill: false,
          },
          {
            label: 'Baseline ($917/wk)',
            data: Array(labels.length).fill(data.baseline?.shopify?.avg_weekly_revenue || 917),
            type: 'line',
            borderColor: '#ef4444',
            borderDash: [3, 3],
            pointRadius: 0,
            fill: false,
          }
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'top' } },
        scales: {
          y: { beginAtZero: true, ticks: { callback: v => '$' + v.toLocaleString() }, grid: { color: '#1e2130' } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  // AOV Target chart
  const aovCtx = document.getElementById('aovTargetChart');
  if (aovCtx) {
    new Chart(aovCtx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'AOV',
            data: aovs,
            borderColor: '#a855f7',
            backgroundColor: 'rgba(168,85,247,0.1)',
            fill: true,
            tension: 0.4,
            pointRadius: 5,
            pointBackgroundColor: aovs.map(v => v >= 250 ? '#22c55e' : '#f97316'),
          },
          {
            label: 'Target ($250)',
            data: Array(labels.length).fill(250),
            borderColor: '#22c55e',
            borderDash: [5, 5],
            pointRadius: 0,
            fill: false,
          }
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'top' } },
        scales: {
          y: { beginAtZero: false, ticks: { callback: v => '$' + v }, grid: { color: '#1e2130' } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  // Orders Target chart
  const ordCtx = document.getElementById('ordersTargetChart');
  if (ordCtx) {
    new Chart(ordCtx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Orders',
            data: orders,
            backgroundColor: orders.map(o => o >= 6 ? '#22c55e' : o >= 4 ? '#facc15' : '#ef4444'),
            borderRadius: 6,
          },
          {
            label: 'Target (6/wk)',
            data: Array(labels.length).fill(6),
            type: 'line',
            borderColor: '#22c55e',
            borderDash: [5, 5],
            pointRadius: 0,
            fill: false,
          }
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'top' } },
        scales: {
          y: { beginAtZero: true, grid: { color: '#1e2130' } },
          x: { grid: { display: false } }
        }
      }
    });
  }
}

function buildWeeklyScorecard(data) {
  const tbody = document.getElementById('scorecard-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  const weeks = data.weeks || [];
  const targets = { revenue: 1500, orders: 6, aov: 250 };

  weeks.forEach(week => {
    const rev = week.shopify.revenue;
    const ord = week.shopify.orders;
    const aov = week.shopify.aov;
    const items = week.shopify.items;
    const sessions = week.ga4?.sessions;
    const cvr = week.ga4?.conversion_rate;

    // Grade: how many targets hit
    let hits = 0;
    if (rev >= targets.revenue) hits++;
    if (ord >= targets.orders) hits++;
    if (aov >= targets.aov) hits++;

    let grade, gradeColor;
    if (hits === 3) { grade = 'A'; gradeColor = 'var(--green)'; }
    else if (hits === 2) { grade = 'B'; gradeColor = 'var(--accent)'; }
    else if (hits === 1) { grade = 'C'; gradeColor = 'var(--orange)'; }
    else { grade = 'D'; gradeColor = 'var(--red)'; }

    const revColor = rev >= targets.revenue ? 'color:var(--green)' : rev >= 1000 ? 'color:var(--accent)' : 'color:var(--red)';
    const ordColor = ord >= targets.orders ? 'color:var(--green)' : ord >= 4 ? 'color:var(--accent)' : 'color:var(--red)';
    const aovColor = aov >= targets.aov ? 'color:var(--green)' : aov >= 200 ? 'color:var(--accent)' : 'color:var(--red)';

    const revDelta = ((rev - targets.revenue) / targets.revenue * 100).toFixed(0);
    const revDeltaStr = rev >= targets.revenue
      ? `<span style="color:var(--green)">+${revDelta}%</span>`
      : `<span style="color:var(--red)">${revDelta}%</span>`;

    const tr = document.createElement('tr');
    if (week.strategies_active) {
      tr.style.background = 'rgba(250,204,21,0.04)';
    }
    tr.innerHTML = `
      <td><strong>${week.label}</strong></td>
      <td style="${revColor}; font-weight:600;">$${rev.toLocaleString('en-US',{minimumFractionDigits:0})}</td>
      <td>${revDeltaStr}</td>
      <td style="${ordColor}; font-weight:600;">${ord}</td>
      <td style="${aovColor}; font-weight:600;">$${aov.toFixed(0)}</td>
      <td>${items}</td>
      <td>${sessions !== null ? sessions : '—'}</td>
      <td>${cvr !== null ? cvr.toFixed(2)+'%' : '—'}</td>
      <td style="font-weight:800; font-size:1.1rem; color:${gradeColor};">${grade}</td>
    `;
    tbody.appendChild(tr);
  });
}

// Main initialization for the tracker tab
async function initTrackerTab() {
  const data = await fetchWeeklyData();
  if (data) {
    updateTrackerKPIs(data);
    buildWeekOnWeekTable(data);
    buildStrategiesPanel(data);
    initTrackerCharts(data);
    // Also init targets tab (data-driven)
    buildTargetGauges(data);
    buildTargetCharts(data);
    buildWeeklyScorecard(data);
  } else {
    document.getElementById('tracker-status').innerHTML =
      '<span style="color:var(--red); font-weight:600;">⚠️ Could not load live data. Make sure data.json exists.</span>';
  }
}
