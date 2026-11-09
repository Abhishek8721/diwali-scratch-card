/**
 * app.js – Main application logic for homepage
 */

// ─── State ────────────────────────────────────────────────────────────────────

let currentCategory = 'offers';
let scratchCard     = null;
let currentAttempt  = null;
let scratchComplete = false;

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  checkTabAvailability();
  setupTabSwitcher();
  setupScratchNowButton();
  loadExistingAttempt();
  startParticleAnimation();
  initDiyaLights();

  // Listen for real-time Firebase settings changes
  window.addEventListener('diwali:settings-updated', () => {
    checkTabAvailability();
  });
});

function checkTabAvailability() {
  const settings = getSettings();
  const offersTab    = document.getElementById('tab-offers');
  const bigOfferTab  = document.getElementById('tab-bigoffers');

  if (offersTab) {
    offersTab.style.display = settings.offersTabEnabled ? '' : 'none';
    if (!settings.offersTabEnabled && currentCategory === 'offers') {
      currentCategory = 'bigOffers';
      bigOfferTab && bigOfferTab.click();
    }
  }
  if (bigOfferTab) {
    bigOfferTab.style.display = settings.bigOffersTabEnabled ? '' : 'none';
    if (!settings.bigOffersTabEnabled && currentCategory === 'bigOffers') {
      currentCategory = 'offers';
      offersTab && offersTab.click();
    }
  }
}

function setupTabSwitcher() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      currentCategory = btn.dataset.tab;

      const pane = document.getElementById(`pane-${btn.dataset.tab}`);
      if (pane) pane.classList.add('active');

      // Reset scratch if switching tabs without having scratched
      if (!scratchComplete && scratchCard) {
        resetScratchArea();
      }
    });
  });
}

function setupScratchNowButton() {
  document.querySelectorAll('.scratch-now-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      smoothScrollTo('scratch-section');
      setTimeout(() => activateScratchCard(), 500);
    });
  });
}

async function loadExistingAttempt() {
  const sid = getUserSessionId();
  const attempt = await getAttemptBySession(sid);

  if (!attempt) return;

  currentAttempt  = attempt;
  currentCategory = attempt.category;

  // Sync the tab UI
  document.querySelectorAll('.tab-btn').forEach(b => {
    const isActive = b.dataset.tab === attempt.category;
    b.classList.toggle('active', isActive);
    b.setAttribute('aria-selected', String(isActive));
  });
  document.querySelectorAll('.tab-pane').forEach(p => {
    p.classList.toggle('active', p.id === `pane-${attempt.category}`);
  });

  if (attempt.scratchStatus === 'scratched') {
    // Already scratched – restore result view immediately
    scratchComplete = true;
    renderScratchCardUI(attempt.category, true);
    setTimeout(() => {
      revealResult(attempt, true);
      showResultMessage(attempt.assignedReward, attempt.assignedNumber, attempt.category);
    }, 300);
  } else {
    // Assigned but not scratched yet – restore scratch card ready to use
    renderScratchCardUI(attempt.category, false);
    setTimeout(() => initScratchCanvas(attempt.category), 100);
  }
}

// ─── Scratch Card Activation ──────────────────────────────────────────────────

async function activateScratchCard() {
  if (scratchCard && !scratchComplete) return; // already active

  const category = currentCategory;
  const settings = getSettings();

  if (category === 'bigOffers' && !settings.bigOffersTabEnabled) {
    showToast('Big Offers tab is currently disabled.', 'error');
    return;
  }
  if (category === 'offers' && !settings.offersTabEnabled) {
    showToast('Offers tab is currently disabled.', 'error');
    return;
  }

  if (scratchComplete) {
    showToast('You have already scratched your card!', 'info');
    return;
  }

  // Render card UI in preparing state
  renderScratchCardUI(category, false);

  // Assign reward atomically via Firebase / store
  const sid = getUserSessionId();
  currentAttempt = await assignReward(sid, category);

  initScratchCanvas(category);
}

