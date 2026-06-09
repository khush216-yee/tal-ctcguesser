/* ═══════════════════════════════════════════
   TAL — GUESS THE CTC
   game.js
═══════════════════════════════════════════ */

// ─── State ───────────────────────────────
const STATE = {
  config: null,
  allOffers: [],
  sessionOffers: [],        // 5 picked for this game
  currentOfferIndex: 0,     // 0–4
  currentCardIndex: 0,      // which flashcard within the offer
  sliderValue: 20,
  totalScore: 0,
  roundResults: [],         // { offerLabel, guess, actual, points, tierLabel, tierColor }
  phase: 'idle'             // idle | guessing | revealing | results
};

// ─── DOM refs ────────────────────────────
const $ = id => document.getElementById(id);
const screens = {
  splash:  $('screen-splash'),
  game:    $('screen-game'),
  reveal:  $('screen-reveal'),
  results: $('screen-results')
};

// ─── Boot ────────────────────────────────
async function boot() {
  const [configRes, offersRes] = await Promise.all([
    fetch('config/game.json'),
    fetch('offers/offers.json')
  ]);
  STATE.config  = await configRes.json();
  STATE.allOffers = await offersRes.json();

  $('btn-start').addEventListener('click', startGame);
  $('btn-prev').addEventListener('click', () => navigateCard(-1));
  $('btn-next').addEventListener('click', () => navigateCard(1));
  $('ctc-slider').addEventListener('input', onSliderInput);
  $('btn-lock').addEventListener('click', lockGuess);
  $('btn-next-offer').addEventListener('click', nextOffer);
  $('btn-play-again').addEventListener('click', startGame);

  showScreen('splash');
}

// ─── Screen management ───────────────────
function showScreen(name) {
  Object.entries(screens).forEach(([k, el]) => {
    el.classList.toggle('active', k === name);
  });
}

// ─── Game start ──────────────────────────
function startGame() {
  // Pick 5 random offers without replacement
  const shuffled = [...STATE.allOffers].sort(() => Math.random() - 0.5);
  STATE.sessionOffers = shuffled.slice(0, STATE.config.session.offersPerGame);
  STATE.currentOfferIndex = 0;
  STATE.currentCardIndex  = 0;
  STATE.totalScore = 0;
  STATE.roundResults = [];

  buildProgressDots();
  loadOffer(0);
  showScreen('game');
}

// ─── Progress dots ───────────────────────
function buildProgressDots() {
  const container = $('progress-dots');
  container.innerHTML = '';
  STATE.sessionOffers.forEach((_, i) => {
    const dot = document.createElement('div');
    dot.className = 'progress-dot';
    dot.id = `pdot-${i}`;
    container.appendChild(dot);
  });
  updateProgressDots();
}

function updateProgressDots() {
  STATE.sessionOffers.forEach((_, i) => {
    const dot = $(`pdot-${i}`);
    if (!dot) return;
    dot.className = 'progress-dot';
    if (i < STATE.currentOfferIndex) dot.classList.add('done');
    else if (i === STATE.currentOfferIndex) dot.classList.add('active');
  });
}

// ─── Load an offer ───────────────────────
function loadOffer(index) {
  STATE.currentOfferIndex = index;
  STATE.currentCardIndex  = 0;

  const offer = STATE.sessionOffers[index];

  // Update header
  $('offer-counter').textContent = `${index + 1} / ${STATE.config.session.offersPerGame}`;
  $('live-score').textContent    = STATE.totalScore.toLocaleString();

  updateProgressDots();

  // Reset slider
  const defaultVal = STATE.config.slider.defaultValue;
  STATE.sliderValue = defaultVal;
  const slider = $('ctc-slider');
  slider.min   = STATE.config.slider.min;
  slider.max   = STATE.config.slider.max;
  slider.step  = STATE.config.slider.step;
  slider.value = defaultVal;
  updateSliderDisplay(defaultVal);
  updateSliderTrack(slider);

  // Build cards
  buildCards(offer);
  buildCardPips(offer.cards.length);
  showCard(0, 'none');

  $('btn-lock').disabled = false;
  STATE.phase = 'guessing';
}

