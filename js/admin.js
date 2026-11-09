/**
 * admin.js – Admin dashboard logic with Firebase Real-time sync
 */

// ─── Auth ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;

  if (page === 'admin-login') {
    initLoginPage();
  } else if (page === 'admin-dashboard') {
    checkAdminAuth();
    initDashboard();
  }
});

function initLoginPage() {
  const form = document.getElementById('login-form');
  if (!form) return;

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const username = document.getElementById('admin-username').value.trim();
    const password = document.getElementById('admin-password').value;

    const admin = await validateAdmin(username, password);
    if (admin) {
      setSession({ admin, loggedIn: true, loginTime: new Date().toISOString() });
      showToastAdmin('Login successful! Redirecting…', 'success');
      setTimeout(() => { window.location.href = 'admin-dashboard.html'; }, 800);
    } else {
      showLoginError('Invalid username or password.');
    }
  });
}

function checkAdminAuth() {
  const session = getSession();
  if (!session || !session.loggedIn) {
    window.location.href = 'admin.html';
    return false;
  }
  const nameEl = document.getElementById('admin-name');
  if (nameEl && session.admin) nameEl.textContent = session.admin.username;
  return true;
}

function initDashboard() {
  refreshStats();
  refreshQueue();
  loadSettings();
  loadFirebaseSettings();
  setupAdminControls();
  loadActivityTable();
  updateCloudBadge();

  // Listen to Firebase real-time events for instant updates
  window.addEventListener('diwali:queue-updated', () => {
    refreshQueue();
    refreshStats();
  });

  window.addEventListener('diwali:attempts-updated', () => {
    refreshStats();
    loadActivityTable();
  });

  window.addEventListener('diwali:settings-updated', () => {
    loadSettings();
  });

  // Polling fallback every 10s
  setInterval(() => {
    refreshStats();
    refreshQueue();
    loadActivityTable();
    updateCloudBadge();
  }, 10000);
}

function updateCloudBadge() {
  const badge = document.getElementById('cloud-status-badge');
  if (!badge) return;

  if (typeof isCloudActive === 'function' && isCloudActive()) {
    badge.innerHTML = `<span class="live-dot" style="background:#2ecc71;"></span> 🔥 Firebase Connected`;
    badge.className = 'live-badge';
    badge.style.color = '#2ecc71';
    badge.style.borderColor = 'rgba(46,204,113,0.3)';
  } else {
    badge.innerHTML = `<span class="live-dot" style="background:#f39c12;"></span> 💾 LocalStorage Mode`;
    badge.className = 'live-badge';
    badge.style.color = '#f39c12';
    badge.style.borderColor = 'rgba(243,156,18,0.3)';
  }
}

// ─── Stats ────────────────────────────────────────────────────────────────────

function refreshStats() {
  const stats = getStats();

  setStatCard('stat-total',       stats.totalAttempts);
  setStatCard('stat-scratched',   stats.totalScratched);
  setStatCard('stat-free',        stats.totalFree);
  setStatCard('stat-betterLuck',  stats.totalBetterLuck);
  setStatCard('stat-smallDisc',   stats.totalSmallDisc);
  setStatCard('stat-bigDisc',     stats.totalBigDisc);
  setStatCard('stat-pending',     stats.pendingQueue);
}

function setStatCard(id, value) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = value;
    el.classList.add('stat-pop');
    setTimeout(() => el.classList.remove('stat-pop'), 500);
  }
}

// ─── Queue Management ─────────────────────────────────────────────────────────

function refreshQueue() {
  const queue = getPendingQueue();
  const tbody = document.getElementById('queue-tbody');
  if (!tbody) return;

  if (queue.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-row">No pending rewards in queue</td></tr>`;
    return;
  }

  tbody.innerHTML = queue.map(item => `
    <tr>
      <td><span class="badge-id">${item.id ? item.id.slice(-8) : '—'}</span></td>
      <td><span class="badge-type badge-${item.rewardType}">${item.rewardType}</span></td>
      <td><strong>${item.rewardValue}</strong></td>
      <td>${item.customNumber != null ? item.customNumber : '—'}</td>
      <td><span class="badge-cat">${item.targetCategory}</span></td>
      <td>
        <button class="btn-danger-sm" onclick="removeQueueEntry('${item.firebaseKey || item.id}')">🗑 Remove</button>
      </td>
    </tr>
  `).join('');
}