function renderScratchCardUI(category, alreadyScratched) {
  const section = document.getElementById('scratch-section');
  if (!section) return;

  section.style.display = 'block';
  section.classList.add('fade-in');

  const container = document.getElementById('scratch-card-container');
  if (!container) return;
  container.innerHTML = '';

  // Build card
  container.innerHTML = buildCardHTML(category, alreadyScratched);
}

function buildCardHTML(category, alreadyScratched) {
  const isBig = category === 'bigOffers';
  const title = isBig ? '✦ MEGA DIWALI OFFER ✦' : '✦ FESTIVE OFFER ✦';
  const subtitle = isBig ? 'Scratch & Win BIG!' : 'Scratch to Reveal';
  const borderClass = isBig ? 'card-big' : 'card-normal';

  return `
    <div class="scratch-card-wrap ${borderClass}" id="scratch-wrap">
      <div class="card-header-row">
        <span class="card-title-badge">${title}</span>
        <span class="diya-icon">🪔</span>
      </div>
      <div class="scratch-card-body" id="scratch-body">
        <!-- Reward revealed beneath -->
        <div class="reward-reveal" id="reward-reveal">
          <div class="reward-loading">
            <div class="spinner"></div>
            <p>Your reward is hiding here…</p>
          </div>
        </div>
        <!-- Canvas overlay sits on top -->
      </div>
      <div class="card-footer-row">
        <span>🎉 ${subtitle}</span>
        <span class="scratch-hint" id="scratch-hint">Use finger or mouse to scratch</span>
      </div>
      <div class="scratch-progress-bar-wrap">
        <div class="scratch-progress-bar" id="scratch-progress"></div>
      </div>
    </div>
  `;
}

function initScratchCanvas(category) {
  const body = document.getElementById('scratch-body');
  if (!body) return;

  const isBig = category === 'bigOffers';

  // Use actual rendered dimensions
  const rect = body.getBoundingClientRect();
  const w = rect.width  || 340;
  const h = rect.height || 220;

  scratchCard = new ScratchCard(body, {
    width:        w,
    height:       h,
    coverType:    isBig ? 'gold' : 'silver',
    scratchRadius: Math.max(22, Math.min(35, w * 0.08)),
    threshold:    0.50,
    onProgress:   (ratio) => updateProgressBar(ratio),
    onComplete:   (ratio) => onScratchComplete(ratio),
  });
}

function updateProgressBar(ratio) {
  const bar = document.getElementById('scratch-progress');
  if (bar) bar.style.width = `${Math.min(ratio * 100, 100)}%`;

  const hint = document.getElementById('scratch-hint');
  if (hint) {
    const pct = Math.round(ratio * 100);
    if (pct < 20)       hint.textContent = 'Keep scratching…';
    else if (pct < 50)  hint.textContent = `${pct}% scratched – almost there!`;
    else                hint.textContent = 'Revealing…';
  }
}

async function onScratchComplete(ratio) {
  scratchComplete = true;

  // Mark attempt as scratched in store / Firebase
  if (currentAttempt) {
    await updateAttemptStatus(currentAttempt.id, 'scratched');
  }

  setTimeout(() => revealResult(currentAttempt, false), 600);
}

// ─── Result Reveal ────────────────────────────────────────────────────────────

function revealResult(attempt, instant) {
  const revealDiv = document.getElementById('reward-reveal');
  if (!revealDiv) return;

  const reward = attempt.assignedReward;
  const number = attempt.assignedNumber;

  let html = '';
  let isWin = true;

  if (reward === 'free') {
    html = buildFreeHTML(number);
  } else if (reward === 'better_luck') {
    html = buildBetterLuckHTML(number);
    isWin = false;
  } else if (reward && reward.includes('%')) {
    html = buildDiscountHTML(reward, number, attempt.category);
  } else {
    html = buildBetterLuckHTML(number);
    isWin = false;
  }

  revealDiv.innerHTML = html;
  if (!instant) revealDiv.classList.add('reveal-animation');

  if (isWin && !instant) {
    setTimeout(() => launchCelebration(5000), 400);
  }

  // Show result section below
  setTimeout(() => showResultMessage(reward, number, attempt.category), instant ? 100 : 1000);
}