// ─── Build flashcards ────────────────────
function buildCards(offer) {
  const stack = $('card-stack');
  stack.innerHTML = '';

  offer.cards.forEach((card, i) => {
    const el = document.createElement('div');
    el.className = 'offer-card';
    el.id = `card-${i}`;

    // Hint copy varies by card
    const hints = [
      'Swipe → for more details',
      '← back  ·  → continue',
      '← back  ·  → continue',
      'That\'s all the info — make your guess below'
    ];
    const isLast = i === offer.cards.length - 1;

    el.innerHTML = `
      <div class="card-label">${escHtml(card.label)}</div>
      <div class="card-value">${escHtml(card.value)}</div>
      <div class="card-footer">
        <span class="card-hint">${isLast ? 'Make your guess below ↓' : 'Swipe for more details →'}</span>
        <span class="card-index-label">${i + 1} / ${offer.cards.length}</span>
      </div>
    `;
    stack.appendChild(el);
  });
}

// ─── Card pip indicators ─────────────────
function buildCardPips(count) {
  const container = $('card-pips');
  container.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const pip = document.createElement('div');
    pip.className = 'card-pip';
    pip.addEventListener('click', () => navigateToCard(i));
    container.appendChild(pip);
  }
  updateCardPips();
}

function updateCardPips() {
  const pips = $('card-pips').querySelectorAll('.card-pip');
  pips.forEach((pip, i) => {
    pip.className = 'card-pip';
    if (i < STATE.currentCardIndex) pip.classList.add('visited');
    if (i === STATE.currentCardIndex) pip.classList.add('active');
  });
}

// ─── Card navigation ─────────────────────
function navigateCard(direction) {
  const offer      = STATE.sessionOffers[STATE.currentOfferIndex];
  const totalCards = offer.cards.length;
  const nextIndex  = STATE.currentCardIndex + direction;

  if (nextIndex < 0 || nextIndex >= totalCards) return;

  const dir = direction > 0 ? 'left' : 'right';
  showCard(nextIndex, dir);
}

function navigateToCard(index) {
  if (index === STATE.currentCardIndex) return;
  const dir = index > STATE.currentCardIndex ? 'left' : 'right';
  showCard(index, dir);
}

function showCard(index, exitDirection) {
  const offer      = STATE.sessionOffers[STATE.currentOfferIndex];
  const totalCards = offer.cards.length;

  // Exit current card
  if (exitDirection !== 'none') {
    const currentEl = $(`card-${STATE.currentCardIndex}`);
    if (currentEl) {
      currentEl.classList.remove('card-active');
      currentEl.classList.add(exitDirection === 'left' ? 'card-exit-left' : 'card-exit-right');
      setTimeout(() => currentEl.classList.remove('card-exit-left', 'card-exit-right'), 350);
    }
  } else {
    // Just hide all
    for (let i = 0; i < totalCards; i++) {
      const el = $(`card-${i}`);
      if (el) el.classList.remove('card-active', 'card-exit-left', 'card-exit-right');
    }
  }

  STATE.currentCardIndex = index;

  // Show new card
  const newEl = $(`card-${index}`);
  if (newEl) {
    // Force reflow for animation
    void newEl.offsetWidth;
    newEl.classList.add('card-active');
  }

  // Nav button states
  $('btn-prev').disabled = index === 0;
  $('btn-next').disabled = index === totalCards - 1;

  updateCardPips();
}

// ─── Slider ──────────────────────────────
function onSliderInput(e) {
  const val = parseFloat(e.target.value);
  STATE.sliderValue = val;
  updateSliderDisplay(val);
  updateSliderTrack(e.target);
}

function updateSliderDisplay(val) {
  // Show decimals only when below 10
  const display = val < 10 ? val.toFixed(1) : Math.round(val).toString();
  $('slider-display').textContent = display;
}

function updateSliderTrack(input) {
  const min = parseFloat(input.min);
  const max = parseFloat(input.max);
  const val = parseFloat(input.value);
  const pct = ((val - min) / (max - min)) * 100;
  input.style.background = `linear-gradient(to right, var(--amber) ${pct}%, #1E3349 ${pct}%)`;
}

// ─── Lock in guess ───────────────────────
function lockGuess() {
  if (STATE.phase !== 'guessing') return;
  STATE.phase = 'revealing';

  $('btn-lock').disabled = true;

  const offer  = STATE.sessionOffers[STATE.currentOfferIndex];
  const guess  = STATE.sliderValue;
  const actual = offer.actualCTC;

  const { points, tier } = calculateScore(guess, actual);

  STATE.totalScore += points;
  STATE.roundResults.push({
    offerLabel: offer.cards[0].value,  // Role name
    guess,
    actual,
    points,
    tierLabel: tier.label,
    tierColor: tier.color
  });

  showReveal(guess, actual, points, tier, offer);
}

