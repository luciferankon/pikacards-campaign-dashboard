// ============================================
// STATIC CHARTS & APP LOGIC — charts.js
// Tab switching, login, and all non-tracker charts
// ============================================

// Tab switching
function switchTab(name) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  event.target.classList.add('active');
}

// Password check using SHA-256 hash
async function checkPassword(e) {
  e.preventDefault();
  const pwd = document.getElementById('password-input').value;
  const encoder = new TextEncoder();
  const data = encoder.encode(pwd);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  const correctHash = 'cc2d10c54cd0dbcbda23ad6205bb5fca3f3b438b4c5614a41a331174c995f75d';

  if (hashHex === correctHash) {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('dashboard-content').style.display = 'block';
    initAllCharts();
    sessionStorage.setItem('pika_auth', '1');
  } else {
    document.getElementById('login-error').style.display = 'block';
    document.getElementById('password-input').value = '';
    document.getElementById('password-input').focus();
  }
}

// Auto-login if already authenticated in this session
if (sessionStorage.getItem('pika_auth') === '1') {
  document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('dashboard-content').style.display = 'block';
    initAllCharts();
  });
}

// Initialize all charts (called after login)
async function initAllCharts() {
  // Chart defaults
  Chart.defaults.color = '#9ca3af';
  Chart.defaults.borderColor = '#2a2e3d';
  Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

  // Initialize the strategy tracker tab (from tracker.js)
  await initTrackerTab();

  // === STATIC CHARTS (tabs 1–7) ===

  // Purchase Journey Chart
  new Chart(document.getElementById('purchaseJourneyChart'), {
    type: 'bar',
    data: {
      labels: ['Session Start', 'View Product', 'Add to Cart', 'Begin Checkout', 'Purchase'],
      datasets: [{
        label: 'Mobile',
        data: [928, 788, 64, 25, 5],
        backgroundColor: '#3b82f6',
        borderRadius: 4,
      }, {
        label: 'Desktop',
        data: [180, 113, 13, 6, 0],
        backgroundColor: '#a855f7',
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'top' } },
      scales: { y: { beginAtZero: true, grid: { color: '#1e2130' } }, x: { grid: { display: false } } }
    }
  });

  // Traffic Acquisition Doughnut
  new Chart(document.getElementById('trafficChart'), {
    type: 'doughnut',
    data: {
      labels: ['Paid Shopping', 'Direct', 'Organic Search', 'Organic Social', 'Paid Social', 'Other'],
      datasets: [{
        data: [963, 172, 90, 64, 34, 57],
        backgroundColor: ['#3b82f6', '#a855f7', '#22c55e', '#ec4899', '#f97316', '#6b7280'],
        borderWidth: 0,
      }]
    },
    options: {
      responsive: true,
      cutout: '60%',
      plugins: {
        legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true } }
      }
    }
  });

  // Engagement Rate Chart
  new Chart(document.getElementById('engagementChart'), {
    type: 'bar',
    data: {
      labels: ['Organic Search', 'Organic Social', 'Paid Shopping', 'Direct', 'Paid Social'],
      datasets: [{
        label: 'Engagement Rate',
        data: [73.33, 60.94, 50.47, 45.35, 38.24],
        backgroundColor: ['#22c55e', '#ec4899', '#3b82f6', '#a855f7', '#ef4444'],
        borderRadius: 6,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' }, grid: { color: '#1e2130' } },
        y: { grid: { display: false } }
      }
    }
  });

  // Landing Page Conversion Chart
  new Chart(document.getElementById('landingPageChart'), {
    type: 'bar',
    data: {
      labels: ['/cart', '/collections/sealed-boxes', 'Mega Start Deck', 'Ninja Spinner', 'Mega Charizard UPC', 'Homepage (/)', 'Mega Dream M2a', 'One Piece OP13', 'Pikachu PSA 8'],
      datasets: [{
        label: 'Conversion Rate %',
        data: [6.25, 3.64, 1.56, 1.39, 1.23, 0.84, 0.54, 0, 0],
        backgroundColor: function(ctx) {
          const v = ctx.raw;
          if (v >= 3) return '#22c55e';
          if (v >= 1) return '#facc15';
          if (v > 0) return '#f97316';
          return '#ef4444';
        },
        borderRadius: 6,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, ticks: { callback: v => v + '%' }, grid: { color: '#1e2130' } },
        y: { grid: { display: false } }
      }
    }
  });

  // Location Chart
  new Chart(document.getElementById('locationChart'), {
    type: 'bar',
    data: {
      labels: ['Melbourne', 'Sydney', 'Brisbane', 'Iowa (US)', 'Perth'],
      datasets: [{
        label: 'Sessions',
        data: [847, 751, 318, 212, 152],
        backgroundColor: ['#3b82f6', '#06b6d4', '#a855f7', '#f97316', '#ec4899'],
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, grid: { color: '#1e2130' } }, x: { grid: { display: false } } }
    }
  });

  // Product Funnel Chart
  new Chart(document.getElementById('productFunnelChart'), {
    type: 'bar',
    data: {
      labels: ['YGO Limit Heroes', 'YGO Limit Rivals', 'Mega Start Deck', 'Mega Dream M2a', 'Ninja Spinner', 'One Piece OP13', 'Ascended Heroes', 'Charizard UPC', 'Munikis M3', 'Pikachu PSA 8'],
      datasets: [
        { label: 'Views', data: [23, 22, 89, 215, 139, 152, 44, 223, 81, 137], backgroundColor: '#3b82f6', borderRadius: 4 },
        { label: 'Cart Adds', data: [39, 44, 29, 25, 20, 19, 8, 6, 6, 1], backgroundColor: '#facc15', borderRadius: 4 },
        { label: 'Purchased', data: [14, 4, 1, 4, 1, 0, 1, 2, 3, 1], backgroundColor: '#22c55e', borderRadius: 4 }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'top' } },
      scales: { y: { beginAtZero: true, grid: { color: '#1e2130' } }, x: { grid: { display: false } } }
    }
  });

  // Category Pie
  new Chart(document.getElementById('categoryChart'), {
    type: 'doughnut',
    data: {
      labels: ['Yu-Gi-Oh! (63.4%)', 'Pokemon (31.1%)', 'One Piece (5.5%)'],
      datasets: [{
        data: [3092, 1514, 277],
        backgroundColor: ['#a855f7', '#facc15', '#ef4444'],
        borderWidth: 0,
      }]
    },
    options: {
      responsive: true,
      cutout: '60%',
      plugins: { legend: { position: 'bottom', labels: { padding: 12, usePointStyle: true } } }
    }
  });

  // Revenue per View
  new Chart(document.getElementById('revenuePerViewChart'), {
    type: 'bar',
    data: {
      labels: ['YGO Heroes', 'YGO Rivals', 'Ascended ETB', 'Munikis M3', 'Charizard UPC', 'Dream M2a', 'Ninja Spinner', 'PSA 8', 'Start Deck', 'OP13'],
      datasets: [{
        label: '$/view',
        data: [104.17, 31.64, 4.09, 3.42, 2.56, 2.33, 0.97, 0.66, 0.44, 0],
        backgroundColor: function(ctx) {
          const v = ctx.raw;
          if (v >= 10) return '#22c55e';
          if (v >= 2) return '#facc15';
          if (v > 0) return '#f97316';
          return '#ef4444';
        },
        borderRadius: 6,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, ticks: { callback: v => '$' + v }, grid: { color: '#1e2130' } },
        y: { grid: { display: false } }
      }
    }
  });

  // Calendar activity chart
  new Chart(document.getElementById('calendarChart'), {
    type: 'bar',
    data: {
      labels: ['Wk 1', 'Wk 2', 'Wk 3', 'Wk 4', 'Wk 5', 'Wk 6', 'Wk 7', 'Wk 8', 'Wk 9', 'Wk 10', 'Wk 11', 'Wk 12'],
      datasets: [
        { label: 'Site Fixes', data: [4, 3, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0], backgroundColor: '#ef4444', borderRadius: 4 },
        { label: 'Blog/SEO', data: [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0], backgroundColor: '#22c55e', borderRadius: 4 },
        { label: 'Instagram', data: [0, 4, 4, 4, 4, 5, 4, 4, 4, 4, 4, 2], backgroundColor: '#ec4899', borderRadius: 4 },
        { label: 'Email', data: [3, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0], backgroundColor: '#a855f7', borderRadius: 4 },
        { label: 'Ads', data: [0, 1, 0, 2, 0, 1, 0, 1, 0, 0, 0, 1], backgroundColor: '#f97316', borderRadius: 4 },
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'top' } },
      scales: {
        x: { stacked: true, grid: { display: false } },
        y: { stacked: true, beginAtZero: true, title: { display: true, text: 'Action Items' }, grid: { color: '#1e2130' } }
      }
    }
  });

  // Revenue Projection Chart
  new Chart(document.getElementById('projectionChart'), {
    type: 'line',
    data: {
      labels: ['Now', 'Wk 2', 'Wk 4', 'Wk 6', 'Wk 8', 'Wk 10', 'Wk 12'],
      datasets: [{
        label: 'Projected Monthly Revenue',
        data: [3800, 4100, 4500, 4900, 5300, 5700, 6200],
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34,197,94,0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 6,
        pointBackgroundColor: '#22c55e',
      }, {
        label: 'Current Baseline',
        data: [3800, 3800, 3800, 3800, 3800, 3800, 3800],
        borderColor: '#ef4444',
        borderDash: [5, 5],
        pointRadius: 0,
        fill: false,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'top' } },
      scales: {
        y: { beginAtZero: false, min: 2000, ticks: { callback: v => '$' + v.toLocaleString() }, grid: { color: '#1e2130' } },
        x: { grid: { display: false } }
      }
    }
  });
}