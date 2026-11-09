/**
 * store.js – Firebase Realtime Database Data Layer
 * 
 * Synchronizes scratch card state across multiple phones and devices in real-time.
 * Falls back seamlessly to localStorage if Firebase is not yet configured.
 */

const KEYS = {
  SETTINGS:       'diwali_settings',
  REWARD_QUEUE:   'diwali_reward_queue',
  ATTEMPTS:       'diwali_attempts',
  SESSION:        'diwali_session',
  ADMIN_USERS:    'diwali_admin_users',
};

// ─── Default Data ──────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  offersTabEnabled:    true,
  bigOffersTabEnabled: true,
  minNumber:           1,
  maxNumber:           100,
  rewardConfig: {
    offers:    ['10%', '15%', '20%', 'better_luck'],
    bigOffers: ['25%', '30%', 'better_luck'],
  },
  offerWeights: {
    '10%':         30,
    '15%':         25,
    '20%':         20,
    '25%':         35,
    '30%':         25,
    'free':        5,
    'better_luck': 20,
  },
};

const DEFAULT_ADMIN = {
  id:           'admin_001',
  username:     'Paa',
  passwordHash: btoa('Paa@8721'),
  role:         'superadmin',
};

// In-memory cache for fast synchronous access
let cachedSettings = null;
let cachedQueue = [];
let cachedAttempts = [];
let cachedAdmins = [DEFAULT_ADMIN];
let isFirebaseReady = false;

// ─── Initialization ──────────────────────────────────────────────────────────

async function initStore() {
  // Load local cache first
  cachedSettings = getLocal(KEYS.SETTINGS) || DEFAULT_SETTINGS;
  cachedQueue = getLocal(KEYS.REWARD_QUEUE) || [];
  cachedAttempts = getLocal(KEYS.ATTEMPTS) || [];
  
  let storedAdmins = getLocal(KEYS.ADMIN_USERS);
  if (!storedAdmins || !storedAdmins.some(u => u.username === DEFAULT_ADMIN.username)) {
    storedAdmins = [DEFAULT_ADMIN];
    setLocal(KEYS.ADMIN_USERS, storedAdmins);
  }
  cachedAdmins = storedAdmins;

  // Try initializing Firebase
  const db = (typeof initFirebase === 'function') ? initFirebase() : null;
  if (db) {
    isFirebaseReady = true;
    setupFirebaseListeners(db);
    await syncInitialFirebaseData(db);
  } else {
    // Save defaults to localStorage if missing
    if (!getLocal(KEYS.SETTINGS)) setLocal(KEYS.SETTINGS, DEFAULT_SETTINGS);
  }

  notifyStoreReady();
}

const storeReadyListeners = [];
function onStoreReady(callback) {
  if (isFirebaseReady || cachedSettings) {
    callback(isFirebaseReady);
  }
  storeReadyListeners.push(callback);
}
function notifyStoreReady() {
  storeReadyListeners.forEach(cb => {
    try { cb(isFirebaseReady); } catch (e) { console.error(e); }
  });
}

function isCloudActive() {
  return isFirebaseReady && typeof firebaseDb !== 'undefined' && firebaseDb !== null;
}

// ─── Real-time Firebase Listeners ─────────────────────────────────────────────

function setupFirebaseListeners(db) {
  // 1. Settings listener
  db.ref('settings').on('value', snapshot => {
    const val = snapshot.val();
    if (val) {
      cachedSettings = { ...DEFAULT_SETTINGS, ...val };
      setLocal(KEYS.SETTINGS, cachedSettings);
      window.dispatchEvent(new CustomEvent('diwali:settings-updated', { detail: cachedSettings }));
    }
  });

  // 2. Queue listener
  db.ref('rewardQueue').on('value', snapshot => {
    const val = snapshot.val();
    const list = [];
    if (val) {
      Object.keys(val).forEach(key => {
        list.push({ ...val[key], firebaseKey: key });
      });
    }
    cachedQueue = list;
    setLocal(KEYS.REWARD_QUEUE, cachedQueue);
    window.dispatchEvent(new CustomEvent('diwali:queue-updated', { detail: cachedQueue }));
  });

  // 3. Attempts listener
  db.ref('attempts').on('value', snapshot => {
    const val = snapshot.val();
    const list = [];
    if (val) {
      Object.keys(val).forEach(key => {
        list.push({ ...val[key], firebaseKey: key });
      });
    }
    cachedAttempts = list;
    setLocal(KEYS.ATTEMPTS, cachedAttempts);
    window.dispatchEvent(new CustomEvent('diwali:attempts-updated', { detail: cachedAttempts }));
  });

  // 4. Admin Users listener
  db.ref('admin').on('value', snapshot => {
    const val = snapshot.val();
    if (val) {
      const list = Array.isArray(val) ? val : Object.values(val);
      cachedAdmins = list;
      setLocal(KEYS.ADMIN_USERS, cachedAdmins);
    }
  });
}