async function removeQueueEntry(id) {
  if (confirm('Remove this queued reward?')) {
    await removeQueueItem(id);
    refreshQueue();
    refreshStats();
    showToastAdmin('Queue item removed.', 'info');
  }
}

// ─── Admin Controls ───────────────────────────────────────────────────────────

function setupAdminControls() {
  // Push specific number
  document.getElementById('btn-push-number')?.addEventListener('click', async () => {
    const numInput  = document.getElementById('push-number-val');
    const catInput  = document.getElementById('push-number-cat');
    const num       = parseInt(numInput.value, 10);
    const cat       = catInput.value;

    if (isNaN(num) || num < 1) {
      showToastAdmin('Please enter a valid number.', 'error');
      return;
    }
    await pushToRewardQueue({ rewardType: 'number', rewardValue: String(num), customNumber: num, targetCategory: cat });
    numInput.value = '';
    refreshQueue();
    refreshStats();
    showToastAdmin(`Number #${num} pushed to queue for ${cat}.`, 'success');
  });

  // Push discount
  document.getElementById('btn-push-discount')?.addEventListener('click', async () => {
    const discInput  = document.getElementById('push-discount-val');
    const catInput   = document.getElementById('push-discount-cat');
    const discount   = discInput.value.trim();
    const cat        = catInput.value;

    if (!discount) {
      showToastAdmin('Please select or enter a discount value.', 'error');
      return;
    }

    const discNum = parseInt(discount, 10);
    if (isNaN(discNum) || discNum < 1 || discNum > 100) {
      showToastAdmin('Please enter a valid discount percentage (e.g. 12, 16%, 25%).', 'error');
      return;
    }

    const formattedDiscount = discount.includes('%') ? discount : `${discNum}%`;

    if (cat === 'offers' && discNum > 20) {
      showToastAdmin('Discounts above 20% cannot be pushed to Festive Offers tab (10–20% only).', 'error');
      return;
    }
    if (cat === 'bigOffers' && discNum < 21) {
      showToastAdmin('Discounts under 21% cannot be pushed to Mega Offers tab (21–30% only).', 'error');
      return;
    }

    const settings = getSettings();
    const num = generateRandomNumber(settings.minNumber, settings.maxNumber);
    await pushToRewardQueue({ rewardType: 'discount', rewardValue: formattedDiscount, customNumber: num, targetCategory: cat });
    refreshQueue();
    refreshStats();
    showToastAdmin(`${formattedDiscount} OFF pushed to ${cat} queue.`, 'success');
  });

  // Push FREE
  document.getElementById('btn-push-free')?.addEventListener('click', async () => {
    const catInput = document.getElementById('push-special-cat');
    const cat      = catInput.value;
    const settings = getSettings();
    const num      = generateRandomNumber(settings.minNumber, settings.maxNumber);
    await pushToRewardQueue({ rewardType: 'free', rewardValue: 'free', customNumber: num, targetCategory: cat });
    refreshQueue();
    refreshStats();
    showToastAdmin(`FREE reward pushed to ${cat} queue.`, 'success');
  });

  // Push Better Luck
  document.getElementById('btn-push-luck')?.addEventListener('click', async () => {
    const catInput = document.getElementById('push-special-cat');
    const cat      = catInput.value;
    const settings = getSettings();
    const num      = generateRandomNumber(settings.minNumber, settings.maxNumber);
    await pushToRewardQueue({ rewardType: 'better_luck', rewardValue: 'better_luck', customNumber: num, targetCategory: cat });
    refreshQueue();
    refreshStats();
    showToastAdmin(`"Better Luck Next Time" pushed to ${cat} queue.`, 'success');
  });

  // Clear all queue
  document.getElementById('btn-clear-queue')?.addEventListener('click', async () => {
    if (confirm('Clear ALL pending rewards from the queue?')) {
      await clearRewardQueue();
      refreshQueue();
      refreshStats();
      showToastAdmin('Queue cleared.', 'info');
    }
  });

  // Settings form
  document.getElementById('settings-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    await saveSettings();
  });

  // Logout
  document.getElementById('btn-logout')?.addEventListener('click', () => {
    clearSession();
    window.location.href = 'admin.html';
  });

  // Reset all data
  document.getElementById('btn-reset-data')?.addEventListener('click', async () => {
    if (confirm('⚠️ This will delete ALL scratch attempts and statistics. Continue?')) {
      await clearAllAttempts();
      refreshStats();
      loadActivityTable();
      showToastAdmin('All attempt data cleared.', 'info');
    }
  });
}