function buildDiscountHTML(reward, number, category) {
  const coupon = generateCouponCode(reward, number);
  return `
    <div class="reward-content discount-reward">
      <div class="reward-stars">★ ★ ★</div>
      <div class="reward-badge">${reward}<span class="off-text">OFF</span></div>
      <div class="reward-number">Lucky No: <strong>#${number}</strong></div>
      <div class="coupon-row">
        <span class="coupon-code" id="coupon-code">${coupon}</span>
        <button class="copy-btn" onclick="copyCoupon('${coupon}')">📋 Copy</button>
      </div>
      <div class="reward-stars">🪔 🎉 🪔</div>
    </div>
  `;
}

function buildFreeHTML(number) {
  const coupon = `FREE${number}DIWALI`;
  return `
    <div class="reward-content free-reward">
      <div class="reward-stars">🎊 🎊 🎊</div>
      <div class="reward-badge free-badge">FREE<span class="off-text" style="font-size:1rem">GIFT!</span></div>
      <div class="reward-number">Lucky No: <strong>#${number}</strong></div>
      <div class="reward-msg">🎁 Congratulations! You Won a FREE Gift!</div>
      <div class="coupon-row">
        <span class="coupon-code" id="coupon-code">${coupon}</span>
        <button class="copy-btn" onclick="copyCoupon('${coupon}')">📋 Copy</button>
      </div>
    </div>
  `;
}

function buildBetterLuckHTML(number) {
  return `
    <div class="reward-content luck-reward">
      <div class="reward-stars">🪔 🪔 🪔</div>
      <div class="reward-badge luck-badge">OOPS!</div>
      <div class="reward-number">Lucky No: <strong>#${number}</strong></div>
      <div class="reward-msg">Better Luck Next Time!<br><small>Keep Celebrating Diwali! 🎆</small></div>
      <div style="margin-top:10px;">
        <button class="try-again-btn-inline" onclick="tryAgain()">🔄 Try Again</button>
      </div>
    </div>
  `;
}

function showResultMessage(reward, number, category) {
  const msgSection = document.getElementById('result-message-section');
  if (!msgSection) return;

  msgSection.style.display = 'block';
  msgSection.classList.add('fade-in');

  let html = '';
  if (reward === 'free') {
    html = `
      <div class="result-msg-box win-box">
        <h2>🎊 Congratulations! 🎊</h2>
        <p>You Won a <strong>FREE Gift!</strong> Show this screen to redeem your prize.</p>
        <div style="margin-top:16px;">
          <button class="try-again-btn" onclick="tryAgain()">🔄 Scratch Another Card</button>
          <button class="share-btn" onclick="shareResult('free', '${number}')">📤 Share</button>
        </div>
        <p class="thank-you">Thank You for Celebrating Diwali With Us! 🪔</p>
      </div>
    `;
  } else if (reward === 'better_luck') {
    html = `
      <div class="result-msg-box luck-box">
        <h2>🪔 Keep Celebrating! 🪔</h2>
        <p>Better Luck Next Time! Don't worry, your next festive surprise is one scratch away!</p>
        <div style="margin-top:18px;">
          <button class="try-again-btn try-again-pulse" onclick="tryAgain()">🔄 Try Again Now!</button>
        </div>
        <p class="thank-you">Thank You for Celebrating Diwali With Us! 🎆</p>
      </div>
    `;
  } else {
    const coupon = generateCouponCode(reward, number);
    html = `
      <div class="result-msg-box win-box">
        <h2>🎉 You Won ${reward} OFF! 🎉</h2>
        <p>Use coupon code <strong>${coupon}</strong> at checkout.</p>
        <div style="margin-top:16px;">
          <button class="copy-btn-lg" onclick="copyCoupon('${coupon}')">📋 Copy Coupon Code</button>
          <button class="try-again-btn" onclick="tryAgain()">🔄 Scratch Another Card</button>
          <button class="share-btn" onclick="shareResult('${reward}', '${number}')">📤 Share</button>
        </div>
        <p class="thank-you">Thank You for Celebrating Diwali With Us! 🪔</p>
      </div>
    `;
  }
  msgSection.innerHTML = html;
}