async function syncInitialFirebaseData(db) {
  try {
    const settingsSnap = await db.ref('settings').once('value');
    if (!settingsSnap.exists()) {
      await db.ref('settings').set(DEFAULT_SETTINGS);
    }

    const adminSnap = await db.ref('admin').once('value');
    if (!adminSnap.exists() || !adminSnap.val()?.admin_001 || adminSnap.val()?.admin_001?.username !== DEFAULT_ADMIN.username) {
      await db.ref('admin/admin_001').set(DEFAULT_ADMIN);
    }
  } catch (err) {
    console.warn('Initial Firebase sync note:', err.message);
  }
}

// ─── Settings Methods ─────────────────────────────────────────────────────────

function getSettings() {
  return cachedSettings || getLocal(KEYS.SETTINGS) || DEFAULT_SETTINGS;
}

async function updateSettings(partial) {
  const current = getSettings();
  const updated = { ...current, ...partial };
  cachedSettings = updated;
  setLocal(KEYS.SETTINGS, updated);

  if (isCloudActive()) {
    try {
      await firebaseDb.ref('settings').update(partial);
    } catch (e) {
      console.error('Firebase settings update failed:', e);
    }
  }
  return updated;
}

// ─── Reward Queue Methods ─────────────────────────────────────────────────────

function getRewardQueue() {
  return cachedQueue || getLocal(KEYS.REWARD_QUEUE) || [];
}

function getPendingQueue() {
  return getRewardQueue().filter(i => i.status === 'pending');
}

async function pushToRewardQueue(item) {
  const entry = {
    id:             generateId('q'),
    rewardType:     item.rewardType || 'discount',
    rewardValue:    String(item.rewardValue || '10%'),
    customNumber:   item.customNumber != null ? Number(item.customNumber) : null,
    targetCategory: item.targetCategory || 'any',
    status:         'pending',
    createdAt:      new Date().toISOString(),
  };

  if (isCloudActive()) {
    try {
      const newRef = firebaseDb.ref('rewardQueue').push();
      entry.firebaseKey = newRef.key;
      await newRef.set(entry);
    } catch (e) {
      console.error('Firebase queue push error:', e);
    }
  } else {
    const q = getRewardQueue();
    q.push(entry);
    cachedQueue = q;
    setLocal(KEYS.REWARD_QUEUE, q);
  }

  return entry;
}

async function removeQueueItem(id) {
  if (isCloudActive()) {
    try {
      const item = cachedQueue.find(q => q.id === id || q.firebaseKey === id);
      const key = (item && item.firebaseKey) || id;
      await firebaseDb.ref(`rewardQueue/${key}`).remove();
    } catch (e) {
      console.error('Firebase remove queue item failed:', e);
    }
  } else {
    cachedQueue = cachedQueue.filter(i => i.id !== id);
    setLocal(KEYS.REWARD_QUEUE, cachedQueue);
  }
}

async function clearRewardQueue() {
  if (isCloudActive()) {
    try {
      await firebaseDb.ref('rewardQueue').remove();
    } catch (e) {
      console.error('Firebase clear queue failed:', e);
    }
  } else {
    cachedQueue = [];
    setLocal(KEYS.REWARD_QUEUE, []);
  }
}

// ─── Scratch Attempts Methods ─────────────────────────────────────────────────

function getAttempts() {
  return cachedAttempts || getLocal(KEYS.ATTEMPTS) || [];
}

async function getAttemptBySession(sessionId) {
  // Check in-memory cache first
  const existing = getAttempts().find(a => a.sessionId === sessionId);
  if (existing) return existing;

  if (isCloudActive()) {
    try {
      const snap = await firebaseDb.ref('attempts')
        .orderByChild('sessionId')
        .equalTo(sessionId)
        .once('value');
      const val = snap.val();
      if (val) {
        const firstKey = Object.keys(val)[0];
        return { ...val[firstKey], firebaseKey: firstKey };
      }
    } catch (e) {
      console.warn('Firebase getAttemptBySession error:', e);
    }
  }

  return null;
}