// ─── Scoring ─────────────────────────────
function calculateScore(guess, actual) {
  const pctDiff = Math.abs(guess - actual) / actual * 100;
  const tiers   = STATE.config.scoring.tiers;

  let matchedTier = tiers[tiers.length - 1];
  for (const tier of tiers) {
    if (pctDiff <= tier.withinPercent) {
      matchedTier = tier;
      break;
    }
  }

  return { points: matchedTier.points, tier: matchedTier };
}

// ─── Reveal screen ───────────────────────
function showReveal(guess, actual, points, tier, offer) {
  const label     = $('reveal-tier-label');
  const guessEl   = $('reveal-guess');
  const actualEl  = $('reveal-actual');
  const pointsEl  = $('reveal-points');
  const insightEl = $('reveal-insight');
  const nextBtn   = $('btn-next-offer');

  label.textContent   = tier.label;
  label.style.background = tier.color;

  guessEl.textContent  = formatCTC(guess);
  actualEl.textContent = formatCTC(actual);
  pointsEl.textContent = `+${points.toLocaleString()} pts`;
  pointsEl.style.color  = tier.color;

  insightEl.textContent = buildInsight(guess, actual, offer);

  // Last offer?
  const isLast = STATE.currentOfferIndex >= STATE.config.session.offersPerGame - 1;
  nextBtn.textContent = isLast ? 'See my results →' : 'Next offer →';

  // Pop-in animations
  [label, guessEl, actualEl, pointsEl].forEach((el, i) => {
    el.classList.remove('pop-in');
    void el.offsetWidth;
    setTimeout(() => el.classList.add('pop-in'), i * 80);
  });

  showScreen('reveal');
}

function formatCTC(val) {
  if (val >= 100) return '₹1Cr';
  const rounded = val < 10 ? val.toFixed(1) : Math.round(val);
  return `₹${rounded}L`;
}

function buildInsight(guess, actual, offer) {
  const diff    = guess - actual;
  const absDiff = Math.abs(diff);
  const pct     = Math.round(absDiff / actual * 100);
  const role    = offer.cards[0].value;

  if (pct <= 5) return `Nailed it. You know exactly what a ${role} earns.`;
  if (diff > 0) {
    if (pct <= 20) return `You overestimated by ₹${absDiff.toFixed(1)}L. The market for this role is slightly softer than you thought.`;
    return `You overshot by ${pct}%. For a ${role}, the market isn't quite there yet.`;
  } else {
    if (pct <= 20) return `You underestimated by ₹${absDiff.toFixed(1)}L. This profile commands more than most people assume.`;
    return `You underestimated by ${pct}%. Good talent in this space gets paid more than the market realises.`;
  }
}

// ─── Next offer / finish ─────────────────
function nextOffer() {
  const isLast = STATE.currentOfferIndex >= STATE.config.session.offersPerGame - 1;

  if (isLast) {
    showResults();
  } else {
    showScreen('game');
    loadOffer(STATE.currentOfferIndex + 1);
  }
}

// ─── Results screen ──────────────────────
function showResults() {
  const total = STATE.totalScore;
  const max   = STATE.config.session.offersPerGame * STATE.config.scoring.maxPointsPerOffer;

  $('results-score-big').textContent = total.toLocaleString();
  $('results-title').textContent     = getResultTitle(total, max);

  buildBreakdown();

  showScreen('results');
}

function getResultTitle(total, max) {
  const pct = total / max;
  if (pct >= 0.9) return 'You read the market like a pro.';
  if (pct >= 0.7) return 'Solid market instincts.';
  if (pct >= 0.5) return 'You\'re closer than most.';
  if (pct >= 0.3) return 'The market surprised you.';
  return 'The market is full of surprises.';
}

function buildBreakdown() {
  const container = $('results-breakdown');
  container.innerHTML = '';

  STATE.roundResults.forEach((r, i) => {
    const row = document.createElement('div');
    row.className = 'breakdown-row';

    const tierBadge = document.createElement('span');
    tierBadge.className = 'breakdown-tier';
    tierBadge.textContent = r.tierLabel;
    tierBadge.style.background = r.tierColor + '22';
    tierBadge.style.color      = r.tierColor;

    row.innerHTML = `
      <span class="breakdown-offer">${escHtml(r.offerLabel)}</span>
    `;
    row.appendChild(tierBadge);

    const pts = document.createElement('span');
    pts.className = 'breakdown-pts';
    pts.textContent = r.points.toLocaleString();
    row.appendChild(pts);

    container.appendChild(row);
  });
}

// ─── Utils ───────────────────────────────
function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Init ────────────────────────────────
boot();