// ─── Try Again Action ─────────────────────────────────────────────────────────

async function tryAgain() {
  // 1. Generate new session ID for a fresh attempt
  if (typeof resetUserSessionId === 'function') {
    resetUserSessionId();
  }

  // 2. Reset local scratch state
  scratchComplete = false;
  currentAttempt = null;
  if (scratchCard) {
    scratchCard.destroy();
    scratchCard = null;
  }

  // 3. Hide previous result message box
  const msgSection = document.getElementById('result-message-section');
  if (msgSection) {
    msgSection.style.display = 'none';
    msgSection.innerHTML = '';
  }

  // 4. Scroll smoothly to scratch card section
  smoothScrollTo('scratch-section');

  // 5. Activate a fresh scratch card!
  await activateScratchCard();
  showToast('New card ready to scratch! 🪔 Best of luck!', 'info');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateCouponCode(reward, number) {
  const r = reward.replace('%', '').replace(' ', '');
  return `DIWALI${r}OFF${number}`;
}

function copyCoupon(code) {
  navigator.clipboard.writeText(code).then(() => {
    showToast(`Coupon ${code} copied!`, 'success');
  }).catch(() => {
    // Fallback
    const el = document.createElement('textarea');
    el.value = code;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    showToast(`Coupon ${code} copied!`, 'success');
  });
}

function shareResult(reward, number) {
  const text = reward === 'free'
    ? `I won a FREE Gift in the Dhoom Dhaam Diwali Scratch & Win! 🎁🪔`
    : `I won ${reward} OFF in the Dhoom Dhaam Diwali Scratch & Win! 🎉🪔 Use code DIWALI${reward.replace('%','')}OFF${number}`;

  if (navigator.share) {
    navigator.share({ title: 'Diwali Scratch & Win', text });
  } else {
    copyCoupon(text);
  }
}

function resetScratchArea() {
  if (scratchCard) {
    scratchCard.destroy();
    scratchCard = null;
  }
  currentAttempt  = null;
  scratchComplete = false;
}

function smoothScrollTo(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function showToast(message, type = 'info') {
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

// ─── Background Particles ─────────────────────────────────────────────────────

function startParticleAnimation() {
  const container = document.getElementById('particles-bg');
  if (!container) return;

  const particles = ['✦','★','🌟','✨','🎆','🎇','🪔','🌸'];

  setInterval(() => {
    const p = document.createElement('span');
    p.className  = 'bg-particle';
    p.textContent = particles[Math.floor(Math.random() * particles.length)];
    p.style.left    = `${Math.random() * 100}%`;
    p.style.fontSize = `${Math.random() * 20 + 10}px`;
    p.style.animationDuration = `${Math.random() * 6 + 4}s`;
    p.style.opacity = Math.random() * 0.5 + 0.1;
    container.appendChild(p);
    setTimeout(() => p.remove(), 10000);
  }, 600);
}

function initDiyaLights() {
  const rows = document.querySelectorAll('.diya-lights-row');
  rows.forEach(row => {
    row.querySelectorAll('.light-bulb').forEach((bulb, i) => {
      bulb.style.animationDelay = `${i * 0.15}s`;
    });
  });
}