async function updateAttemptStatus(id, status) {
  const attempts = getAttempts();
  const attempt = attempts.find(a => a.id === id || a.firebaseKey === id);

  if (attempt) {
    attempt.scratchStatus = status;
    attempt.scratchedAt = new Date().toISOString();
  }

  if (isCloudActive()) {
    try {
      const key = (attempt && attempt.firebaseKey) || id;
      await firebaseDb.ref(`attempts/${key}`).update({
        scratchStatus: status,
        scratchedAt: new Date().toISOString()
      });
    } catch (e) {
      console.error('Firebase updateAttemptStatus error:', e);
    }
  } else {
    setLocal(KEYS.ATTEMPTS, attempts);
  }

  return attempt;
}

// ─── Atomic Reward Assignment ─────────────────────────────────────────────────

/**
 * Assign reward to user session.
 * Priority:
 * 1. Return already assigned attempt if user scratched before.
 * 2. Pop next matching pending item from Admin Queue (atomically via Firebase Transaction).
 * 3. Fallback to generating a weighted random reward + random lucky number.
 */
async function assignReward(sessionId, category) {
  // Step 1: Check if already assigned
  const existing = await getAttemptBySession(sessionId);
  if (existing) return existing;

  const settings = getSettings();
  let assignedRewardValue = null;
  let assignedLuckyNumber = null;

  if (isCloudActive()) {
    // Step 2: Atomic dequeue from Firebase Realtime Database
    try {
      const queueRef = firebaseDb.ref('rewardQueue');
      let poppedItem = null;

      await queueRef.transaction(currentQueue => {
        if (!currentQueue) return currentQueue;

        const keys = Object.keys(currentQueue);
        for (const k of keys) {
          const item = currentQueue[k];
          if (item && item.status === 'pending') {
            const matchesCategory = item.targetCategory === 'any' || item.targetCategory === category;
            if (matchesCategory) {
              item.status = 'assigned';
              item.assignedTo = sessionId;
              item.assignedAt = new Date().toISOString();
              poppedItem = { ...item, firebaseKey: k };
              break;
            }
          }
        }
        return currentQueue;
      });

      if (poppedItem) {
        if (poppedItem.rewardType === 'number') {
          assignedLuckyNumber = poppedItem.customNumber;
          assignedRewardValue = generateRandomReward(category, settings);
        } else {
          assignedRewardValue = poppedItem.rewardValue;
          assignedLuckyNumber = poppedItem.customNumber != null
            ? poppedItem.customNumber
            : generateRandomNumber(settings.minNumber, settings.maxNumber);
        }
      } else {
        // No admin push found in cloud queue
        assignedRewardValue = generateRandomReward(category, settings);
        assignedLuckyNumber = generateRandomNumber(settings.minNumber, settings.maxNumber);
      }
    } catch (err) {
      console.warn('Firebase queue transaction error, falling back to random:', err);
      assignedRewardValue = generateRandomReward(category, settings);
      assignedLuckyNumber = generateRandomNumber(settings.minNumber, settings.maxNumber);
    }
  } else {
    // Offline / LocalStorage Mode
    const q = getRewardQueue();
    const idx = q.findIndex(item =>
      item.status === 'pending' &&
      (item.targetCategory === 'any' || item.targetCategory === category)
    );

    if (idx !== -1) {
      const queued = q[idx];
      queued.status = 'assigned';
      setLocal(KEYS.REWARD_QUEUE, q);

      if (queued.rewardType === 'number') {
        assignedLuckyNumber = queued.customNumber;
        assignedRewardValue = generateRandomReward(category, settings);
      } else {
        assignedRewardValue = queued.rewardValue;
        assignedLuckyNumber = queued.customNumber != null
          ? queued.customNumber
          : generateRandomNumber(settings.minNumber, settings.maxNumber);
      }
    } else {
      assignedRewardValue = generateRandomReward(category, settings);
      assignedLuckyNumber = generateRandomNumber(settings.minNumber, settings.maxNumber);
    }
  }

  // Step 3: Save Attempt permanently
  const attempt = {
    id:              generateId('a'),
    sessionId,
    category,
    assignedReward:  assignedRewardValue,
    assignedNumber:  assignedLuckyNumber,
    scratchStatus:   'pending',
    createdAt:       new Date().toISOString(),
  };

  if (isCloudActive()) {
    try {
      const newRef = firebaseDb.ref('attempts').push();
      attempt.firebaseKey = newRef.key;
      await newRef.set(attempt);
    } catch (e) {
      console.error('Firebase save attempt error:', e);
    }
  } else {
    const list = getAttempts();
    list.push(attempt);
    cachedAttempts = list;
    setLocal(KEYS.ATTEMPTS, list);
  }

  return attempt;
}

// ─── Reward & Number Generators ───────────────────────────────────────────────

