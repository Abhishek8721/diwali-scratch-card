/**
 * firebase-config.js – Firebase Configuration & Initialization
 * 
 * Paste your Firebase credentials below OR enter them inside the
 * Admin Dashboard -> Settings -> Firebase Cloud Sync!
 */

const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyAb5BqmmK8eA84iHiAsu3KysT_NWOv67Hc",
  authDomain: "diwali-scratch-win.firebaseapp.com",
  databaseURL: "https://diwali-scratch-win-default-rtdb.firebaseio.com",
  projectId: "diwali-scratch-win",
  storageBucket: "diwali-scratch-win.firebasestorage.app",
  messagingSenderId: "407200208157",
  appId: "1:407200208157:web:77f8890eb3097a7e797df4",
  measurementId: "G-RKXF8BBW7Q"
};

/**
 * Get active Firebase configuration (checks localStorage first, then default)
 */
function getActiveFirebaseConfig() {
  try {
    const saved = localStorage.getItem('diwali_firebase_config');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.apiKey && parsed.databaseURL) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Error reading saved firebase config:', e);
  }
  return DEFAULT_FIREBASE_CONFIG;
}

/**
 * Save Firebase configuration to localStorage
 */
function saveFirebaseConfig(config) {
  localStorage.setItem('diwali_firebase_config', JSON.stringify(config));
}

/**
 * Check if Firebase credentials are fully configured
 */
function isFirebaseConfigured(config) {
  const c = config || getActiveFirebaseConfig();
  return !!(c && c.apiKey && (c.databaseURL || c.projectId));
}

let firebaseApp = null;
let firebaseDb = null;

/**
 * Initialize Firebase if SDK is loaded and config exists
 */
function initFirebase() {
  if (typeof firebase === 'undefined') {
    console.warn('Firebase SDK not loaded.');
    return null;
  }

  const config = getActiveFirebaseConfig();
  if (!isFirebaseConfigured(config)) {
    console.info('Firebase config not set yet. Running in offline/localStorage mode.');
    return null;
  }

  try {
    if (!firebase.apps.length) {
      firebaseApp = firebase.initializeApp(config);
    } else {
      firebaseApp = firebase.app();
    }
    firebaseDb = firebase.database();
    if (config.measurementId && typeof firebase.analytics === 'function') {
      try { firebase.analytics(); } catch (e) {}
    }
    console.log('🔥 Firebase Realtime Database initialized successfully!');
    return firebaseDb;
  } catch (err) {
    console.error('Firebase initialization error:', err);
    return null;
  }
}