// ─── Settings ─────────────────────────────────────────────────────────────────

function loadSettings() {
  const s = getSettings();
  if (!s) return;

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = val;
    else el.value = val;
  };

  setVal('setting-offers-enabled',    s.offersTabEnabled);
  setVal('setting-bigoffers-enabled', s.bigOffersTabEnabled);
  setVal('setting-min-number',        s.minNumber);
  setVal('setting-max-number',        s.maxNumber);
}

async function saveSettings() {
  const getVal = (id) => {
    const el = document.getElementById(id);
    if (!el) return null;
    if (el.type === 'checkbox') return el.checked;
    return el.value;
  };

  const min = parseInt(getVal('setting-min-number'), 10);
  const max = parseInt(getVal('setting-max-number'), 10);

  if (isNaN(min) || isNaN(max) || min >= max) {
    showToastAdmin('Invalid number range. Min must be less than Max.', 'error');
    return;
  }

  await updateSettings({
    offersTabEnabled:    getVal('setting-offers-enabled'),
    bigOffersTabEnabled: getVal('setting-bigoffers-enabled'),
    minNumber:           min,
    maxNumber:           max,
  });

  showToastAdmin('Settings saved successfully!', 'success');
}

// ─── Firebase Configuration Controls ──────────────────────────────────────────

function loadFirebaseSettings() {
  const cfg = (typeof getActiveFirebaseConfig === 'function') ? getActiveFirebaseConfig() : {};
  const setEl = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val || '';
  };

  setEl('fb-api-key', cfg.apiKey);
  setEl('fb-auth-domain', cfg.authDomain);
  setEl('fb-database-url', cfg.databaseURL);
  setEl('fb-project-id', cfg.projectId);
  setEl('fb-storage-bucket', cfg.storageBucket);
  setEl('fb-messaging-sender-id', cfg.messagingSenderId);
  setEl('fb-app-id', cfg.appId);
}

function saveFirebaseCredentials() {
  const getEl = id => {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  };

  const config = {
    apiKey: getEl('fb-api-key'),
    authDomain: getEl('fb-auth-domain'),
    databaseURL: getEl('fb-database-url'),
    projectId: getEl('fb-project-id'),
    storageBucket: getEl('fb-storage-bucket'),
    messagingSenderId: getEl('fb-messaging-sender-id'),
    appId: getEl('fb-app-id'),
  };

  if (!config.apiKey || !config.databaseURL) {
    showToastAdmin('Please enter at least the API Key and Database URL.', 'error');
    return;
  }

  saveFirebaseConfig(config);
  showToastAdmin('🔥 Firebase config saved! Reloading to connect…', 'success');
  setTimeout(() => {
    window.location.reload();
  }, 1200);
}

// ─── Activity Table ───────────────────────────────────────────────────────────

function loadActivityTable() {
  const stats = getStats();
  const tbody = document.getElementById('activity-tbody');
  if (!tbody) return;

  const rows = stats.recentActivity;
  if (!rows || rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-row">No activity yet</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(a => {
    const reward = a.assignedReward || '—';
    const badgeClass = reward === 'free' ? 'badge-free'
                      : reward === 'better_luck' ? 'badge-luck'
                      : reward.includes('%') ? 'badge-disc' : 'badge-default';

    const rewardLabel = reward === 'better_luck' ? 'Better Luck' : reward.toUpperCase();
    const statusClass = a.scratchStatus === 'scratched' ? 'status-done' : 'status-pending';

    return `
      <tr>
        <td><span class="badge-id">${a.id ? a.id.slice(-8) : '—'}</span></td>
        <td>${formatDate(a.createdAt)}</td>
        <td><span class="badge-cat">${a.category}</span></td>
        <td>${a.assignedNumber != null ? a.assignedNumber : '—'}</td>
        <td><span class="badge-type ${badgeClass}">${rewardLabel}</span></td>
        <td><span class="status-badge ${statusClass}">${a.scratchStatus}</span></td>
      </tr>
    `;
  }).join('');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
}

function showLoginError(msg) {
  const err = document.getElementById('login-error');
  if (err) {
    err.textContent = msg;
    err.style.display = 'block';
    err.classList.add('shake');
    setTimeout(() => err.classList.remove('shake'), 600);
  }
}

function showToastAdmin(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('toast-visible'), 50);
  setTimeout(() => {
    toast.classList.remove('toast-visible');
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}