function generateRandomReward(category, settings) {
  // Determine outcome type: Free Gift, Better Luck, or Random Discount
  const rand = Math.random() * 100;

  if (category === 'bigOffers') {
    if (rand < 8) return 'free';            // 8% chance of Free Gift
    if (rand < 25) return 'better_luck';     // 17% chance of Better Luck

    // Random percentage from 21% to 30% (e.g. 21%, 22%, 24%, 25%, 26%, 28%, 30%)
    const pct = Math.floor(Math.random() * 10) + 21;
    return `${pct}%`;
  } else {
    // Festive Offers (Tab 1)
    if (rand < 5) return 'free';            // 5% chance of Free Gift
    if (rand < 20) return 'better_luck';     // 15% chance of Better Luck

    // Random percentage from 10% to 20% (e.g. 10%, 11%, 12%, 13%, 14%, 15%, 16%, 17%, 18%, 19%, 20%)
    const pct = Math.floor(Math.random() * 11) + 10;
    return `${pct}%`;
  }
}

function generateRandomNumber(min, max) {
  min = Math.ceil(Number(min)  || 1);
  max = Math.floor(Number(max) || 100);
  if (min > max) [min, max] = [max, min];
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ─── Statistics ───────────────────────────────────────────────────────────────

function getStats() {
  const attempts = getAttempts();
  const scratched = attempts.filter(a => a.scratchStatus === 'scratched');
  const pending = getPendingQueue();

  return {
    totalAttempts:    attempts.length,
    totalScratched:   scratched.length,
    totalFree:        scratched.filter(a => a.assignedReward === 'free').length,
    totalBetterLuck:  scratched.filter(a => a.assignedReward === 'better_luck').length,
    totalDiscount:    scratched.filter(a => a.assignedReward && a.assignedReward.includes('%')).length,
    totalSmallDisc:   scratched.filter(a => {
      if (!a.assignedReward || !a.assignedReward.includes('%')) return false;
      const val = parseInt(a.assignedReward, 10);
      return val >= 10 && val <= 20;
    }).length,
    totalBigDisc:     scratched.filter(a => {
      if (!a.assignedReward || !a.assignedReward.includes('%')) return false;
      const val = parseInt(a.assignedReward, 10);
      return val > 20 && val <= 35;
    }).length,
    pendingQueue:     pending.length,
    recentActivity:   attempts.slice(-50).reverse(),
  };
}

async function clearAllAttempts() {
  if (isCloudActive()) {
    try {
      await firebaseDb.ref('attempts').remove();
    } catch (e) {
      console.error('Firebase clear attempts failed:', e);
    }
  } else {
    cachedAttempts = [];
    setLocal(KEYS.ATTEMPTS, []);
  }
}

// ─── Admin Authentication ─────────────────────────────────────────────────────

function getAdminUsers() {
  return cachedAdmins || getLocal(KEYS.ADMIN_USERS) || [DEFAULT_ADMIN];
}

async function validateAdmin(username, password) {
  const hash = btoa(password);
  if (username === DEFAULT_ADMIN.username && hash === DEFAULT_ADMIN.passwordHash) {
    return DEFAULT_ADMIN;
  }
  const users = getAdminUsers();
  const found = users.find(u => u.username === username && u.passwordHash === hash);
  return found || null;
}

async function updateAdminPassword(username, newPassword) {
  const hash = btoa(newPassword);
  const users = getAdminUsers();
  const user = users.find(u => u.username === username);
  if (user) {
    user.passwordHash = hash;
  }

  if (isCloudActive()) {
    try {
      await firebaseDb.ref('admin/admin_001').update({ passwordHash: hash });
    } catch (e) {
      console.error('Firebase update admin password error:', e);
    }
  } else {
    setLocal(KEYS.ADMIN_USERS, users);
  }
}

// ─── Session Helpers ──────────────────────────────────────────────────────────

function getSession() {
  try {
    const raw = sessionStorage.getItem(KEYS.SESSION);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function setSession(data) {
  sessionStorage.setItem(KEYS.SESSION, JSON.stringify(data));
}

function clearSession() {
  sessionStorage.removeItem(KEYS.SESSION);
}

function getUserSessionId() {
  let sid = localStorage.getItem('diwali_user_sid');
  if (!sid) {
    sid = generateId('usr');
    localStorage.setItem('diwali_user_sid', sid);
  }
  return sid;
}

function resetUserSessionId() {
  const sid = generateId('usr');
  localStorage.setItem('diwali_user_sid', sid);
  return sid;
}

// ─── LocalStorage Low-Level Helpers ───────────────────────────────────────────

function getLocal(k) {
  try {
    const r = localStorage.getItem(k);
    return r ? JSON.parse(r) : null;
  } catch (e) { return null; }
}

function setLocal(k, v) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch (e) {}
}

function generateId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// Boot up store on script evaluation
initStore();
