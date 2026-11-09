# 🪔 Dhoom Dhaam Diwali – Scratch & Win

A premium, festive, responsive Diwali Scratch & Win promotional website with an interactive scratch card system, administrative queue controls, and **Firebase Realtime Database cloud synchronization** across multiple phones and devices.

---

## 📱 Multi-Phone Real-Time Sync (How It Works)

```
[Phone A: Admin Dashboard]                       [Phone B: Customer]
          │                                              │
          ▼                                              ▼
  Pushes Number #42                                 Scratches Card
          │                                              ▲
          ▼                                              │
   ┌────────────────────────────────────────────────────────┐
   │         🔥 GOOGLE FIREBASE REALTIME DATABASE           │
   │                                                        │
   │   /rewardQueue ─── Atomic Transaction ──► Assigned!    │
   │   /settings                                            │
   │   /attempts (Permanent Record & Anti-Tamper)           │
   └────────────────────────────────────────────────────────┘
```

1. **Admin on Phone A** logs into `admin.html` and pushes a lucky number (e.g. `#42`) or discount (e.g. `30% OFF`).
2. **Customer on Phone B** opens the website on mobile data/Wi-Fi and scratches.
3. Phone B receives that exact pushed reward via Firebase atomic transaction!
4. Admin on Phone A sees live statistics and activity update instantly without refreshing!

---

## 🔥 Quick 2-Minute Firebase Setup

You can connect Firebase without writing any backend code:

1. Go to [Firebase Console](https://console.firebase.google.com/) and click **Add project** (e.g. `diwali-scratch-win`).
2. In your new project, navigate to **Build** → **Realtime Database** → click **Create Database**.
   - Choose your location (e.g., `us-central1` or closest).
   - In Security Rules, select **Start in test mode** (allows read/write during testing).
3. Click the **Project Settings** (gear icon ⚙️) → under "Your apps", click the **Web icon (`</>`)**.
4. Register the app name and copy the `firebaseConfig` keys:
   ```javascript
   {
     apiKey: "AIzaSy...",
     authDomain: "your-app.firebaseapp.com",
     databaseURL: "https://your-app-default-rtdb.firebaseio.com",
     projectId: "your-app",
     storageBucket: "your-app.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abcdef"
   }
   ```
5. **Connect it via one of two simple ways:**
   - **Method A (No code):** Open `admin.html` → Go to **Settings** → Scroll to **🔥 Firebase Multi-Phone Cloud Sync** → Paste the keys and click **Save & Connect Firebase**!
   - **Method B:** Open `js/firebase-config.js` in a text editor and paste the keys into `DEFAULT_FIREBASE_CONFIG`.

*Note: If Firebase is not yet configured, the website automatically runs in offline `localStorage` mode so it always functions!*

---

## 📁 File Structure

```
diwali scratch card/
├── index.html              ← Main promotional website (customer facing)
├── admin.html              ← Admin login page
├── admin-dashboard.html    ← Admin control center & live statistics
├── package.json            ← Node.js package definition
├── server.js               ← Optional local Express server for testing
├── assets/
│   └── Dhoom Dhaam Diwali Fireworks Celebration.png
├── css/
│   ├── animations.css      ← Diya flicker, fireworks & shimmer keyframes
│   ├── main.css            ← Festive theme styles (purple, gold, red)
│   └── admin.css           ← Admin dashboard dark theme
└── js/
    ├── firebase-config.js  ← Firebase configuration & initialization
    ├── store.js            ← Hybrid Firebase Realtime DB + localStorage layer
    ├── scratch.js          ← Canvas scratch card engine (50% auto-reveal)
    ├── confetti.js         ← Confetti & celebration fireworks
    ├── app.js              ← Customer application logic
    └── admin.js            ← Admin panel controls & real-time listeners
```

---

## 🔑 Default Admin Credentials

- **URL:** `admin.html`
- **Username:** `Paa`
- **Password:** `Paa@8721`

*(Can be updated in Admin Dashboard → Settings → Change Admin Password)*

---

## 🎲 Reward Assignment Priority Logic

1. **Admin Queued Rewards (Highest Priority):**
   - If Admin pushed a specific number $\rightarrow$ next user receives that exact number + a category discount.
   - If Admin pushed a discount or FREE / Better Luck $\rightarrow$ assigned atomically via Firebase transaction so two users never get the same queued item.
2. **Automatic Random Generation:**
   - If no queued item exists, the system automatically assigns a random lucky number between `minNumber` and `maxNumber` (default: 1–100) and a category-validated random discount.
3. **Anti-Tamper & Persistence:**
   - Results are saved permanently in Firebase `/attempts`.
   - Reloading or re-scratching does not generate a new reward for the same attempt.

---

## 🚀 Running Locally or Deploying

### Option 1: Direct File / Static Hosting (Zero Server)
Just open `index.html` or upload all files to GitHub Pages, Netlify, or Vercel. With Firebase connected, all phones communicate through Firebase cloud!

### Option 2: Run with Node.js
```bash
npm start
```
Connect any phone on your local Wi-Fi to the displayed network IP.
