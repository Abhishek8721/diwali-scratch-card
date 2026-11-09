/**
 * server.js – Diwali Scratch & Win Central Backend Server
 * Enables real-time synchronization across multiple phones, tablets & desktops.
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'data', 'db.json');

// Ensure data directory exists
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
}

// ─── Initial Database Template ──────────────────────────────────────────────
const INITIAL_DB = {
  admin: [
    {
      id: 'admin_001',
      username: 'Paa',
      passwordHash: Buffer.from('Paa@8721').toString('base64'),
      role: 'superadmin',
    },
  ],
  settings: {
    offersTabEnabled: true,
    bigOffersTabEnabled: true,
    minNumber: 1,
    maxNumber: 100,
    offerWeights: {
      '10%': 30,
      '15%': 25,
      '20%': 20,
      '25%': 35,
      '30%': 25,
      'free': 5,
      'better_luck': 20,
    },
  },
  rewardQueue: [],
  attempts: [],
};

// ─── Database File Helpers ──────────────────────────────────────────────────
function readDb() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      writeDb(INITIAL_DB);
      return INITIAL_DB;
    }
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading db.json, returning initial:', err);
    return INITIAL_DB;
  }
}

function writeDb(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing to db.json:', err);
  }
}

function generateId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function generateRandomNumber(min, max) {
  min = Math.ceil(Number(min) || 1);
  max = Math.floor(Number(max) || 100);
  if (min > max) [min, max] = [max, min];
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateRandomReward(category) {
  const rand = Math.random() * 100;
  if (category === 'bigOffers') {
    if (rand < 8) return 'free';
    if (rand < 25) return 'better_luck';
    const pct = Math.floor(Math.random() * 10) + 21; // 21% to 30%
    return `${pct}%`;
  } else {
    if (rand < 5) return 'free';
    if (rand < 20) return 'better_luck';
    const pct = Math.floor(Math.random() * 11) + 10; // 10% to 20%
    return `${pct}%`;
  }
}

// ─── Middleware ─────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // Serves index.html, admin.html, assets, css, js

// ─── API Routes ─────────────────────────────────────────────────────────────

// 1. Admin Login
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const db = readDb();
  const hash = Buffer.from(password || '').toString('base64');
  const user = db.admin.find(u => u.username === username && u.passwordHash === hash);
  if (user) {
    res.json({
      success: true,
      admin: { id: user.id, username: user.username, role: user.role },
      token: `token_${user.id}_${Date.now()}`,
    });
  } else {
    res.status(401).json({ success: false, message: 'Invalid admin credentials' });
  }
});

// 2. Change Admin Password
app.post('/api/admin/change-password', (req, res) => {
  const { username, newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
  }
  const db = readDb();
  const user = db.admin.find(u => u.username === username);
  if (user) {
    user.passwordHash = Buffer.from(newPassword).toString('base64');
    writeDb(db);
    res.json({ success: true, message: 'Password updated successfully' });
  } else {
    res.status(404).json({ success: false, message: 'Admin not found' });
  }
});

// 3. Settings
app.get('/api/settings', (req, res) => {
  const db = readDb();
  res.json({ success: true, settings: db.settings });
});

app.post('/api/settings', (req, res) => {
  const db = readDb();
  db.settings = { ...db.settings, ...req.body };
  writeDb(db);
  res.json({ success: true, settings: db.settings });
});

// 4. Reward Queue: List pending
app.get('/api/queue', (req, res) => {
  const db = readDb();
  const pending = (db.rewardQueue || []).filter(item => item.status === 'pending');
  res.json({ success: true, queue: pending });
});

// 5. Reward Queue: Push reward/number from Admin
app.post('/api/queue/push', (req, res) => {
  const { rewardType, rewardValue, customNumber, targetCategory } = req.body;
  const db = readDb();
  const entry = {
    id: generateId('q'),
    rewardType: rewardType || 'discount',
    rewardValue: rewardValue || '10%',
    customNumber: customNumber != null ? Number(customNumber) : null,
    targetCategory: targetCategory || 'any',
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  db.rewardQueue.push(entry);
  writeDb(db);
  res.json({ success: true, item: entry });
});

// 6. Reward Queue: Remove single or all
app.delete('/api/queue/:id', (req, res) => {
  const { id } = req.params;
  const db = readDb();
  db.rewardQueue = (db.rewardQueue || []).filter(item => item.id !== id);
  writeDb(db);
  res.json({ success: true });
});

app.delete('/api/queue', (req, res) => {
  const db = readDb();
  db.rewardQueue = [];
  writeDb(db);
  res.json({ success: true });
});

// 7. Atomic Reward Assignment (Called when user clicks Scratch)
app.post('/api/reward/assign', (req, res) => {
  const { sessionId, category } = req.body;
  if (!sessionId || !category) {
    return res.status(400).json({ success: false, message: 'Missing sessionId or category' });
  }

  const db = readDb();

  // Check if session already has an assigned attempt (prevent repeat scratching)
  const existing = (db.attempts || []).find(a => a.sessionId === sessionId);
  if (existing) {
    return res.json({ success: true, attempt: existing, isExisting: true });
  }

  const settings = db.settings || INITIAL_DB.settings;
  let reward = null;
  let number = null;

  // Find next pending queued reward matching category
  const qIndex = (db.rewardQueue || []).findIndex(
    item => item.status === 'pending' &&
            (item.targetCategory === 'any' || item.targetCategory === category)
  );

  if (qIndex !== -1) {
    const queued = db.rewardQueue[qIndex];
    queued.status = 'assigned'; // Mark used atomically
    queued.assignedToSession = sessionId;
    queued.assignedAt = new Date().toISOString();

    if (queued.rewardType === 'number') {
      number = queued.customNumber;
      reward = generateRandomReward(category);
    } else {
      reward = queued.rewardValue;
      number = queued.customNumber != null
        ? queued.customNumber
        : generateRandomNumber(settings.minNumber, settings.maxNumber);
    }
  } else {
    // No admin queued reward -> Generate random reward and random number
    reward = generateRandomReward(category);
    number = generateRandomNumber(settings.minNumber, settings.maxNumber);
  }

  const attempt = {
    id: generateId('a'),
    sessionId,
    category,
    assignedReward: reward,
    assignedNumber: number,
    scratchStatus: 'pending',
    createdAt: new Date().toISOString(),
  };

  db.attempts.push(attempt);
  writeDb(db);

  res.json({ success: true, attempt, isExisting: false });
});

// 8. Get Attempt for Session (restore state on refresh)
app.get('/api/attempt/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const db = readDb();
  const attempt = (db.attempts || []).find(a => a.sessionId === sessionId);
  res.json({ success: true, attempt: attempt || null });
});

// 9. Update Scratch Status to 'scratched'
app.post('/api/attempt/:id/scratched', (req, res) => {
  const { id } = req.params;
  const db = readDb();
  const attempt = (db.attempts || []).find(a => a.id === id);
  if (attempt) {
    attempt.scratchStatus = 'scratched';
    attempt.scratchedAt = new Date().toISOString();
    writeDb(db);
    res.json({ success: true, attempt });
  } else {
    res.status(404).json({ success: false, message: 'Attempt not found' });
  }
});

// 10. Admin Statistics & Activity
app.get('/api/stats', (req, res) => {
  const db = readDb();
  const attempts = db.attempts || [];
  const scratched = attempts.filter(a => a.scratchStatus === 'scratched');
  const pendingQueue = (db.rewardQueue || []).filter(i => i.status === 'pending');

  const stats = {
    totalAttempts: attempts.length,
    totalScratched: scratched.length,
    totalFree: scratched.filter(a => a.assignedReward === 'free').length,
    totalBetterLuck: scratched.filter(a => a.assignedReward === 'better_luck').length,
    totalDiscount: scratched.filter(a => a.assignedReward && a.assignedReward.includes('%')).length,
    totalSmallDisc: scratched.filter(a => ['10%', '15%', '20%'].includes(a.assignedReward)).length,
    totalBigDisc: scratched.filter(a => ['25%', '30%'].includes(a.assignedReward)).length,
    pendingQueue: pendingQueue.length,
    recentActivity: attempts.slice(-50).reverse(),
  };

  res.json({ success: true, stats });
});

// 11. Clear all attempts data
app.post('/api/admin/clear-data', (req, res) => {
  const db = readDb();
  db.attempts = [];
  writeDb(db);
  res.json({ success: true });
});

// ─── Find Local Network IP ──────────────────────────────────────────────────
function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

// ─── Start Server ───────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  const localIp = getLocalIp();
  console.log(`
══════════════════════════════════════════════════════════════════════════════
  🪔  DHOOM DHAAM DIWALI SCRATCH & WIN SERVER IS RUNNING!  🪔
══════════════════════════════════════════════════════════════════════════════

  💻  On this computer:
      Website:         http://localhost:${PORT}
      Admin Dashboard: http://localhost:${PORT}/admin.html

  📱  On ANY PHONE connected to the same Wi-Fi:
      Website:         http://${localIp}:${PORT}
      Admin Dashboard: http://${localIp}:${PORT}/admin.html

  ✨  How Multi-Phone Live Sync Works:
      1. Open the Admin link on Phone A (Login: Paa / Paa@8721)
      2. Push a Lucky Number or Discount Offer from Phone A
      3. Open the Website on Phone B and scratch!
      4. Phone B will instantly receive the exact number pushed by Phone A!
══════════════════════════════════════════════════════════════════════════════
  `);
});
