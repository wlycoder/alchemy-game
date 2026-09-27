/* ============================================================
   状态
   ============================================================ */
const SAVE_KEY = 'alchemy_save_v8';

const state = {
  gold: 40, rep: 0,
  stock:{}, acc:{},
  cauldron: [],
  cauldronPotion: null,
  discovered: new Set(),
  potions: {},
  orders: [],
  upgrades: {},
  orderUid: 0,
  nextOrderIn: 4000,
  sageVariants: new Set(),
  midSageVariants: new Set(),
  pureSageOwned: false,
  finalSageOwned: false,
  activeSageVariant: 'standard',
  sageCraft: { variant: null, potionId: null },
  merchant: { active:false, offer:null, timeLeft:0, nextIn:48000, type:null },
  chainState: {},
  repTier: 0,
  achievements: new Set(),
  variantTipsShown: new Set(),
  streakPotion: null,
  streakCount: 0,
  pureChance: 0.5,
  news: [],
  nextAmbientNewsIn: 30000,
  stats: {
    potionsBrewed: 0,
    perfectBrewed: 0,
    tier2Crafted: 0,
    chainsCompleted: 0,
    merchantDeals: 0,
    purchases: 0,
    ordersRejected: 0,
    refineCount: 0,
    midSageCrafted: 0,
    sageCraftCount: 0,
    variantsSeen: new Set(),
    chainsDone: new Set(),
    chainsActivated: new Set(),
    goodDoctorFlag: false,
    badDoctorFlag: false,
  },
};

for (const id in ING) { state.stock[id] = ING[id].max; state.acc[id] = 0; }
for (const u of UPGRADES) state.upgrades[u.id] = 0;

const brew = {
  active:false, heating:false,
  temp:20, progress:0,
  goodTime:0, totalTime:0, escapeCount:0,
  avgTempAcc:0, maxTemp:20, minTemp:20,
  zoneMin:0, zoneMax:0, zoneCenter:60,
  zoneDriftIn: 0, driftLogged: false,
  rafId:null, lastTs:0,
  pendingRecipe:null, isSage:false,
  mysteriousRoll: false,
  isRefine: false,
  refineSuccess: false,
  isSageCraft: false,
  sageCraftTarget: null,
};

let isResetting = false;

/* ============================================================
   DOM 引用
   ============================================================ */
const $ = id => document.getElementById(id);
const ingGrid=$('ingGrid'), logEl=$('log'), liquidEl=$('liquid'), bubbleLayer=$('bubbleLayer');
const cauldronEl=$('cauldron'), brewBtn=$('brewBtn'), clearBtn=$('clearBtn');
const goldEl=$('gold'), repEl=$('rep'), discEl=$('disc'), achCountEl=$('achCount'),
      merchantEtaEl=$('merchantEta'), repStatEl=$('repStat');
const slots=[...document.querySelectorAll('.slot')];
const brewUI=$('brewUI'), heatZone=$('heatZone'), heatFill=$('heatFill'),
      heatMarker=$('heatMarker'), heatBtn=$('heatBtn'),
      brewProgress=$('brewProgress'), brewQuality=$('brewQuality'), brewHint=$('brewHint');
const sageSelector=$('sageSelector'), sageRow=$('sageRow');
const sageCraftPanel=$('sageCraftPanel'), scVariants=$('scVariants'),
      scPotions=$('scPotions'), scCraftBtn=$('scCraftBtn'), scStatus=$('scStatus');
const shelfEl=$('shelf');
const newsListEl=$('newsList');
const panes={
  orders:$('pane-orders'), tier2:$('pane-tier2'),
  upgrades:$('pane-upgrades'), achievements:$('pane-achievements'),
  codex:$('pane-codex'), grimoire:$('pane-grimoire')
};
const merchantModal=$('merchantModal');
const eventBanner=$('eventBanner');
const achievementPopup=$('achievementPopup');
const ingEls={};

function iconHTML(icon, sizeEm) {
  if (icon === undefined || icon === null || icon === '') return '';
  const sz = sizeEm || 1;
  if (typeof icon === 'string' &&
      (/^(\.\/|\/|https?:\/\/)/.test(icon) || /\.(png|jpe?g|gif|svg|webp)$/i.test(icon))) {
    return `<img src="${icon}" alt="" style="width:${sz}em;height:${sz}em;object-fit:contain;display:inline-block;vertical-align:middle">`;
  }
  return icon;
}

for (const id in ING) {
  const d = ING[id];
  const btn = document.createElement('button');
  btn.className = 'ing';
  btn.innerHTML = `
    <span class="icon">${iconHTML(d.icon, 1.1)}</span>
    <span class="name">${d.name}</span>
    <span class="count">0</span>
    <span class="buy" title="购买">+</span>
    <span class="bar"><i></i></span>`;
  btn.querySelector('.buy').addEventListener('click', e => { e.stopPropagation(); buyIngredient(id); });
  btn.addEventListener('click', () => addToCauldron(id));
  ingGrid.appendChild(btn);
  ingEls[id] = { btn, count: btn.querySelector('.count'), bar: btn.querySelector('.bar i'), buy: btn.querySelector('.buy') };
}

/* ============================================================
   工具
   ============================================================ */
const gatherMult = () => 1 + 0.25 * state.upgrades.gather;
const sellMult   = () => 1 + 0.15 * state.upgrades.sell;
const sageMult   = () => 1 + 0.20 * state.upgrades.sage;
const repBonusMult = () => 1 + 0.30 * state.upgrades.charm;
const maxOrders  = () => 2 + state.upgrades.orders;

const midSageSpeedMult = () => {
  const n = Math.min(state.midSageVariants.size, 4);
  return 1 + Math.min(MID_SAGE_SPEED.max, n * MID_SAGE_SPEED.perStone);
};

const getRecipe = id => RECIPES.find(r => r.id === id);
const getTier2  = id => TIER2.find(t => t.id === id);
function potionDef(id) {
  return RECIPES.find(r => r.id === id) || TIER2.find(t => t.id === id) || SAGE;
}
function isPrimaryRecipe(id) {
  return RECIPES.some(r => r.id === id);
}
const potKey = (id, v) => id + '|' + v;
function potSlot(id, v) {
  const k = potKey(id, v);
  if (!state.potions[k]) state.potions[k] = [0,0,0];
  return state.potions[k];
}
function potTotal(id, v) { const a = potSlot(id, v); return a[0]+a[1]+a[2]; }
function allBaseUnlocked() { return RECIPES.every(r => state.discovered.has(r.id)); }
function hasSage() {
  return state.sageVariants.size > 0 || state.midSageVariants.size > 0 || state.pureSageOwned;
}
function hasPrimarySage() { return state.sageVariants.size > 0; }
function hasMidSage() { return state.midSageVariants.size > 0; }

function pickSageVariantFor() {
  if (state.sageVariants.has(state.activeSageVariant)) return state.activeSageVariant;
  const found = SAGE_ALLOWED_VARIANTS.find(v => state.sageVariants.has(v));
  if (found) return found;
  if (state.midSageVariants.has(state.activeSageVariant)) return state.activeSageVariant;
  return SAGE_ALLOWED_VARIANTS.find(v => state.midSageVariants.has(v)) || null;
}

/* ============================================================
   新闻系统
   ============================================================ */
function addNews(title, text, kind = 'info') {
  const item = {
    id: 'news_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    title, text, kind,
    time: Date.now(),
  };
  state.news.unshift(item);
  if (state.news.length > 30) state.news.pop();
  safe(renderNews, 'renderNews');
  safe(() => saveGame(true), 'saveGame');
}

function renderNews() {
  if (!newsListEl) return;
  if (!state.news || state.news.length === 0) {
    newsListEl.innerHTML = '<div class="news-empty">城中风平浪静……</div>';
    return;
  }
  newsListEl.innerHTML = '';
  for (const n of state.news.slice(0, 15)) {
    const div = document.createElement('div');
    div.className = 'news-item news-' + n.kind;
    div.innerHTML = `
      <div class="news-title">📰 ${n.title}</div>
      <div class="news-text">${n.text}</div>`;
    newsListEl.appendChild(div);
  }
}

/* 环境新闻：根据声誉等级生成 */
function spawnAmbientNews() {
  const rep = state.rep;
  let pool;
  if (rep >= 60) pool = AMBIENT_NEWS.good;
  else if (rep <= -20) pool = AMBIENT_NEWS.bad;
  else pool = AMBIENT_NEWS.neutral;

  const item = pool[Math.floor(Math.random() * pool.length)];
  addNews(item.title, item.text, item.kind);
}

/* ============================================================
   贤者炼制可选变种
   ============================================================ */
function getSageCraftVariants(targetPotionId) {
  if (targetPotionId === SAGE.id) {
    return [...SAGE_ALLOWED_VARIANTS];
  }

  const list = [];
  for (const v of SAGE_ALLOWED_VARIANTS) {
    if (state.midSageVariants.has(v)) list.push(v);
  }
  if (state.pureSageOwned && !list.includes('pure')) {
    list.push('pure');
  }
  if (state.midSageVariants.size > 0 && !list.includes('mysterious')) {
    list.push('mysterious');
  }
  if (state.finalSageOwned) {
    for (const v of VARIANT_ORDER) {
      if (!list.includes(v)) list.push(v);
    }
  }
  return list;
}

function getSageCraftPotions() {
  const list = [];
  for (const r of RECIPES) if (state.discovered.has(r.id)) list.push(r);
  for (const t of TIER2) if (state.discovered.has(t.id)) list.push(t);
  if (state.discovered.has(SAGE.id)) {
    list.push(SAGE);
  }
  return list;
}

function isSagePotionTarget(potionId) {
  return potionId === SAGE.id;
}

function normalizeSageCraftVariant() {
  if (!state.sageCraft.potionId) return;
  if (isSagePotionTarget(state.sageCraft.potionId)) {
    if (!SAGE_ALLOWED_VARIANTS.includes(state.sageCraft.variant)) {
      state.sageCraft.variant = 'standard';
    }
  }
}

function perfectWisdomCount() {
  let total = 0;
  for (const v of VARIANT_ORDER) total += potSlot('wisdom', v)[2];
  return total;
}
function findPerfectWisdomVariant() {
  for (const v of VARIANT_ORDER) if (potSlot('wisdom', v)[2] > 0) return v;
  return null;
}
function findPureElixirSlot() {
  const arr = potSlot('elixir', 'pure');
  for (let i = 0; i < 3; i++) if (arr[i] > 0) return i;
  return -1;
}
function findT2WisdomSlot() {
  for (const v of VARIANT_ORDER) {
    const arr = potSlot('t2wisdom', v);
    for (let i = 0; i < 3; i++) if (arr[i] > 0) return { v, qi: i };
  }
  return null;
}
function findMysteriousPotionSlot() {
  for (const r of RECIPES) {
    const arr = potSlot(r.id, 'mysterious');
    for (let i = 0; i < 3; i++) if (arr[i] > 0) return { id: r.id, qi: i };
  }
  for (const t of TIER2) {
    const arr = potSlot(t.id, 'mysterious');
    for (let i = 0; i < 3; i++) if (arr[i] > 0) return { id: t.id, qi: i };
  }
  return null;
}

function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}

function log(msg, type='') {
  const e = document.createElement('div');
  e.className = 'log-entry ' + type;
  e.textContent = msg;
  logEl.prepend(e);
  while (logEl.children.length > 45) logEl.lastChild.remove();
}
function pulseEl(el){el.classList.remove('pulse');void el.offsetWidth;el.classList.add('pulse');}

function showEventBanner(text, kind='good') {
  eventBanner.textContent = text;
  eventBanner.className = 'event-banner show ' + kind;
  clearTimeout(showEventBanner._t);
  showEventBanner._t = setTimeout(() => { eventBanner.classList.remove('show'); }, 4800);
}

function showAchievementPopup(a) {
  achievementPopup.innerHTML = `
    <span class="ap-icon">${a.icon}</span>
    <div class="ap-body">
      <div class="ap-title">🏆 成就达成</div>
      <div class="ap-name">${a.name}</div>
      <div class="ap-desc">${a.desc}</div>
    </div>`;
  achievementPopup.classList.add('show');
  clearTimeout(showAchievementPopup._t);
  showAchievementPopup._t = setTimeout(() => { achievementPopup.classList.remove('show'); }, 4000);
}

function safe(fn, label) {
  try { fn(); }
  catch (e) { console.error(`[${label}]`, e); }
}

/* ============================================================
   纯净连击
   ============================================================ */
function recordBrewStreak(recipeId) {
  if (state.streakPotion === recipeId) state.streakCount++;
  else { state.streakPotion = recipeId; state.streakCount = 1; state.pureChance = PURE_STREAK.baseChance; }
}
function rollPure() {
  if (state.streakCount <= PURE_STREAK.required) return false;
  if (Math.random() < state.pureChance) {
    state.streakCount = 0; state.streakPotion = null; state.pureChance = PURE_STREAK.baseChance;
    return true;
  } else {
    state.pureChance = Math.min(PURE_STREAK.maxChance, state.pureChance + PURE_STREAK.increment);
    return false;
  }
}
function isInStreak(recipeId) {
  return state.streakPotion === recipeId && state.streakCount > PURE_STREAK.required;
}

/* ============================================================
   存档
   ============================================================ */
function saveGame(silent) {
  if (isResetting) return false;
  try {
    const save = {
      version: 8,
      gold: state.gold, rep: state.rep,
      stock: state.stock, acc: state.acc,
      cauldron: state.cauldron, cauldronPotion: state.cauldronPotion,
      discovered: [...state.discovered],
      potions: state.potions, orders: state.orders, upgrades: state.upgrades,
      orderUid: state.orderUid, nextOrderIn: state.nextOrderIn,
      sageVariants: [...state.sageVariants],
      midSageVariants: [...state.midSageVariants],
      pureSageOwned: state.pureSageOwned,
      finalSageOwned: state.finalSageOwned,
      activeSageVariant: state.activeSageVariant,
      sageCraft: state.sageCraft,
      merchantNextIn: state.merchant.nextIn,
      chainState: state.chainState, repTier: state.repTier,
      achievements: [...state.achievements],
      variantTipsShown: [...state.variantTipsShown],
      streakPotion: state.streakPotion,
      streakCount: state.streakCount,
      pureChance: state.pureChance,
      news: state.news,
      nextAmbientNewsIn: state.nextAmbientNewsIn,
      stats: {
        potionsBrewed: state.stats.potionsBrewed,
        perfectBrewed: state.stats.perfectBrewed,
        tier2Crafted: state.stats.tier2Crafted,
        chainsCompleted: state.stats.chainsCompleted,
        merchantDeals: state.stats.merchantDeals,
        purchases: state.stats.purchases,
        ordersRejected: state.stats.ordersRejected,
        refineCount: state.stats.refineCount,
        midSageCrafted: state.stats.midSageCrafted,
        sageCraftCount: state.stats.sageCraftCount,
        variantsSeen: [...state.stats.variantsSeen],
        chainsDone: [...state.stats.chainsDone],
        chainsActivated: [...state.stats.chainsActivated],
        goodDoctorFlag: state.stats.goodDoctorFlag,
        badDoctorFlag: state.stats.badDoctorFlag,
      },
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    if (!silent) log('💾 进度已保存。', 'ok');
    return true;
  } catch (e) {
    if (!silent) log('⚠️ 保存失败：' + e.message, 'bad');
    return false;
  }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    if (!s || s.version !== 8) return false;

    state.gold = s.gold ?? 40;
    state.rep = s.rep ?? 0;
    state.stock = Object.assign({}, state.stock, s.stock || {});
    state.acc = Object.assign({}, state.acc, s.acc || {});
    state.cauldron = Array.isArray(s.cauldron) ? s.cauldron.filter(id => ING[id]) : [];
    state.cauldronPotion = s.cauldronPotion || null;
    state.discovered = new Set(s.discovered || []);
    state.potions = s.potions || {};
    state.orders = (s.orders || []).map(o => ({ ...o }));
    state.upgrades = Object.assign({}, state.upgrades, s.upgrades || {});
    state.orderUid = s.orderUid || 0;
    state.nextOrderIn = s.nextOrderIn ?? 4000;
    state.sageVariants = new Set(s.sageVariants || []);
    state.midSageVariants = new Set(s.midSageVariants || []);
    state.pureSageOwned = !!s.pureSageOwned;
    state.finalSageOwned = !!s.finalSageOwned;
    state.activeSageVariant = s.activeSageVariant || 'standard';
    state.sageCraft = s.sageCraft || { variant: null, potionId: null };
    state.merchant.nextIn = s.merchantNextIn ?? 48000;
    state.chainState = s.chainState || {};
    state.repTier = s.repTier ?? 0;
    state.achievements = new Set(s.achievements || []);
    state.variantTipsShown = new Set(s.variantTipsShown || []);
    state.streakPotion = s.streakPotion ?? null;
    state.streakCount = s.streakCount ?? 0;
    state.pureChance = s.pureChance ?? PURE_STREAK.baseChance;
    state.news = s.news || [];
    state.nextAmbientNewsIn = s.nextAmbientNewsIn ?? 30000;

    const st = s.stats || {};
    state.stats.potionsBrewed = st.potionsBrewed || 0;
    state.stats.perfectBrewed = st.perfectBrewed || 0;
    state.stats.tier2Crafted = st.tier2Crafted || 0;
    state.stats.chainsCompleted = st.chainsCompleted || 0;
    state.stats.merchantDeals = st.merchantDeals || 0;
    state.stats.purchases = st.purchases || 0;
    state.stats.ordersRejected = st.ordersRejected || 0;
    state.stats.refineCount = st.refineCount || 0;
    state.stats.midSageCrafted = st.midSageCrafted || 0;
    state.stats.sageCraftCount = st.sageCraftCount || 0;
    state.stats.variantsSeen = new Set(st.variantsSeen || []);
    state.stats.chainsDone = new Set(st.chainsDone || []);
    state.stats.chainsActivated = new Set(st.chainsActivated || []);
    state.stats.goodDoctorFlag = st.goodDoctorFlag || false;
    state.stats.badDoctorFlag = st.badDoctorFlag || false;
    return true;
  } catch (e) {
    console.warn('读档失败', e);
    return false;
  }
}

function resetGame() {
  if (!confirm('确定要重置游戏吗？所有进度将被清除。')) return;
  isResetting = true;
  try { localStorage.removeItem(SAVE_KEY); } catch(e){}
  try { location.reload(); }
  catch (e) { isResetting = false; location.href = location.pathname + '?_r=' + Date.now(); }
}

/* ============================================================
   成就
   ============================================================ */
function checkAchievements() {
  let changed = false;
  for (const a of ACHIEVEMENTS) {
    if (state.achievements.has(a.id)) continue;
    try {
      if (a.check(state)) {
        state.achievements.add(a.id);
        showAchievementPopup(a);
        log(`🏆 成就达成【${a.name}】：${a.desc}`, 'sage');
        changed = true;
      }
    } catch (e) {}
  }
  if (changed) {
    safe(renderAchievements, 'renderAchievements');
    safe(() => renderHeader(false), 'renderHeader');
    safe(() => saveGame(true), 'saveGame');
  }
}

function showVariantTip() {
  const remaining = VARIANT_TIPS.filter(t => !state.variantTipsShown.has(t.v));
  if (remaining.length === 0) {
    state.variantTipsShown.clear();
    remaining.push(...VARIANT_TIPS);
  }
  const tip = remaining[Math.floor(Math.random() * remaining.length)];
  state.variantTipsShown.add(tip.v);
  log(tip.tip, 'sage');
  safe(renderCodex, 'renderCodex');
}

/* ============================================================
   渲染
   ============================================================ */
function renderHeader(flashGold) {
  goldEl.textContent = state.gold;
  repEl.textContent  = state.rep;
  discEl.textContent = state.discovered.size + '/' + (RECIPES.length + 1);
  achCountEl.textContent = state.achievements.size + '/' + ACHIEVEMENTS.length;
  if (state.rep < 0) repStatEl.classList.add('neg');
  else repStatEl.classList.remove('neg');
  if (flashGold) pulseEl(goldEl);

  const fcBtn = $('finalCraftBtn');
  if (fcBtn) fcBtn.style.display = state.finalSageOwned ? '' : 'none';
}

function renderMerchantEta() {
  if (state.merchant.active) {
    merchantEtaEl.textContent = state.merchant.type ? state.merchant.type.name : '到访中';
    merchantEtaEl.style.color = '#c9b6ff';
  } else if (brew.active) {
    merchantEtaEl.textContent = '炼药中';
    merchantEtaEl.style.color = '#8a8272';
  } else {
    merchantEtaEl.textContent = Math.ceil(state.merchant.nextIn / 1000) + 's';
    merchantEtaEl.style.color = '';
  }
}

function renderIngredients() {
  for (const id in ING) {
    const n = state.stock[id], el = ingEls[id];
    el.count.textContent = n;
    const hasRefine = !!state.cauldronPotion;
    el.btn.disabled = (n <= 0) || brew.active || hasRefine;
    el.bar.style.width = (n >= ING[id].max) ? '0%' : Math.min(100, state.acc[id] * 100) + '%';
    el.buy.classList.toggle('off', n >= ING[id].max || brew.active || hasRefine);
  }
}

function renderCauldron() {
  if (state.cauldronPotion) {
    const p = state.cauldronPotion;
    const def = potionDef(p.id);
    const vd = VARIANTS[p.variant];
    slots.forEach((s, i) => {
      s.innerHTML = '';
      s.classList.remove('filled', 'refine-slot', 'sage-craft-slot');
      if (i === 0) {
        s.innerHTML = iconHTML(def.icon, 1.1) + `<span class="order-num refine">R</span>`;
        s.classList.add('filled', 'refine-slot');
        s.title = `重炼：${vd.name}${def.name}（${QUALITY[p.quality].name}）`;
      }
    });
    liquidEl.style.background = 'linear-gradient(180deg, hsl(210 80% 60%), hsl(210 85% 32%))';
    liquidEl.style.height = '35%';
    liquidEl.style.boxShadow = '0 -8px 30px rgba(90,169,255,.5) inset';
  } else if (state.cauldron.length === 0) {
    slots.forEach(s => { s.innerHTML = ''; s.classList.remove('filled', 'refine-slot', 'sage-craft-slot'); s.title = ''; });
    liquidEl.style.background = 'linear-gradient(180deg,#33334a,#181822)';
    liquidEl.style.height = '22%';
    liquidEl.style.boxShadow = '0 -6px 22px rgba(120,180,255,.15) inset';
  } else {
    const isSageCraft = brew.active && brew.isSageCraft;
    const usePurple = isSageCraft || (hasMidSage() && state.sageCraft.variant && state.sageCraft.potionId);
    slots.forEach((s, i) => {
      const id = state.cauldron[i];
      s.innerHTML = '';
      s.classList.remove('refine-slot');
      if (id && ING[id]) {
        s.innerHTML = iconHTML(ING[id].icon, 1.1) +
          `<span class="order-num${usePurple ? ' sage-craft' : ''}">${i + 1}</span>`;
        s.classList.add('filled');
        if (usePurple) s.classList.add('sage-craft-slot');
        else s.classList.remove('sage-craft-slot');
        s.title = ING[id].name;
      } else {
        s.classList.remove('filled', 'sage-craft-slot');
        s.title = '';
      }
    });
    const avg = state.cauldron.reduce((a,id) => a + (HUE[id] || 200), 0) / state.cauldron.length;
    if (usePurple) {
      liquidEl.style.background = `linear-gradient(180deg, hsl(${avg} 70% 68%), hsl(275 90% 45%))`;
      liquidEl.style.boxShadow = `0 -10px 40px rgba(200,140,255,.6) inset`;
    } else {
      liquidEl.style.background = `linear-gradient(180deg,hsl(${avg} 75% 58%),hsl(${avg} 85% 32%))`;
      liquidEl.style.boxShadow = `0 -8px 30px hsla(${avg},90%,60%,.5) inset`;
    }
    liquidEl.style.height = (22 + state.cauldron.length * 13) + '%';
  }

  if (state.cauldronPotion) {
    brewBtn.disabled = brew.active;
    clearBtn.disabled = brew.active;
  } else {
    brewBtn.disabled = brew.active || state.cauldron.length < 2;
    clearBtn.disabled = brew.active || state.cauldron.length === 0;
  }
}

function renderOrders() {
  const pane = panes.orders;
  if (state.discovered.size === 0) {
    pane.innerHTML = '<div class="shelf-empty">尚未解锁任何配方。<br>先在坩埚中调配出第一瓶药水吧。</div>';
    return;
  }
  if (state.orders.length === 0) {
    pane.innerHTML = '<div class="shelf-empty">暂无订单，新的委托正在路上…</div>';
    return;
  }
  pane.innerHTML = '';
  for (const o of state.orders) {
    const def = potionDef(o.potionId);
    if (!def) continue;
    const ratio = Math.max(0, o.timeLeft / o.totalTime);
    const q = QUALITY[o.minQuality] || QUALITY[0];
    const variant = o.variant || 'any';
    const vd = variant === 'any' ? null : VARIANTS[variant];
    const client = CLIENTS[o.client] || CLIENTS.alchemist;

    let have = 0;
    if (variant === 'any') {
      for (const v of VARIANT_ORDER) {
        const arr = potSlot(o.potionId, v);
        for (let qi = o.minQuality; qi < 3; qi++) have += arr[qi];
      }
    } else {
      const arr = potSlot(o.potionId, variant);
      for (let qi = o.minQuality; qi < 3; qi++) have += arr[qi];
    }
    const ready = have >= o.qty;

    const chainInfo = o.chain ? CHAINS.find(c => c.id === o.chain) : null;
    const chainClass = chainInfo ? (chainInfo.chainClass || '') : '';
    const chainSt = chainInfo ? state.chainState[chainInfo.id] : null;

    const div = document.createElement('div');
    div.className = 'order' + (ready ? ' ready' : '') + (ratio < 0.28 ? ' urgent' : '') +
      (client.dark ? ' dark' : '') + (o.chain ? ' chain ' + chainClass : '');

    const vLabel = vd && vd.name
      ? `<span style="color:${vd.color}">${vd.icon}${vd.name}</span>`
      : (variant === 'any' ? '<span style="color:#7a6a50;font-size:10.5px">［不限变种］</span>' : '');

    const repTxt = o.repReward >= 0 ? `+${o.repReward}🏅` : `<span class="neg">${o.repReward}🏅</span>`;
    const chainBadge = (chainInfo && chainSt)
      ? `<div class="order-chain-title ${chainClass}">${chainInfo.title} · 第 ${(chainSt.step||0) + 1}/${chainInfo.steps.length} 环</div>`
      : '';

    div.innerHTML = `
      <div class="order-top">
        <div class="order-avatar ${client.cls}">${client.icon}</div>
        <div class="order-body">
          <div class="order-client"><b>${client.name}</b>${o.chain ? ' · 连续委托' : ''}</div>
          <div class="order-quote">${o.quote || client.quotes[0]}</div>
          <div class="order-title">
            ${o.qty > 1 ? o.qty + '× ' : ''}<span style="color:${q.color}">${q.name}</span>${vLabel} ${iconHTML(def.icon, 1.1)}${def.name}
          </div>
          ${chainBadge}
        </div>
        <div class="order-reward">+${o.goldReward}💰<br>${repTxt}</div>
      </div>
      <div class="order-bottom">
        <div class="order-timer"><i style="width:${(ratio*100).toFixed(1)}%"></i></div>
        <span class="order-need ${ready ? 'has' : ''}">${ready ? '可交付' : `库存 ${have}/${o.qty}`}</span>
        <button class="order-btn reject" data-uid="${o.uid}">拒绝</button>
        <button class="order-btn deliver" ${ready ? '' : 'disabled'} data-uid="${o.uid}">交付</button>
      </div>`;
    div.querySelector('.order-btn.deliver').addEventListener('click', () => deliverOrder(o.uid));
    div.querySelector('.order-btn.reject').addEventListener('click', () => rejectOrder(o.uid));
    pane.appendChild(div);
  }
}

function rejectOrder(uid) {
  const idx = state.orders.findIndex(o => o.uid === uid);
  if (idx < 0) return;
  const o = state.orders[idx];
  const def = potionDef(o.potionId);
  const client = CLIENTS[o.client] || CLIENTS.alchemist;
  state.orders.splice(idx, 1);
  state.stats.ordersRejected++;
  state.nextOrderIn = Math.min(state.nextOrderIn, 3000);
  log(`🚫 你拒绝了${client.name}的【${def ? def.name : '?'}】委托。`, 'warn');
  if (o.chain) {
    const st = state.chainState[o.chain];
    if (st) { st.active = false; st.step = 0; st.cooldown = 0; }
    const chain = CHAINS.find(c => c.id === o.chain);
    if (chain) log(`💔 【${chain.title}】的委托链中断了。`, 'bad');
  }
  safe(renderOrders, 'renderOrders');
  safe(() => saveGame(true), 'saveGame');
}

function renderUpgrades() {
  const pane = panes.upgrades;
  pane.innerHTML = '';
  for (const u of UPGRADES) {
    const lvl = state.upgrades[u.id];
    const maxed = lvl >= u.max;
    const cost = Math.round(u.base * Math.pow(u.mult, lvl));
    const afford = state.gold >= cost;
    const div = document.createElement('div');
    div.className = 'upg' + (maxed ? ' maxed' : '');
    div.innerHTML = `
      <span class="upg-icon">${u.icon}</span>
      <div class="upg-body">
        <div class="upg-name">${u.name}<span>Lv.${lvl}/${u.max}</span></div>
        <div class="upg-desc">${u.desc}</div>
        <div class="upg-dots">${Array.from({length:u.max},(_,i)=>`<i class="${i<lvl?'on':''}"></i>`).join('')}</div>
      </div>
      <button class="upg-buy" ${maxed || !afford ? 'disabled' : ''}>
        ${maxed ? '已满' : cost + '💰'}
      </button>`;
    if (!maxed) div.querySelector('.upg-buy').addEventListener('click', () => buyUpgrade(u.id));
    pane.appendChild(div);
  }
}

function renderAchievements() {
  const pane = panes.achievements;
  pane.innerHTML = '';
  for (const a of ACHIEVEMENTS) {
    const unlocked = state.achievements.has(a.id);
    const div = document.createElement('div');
    div.className = 'ach ' + (unlocked ? 'unlocked' : 'locked');
    div.innerHTML = `
      <span class="ach-icon">${unlocked ? a.icon : '🔒'}</span>
      <div class="ach-body">
        <div class="ach-name">${unlocked ? a.name : '？？？'}</div>
        <div class="ach-desc">${a.desc}</div>
      </div>
      <span class="ach-badge">${unlocked ? '已达成' : '未达成'}</span>`;
    pane.appendChild(div);
  }
}

function renderCodex() {
  const pane = panes.codex;
  pane.innerHTML = '';

  /* ★ 世界观区块 */
  const world = document.createElement('div');
  world.className = 'codex-item known';
  world.style.marginBottom = '8px';
  world.innerHTML = `
    <div class="codex-head">
      <span class="ci-icon">🗺️</span>
      <span class="ci-name">${WORLD.name} · ${WORLD.subtitle}</span>
    </div>
    <div class="codex-body" style="line-height:1.7">
      ${WORLD.description}<br>
      <span style="color:#e0c060;font-style:italic;display:block;margin-top:6px">「${WORLD.motto}」</span>
    </div>`;
  pane.appendChild(world);

  const s1 = document.createElement('div');
  s1.className = 'codex-section';
  s1.textContent = '变 种 手 册';
  pane.appendChild(s1);

  for (const v of VARIANT_ORDER) {
    if (v === 'standard') continue;
    const vd = VARIANTS[v];
    const known = state.stats.variantsSeen.has(v);
    const div = document.createElement('div');
    div.className = 'codex-item ' + (known ? 'known' : 'unknown');
    const tipMap = {
      gentle: '全程均温保持在 48° 以下。',
      burning: '全程均温保持在 63° 以上。',
      refreshing: '将已炼成的药水重新投入坩埚重炼，60% 概率转化为提神的；失败则原样退回。',
      mad: '频繁逃出舒适区（≥4 次）就会癫狂。',
      pure: '连续炼出 5 瓶相同药剂后，下一瓶有 50% 概率成为纯净；每次失败概率 +10%，成功则清零重来。贤者指定炼制同样可以触发纯净连击。',
      mysterious: '每 100 次炼药约有 8 次会自行踏入这条小径。拥有中等贤者之石后，可在贤者炼制中直接指定，成功率为 80%；失败则得到随机药剂的随机变种。',
    };
    div.innerHTML = `
      <div class="codex-head">
        <span class="ci-icon">${known ? vd.icon : '❓'}</span>
        <span class="ci-name">${known ? vd.name : '？？？'}</span>
      </div>
      <div class="codex-body">${known ? tipMap[v] : '尚未炼出此变种。'}</div>`;
    pane.appendChild(div);
  }

  const s2 = document.createElement('div');
  s2.className = 'codex-section';
  s2.style.marginTop = '8px';
  s2.textContent = '贤 者 之 路';
  pane.appendChild(s2);

  const midInfo = document.createElement('div');
  midInfo.className = 'codex-item ' + (state.midSageVariants.size > 0 ? 'known' : 'unknown');
  midInfo.innerHTML = `
    <div class="codex-head">
      <span class="ci-icon">${MID_SAGE.icon}</span>
      <span class="ci-name">中等贤者之石</span>
    </div>
    <div class="codex-body">${
      state.midSageVariants.size > 0
        ? `已拥有 ${state.midSageVariants.size} / 4 种变种。可在坩埚「贤者指定」中指定药剂与变种炼制。`
        : '以 1 个初级贤者之石 + 1 瓶完美品质智慧药剂炼制，30% 失败率。'
    }</div>`;
  pane.appendChild(midInfo);

  const speedPct = Math.round((midSageSpeedMult() - 1) * 100);
  const spdInfo = document.createElement('div');
  spdInfo.className = 'codex-item ' + (state.midSageVariants.size > 0 ? 'known' : 'unknown');
  spdInfo.innerHTML = `
    <div class="codex-head">
      <span class="ci-icon">⏩</span>
      <span class="ci-name">贤者加速</span>
    </div>
    <div class="codex-body">${
      state.midSageVariants.size > 0
        ? `当前拥有 ${state.midSageVariants.size} 种中等贤者之石，炼制速度 +${speedPct}%（手动炼制与贤者指定均生效）。`
        : '每拥有 1 种中等贤者之石，炼制速度 +15%，最多 +60%。'
    }</div>`;
  pane.appendChild(spdInfo);

  const pureInfo = document.createElement('div');
  pureInfo.className = 'codex-item ' + (state.pureSageOwned ? 'known' : 'unknown');
  pureInfo.innerHTML = `
    <div class="codex-head">
      <span class="ci-icon">${state.pureSageOwned ? PURE_SAGE.icon : '❓'}</span>
      <span class="ci-name">${state.pureSageOwned ? PURE_SAGE.name : '？？？'}</span>
    </div>
    <div class="codex-body">${
      state.pureSageOwned ? '已拥有。贤者炼制界面已解锁「纯净」变种。'
      : state.midSageVariants.size >= 4
        ? '以 1 瓶纯净的万灵药 + 4 瓶完美品质智慧药剂炼制。'
        : `集齐 4 种中等贤者之石后方可炼制（${state.midSageVariants.size}/4）。`
    }</div>`;
  pane.appendChild(pureInfo);

  const finalInfo = document.createElement('div');
  finalInfo.className = 'codex-item ' + (state.finalSageOwned ? 'known' : 'unknown');
  finalInfo.innerHTML = `
    <div class="codex-head">
      <span class="ci-icon">${state.finalSageOwned ? FINAL_SAGE.icon : '❓'}</span>
      <span class="ci-name">${state.finalSageOwned ? FINAL_SAGE.name : '？？？'}</span>
    </div>
    <div class="codex-body">${
      state.finalSageOwned
        ? '🏆 已解锁「最终炼制」浮窗：可指定任意变种，必定成功且必定完美品质。'
        : state.pureSageOwned
          ? '以 4 种中等贤者之石 + 纯净初等贤者之石 + 睿智药剂 + 任意神秘药剂炼制。'
          : '需要先炼制纯净的初等贤者之石。'
    }</div>`;
  pane.appendChild(finalInfo);

  const s3 = document.createElement('div');
  s3.className = 'codex-section';
  s3.style.marginTop = '8px';
  s3.textContent = '委 托 链 传 闻';
  pane.appendChild(s3);

  for (const chain of CHAINS) {
    const st = state.chainState[chain.id] || { step:0, active:false };
    const done = state.stats.chainsDone.has(chain.id);
    const known = st.active || st.step > 0 || done;
    const div = document.createElement('div');
    div.className = 'codex-item ' + (known ? 'known' : 'unknown');
    const client = CLIENTS[chain.client] || CLIENTS.alchemist;
    div.innerHTML = `
      <div class="codex-head">
        <span class="ci-icon">${known ? client.icon : '❓'}</span>
        <span class="ci-name">${known ? chain.title : '？？？'}</span>
      </div>
      <div class="codex-body">${
        done ? '✅ 已完成。' :
        known ? `进行中（第 ${st.step + 1}/${chain.steps.length} 环）` :
        '传闻中有一段尚未开始的委托……'}</div>`;
    pane.appendChild(div);
  }
}

function renderTier2() {
  const pane = panes.tier2;
  if (!hasSage()) {
    pane.innerHTML = '<div class="shelf-empty">🔒 需要先获得【初级贤者之石】<br>才能开启进阶之道。</div>';
    return;
  }
  pane.innerHTML = '';

  const s1 = document.createElement('div');
  s1.className = 'codex-section';
  s1.textContent = '贤 者 进 阶';
  pane.appendChild(s1);

  const speedPct = Math.round((midSageSpeedMult() - 1) * 100);
  const spdInfo = document.createElement('div');
  spdInfo.className = 'upg' + (state.midSageVariants.size > 0 ? ' mid' : '');
  spdInfo.innerHTML = `
    <span class="upg-icon">⏩</span>
    <div class="upg-body">
      <div class="upg-name">中等贤者之石 · 炼制加速</div>
      <div class="upg-desc">${
        state.midSageVariants.size > 0
          ? `当前拥有 ${state.midSageVariants.size} 种，炼制速度 <b style="color:#e0c0ff">+${speedPct}%</b>（手动炼制与贤者指定均生效）。`
          : '每拥有 1 种中等贤者之石，炼制速度 +15%，最多 +60%。'
      }</div>
    </div>`;
  pane.appendChild(spdInfo);

  /* 显示当前二阶药剂将继承的变种 */
  const currentVariant = state.sageCraft && state.sageCraft.variant;
  const inheritedVariant = currentVariant && VARIANTS[currentVariant] ? currentVariant : null;
  const inheritInfo = document.createElement('div');
  inheritInfo.className = 'upg';
  if (inheritedVariant) {
    const vd = VARIANTS[inheritedVariant];
    const vTxt = vd.name ? `${vd.icon}${vd.name}` : '标准';
    inheritInfo.style.borderColor = 'rgba(200,140,255,.45)';
    inheritInfo.innerHTML = `
      <span class="upg-icon">🧬</span>
      <div class="upg-body">
        <div class="upg-name">二级变种继承</div>
        <div class="upg-desc">当前贤者指定变种：<b style="color:${vd.color}">${vTxt}</b>，二阶药剂将继承此变种（"神秘的"除外）。</div>
      </div>`;
  } else {
    inheritInfo.innerHTML = `
      <span class="upg-icon">🧬</span>
      <div class="upg-body">
        <div class="upg-name">二级变种继承</div>
        <div class="upg-desc"><span style="color:#6f6a8a">在下方「贤者指定」中选择变种，二阶药剂将继承它；未指定时继承基础药剂的变种。</span></div>
      </div>`;
  }
  pane.appendChild(inheritInfo);

  const wisdomQty = perfectWisdomCount();

  for (const v of SAGE_ALLOWED_VARIANTS) {
    const vd = VARIANTS[v];
    const vLabel = vd.name ? `${vd.icon}${vd.name}` : '标准';
    const owned = state.sageVariants.has(v);
    const midOwned = state.midSageVariants.has(v);
    const canCraft = owned && wisdomQty > 0 && !midOwned;

    const div = document.createElement('div');
    div.className = 'upg mid' + (canCraft ? ' ready' : '') + (midOwned ? ' owned' : '');
    div.innerHTML = `
      <span class="upg-icon">${MID_SAGE.icon}</span>
      <div class="upg-body">
        <div class="upg-name">${vLabel}中等贤者之石<span>${MID_SAGE.price}💰</span></div>
        <div class="upg-desc"><span>1 个${vLabel}初级贤者之石 + 1 瓶完美品质</span>${iconHTML('📘', 1)}<span>智慧药剂</span></div>
        <div class="upg-desc">${
          midOwned ? '<b style="color:#f5d76a">✅ 已拥有</b>' :
          !owned ? '<span style="color:#6f6a8a">缺少初级贤者之石</span>' :
          wisdomQty <= 0 ? '<span style="color:#6f6a8a">缺少完美品质智慧药剂</span>' :
          '<b style="color:#e0c0ff">可炼制 · 30% 失败率</b>'
        }</div>
      </div>
      <button class="upg-buy mid" ${canCraft ? '' : 'disabled'}>${midOwned ? '已拥有' : '炼制'}</button>`;
    if (canCraft) div.querySelector('.upg-buy').addEventListener('click', () => craftMidSage(v));
    pane.appendChild(div);
  }

  const s2 = document.createElement('div');
  s2.className = 'codex-section pure';
  s2.style.marginTop = '8px';
  s2.textContent = '纯 净 贤 者';
  pane.appendChild(s2);

  const pureElixirIdx = findPureElixirSlot();
  const hasPureElixir = pureElixirIdx >= 0;
  const midAll = state.midSageVariants.size >= 4;
  const canPure = midAll && !state.pureSageOwned && hasPureElixir && wisdomQty >= 4;

  const pdiv = document.createElement('div');
  pdiv.className = 'upg pure' + (canPure ? ' ready' : '') + (state.pureSageOwned ? ' owned' : '');
  pdiv.innerHTML = `
    <span class="upg-icon">${PURE_SAGE.icon}</span>
    <div class="upg-body">
      <div class="upg-name">纯净的初等贤者之石<span>${PURE_SAGE.price}💰</span></div>
      <div class="upg-desc"><span>1 瓶纯净的</span>${iconHTML('✨', 1)}<span>万灵药 + 4 瓶完美品质</span>${iconHTML('📘', 1)}<span>智慧药剂</span></div>
      <div class="upg-desc">${
        state.pureSageOwned ? '<b style="color:#f5d76a">✅ 已拥有（贤者炼制已解锁「纯净」）</b>' :
        !midAll ? `<span style="color:#6f6a8a">需要集齐 4 种中等贤者之石（${state.midSageVariants.size}/4）</span>` :
        !hasPureElixir ? '<span style="color:#6f6a8a">缺少纯净的万灵药</span>' :
        wisdomQty < 4 ? `<span style="color:#6f6a8a">缺少完美品质智慧药剂（${wisdomQty}/4）</span>` :
        '<b style="color:#f5d76a">可炼制</b>'
      }</div>
    </div>
    <button class="upg-buy pure" ${canPure ? '' : 'disabled'}>${state.pureSageOwned ? '已拥有' : '炼制'}</button>`;
  if (canPure) pdiv.querySelector('.upg-buy').addEventListener('click', craftPureSage);
  pane.appendChild(pdiv);

  const s3 = document.createElement('div');
  s3.className = 'codex-section ultimate';
  s3.style.marginTop = '8px';
  s3.textContent = '贤 者 之 极';
  pane.appendChild(s3);

  const canFinal = checkFinalSageMaterials();

  const fdiv = document.createElement('div');
  fdiv.className = 'upg ultimate' + (canFinal ? ' ready' : '') + (state.finalSageOwned ? ' owned' : '');
  fdiv.innerHTML = `
    <span class="upg-icon">${FINAL_SAGE.icon}</span>
    <div class="upg-body">
      <div class="upg-name">最终贤者之石<span>${FINAL_SAGE.price}💰</span></div>
      <div class="upg-desc"><span>4 种中等贤者之石 + 纯净初等 + 1 瓶</span>${iconHTML('🔮', 1)}<span>睿智药剂 + 1 瓶任意</span>${iconHTML('🔮', 1)}<span>神秘药剂</span></div>
      <div class="upg-desc">${
        state.finalSageOwned ? '<b style="color:#ffdca0">✅ 已拥有 · 可开启「最终炼制」浮窗</b>' :
        !state.pureSageOwned ? '<span style="color:#6f6a8a">需要先炼制纯净的初等贤者之石</span>' :
        canFinal ? '<b style="color:#ffdca0">可炼制 · 终极仪式</b>' :
        '<span style="color:#6f6a8a">材料不足</span>'
      }</div>
    </div>
    <button class="upg-buy ultimate" ${canFinal ? '' : 'disabled'}>${state.finalSageOwned ? '已拥有' : '炼制'}</button>`;
  if (canFinal) fdiv.querySelector('.upg-buy').addEventListener('click', craftFinalSage);
  pane.appendChild(fdiv);

  const s4 = document.createElement('div');
  s4.className = 'codex-section';
  s4.style.marginTop = '10px';
  s4.textContent = '二 级 药 剂';
  pane.appendChild(s4);

  for (const t of TIER2) {
    const can = canCraftTier2(t);
    let totalStock = 0;
    for (const v of VARIANT_ORDER) totalStock += potTotal(t.id, v);

    const div = document.createElement('div');
    div.className = 'upg t2' + (can ? ' ready' : '');
    const matsList = t.mats.map(m => iconHTML(ING[m].icon, 1) + ING[m].name).join(' + ');
    const baseList = t.base.map(b => {
      const d = potionDef(b);
      return iconHTML(d.icon, 1) + d.name;
    }).join(' + ');
    div.innerHTML = `
      <span class="upg-icon">${iconHTML(t.icon, 1.1)}</span>
      <div class="upg-body">
        <div class="upg-name">${t.name}<span>${t.price}💰</span></div>
        <div class="upg-desc">${baseList}${matsList ? ' + ' + matsList : ''}</div>
        <div class="upg-desc">${can
          ? '可变种加工'
          : '<span style="color:#6f6a8a">材料或药剂不足</span>'}
          ${totalStock > 0 ? `　库存 ${totalStock}` : ''}</div>
      </div>
      <button class="upg-buy violet" ${can ? '' : 'disabled'}>加工</button>`;
    if (can) div.querySelector('.upg-buy').addEventListener('click', () => craftTier2(t));
    pane.appendChild(div);
  }
}

function canCraftTier2(t) {
  for (const m of t.mats) if (state.stock[m] <= 0) return false;
  for (const b of t.base) {
    let total = 0;
    for (const v of VARIANT_ORDER) total += potTotal(b, v);
    if (total <= 0) return false;
  }
  return true;
}

function renderGrimoire() {
  const pane = panes.grimoire;
  pane.innerHTML = '';
  for (const r of RECIPES) {
    const found = state.discovered.has(r.id);
    const div = document.createElement('div');
    div.className = 'recipe' + (found ? ' found' : '');
    if (found) {
      div.innerHTML = `
        <span class="r-icon">${iconHTML(r.icon, 1.1)}</span>
        <div class="r-body">
          <div class="r-name">${r.name}${r.negative ? ' <span style="font-size:10px;color:#d966d9">· 负面</span>' : ''}</div>
          <div class="r-mats">${r.mats.map(m => iconHTML(ING[m].icon, 1) + ING[m].name).join(' + ')}</div>
        </div>
        <span class="r-price">${r.price}💰</span>`;
    } else {
      div.innerHTML = `
        <span class="r-icon">❓</span>
        <div class="r-body">
          <div class="r-name">？？？</div>
          <div class="r-hint">${r.hint}</div>
        </div>`;
    }
    pane.appendChild(div);
  }

  const allBase = allBaseUnlocked();
  const sdiv = document.createElement('div');
  if (hasPrimarySage()) {
    sdiv.className = 'recipe found sage';
    const owned = [...state.sageVariants].map(v => {
      const vd = VARIANTS[v];
      return vd.name ? `${vd.icon}${vd.name}` : '标准';
    }).join('、');
    sdiv.innerHTML = `
      <span class="r-icon">🔴</span>
      <div class="r-body">
        <div class="r-name">初级贤者之石</div>
        <div class="r-mats">${SAGE.mats.map(m => iconHTML(ING[m].icon, 1) + ING[m].name).join(' + ')}</div>
        <div class="r-hint" style="color:#c9b6ff;font-style:normal">已持有：${owned}</div>
      </div>`;
  } else if (allBase) {
    sdiv.className = 'recipe sage';
    sdiv.innerHTML = `
      <span class="r-icon">❓</span>
      <div class="r-body">
        <div class="r-name">？？？</div>
        <div class="r-hint">${SAGE.hint}</div>
      </div>`;
  } else {
    sdiv.className = 'recipe';
    sdiv.innerHTML = `
      <span class="r-icon">🔒</span>
      <div class="r-body">
        <div class="r-name">？？？</div>
        <div class="r-hint">解锁全部药剂后，方能窥见终极奥秘</div>
      </div>`;
  }
  pane.appendChild(sdiv);

  if (state.midSageVariants.size > 0) {
    const mdiv = document.createElement('div');
    mdiv.className = 'recipe found midsage';
    const owned = [...state.midSageVariants].map(v => {
      const vd = VARIANTS[v];
      return vd.name ? `${vd.icon}${vd.name}` : '标准';
    }).join('、');
    mdiv.innerHTML = `
      <span class="r-icon">${MID_SAGE.icon}</span>
      <div class="r-body">
        <div class="r-name">中等贤者之石</div>
        <div class="r-mats">可指定任意药剂与变种</div>
        <div class="r-hint" style="color:#e0c0ff;font-style:normal">已持有：${owned}</div>
      </div>`;
    pane.appendChild(mdiv);
  }

  if (state.pureSageOwned) {
    const pdiv = document.createElement('div');
    pdiv.className = 'recipe found puresage';
    pdiv.innerHTML = `
      <span class="r-icon">${PURE_SAGE.icon}</span>
      <div class="r-body">
        <div class="r-name">${PURE_SAGE.name}</div>
        <div class="r-mats">纯净的万灵药 + 4 瓶完美品质智慧药剂</div>
        <div class="r-hint" style="color:#f5d76e;font-style:normal">✅ 已持有 · 贤者炼制已解锁纯净</div>
      </div>`;
    pane.appendChild(pdiv);
  }

  if (state.finalSageOwned) {
    const fdiv = document.createElement('div');
    fdiv.className = 'recipe found finalsage';
    fdiv.innerHTML = `
      <span class="r-icon">${FINAL_SAGE.icon}</span>
      <div class="r-body">
        <div class="r-name">${FINAL_SAGE.name}</div>
        <div class="r-mats">已解锁「最终炼制」· 可指定任意变种</div>
        <div class="r-hint" style="color:#ffdca0;font-style:normal">🏆 炼金术的终极彼岸 · 必定成功 · 完美品质</div>
      </div>`;
    pane.appendChild(fdiv);
  }
}

function renderShelf() {
  shelfEl.innerHTML = '';
  let any = false;

  function addGroup(def, t2) {
    const isPrimary = isPrimaryRecipe(def.id);
    for (const v of VARIANT_ORDER) {
      const arr = potSlot(def.id, v);
      const total = arr[0]+arr[1]+arr[2];
      if (total === 0) continue;
      any = true;
      const vd = VARIANTS[v];

      const item = document.createElement('div');
      item.className = 'shelf-item' + (t2 ? ' t2' : '');
      if (v === 'mysterious') { item.style.borderColor = 'rgba(177,108,255,.7)'; item.style.boxShadow = '0 0 14px rgba(177,108,255,.4)'; }
      else if (v === 'pure') { item.style.borderColor = 'rgba(245,215,110,.6)'; item.style.boxShadow = '0 0 12px rgba(245,215,110,.35)'; }
      else if (v === 'refreshing') { item.style.borderColor = 'rgba(90,169,255,.6)'; item.style.boxShadow = '0 0 12px rgba(90,169,255,.35)'; }

      let badges = '';
      for (let i = 0; i < 3; i++) {
        if (arr[i] > 0) {
          badges += `<button class="badge ${QUALITY[i].key}" data-q="${i}" data-v="${v}">${QUALITY[i].name[0]} ${arr[i]}</button>`;
        }
      }
      const vTxt = vd.name ? `<span class="s-variant" style="color:${vd.color}">${vd.icon}${vd.name}</span>` : '';
      const canRefine = isPrimary && v !== 'refreshing';
      const refineBtn = canRefine ? `<button class="refine-btn" title="重炼为提神的（60% 概率）">🔄</button>` : '';
      item.innerHTML = `
        <span class="s-icon">${iconHTML(def.icon, 1.1)}</span>
        <span class="s-name">${def.name}</span>
        ${vTxt}
        <div class="s-badges">${badges}</div>
        ${refineBtn}`;

      item.querySelectorAll('.badge').forEach(b => {
        b.addEventListener('click', () => sellPotion(def.id, b.dataset.v, +b.dataset.q));
      });
      const refBtn = item.querySelector('.refine-btn');
      if (refBtn) refBtn.addEventListener('click', e => {
        e.stopPropagation();
        startRefineFromShelf(def.id, v);
      });
      shelfEl.appendChild(item);
    }
  }

  for (const r of RECIPES) addGroup(r, false);
  if (hasSage()) for (const t of TIER2) addGroup(t, true);

  if (!any) shelfEl.innerHTML = '<div class="shelf-empty">还没有库存药水。</div>';
}

function renderBrewUI() {
  if (brew.isRefine) {
    brewUI.classList.add('show');
    brewProgress.style.width = '100%';
    heatFill.style.width = '0%';
    heatMarker.style.left = '50%';
    brewQuality.innerHTML = `<b style="color:#5aa9ff">重 炼 中</b>`;
    brewHint.innerHTML = `将药剂重新投入坩埚……`;
    return;
  }
  if (brew.isSageCraft) {
    brewUI.classList.add('show');
    brewProgress.style.width = brew.progress + '%';
    heatFill.style.width = '0%';
    heatMarker.style.left = '50%';
    brewQuality.innerHTML = `<b style="color:#e0c0ff">贤 者 指 定 炼 制</b>`;
    brewHint.innerHTML = `贤者之力正在凝练……`;
    return;
  }

  const t = brew.temp;
  heatFill.style.width = t + '%';
  heatMarker.style.left = t + '%';

  const inZone = t >= brew.zoneMin && t <= brew.zoneMax;
  const overheat = t > 92;

  if (overheat) heatFill.style.background = 'linear-gradient(90deg,rgba(255,80,80,.5),rgba(220,40,40,.8))';
  else if (inZone) heatFill.style.background = 'linear-gradient(90deg,rgba(126,231,135,.5),rgba(63,185,80,.75))';
  else heatFill.style.background = 'linear-gradient(90deg,rgba(255,213,79,.45),rgba(255,152,0,.65))';

  cauldronEl.classList.toggle('glow-heat', inZone);
  brewProgress.style.width = brew.progress + '%';

  const ratio = brew.totalTime > 0.25 ? brew.goodTime / brew.totalTime : 1;
  const qi = ratio >= 0.78 ? 2 : ratio >= 0.52 ? 1 : 0;
  const q = QUALITY[qi];

  const avg = brew.totalTime > 0.2 ? brew.avgTempAcc / brew.totalTime : 50;
  const inZoneRatio = brew.goodTime / Math.max(0.3, brew.totalTime);
  const predicted = brew.mysteriousRoll ? 'mysterious' : predictVariant(avg, brew.escapeCount, inZoneRatio, qi);
  const pv = VARIANTS[predicted];
  const pvTxt = pv.name ? `${pv.icon}${pv.name}` : '标准';

  brewQuality.innerHTML = `品质：<b style="color:${q.color}">${q.name}</b> · <span style="color:${pv.color}">${pvTxt}</span>`;

  let hintHTML = `均温 <b style="color:#e0d0ff">${avg.toFixed(0)}°</b> · 逃离舒适区 <b style="color:#ffb677">${brew.escapeCount}</b> 次`;
  if (brew.pendingRecipe && isPrimaryRecipe(brew.pendingRecipe.id) && !brew.isSage) {
    if (isInStreak(brew.pendingRecipe.id)) {
      hintHTML += ` · <b style="color:#f5d76e">连击×${state.streakCount} 纯净 ${(state.pureChance*100).toFixed(0)}%</b>`;
    } else if (state.streakPotion === brew.pendingRecipe.id && state.streakCount > 0) {
      hintHTML += ` · <b style="color:#b8a9e8">连击 ${state.streakCount}/${PURE_STREAK.required}</b>`;
    }
  }
  brewHint.innerHTML = hintHTML;
}

function renderSageSelector() {
  if (hasMidSage()) {
    sageSelector.classList.remove('show');
    return;
  }
  if (!hasPrimarySage()) {
    sageSelector.classList.remove('show');
    return;
  }
  sageSelector.classList.add('show');
  sageRow.innerHTML = '';
  for (const v of SAGE_ALLOWED_VARIANTS) {
    const vd = VARIANTS[v];
    const owned = state.sageVariants.has(v);
    const b = document.createElement('button');
    b.className = 'ss-btn' + (state.activeSageVariant === v ? ' active' : '');
    b.disabled = !owned;
    b.innerHTML = vd.name ? `${vd.icon}${vd.name}` : '标准';
    b.title = owned ? '自动炼制使用此变种' : '尚未拥有此变种';
    b.addEventListener('click', () => {
      state.activeSageVariant = v;
      renderSageSelector();
      safe(() => saveGame(true), 'saveGame');
    });
    sageRow.appendChild(b);
  }
}

function renderSageCraft() {
  if (!hasMidSage()) {
    sageCraftPanel.classList.remove('show');
    return;
  }
  sageCraftPanel.classList.add('show');

  const availablePotions = getSageCraftPotions();

  if (state.sageCraft.potionId && !availablePotions.find(p => p.id === state.sageCraft.potionId)) {
    state.sageCraft.potionId = null;
  }

  const availableVariants = getSageCraftVariants(state.sageCraft.potionId);
  const isSageTarget = isSagePotionTarget(state.sageCraft.potionId);

  if (state.sageCraft.variant && !availableVariants.includes(state.sageCraft.variant)) {
    state.sageCraft.variant = null;
  }
  if (!state.sageCraft.variant && availableVariants.length > 0) {
    state.sageCraft.variant = availableVariants[0];
  }
  normalizeSageCraftVariant();

  scVariants.innerHTML = '';
  for (const v of availableVariants) {
    const vd = VARIANTS[v];
    const alreadyOwned = isSageTarget && state.sageVariants.has(v);
    const btn = document.createElement('button');
    btn.className = 'sc-v-btn' +
      (state.sageCraft.variant === v ? ' active' : '') +
      (v === 'mysterious' ? ' mystery' : '') +
      (v === 'pure' ? ' pure' : '');
    btn.innerHTML = (vd.name ? `${vd.icon}${vd.name}` : '标准') + (alreadyOwned ? ' ✓' : '');
    if (alreadyOwned) {
      btn.style.opacity = '.5';
      btn.title = '已拥有该变种的初级贤者之石';
    } else if (v === 'mysterious') {
      btn.title = `神秘的 · 成功率 ${(SAGE_CRAFT.finalSageMysteryChance*100).toFixed(0)}%（失败则得到随机药剂的随机变种）`;
    } else if (v === 'pure') {
      btn.title = '纯净的 · 由纯净的初等贤者之石解锁（也可由纯净连击触发）';
    } else if (isSageTarget) {
      btn.title = '初级贤者之石 · 四种变种任选';
    }
    btn.addEventListener('click', () => {
      state.sageCraft.variant = v;
      renderSageCraft();
      safe(renderTier2, 'renderTier2');
      safe(() => saveGame(true), 'saveGame');
    });
    scVariants.appendChild(btn);
  }

  scPotions.innerHTML = '';
  for (const p of availablePotions) {
    const isSagePotion = isSagePotionTarget(p.id);
    const btn = document.createElement('button');
    btn.className = 'sc-p-btn' +
      (state.sageCraft.potionId === p.id ? ' active' : '') +
      (isSagePotion ? ' sage-potion' : '');
    btn.innerHTML = `${iconHTML(p.icon, 1.1)}${p.name}`;
    btn.title = isSagePotion
      ? '初级贤者之石 · 标准 / 温和 / 炽热 / 疯狂 四种变种任选'
      : p.name;
    btn.addEventListener('click', () => {
      state.sageCraft.potionId = p.id;
      if (isSagePotion) {
        const list = getSageCraftVariants(p.id);
        if (!list.includes(state.sageCraft.variant)) state.sageCraft.variant = list[0];
      }
      normalizeSageCraftVariant();
      renderSageCraft();
      safe(() => saveGame(true), 'saveGame');
    });
    scPotions.appendChild(btn);
  }

  updateSageCraftButton();
}

function updateSageCraftButton() {
  const target = state.sageCraft;
  const materialsInPot = state.cauldron.length;

  if (!target.variant || !target.potionId) {
    scCraftBtn.disabled = true;
    scStatus.textContent = '请选择变种与药剂';
    return;
  }

  const def = potionDef(target.potionId);
  const vd = VARIANTS[target.variant];
  const vTxt = vd.name ? `${vd.icon}${vd.name}` : '标准';
  const isSagePotion = isSagePotionTarget(target.potionId);

  if (state.cauldronPotion) {
    scCraftBtn.disabled = true;
    scStatus.textContent = '请先清空重炼台上的药剂';
    return;
  }
  if (materialsInPot < SAGE_CRAFT.minMaterials) {
    scCraftBtn.disabled = true;
    scStatus.textContent = `坩埚内材料不足（${materialsInPot}/${SAGE_CRAFT.minMaterials}）`;
    return;
  }

  if (isSagePotion && state.sageVariants.has(target.variant)) {
    scCraftBtn.disabled = true;
    scStatus.textContent = `你已经拥有【${vTxt}】初级贤者之石，请改选其它变种（标准 / 温和 / 炽热 / 疯狂）`;
    return;
  }

  if (isSagePotion && !SAGE_ALLOWED_VARIANTS.includes(target.variant)) {
    scCraftBtn.disabled = true;
    scStatus.textContent = `贤者之石只能炼制：标准 / 温和 / 炽热 / 疯狂`;
    return;
  }

  scCraftBtn.disabled = false;
  const speedPct = Math.round((midSageSpeedMult() - 1) * 100);
  let status = `将炼制：【${vTxt}】${def.name}`;
  if (!isSagePotion) status += '（完美品质）';
  if (target.variant === 'mysterious' && !isSagePotion) {
    status += ` · 成功率 ${(SAGE_CRAFT.finalSageMysteryChance*100).toFixed(0)}%`;
  }
  if (isSagePotion) {
    status += ' · 变种任选，不消耗贤者之石';
  }
  if (speedPct > 0) {
    status += ` · 加速 +${speedPct}%`;
  }
  scStatus.textContent = status;
}

function startSageCraft() {
  if (brew.active) return;
  if (state.cauldronPotion) { log('请先清空重炼台上的药剂。', 'warn'); return; }

  const target = state.sageCraft;
  if (!target.variant || !target.potionId) { log('请先选择变种与药剂。', 'warn'); return; }
  if (state.cauldron.length < SAGE_CRAFT.minMaterials) {
    log(`贤者指定炼制需要至少 ${SAGE_CRAFT.minMaterials} 种材料。`, 'warn');
    return;
  }

  const def = potionDef(target.potionId);
  if (!def) { log('无效的药剂。', 'bad'); return; }

  const isSagePotion = isSagePotionTarget(target.potionId);

  if (isSagePotion) {
    if (state.sageVariants.has(target.variant)) {
      log('你已经拥有该变种的初级贤者之石。', 'warn'); return;
    }
    if (!SAGE_ALLOWED_VARIANTS.includes(target.variant)) {
      log('贤者之石只能炼制：标准 / 温和 / 炽热 / 疯狂。', 'warn'); return;
    }
  }

  const targetVariant = target.variant;
  const targetPotionId = target.potionId;

  state.cauldron = [];

  brew.active = true;
  brew.isSageCraft = true;
  brew.sageCraftTarget = { potionId: targetPotionId, variant: targetVariant };
  brew.progress = 0;

  cauldronEl.classList.add('brewing', 'glow-sage');
  brewUI.classList.add('show');
  brewBtn.disabled = true;
  clearBtn.disabled = true;
  scCraftBtn.disabled = true;
  safe(renderBrewUI, 'renderBrewUI');
  safe(renderCauldron, 'renderCauldron');
  safe(renderIngredients, 'renderIngredients');
  safe(renderMerchantEta, 'renderMerchantEta');
  spawnBubbles(18);

  const vd = VARIANTS[targetVariant];
  const vTxt = vd.name ? `${vd.icon}${vd.name}` : '标准';
  const speedPct = Math.round((midSageSpeedMult() - 1) * 100);
  log(`🟣 贤者指定炼制：【${vTxt}】${def.name} ……${speedPct > 0 ? `（加速 +${speedPct}%）` : ''}`);

  let prog = 0;
  const speed = midSageSpeedMult();
  const tick = () => {
    if (!brew.active || !brew.isSageCraft) return;
    prog += 4 * speed;
    brew.progress = Math.min(100, prog);
    safe(renderBrewUI, 'renderBrewUI');
    if (prog < 100) setTimeout(tick, 40);
    else finishSageCraft();
  };
  setTimeout(tick, 100);
}

function finishSageCraft() {
  if (!brew.isSageCraft) return;

  const target = brew.sageCraftTarget;
  brew.active = false;
  brew.isSageCraft = false;
  brew.sageCraftTarget = null;
  brew.progress = 0;

  cauldronEl.classList.remove('brewing', 'glow-sage');
  brewUI.classList.remove('show');

  if (!target) return;
  const def = potionDef(target.potionId);
  if (!def) return;

  const isSagePotion = isSagePotionTarget(target.potionId);

  if (!isSagePotion) {
    recordBrewStreak(target.potionId);
  }

  let actualVariant = target.variant;
  let mysteryFailed = false;

  if (target.variant === 'mysterious' && !isSagePotion) {
    if (Math.random() < SAGE_CRAFT.finalSageMysteryChance) {
      actualVariant = 'mysterious';
    } else {
      mysteryFailed = true;

      let poolIds = [
        ...RECIPES.filter(r => state.discovered.has(r.id)).map(r => r.id),
        ...TIER2.filter(t => state.discovered.has(t.id)).map(t => t.id),
      ];
      if (poolIds.length === 0) {
        poolIds = [...RECIPES.map(r => r.id), ...TIER2.map(t => t.id)];
      }
      const randomPotionId = poolIds[Math.floor(Math.random() * poolIds.length)];
      const randomVariant = VARIANT_ORDER[Math.floor(Math.random() * VARIANT_ORDER.length)];
      const randomDef = potionDef(randomPotionId);
      const rvd = VARIANTS[randomVariant];

      potSlot(randomPotionId, randomVariant)[2]++;
      state.stats.potionsBrewed++;
      state.stats.perfectBrewed++;
      state.stats.sageCraftCount++;
      state.stats.variantsSeen.add(randomVariant);

      cauldronEl.classList.add('glow-fail');
      setTimeout(() => cauldronEl.classList.remove('glow-fail'), 1200);
      showEventBanner('🔮💥 神秘共鸣失败……', 'bad');

      const rvTxt = rvd.name ? `${rvd.icon}${rvd.name}` : '';
      log(`🔮💥 神秘共鸣失败……贤者之石失控，凝出一瓶【完美·${rvTxt}${randomDef.name}】。`, 'warn');
    }
  }

  if (!mysteryFailed) {
    let finalVariant = actualVariant;
    let pureFromStreak = false;
    if (!isSagePotion && actualVariant !== 'mysterious') {
      if (rollPure()) {
        finalVariant = 'pure';
        pureFromStreak = true;
      }
    }

    const vd = VARIANTS[finalVariant];
    const vTxt = vd.name ? `${vd.icon}${vd.name}` : '';

    if (isSagePotion) {
      if (!SAGE_ALLOWED_VARIANTS.includes(finalVariant)) finalVariant = 'standard';

      state.sageVariants.add(finalVariant);
      state.stats.sageCraftCount++;
      state.discovered.add(SAGE.id);

      cauldronEl.classList.add('glow-sage');
      setTimeout(() => cauldronEl.classList.remove('glow-sage'), 1600);
      showEventBanner('🔴 贤者之石诞生！', 'good');

      const avd = VARIANTS[finalVariant];
      const avTxt = avd.name ? `${avd.icon}${avd.name}·` : '';
      log(`🔴✨ 贤者之力凝练出【${avTxt}初级贤者之石】！`, 'sage');

      if (!state.activeSageVariant || !state.sageVariants.has(state.activeSageVariant)) {
        if (SAGE_ALLOWED_VARIANTS.includes(finalVariant)) {
          state.activeSageVariant = finalVariant;
        }
      }
    } else {
      potSlot(target.potionId, finalVariant)[2]++;
      state.stats.potionsBrewed++;
      state.stats.perfectBrewed++;
      state.stats.sageCraftCount++;
      state.stats.variantsSeen.add(finalVariant);

      if (pureFromStreak) {
        cauldronEl.classList.add('glow-pure');
        setTimeout(() => cauldronEl.classList.remove('glow-pure'), 1800);
        showEventBanner('✨ 纯净的祝福！', 'pure');
        log(`✨ 连击达成！贤者之力凝练出【完美·${vTxt}${def.name}】`, 'pure');
      } else if (finalVariant === 'mysterious') {
        cauldronEl.classList.add('glow-mystery');
        setTimeout(() => cauldronEl.classList.remove('glow-mystery'), 2200);
        showEventBanner('🔮 神秘的共鸣……', 'mystery');
        log(`🔮✨ 贤者之力凝练出【完美·${vTxt}${def.name}】！`, 'mystery');
      } else if (finalVariant === 'pure') {
        cauldronEl.classList.add('glow-pure');
        setTimeout(() => cauldronEl.classList.remove('glow-pure'), 1600);
        showEventBanner('✨ 纯净的结晶', 'pure');
        log(`✨ 贤者之力凝练出【完美·${vTxt}${def.name}】`, 'pure');
      } else {
        cauldronEl.classList.add('glow-sage');
        setTimeout(() => cauldronEl.classList.remove('glow-sage'), 900);
        log(`🟣 贤者之力凝练出【完美·${vTxt}${def.name}】`, 'sage');
      }

      if (isInStreak(target.potionId)) {
        log(`📈 连击 ×${state.streakCount}　下次纯净概率 ${(state.pureChance*100).toFixed(0)}%`, 'warn');
      }
    }
  }

  spawnBubbles(24);
  safe(render, 'render');
  safe(() => renderHeader(true), 'renderHeader');
  safe(checkAchievements, 'checkAchievements');
  safe(() => saveGame(true), 'saveGame');
}

function render() {
  safe(renderIngredients, 'renderIngredients');
  safe(renderCauldron, 'renderCauldron');
  safe(renderOrders, 'renderOrders');
  safe(renderTier2, 'renderTier2');
  safe(renderUpgrades, 'renderUpgrades');
  safe(renderAchievements, 'renderAchievements');
  safe(renderCodex, 'renderCodex');
  safe(renderGrimoire, 'renderGrimoire');
  safe(renderShelf, 'renderShelf');
  safe(renderSageSelector, 'renderSageSelector');
  safe(renderSageCraft, 'renderSageCraft');
  safe(() => renderHeader(false), 'renderHeader');
  safe(renderMerchantEta, 'renderMerchantEta');
  safe(renderNews, 'renderNews');
  safe(renderFinalCraft, 'renderFinalCraft');
}

/* ============================================================
   材料交互
   ============================================================ */
function addToCauldron(id) {
  if (brew.active) return;
  if (state.cauldronPotion) { log('请先清空重炼台上的药剂。', 'warn'); return; }
  if (state.stock[id] <= 0) { log(`${ING[id].name}不足，正在凝聚中…`, 'warn'); return; }
  if (state.cauldron.length >= 3) { log('坩埚已满，请先调配或清空。', 'warn'); return; }
  if (state.cauldron.includes(id)) { log('同一种材料只能投放一份。', 'warn'); return; }

  state.stock[id]--;
  state.cauldron.push(id);
  spawnBubbles(5);
  log(`投入了 ${ING[id].name}（第${state.cauldron.length}份）`);
  safe(renderCauldron, 'renderCauldron');
  safe(renderIngredients, 'renderIngredients');
  safe(updateSageCraftButton, 'updateSageCraftButton');
  safe(renderFinalCraft, 'renderFinalCraft');
  safe(() => saveGame(true), 'saveGame');
}

function clearCauldron() {
  if (brew.active) return;

  if (state.cauldronPotion) {
    const p = state.cauldronPotion;
    potSlot(p.id, p.variant)[p.quality]++;
    log('重炼台上的药剂已退回药水架。');
    state.cauldronPotion = null;
    safe(renderCauldron, 'renderCauldron');
    safe(renderShelf, 'renderShelf');
    safe(renderIngredients, 'renderIngredients');
    safe(updateSageCraftButton, 'updateSageCraftButton');
    safe(renderFinalCraft, 'renderFinalCraft');
    safe(() => saveGame(true), 'saveGame');
    return;
  }

  for (const id of state.cauldron) {
    if (ING[id]) state.stock[id] = Math.min(ING[id].max, state.stock[id] + 1);
  }
  if (state.cauldron.length) log('材料已全部取回。');
  state.cauldron = [];
  safe(renderCauldron, 'renderCauldron');
  safe(renderIngredients, 'renderIngredients');
  safe(updateSageCraftButton, 'updateSageCraftButton');
  safe(renderFinalCraft, 'renderFinalCraft');
  safe(() => saveGame(true), 'saveGame');
}

function buyIngredient(id) {
  const d = ING[id];
  if (brew.active) return;
  if (state.cauldronPotion) { log('请先清空重炼台上的药剂。', 'warn'); return; }
  if (state.stock[id] >= d.max) { log(`${d.name}库存已满。`, 'warn'); return; }
  if (state.gold < d.price) { log(`金币不足（需要 ${d.price}💰）。`, 'warn'); return; }
  state.gold -= d.price;
  state.stock[id]++;
  state.stats.purchases++;
  log(`花费 ${d.price}💰 购入 1 份 ${d.name}。`);
  safe(renderIngredients, 'renderIngredients');
  safe(() => renderHeader(true), 'renderHeader');
  checkAchievements();
  safe(() => saveGame(true), 'saveGame');
}

/* ============================================================
   变种判定
   ============================================================ */
function predictVariant(avgTemp, escapeCount, inZoneRatio, quality) {
  const T = VARIANT_THRESHOLDS;
  if (avgTemp < T.gentleAvgTemp) return 'gentle';
  if (avgTemp > T.burningAvgTemp) return 'burning';
  if (escapeCount >= T.madEscapes) return 'mad';
  return 'standard';
}

function computeZoneCenter(recipe) {
  const first = state.cauldron[0];
  let shift = 0;
  if (first && ING[first]) {
    if (ING[first].temp === 'hot') shift += 12;
    else if (ING[first].temp === 'cold') shift -= 12;
  }
  if (recipe === SAGE) return 50;
  return 60 + shift;
}

function scheduleNextDrift(first) {
  const D = ZONE_DRIFT;
  brew.zoneDriftIn = first
    ? D.firstDelayMin + Math.random() * (D.firstDelayMax - D.firstDelayMin)
    : D.intervalMin + Math.random() * (D.intervalMax - D.intervalMin);
}

function maybeDriftZone(dtMs) {
  if (brew.isSage) return;
  brew.zoneDriftIn -= dtMs;
  if (brew.zoneDriftIn > 0) return;
  const D = ZONE_DRIFT;
  const zoneW = brew.zoneMax - brew.zoneMin;
  const shift = D.shiftMin + Math.random() * (D.shiftMax - D.shiftMin);
  const dir = Math.random() < 0.5 ? -1 : 1;
  let newCenter = brew.zoneCenter + dir * shift;
  const minCenter = zoneW / 2 + 8;
  const maxCenter = 92 - zoneW / 2;
  newCenter = Math.max(minCenter, Math.min(maxCenter, newCenter));
  if (Math.abs(newCenter - brew.zoneCenter) < 4) { scheduleNextDrift(false); return; }
  brew.zoneCenter = newCenter;
  brew.zoneMin = newCenter - zoneW / 2;
  brew.zoneMax = newCenter + zoneW / 2;
  heatZone.style.left = brew.zoneMin + '%';
  heatZone.style.width = zoneW + '%';
  heatZone.classList.remove('drift-flash');
  void heatZone.offsetWidth;
  heatZone.classList.add('drift-flash');
  if (!brew.driftLogged) {
    log('💫 舒适区开始漂移了——注意绿色温度带的位置。', 'warn');
    brew.driftLogged = true;
  }
  scheduleNextDrift(false);
}

/* ============================================================
   重炼
   ============================================================ */
function startRefineFromShelf(recipeId, variant) {
  if (brew.active) return;
  if (state.cauldronPotion) { log('重炼台上已经有药剂了。', 'warn'); return; }
  if (state.cauldron.length > 0) { log('请先清空坩埚中的材料。', 'warn'); return; }
  if (variant === 'refreshing') { log('提神的药剂无法再次重炼。', 'warn'); return; }
  if (!isPrimaryRecipe(recipeId)) { log('该药剂无法重炼。', 'warn'); return; }

  const arr = potSlot(recipeId, variant);
  let qi = -1;
  for (let i = 0; i < 3; i++) if (arr[i] > 0) { qi = i; break; }
  if (qi < 0) return;

  arr[qi]--;
  state.cauldronPotion = { id: recipeId, variant, quality: qi };

  const def = potionDef(recipeId);
  const vd = VARIANTS[variant];
  const vTxt = vd.name ? vd.name : '';
  log(`将【${QUALITY[qi].name}·${vTxt}${def.name}】送上重炼台。`);

  safe(renderCauldron, 'renderCauldron');
  safe(renderShelf, 'renderShelf');
  safe(renderIngredients, 'renderIngredients');
  safe(updateSageCraftButton, 'updateSageCraftButton');
  safe(renderFinalCraft, 'renderFinalCraft');
  safe(() => saveGame(true), 'saveGame');
}

function startRefine() {
  const p = state.cauldronPotion;
  if (!p) return;
  if (p.variant === 'refreshing') { log('提神的药剂无法再次重炼。', 'warn'); return; }
  if (brew.active) return;

  brew.active = true;
  brew.isRefine = true;
  brew.refineSuccess = Math.random() < REFINE_CHANCE;

  cauldronEl.classList.add('brewing', 'glow-refine');
  brewUI.classList.add('show');
  brewBtn.disabled = true;
  clearBtn.disabled = true;
  safe(renderBrewUI, 'renderBrewUI');
  spawnBubbles(12);
  log('💧 重炼中……');

  setTimeout(() => {
    cauldronEl.classList.remove('brewing', 'glow-refine');
    brewUI.classList.remove('show');

    const def = potionDef(p.id);
    const vd = VARIANTS[p.variant];

    try {
      if (brew.refineSuccess) {
        cauldronEl.classList.add('glow-ok');
        setTimeout(() => cauldronEl.classList.remove('glow-ok'), 800);
        showEventBanner('💧 重炼成功 · 提神的', 'good');
        potSlot(p.id, 'refreshing')[p.quality]++;
        state.stats.variantsSeen.add('refreshing');
        state.stats.refineCount++;
        log(`✨ 重炼成功！得到【${QUALITY[p.quality].name}·提神的${def.name}】`, 'ok');
      } else {
        cauldronEl.classList.add('glow-fail');
        setTimeout(() => cauldronEl.classList.remove('glow-fail'), 800);
        potSlot(p.id, p.variant)[p.quality]++;
        log(`💧 重炼未产生变化，【${QUALITY[p.quality].name}·${vd.name}${def.name}】原样退回。`, 'warn');
      }
    } catch (e) {
      console.error('refine 错误', e);
    } finally {
      state.cauldronPotion = null;
      brew.active = false;
      brew.isRefine = false;
      brew.refineSuccess = false;

      safe(renderCauldron, 'renderCauldron');
      safe(renderShelf, 'renderShelf');
      safe(renderIngredients, 'renderIngredients');
      safe(() => renderHeader(true), 'renderHeader');
      safe(updateSageCraftButton, 'updateSageCraftButton');
      safe(renderFinalCraft, 'renderFinalCraft');
      safe(checkAchievements, 'checkAchievements');
      safe(() => saveGame(true), 'saveGame');
    }
  }, 1200);
}

/* ============================================================
   炼药
   ============================================================ */
function startBrew() {
  if (brew.active) return;

  if (state.cauldronPotion) {
    startRefine();
    return;
  }

  if (hasMidSage() && state.sageCraft.variant && state.sageCraft.potionId && state.cauldron.length >= SAGE_CRAFT.minMaterials) {
    startSageCraft();
    return;
  }

  if (state.cauldron.length < 2) { log('至少需要两种材料才能调配。', 'warn'); return; }

  const key = [...state.cauldron].sort().join('+');
  let recipe = RECIPES.find(r => [...r.mats].sort().join('+') === key);
  let isSage = false;

  if (!recipe && [...SAGE.mats].sort().join('+') === key) {
    if (allBaseUnlocked()) { recipe = SAGE; isSage = true; }
  }

  if (!recipe) {
    cauldronEl.classList.add('glow-fail');
    setTimeout(() => cauldronEl.classList.remove('glow-fail'), 700);
    log('💥 砰！坩埚冒出一股黑烟……这个组合没有任何反应。', 'bad');
    spawnBubbles(10);
    return;
  }

  brew.mysteriousRoll = isSage ? false : (Math.random() < MYSTERIOUS_CHANCE);

  if (hasSage() && !isSage) { autoBrew(recipe); return; }
  startManualBrew(recipe, isSage);
}

function startManualBrew(recipe, isSage) {
  brew.active = true;
  brew.isSage = isSage;
  brew.isRefine = false;
  brew.isSageCraft = false;
  brew.pendingRecipe = recipe;
  brew.heating = false;
  brew.temp = 20;
  brew.progress = 0;
  brew.goodTime = 0;
  brew.totalTime = 0;
  brew.escapeCount = 0;
  brew.avgTempAcc = 0;
  brew.maxTemp = 20;
  brew.minTemp = 20;
  brew.driftLogged = false;

  const center = computeZoneCenter(recipe);
  const zoneW = isSage ? 10 : (22 + state.upgrades.thermo * 5);
  brew.zoneCenter = center;
  brew.zoneMin = center - zoneW / 2;
  brew.zoneMax = center + zoneW / 2;

  heatZone.style.left = brew.zoneMin + '%';
  heatZone.style.width = zoneW + '%';

  scheduleNextDrift(true);

  brewUI.classList.add('show');
  cauldronEl.classList.add('brewing');
  safe(renderIngredients, 'renderIngredients');
  safe(renderCauldron, 'renderCauldron');
  safe(renderBrewUI, 'renderBrewUI');
  safe(renderMerchantEta, 'renderMerchantEta');

  if (isSage) log('🔴 坩埚中的液体开始自主发光……这是最后一步。');
  else log('🔥 坩埚开始沸腾……按住加热，将温度保持在绿色区域。');

  brew.lastTs = performance.now();
  brew.rafId = requestAnimationFrame(brewLoop);
}

function brewLoop(ts) {
  if (!brew.active) return;
  const dt = Math.min((ts - brew.lastTs) / 1000, 0.05);
  brew.lastTs = ts;
  const dtMs = dt * 1000;

  const rate = brew.heating ? 50 : -32;
  const newTemp = Math.max(0, Math.min(100, brew.temp + rate * dt));

  const wasIn = brew.temp >= brew.zoneMin && brew.temp <= brew.zoneMax;
  const isIn  = newTemp >= brew.zoneMin && newTemp <= brew.zoneMax;
  if (wasIn && !isIn) brew.escapeCount++;

  brew.temp = newTemp;
  if (brew.temp > brew.maxTemp) brew.maxTemp = brew.temp;
  if (brew.temp < brew.minTemp) brew.minTemp = brew.temp;

  brew.totalTime += dt;
  brew.avgTempAcc += brew.temp * dt;
  if (isIn) brew.goodTime += dt;

  maybeDriftZone(dtMs);

  const overheat = brew.temp > 92;
  let pr;
  if (isIn) pr = 38 * sageMult() * midSageSpeedMult();
  else if (overheat) pr = -55;
  else pr = -20;
  brew.progress = Math.max(0, Math.min(100, brew.progress + pr * dt));

  if (isIn && Math.random() < 0.35) spawnBubbles(1);

  safe(renderBrewUI, 'renderBrewUI');
  if (brew.progress >= 100) { finishBrew(); return; }
  brew.rafId = requestAnimationFrame(brewLoop);
}

function finishBrew() {
  if (!brew.active && !brew.pendingRecipe) return;

  const recipe = brew.pendingRecipe;
  const isSage = brew.isSage;
  const mysteriousRoll = brew.mysteriousRoll;
  const ratio = brew.totalTime > 0 ? brew.goodTime / brew.totalTime : 0;
  const qi = ratio >= 0.78 ? 2 : ratio >= 0.52 ? 1 : 0;
  const q = QUALITY[qi];
  const avgTemp = brew.totalTime > 0.1 ? brew.avgTempAcc / brew.totalTime : 50;
  const escapeCount = brew.escapeCount;

  brew.active = false;
  if (brew.rafId) { try { cancelAnimationFrame(brew.rafId); } catch(e){} brew.rafId = null; }
  brew.pendingRecipe = null;
  brew.isSage = false;
  brew.mysteriousRoll = false;
  brew.progress = 0;

  cauldronEl.classList.remove('brewing', 'glow-heat');
  heatBtn.classList.remove('active');
  brewUI.classList.remove('show');

  let success = false;

  try {
    if (!recipe) {
      log('⚠️ 炼药异常：配方丢失，材料已退回。', 'warn');
      for (const id of state.cauldron) {
        if (ING[id]) state.stock[id] = Math.min(ING[id].max, state.stock[id] + 1);
      }
      return;
    }

    let variant;

    if (!isSage && isPrimaryRecipe(recipe.id)) recordBrewStreak(recipe.id);

    if (isSage) {
      variant = predictVariant(avgTemp, escapeCount, ratio, qi);
      if (!SAGE_ALLOWED_VARIANTS.includes(variant)) variant = 'standard';
    } else if (mysteriousRoll) {
      variant = 'mysterious';
    } else if (isPrimaryRecipe(recipe.id) && rollPure()) {
      variant = 'pure';
    } else {
      variant = predictVariant(avgTemp, escapeCount, ratio, qi);
    }

    const vd = VARIANTS[variant];

    if (variant === 'mysterious') {
      cauldronEl.classList.add('glow-mystery');
      setTimeout(() => cauldronEl.classList.remove('glow-mystery'), 2000);
      showEventBanner('🔮 神秘的共鸣……', 'mystery');
    } else if (variant === 'pure') {
      cauldronEl.classList.add('glow-pure');
      setTimeout(() => cauldronEl.classList.remove('glow-pure'), 1800);
      showEventBanner('✨ 纯净的祝福！', 'pure');
    } else {
      cauldronEl.classList.add('glow-ok');
      setTimeout(() => cauldronEl.classList.remove('glow-ok'), 800);
    }
    spawnBubbles(20);

    if (isSage) {
      state.sageVariants.add(variant);
      state.discovered.add(SAGE.id);
      cauldronEl.classList.add('glow-sage');
      setTimeout(() => cauldronEl.classList.remove('glow-sage'), 1600);
      const vName = vd.name ? `${vd.icon}${vd.name}·` : '';
      log(`🔴 炼成了【${vName}初级贤者之石】！`, 'sage');
      log('⚗️ 该变种药剂现在可以自动炼制。', 'sage');
      state.gold += 200;
      state.rep += 50;
      if (!state.activeSageVariant || !state.sageVariants.has(state.activeSageVariant)) {
        if (SAGE_ALLOWED_VARIANTS.includes(variant)) state.activeSageVariant = variant;
      }
    } else {
      const isNew = !state.discovered.has(recipe.id);
      state.discovered.add(recipe.id);
      potSlot(recipe.id, variant)[qi]++;

      state.stats.potionsBrewed++;
      if (qi === 2) state.stats.perfectBrewed++;
      state.stats.variantsSeen.add(variant);

      const vTxt = vd.name ? `${vd.icon}${vd.name}` : '';
      if (variant === 'mysterious') {
        log(`🔮✨ 神秘之力涌入坩埚！炼成【${q.name}·${vTxt}${recipe.name}】`, 'mystery');
      } else if (variant === 'pure') {
        log(`✨ 连击达成！炼成【${q.name}·${vTxt}${recipe.name}】`, 'pure');
      } else if (isNew) {
        state.gold += 30;
        state.rep += 15;
        log(`✨ 首次调配出【${q.name}·${vTxt}${recipe.name}】！奖励 30💰 15🏅`, 'ok');
        checkAllUnlocked();
      } else {
        state.rep += 2;
        log(`调配出【${q.name}·${vTxt}${recipe.name}】（温度契合度 ${(ratio*100).toFixed(0)}%）`, qi === 2 ? 'ok' : '');
      }

      if (isPrimaryRecipe(recipe.id) && isInStreak(recipe.id)) {
        log(`📈 连击 ×${state.streakCount}　下次纯净概率 ${(state.pureChance*100).toFixed(0)}%`, 'warn');
      }
    }

    success = true;
  } catch (e) {
    console.error('finishBrew 内部错误:', e);
    log('⚠️ 炼药出错：' + (e && e.message ? e.message : '未知错误') + '（材料已退回）', 'bad');
  } finally {
    if (!success) {
      for (const id of state.cauldron) {
        if (ING[id]) state.stock[id] = Math.min(ING[id].max, state.stock[id] + 1);
      }
    }
    state.cauldron = [];
    safe(render, 'render');
    safe(() => renderHeader(true), 'renderHeader');
    safe(checkWin, 'checkWin');
    safe(checkAchievements, 'checkAchievements');
    safe(() => saveGame(true), 'saveGame');
  }
}

function autoBrew(recipe) {
  const sageVar = pickSageVariantFor();
  if (!sageVar) { startManualBrew(recipe, false); return; }

  brew.active = true;
  brew.isSage = false;
  brew.isRefine = false;
  brew.isSageCraft = false;
  brew.pendingRecipe = recipe;

  cauldronEl.classList.add('brewing', 'glow-sage');
  brewBtn.disabled = true;
  clearBtn.disabled = true;
  safe(renderIngredients, 'renderIngredients');
  safe(renderMerchantEta, 'renderMerchantEta');
  spawnBubbles(14);
  const vd = VARIANTS[sageVar];
  log(`🔴 贤者之石闪耀（${vd.name || '标准'}），炼金术自动运转……`);

  setTimeout(() => {
    const mysteriousRoll = brew.mysteriousRoll;

    brew.active = false;
    brew.pendingRecipe = null;
    brew.mysteriousRoll = false;

    let success = false;
    try {
      cauldronEl.classList.remove('brewing', 'glow-sage');

      if (isPrimaryRecipe(recipe.id)) recordBrewStreak(recipe.id);

      let variant;
      if (mysteriousRoll) variant = 'mysterious';
      else if (isPrimaryRecipe(recipe.id) && rollPure()) variant = 'pure';
      else {
        variant = sageVar;
        if (!SAGE_ALLOWED_VARIANTS.includes(variant)) variant = 'standard';
      }
      const vd2 = VARIANTS[variant];

      if (variant === 'mysterious') {
        cauldronEl.classList.add('glow-mystery');
        setTimeout(() => cauldronEl.classList.remove('glow-mystery'), 2000);
        showEventBanner('🔮 神秘的共鸣……', 'mystery');
      } else if (variant === 'pure') {
        cauldronEl.classList.add('glow-pure');
        setTimeout(() => cauldronEl.classList.remove('glow-pure'), 1800);
        showEventBanner('✨ 纯净的祝福！', 'pure');
      } else {
        cauldronEl.classList.add('glow-ok');
        setTimeout(() => cauldronEl.classList.remove('glow-ok'), 700);
      }

      const isNew = !state.discovered.has(recipe.id);
      state.discovered.add(recipe.id);
      potSlot(recipe.id, variant)[2]++;

      state.stats.potionsBrewed++;
      state.stats.perfectBrewed++;
      state.stats.variantsSeen.add(variant);

      const vTxt = vd2.name ? `${vd2.icon}${vd2.name}` : '';
      if (variant === 'mysterious') log(`🔮✨ 贤者之石凝练出【完美·${vTxt}${recipe.name}】——神秘降临！`, 'mystery');
      else if (variant === 'pure') log(`✨ 连击达成！贤者之石凝练出【完美·${vTxt}${recipe.name}】`, 'pure');
      else if (isNew) {
        state.gold += 30;
        state.rep += 15;
        log(`✨ 首次调配出【完美·${vTxt}${recipe.name}】！奖励 30💰 15🏅`, 'ok');
        checkAllUnlocked();
      } else {
        state.rep += 2;
        log(`贤者之石凝练出【完美·${vTxt}${recipe.name}】`, 'ok');
      }

      if (isPrimaryRecipe(recipe.id) && isInStreak(recipe.id)) {
        log(`📈 连击 ×${state.streakCount}　下次纯净概率 ${(state.pureChance*100).toFixed(0)}%`, 'warn');
      }
      success = true;
    } catch (e) {
      console.error('autoBrew 内部错误:', e);
      log('⚠️ 自动炼药出错：' + (e && e.message ? e.message : '未知错误') + '（材料已退回）', 'bad');
    } finally {
      if (!success) {
        for (const id of state.cauldron) {
          if (ING[id]) state.stock[id] = Math.min(ING[id].max, state.stock[id] + 1);
        }
      }
      state.cauldron = [];
      safe(render, 'render');
      safe(() => renderHeader(true), 'renderHeader');
      safe(checkWin, 'checkWin');
      safe(checkAchievements, 'checkAchievements');
      safe(() => saveGame(true), 'saveGame');
    }
  }, 900);
}

heatBtn.addEventListener('pointerdown', e => {
  e.preventDefault();
  if (!brew.active) return;
  brew.heating = true;
  heatBtn.classList.add('active');
});
const stopHeat = () => { brew.heating = false; heatBtn.classList.remove('active'); };
window.addEventListener('pointerup', stopHeat);
window.addEventListener('pointercancel', stopHeat);
window.addEventListener('blur', stopHeat);

/* ============================================================
   二级药剂加工（★ 变种继承自贤者指定）
   ============================================================ */
function craftTier2(t) {
  if (!hasSage()) return;
  if (!canCraftTier2(t)) { log('材料或药剂不足，无法加工。', 'warn'); return; }

  let consumedVariant = 'standard';
  let foundBase = false;

  for (const b of t.base) {
    let picked = null;
    for (const v of VARIANT_ORDER) if (potTotal(b, v) > 0) { picked = v; break; }
    if (!picked) continue;
    if (!foundBase) { consumedVariant = picked; foundBase = true; }
    const arr = potSlot(b, picked);
    for (let qi = 0; qi < 3; qi++) if (arr[qi] > 0) { arr[qi]--; break; }
  }
  for (const m of t.mats) state.stock[m]--;

  /* ★ 变种继承：优先使用贤者指定所选的变种（"神秘的"除外，避免量产） */
  let outVariant = consumedVariant;
  const sagePick = state.sageCraft && state.sageCraft.variant;
  if (sagePick && VARIANTS[sagePick] && sagePick !== 'mysterious') {
    outVariant = sagePick;
  } else if (outVariant === 'standard' && Math.random() < 0.18) {
    outVariant = 'pure';
  }

  potSlot(t.id, outVariant)[2]++;
  state.rep += 5;
  state.stats.tier2Crafted++;
  state.stats.variantsSeen.add(outVariant);

  cauldronEl.classList.add('glow-sage');
  setTimeout(() => cauldronEl.classList.remove('glow-sage'), 900);
  spawnBubbles(12);

  const vd = VARIANTS[outVariant];
  const vTxt = vd.name ? `${vd.icon}${vd.name}` : '';
  log(`⚗️ 二次加工成功：【完美·${vTxt}${t.name}】`, 'sage');
  safe(render, 'render');
  checkAchievements();
  safe(() => saveGame(true), 'saveGame');
}

/* ============================================================
   中等贤者之石
   ============================================================ */
function craftMidSage(sageVariant) {
  if (!state.sageVariants.has(sageVariant)) { log('缺少该变种的初级贤者之石。', 'warn'); return; }
  if (state.midSageVariants.has(sageVariant)) { log('你已经拥有该变种的中等贤者之石。', 'warn'); return; }

  const wisdomVariant = findPerfectWisdomVariant();
  if (!wisdomVariant) { log('需要一瓶完美品质的智慧药剂。', 'warn'); return; }

  state.sageVariants.delete(sageVariant);
  potSlot('wisdom', wisdomVariant)[2]--;

  const success = Math.random() > MID_SAGE.failChance;

  cauldronEl.classList.add('glow-sage');
  setTimeout(() => cauldronEl.classList.remove('glow-sage'), 1400);
  spawnBubbles(18);

  const vd = VARIANTS[sageVariant];
  const vLabel = vd.name ? `${vd.icon}${vd.name}` : '';

  if (success) {
    state.midSageVariants.add(sageVariant);
    state.stats.midSageCrafted++;
    cauldronEl.classList.add('glow-pure');
    setTimeout(() => cauldronEl.classList.remove('glow-pure'), 1600);
    showEventBanner('🟣 中等贤者之石诞生！', 'mid');
    log(`✨✨ 炼制成功！获得【${vLabel}中等贤者之石】`, 'mid');
    log('🟣 现在可以在坩埚下方的「贤者指定」中指定任意药剂与变种炼制。', 'sage');
    log('🔮 「神秘的」变种已可在贤者指定中主动炼制（80% 成功率）。', 'sage');
    const spd = Math.round((midSageSpeedMult() - 1) * 100);
    log(`⏩ 炼制加速 +${spd}%。`, 'sage');
    if (!SAGE_ALLOWED_VARIANTS.includes(state.activeSageVariant)) state.activeSageVariant = sageVariant;
  } else {
    cauldronEl.classList.add('glow-fail');
    setTimeout(() => cauldronEl.classList.remove('glow-fail'), 1200);
    const pool = RECIPES;
    const r = pool[Math.floor(Math.random() * pool.length)];
    const rq = Math.floor(Math.random() * 3);
    potSlot(r.id, sageVariant)[rq]++;
    log(`💥 炼制失败！初级贤者之石碎裂，转化为【${QUALITY[rq].name}·${vLabel}${r.name}】`, 'bad');
    showEventBanner('💥 贤者之石碎裂……', 'bad');
  }

  safe(render, 'render');
  safe(() => renderHeader(true), 'renderHeader');
  checkAchievements();
  safe(() => saveGame(true), 'saveGame');
}

/* ============================================================
   纯净的初等贤者之石
   ============================================================ */
function craftPureSage() {
  if (state.pureSageOwned) { log('你已经拥有纯净的初等贤者之石。', 'warn'); return; }
  if (state.midSageVariants.size < 4) { log(`需要集齐 4 种中等贤者之石（${state.midSageVariants.size}/4）。`, 'warn'); return; }

  const elixirIdx = findPureElixirSlot();
  if (elixirIdx < 0) { log('需要一瓶纯净的万灵药。', 'warn'); return; }

  const wisdomQty = perfectWisdomCount();
  if (wisdomQty < 4) { log(`需要 4 瓶完美品质的智慧药剂（当前 ${wisdomQty}）。`, 'warn'); return; }

  potSlot('elixir', 'pure')[elixirIdx]--;

  let need = 4;
  for (const v of VARIANT_ORDER) {
    if (need <= 0) break;
    const arr = potSlot('wisdom', v);
    while (arr[2] > 0 && need > 0) { arr[2]--; need--; }
  }

  state.pureSageOwned = true;

  cauldronEl.classList.add('glow-pure');
  setTimeout(() => cauldronEl.classList.remove('glow-pure'), 2200);
  spawnBubbles(24);
  showEventBanner('💠 纯净的初等贤者之石诞生！', 'mid');
  log('💠✨ 纯净的初等贤者之石诞生了！贤者炼制界面已解锁「纯净」变种。', 'mid');
  addNews('贤者诞生', '有传闻称，某位炼金术士成功炼制出纯净的初等贤者之石——那是通往真理阶梯的第一级。', 'good');

  state.gold += 1000;
  state.rep += 150;

  safe(render, 'render');
  safe(() => renderHeader(true), 'renderHeader');
  checkAchievements();
  safe(() => saveGame(true), 'saveGame');
}

/* ============================================================
   最终贤者之石
   ============================================================ */
function checkFinalSageMaterials() {
  if (state.finalSageOwned) return false;
  if (!state.pureSageOwned) return false;
  if (state.midSageVariants.size < 4) return false;
  if (!findT2WisdomSlot()) return false;
  if (!findMysteriousPotionSlot()) return false;
  return true;
}

function craftFinalSage() {
  if (state.finalSageOwned) { log('你已经炼制出最终贤者之石。', 'warn'); return; }
  if (!state.pureSageOwned) { log('需要先炼制纯净的初等贤者之石。', 'warn'); return; }
  if (state.midSageVariants.size < 4) { log('需要集齐 4 种中等贤者之石。', 'warn'); return; }

  const t2w = findT2WisdomSlot();
  if (!t2w) { log('需要一瓶睿智药剂。', 'warn'); return; }
  const myst = findMysteriousPotionSlot();
  if (!myst) { log('需要一瓶任意种类的神秘药剂。', 'warn'); return; }

  state.midSageVariants.clear();
  state.pureSageOwned = false;
  potSlot('t2wisdom', t2w.v)[t2w.qi]--;
  potSlot(myst.id, 'mysterious')[myst.qi]--;

  state.finalSageOwned = true;

  cauldronEl.classList.add('glow-ultimate');
  setTimeout(() => cauldronEl.classList.remove('glow-ultimate'), 3500);
  spawnBubbles(35);
  showEventBanner('🌌 最终贤者之石诞生！', 'ultimate');
  log('🌌✨✨✨ 最终贤者之石诞生了！你已抵达炼金术的终极彼岸。', 'ultimate');
  log('🌟 已解锁「最终炼制」浮窗——点击顶栏 🌟 按钮。', 'sage');
  addNews('贤者之极', '艾瑟瑞亚沸腾了——有人成功炼制出传说中的最终贤者之石！《炼金日报》头版整版报道此事。', 'good');

  state.gold += 5000;
  state.rep += 500;
  log('💰 +5000　🏅 +500', 'ok');

  safe(render, 'render');
  safe(() => renderHeader(true), 'renderHeader');
  safe(checkWin, 'checkWin');
  checkAchievements();
  safe(() => saveGame(true), 'saveGame');
}

/* ============================================================
   出售
   ============================================================ */
function sellPotion(recipeId, variant, qIdx) {
  const arr = potSlot(recipeId, variant);
  if (arr[qIdx] <= 0) return;
  const def = potionDef(recipeId);
  if (!def) return;
  const vd = VARIANTS[variant];
  const price = Math.round(def.price * QUALITY[qIdx].mult * vd.mult * sellMult());
  arr[qIdx]--;
  state.gold += price;
  state.rep += 1;
  const vTxt = vd.name ? `${vd.name}` : '';
  let logType = '';
  if (variant === 'mysterious') logType = 'mystery';
  else if (variant === 'pure') logType = 'pure';
  else if (variant === 'refreshing') logType = 'sage';
  log(`卖出一份【${QUALITY[qIdx].name}·${vTxt}${def.name}】，获得 ${price}💰`, logType);
  safe(renderShelf, 'renderShelf');
  safe(() => renderHeader(true), 'renderHeader');
  checkAchievements();
  safe(() => saveGame(true), 'saveGame');
}

/* ============================================================
   订单系统
   ============================================================ */
function pickClientForPotion(potionId) {
  const def = potionDef(potionId);
  const isNegative = def && def.negative;
  const r = Math.random();
  if (isNegative) {
    if (r < 0.55) return CLIENTS.stranger;
    if (r < 0.75) return CLIENTS.mercenary;
    if (r < 0.9) return CLIENTS.alchemist;
    return CLIENTS.noble;
  }
  if (r < 0.20) return CLIENTS.mercenary;
  if (r < 0.38) return CLIENTS.noble;
  if (r < 0.58) return CLIENTS.farmer;
  if (r < 0.78) return CLIENTS.alchemist;
  if (r < 0.90) return CLIENTS.healer;
  return CLIENTS.stranger;
}

function generateOrder() {
  if (Math.random() < 0.20) {
    const chainOrder = tryChainOrder();
    if (chainOrder) return chainOrder;
  }

  const pool = [...state.discovered].filter(id => id !== SAGE.id);
  if (hasSage()) for (const t of TIER2) pool.push(t.id);
  if (pool.length === 0) return null;

  const potionId = pool[Math.floor(Math.random() * pool.length)];
  const def = potionDef(potionId);
  if (!def) return null;
  const client = pickClientForPotion(potionId);
  const isNeg = !!def.negative;

  const qty = Math.random() < 0.22 ? 2 : 1;
  const minQuality = Math.max(client.minQuality, Math.random() < 0.30 ? 1 : 0);

  /* ★ 大多数订单不限变种，只有炼金术士小概率指定变种 */
  let variant = 'any';
  if (client === CLIENTS.alchemist && Math.random() < 0.35) {
    const opts = ['gentle','burning','refreshing','mad','pure','mysterious'];
    variant = opts[Math.floor(Math.random() * opts.length)];
  }

  const totalTime = (65000 + Math.random() * 55000) * client.timeMult;

  let reward = Math.round(def.price * qty * 1.85 * (minQuality > 0 ? 1.45 : 1) * client.goldMult);
  if (variant !== 'standard' && variant !== 'any') reward = Math.round(reward * (1 + VARIANTS[variant].mult * 0.3));

  let repReward = Math.round((6 + def.price / 8) * client.repMult * repBonusMult());

  if (isNeg && client === CLIENTS.stranger) {
    reward = Math.round(reward * 1.4);
    repReward = -Math.abs(Math.round(5 + def.price / 15));
  }

  return {
    uid: ++state.orderUid,
    potionId, qty, minQuality, variant,
    client: Object.keys(CLIENTS).find(k => CLIENTS[k] === client),
    quote: client.quotes[Math.floor(Math.random() * client.quotes.length)],
    timeLeft: totalTime, totalTime,
    goldReward: reward, repReward,
  };
}

function tryChainOrder() {
  for (const chain of CHAINS) {
    const st = state.chainState[chain.id];
    if (!st || !st.active || st.cooldown > 0) continue;
    const step = chain.steps[st.step];
    if (!step) { st.active = false; continue; }
    if (!state.discovered.has(step.potion)) continue;
    if (getTier2(step.potion) && !hasSage()) continue;

    const client = CLIENTS[chain.client];
    const def = potionDef(step.potion);
    if (!def) continue;
    const variant = step.variant || 'any';
    const vd = variant === 'any' ? null : VARIANTS[variant];

    const totalTime = 90000 * client.timeMult;
    let reward = Math.round(def.price * step.qty * 1.95 * client.goldMult);
    if (vd && vd.mult > 1) reward = Math.round(reward * (1 + vd.mult * 0.4));
    reward += step.bonusGold || 0;
    let repReward = Math.round((8 + def.price / 6) * client.repMult * repBonusMult());
    if (def.negative) repReward = -Math.abs(repReward);
    repReward += step.bonusRep || 0;

    return {
      uid: ++state.orderUid,
      potionId: step.potion, qty: step.qty,
      minQuality: step.minQuality || 0,
      variant,
      client: chain.client, quote: step.text, chain: chain.id,
      timeLeft: totalTime, totalTime,
      goldReward: reward, repReward,
    };
  }
  return null;
}

function tickOrders(dtMs) {
  for (const cid in state.chainState) {
    const st = state.chainState[cid];
    if (st && st.cooldown > 0) st.cooldown -= dtMs;
  }
  for (let i = state.orders.length - 1; i >= 0; i--) {
    const o = state.orders[i];
    o.timeLeft -= dtMs;
    if (o.timeLeft <= 0) {
      state.orders.splice(i, 1);
      const def = potionDef(o.potionId);
      log(`📜 订单【${def ? def.name : '?'}】超时，客户失望地离开了…`, 'bad');
      if (o.chain) {
        const st = state.chainState[o.chain];
        if (st) { st.active = false; st.step = 0; }
        const chain = CHAINS.find(c => c.id === o.chain);
        if (chain) log(`💔 【${chain.title}】的委托链中断了。`, 'bad');
      }
      if (o.client === 'stranger') state.rep -= 2;
    }
  }
  state.nextOrderIn -= dtMs;
  if (state.nextOrderIn <= 0) {
    if (state.orders.length < maxOrders() && state.discovered.size > 0) {
      const o = generateOrder();
      if (o) {
        state.orders.push(o);
        const client = CLIENTS[o.client] || CLIENTS.alchemist;
        const vd = o.variant === 'any' ? null : VARIANTS[o.variant];
        const vTxt = vd && vd.name ? vd.icon + vd.name : '';
        const negTag = o.repReward < 0 ? ' ⚠️' : '';
        const def = potionDef(o.potionId);
        const chainTag = o.chain ? `【${CHAINS.find(c=>c.id===o.chain).title}】` : '';
        log(`📜 ${client.icon}${client.name}委托：${chainTag}${QUALITY[o.minQuality].name}【${vTxt}${def ? def.name : '?'}】×${o.qty}${negTag}`,
            o.repReward < 0 ? 'dark' : (o.chain ? 'sage' : 'warn'));
      }
    }
    state.nextOrderIn = 6500 + Math.random() * 5500;
  }
}

/* ============================================================
   ★ 交付：不限变种的订单会弹出变种选择
   ============================================================ */
let pendingDeliver = null;

function deliverOrder(uid) {
  const idx = state.orders.findIndex(o => o.uid === uid);
  if (idx < 0) return;
  const o = state.orders[idx];

  if (o.variant === 'any') {
    openDeliverModal(o);
  } else {
    executeDeliver(o, o.variant);
  }
}

function openDeliverModal(order) {
  const avail = [];
  for (const v of VARIANT_ORDER) {
    const arr = potSlot(order.potionId, v);
    let total = 0;
    for (let qi = order.minQuality; qi < 3; qi++) total += arr[qi];
    if (total >= order.qty) avail.push({ variant: v, count: total });
  }
  if (avail.length === 0) {
    log('库存不足，无法交付。', 'warn');
    return;
  }
  pendingDeliver = { order, avail, selected: avail[0].variant };
  renderDeliverModal();
  $('deliverModal').classList.add('show');
}

function renderDeliverModal() {
  if (!pendingDeliver) return;
  const { order, avail, selected } = pendingDeliver;
  const def = potionDef(order.potionId);
  const client = CLIENTS[order.client] || CLIENTS.alchemist;
  const q = QUALITY[order.minQuality];

  const infoEl = $('deliverOrderInfo');
  infoEl.innerHTML = `
    <div class="d-client">${client.icon}${client.name} 的委托</div>
    <div class="d-req">${order.qty}× ${q.name}+ ${def.name}${order.chain ? ' · 连续委托' : ''}</div>`;

  const row = $('deliverVariants');
  row.innerHTML = '';
  for (const item of avail) {
    const vd = VARIANTS[item.variant];
    const btn = document.createElement('button');
    btn.className = 'd-v-btn' + (selected === item.variant ? ' active' : '');
    btn.innerHTML = `${vd.name ? vd.icon + vd.name : '标准'}<span class="d-count">×${item.count}</span>`;
    btn.addEventListener('click', () => {
      pendingDeliver.selected = item.variant;
      renderDeliverModal();
    });
    row.appendChild(btn);
  }
  $('deliverConfirm').disabled = false;
}

function closeDeliverModal() {
  $('deliverModal').classList.remove('show');
  pendingDeliver = null;
}

function confirmDeliver() {
  if (!pendingDeliver) return;
  const { order, selected } = pendingDeliver;
  closeDeliverModal();
  executeDeliver(order, selected);
}

function executeDeliver(order, variant) {
  const idx = state.orders.findIndex(o => o.uid === order.uid);
  if (idx < 0) return;
  const o = state.orders[idx];

  /* 消耗：只消耗同一变种 */
  const arr = potSlot(o.potionId, variant);
  let need = o.qty;
  for (let qi = o.minQuality; qi < 3 && need > 0; qi++) {
    const use = Math.min(arr[qi], need);
    arr[qi] -= use;
    need -= use;
  }
  if (need > 0) {
    log('库存不足，无法交付。', 'warn');
    return;
  }

  /* 奖励 */
  state.gold += o.goldReward;
  state.rep += o.repReward;
  state.orders.splice(idx, 1);
  state.nextOrderIn = Math.min(state.nextOrderIn, 2500);

  const def = potionDef(o.potionId);
  const client = CLIENTS[o.client] || CLIENTS.alchemist;
  const vd = VARIANTS[variant];
  const vTxt = vd.name ? `${vd.icon}${vd.name}` : '';
  const repTxt = o.repReward >= 0 ? `+${o.repReward}🏅` : `${o.repReward}🏅`;
  log(`✅ ${client.icon}${client.name}收货【${vTxt}${def ? def.name : '?'}】，获得 ${o.goldReward}💰 ${repTxt}`,
      o.repReward < 0 ? 'dark' : 'ok');

  /* ★ 链处理 */
  if (o.chain) {
    handleChainDeliver(o, variant);
  }

  safe(render, 'render');
  safe(() => renderHeader(true), 'renderHeader');
  safe(checkRepEvents, 'checkRepEvents');
  checkAchievements();
  safe(() => saveGame(true), 'saveGame');
}

/* ============================================================
   ★ 链的交付处理（含剧情分支）
   ============================================================ */
function handleChainDeliver(order, variant) {
  const chain = CHAINS.find(c => c.id === order.chain);
  const st = state.chainState[order.chain];
  if (!chain || !st) return;

  /* 生病的妻子：根据提交变种分支剧情 */
  if (chain.id === 'sick_wife') {
    if (variant === 'gentle') {
      addNews('仁心医师', '城郊传来佳话：一位炼金术士以温和之药救治了农夫的妻子。医者仁心，众人称赞。', 'good');
      state.rep += 30;
      state.stats.goodDoctorFlag = true;
      log('📰 新闻：「仁心医师」——你的善举被传颂。', 'sage');
      log('🏅 声望 +30', 'ok');
    } else if (variant === 'mad') {
      addNews('庸医当道', '农夫之妻服药后狂性大发，大闹村舍。有医师怒斥：此乃庸医滥用癫狂之药所致！', 'bad');
      state.rep -= 25;
      state.stats.badDoctorFlag = true;
      log('📰 新闻：「庸医当道」——你的鲁莽毁了名声。', 'bad');
      log('🏅 声望 -25', 'bad');
      /* 立即结束此订单链 */
      st.active = false;
      st.step = 0;
      st.cooldown = 0;
      state.stats.chainsCompleted++;
      state.stats.chainsDone.add(order.chain);
      return;
    } else if (variant === 'burning') {
      addNews('急火攻心', '农夫的妻子服药后浑身燥热，病情反复。虽有惊无险，但村民们议论纷纷。', 'info');
      state.rep += 5;
      log('📰 新闻：「急火攻心」——虽有惊无险，但略损声名。', 'warn');
    } else {
      addNews('药到病除', '农夫的妻子服下药剂后病情好转，村里人松了口气。', 'info');
      log('📰 新闻：「药到病除」——一次平凡的救助。', 'ok');
    }
  }

  /* 发明家之梦 */
  if (chain.id === 'inventor_dream') {
    if (st.step === 0) {
      addNews('发明家的请求', '城中的发明家宣布正在研发一种前所未有的装置，并向炼金工坊求助，寻求智慧药剂。', 'info');
    } else if (st.step === 1) {
      addNews('研究突破', '发明家获得睿智药剂后，装置原型终于稳定运转。城中人议论纷纷，期待这台机器能带来什么。', 'good');
    }
  }

  /* 通用链推进 */
  st.step++;
  if (st.step >= chain.steps.length) {
    st.active = false;
    st.step = 0;
    state.stats.chainsCompleted++;
    state.stats.chainsDone.add(order.chain);
    log(`🎉 完成了【${chain.title}】的全部委托！`, 'sage');

    if (chain.id === 'plague') {
      state.gold += 500; state.rep += 80;
      log('⚕️ 瘟疫平息了，全镇的人都在感谢你。', 'sage');
      addNews('瘟疫平息', '在一位炼金术士的援助下，城中的瘟疫终于平息。医者与工坊皆被市民铭记。', 'good');
    } else if (chain.id === 'war') {
      state.gold += 1000; state.rep += 100;
      log('🛡️ 战争结束了。你的药剂拯救了无数生命。', 'sage');
      addNews('战争的终章', '边境的战事终于落幕。据传，某种药剂在战场上挽救了无数士兵的生命。', 'good');
    } else if (chain.id === 'inventor_dream') {
      state.gold += 800;
      state.rep += 120;
      addNews('伟大发明诞生', '发明家的装置终于完成！它以智慧药剂为能源，能够解析一切物质的结构。发明家称：「这不是终点，而是起点。」', 'good');
      log('🎉 【发明家之梦】全部完成！', 'sage');
      log('💰 +800　🏅 +120', 'ok');
    } else if (chain.id === 'noble_feast') {
      addNews('名门夜宴', '贵族府邸的晚宴上，一瓶月光药剂成为席间焦点。贵族们对炼金工坊的技艺赞不绝口。', 'good');
    } else if (chain.id === 'alchemist_study') {
      addNews('学术新篇', '一位炼金术士发表了关于稳定温度下雷暴药剂的研究论文，引起学界关注。', 'good');
    } else if (chain.id === 'stranger_deal') {
      addNews('夜色交易', '城中流传着关于某个神秘人从炼金工坊带走剧毒药剂的传闻。真假难辨。', 'info');
    } else if (chain.id === 'mercenary_mission') {
      addNews('佣兵凯旋', '一支佣兵小队从前线归来，据说他们靠某些药剂的力量死里逃生。', 'good');
    }
  } else {
    st.cooldown = 6000;
    log(`📖 【${chain.title}】的下一环委托即将到来……`, 'sage');
  }
}

/* ============================================================
   订单链激活
   ============================================================ */
function initChains() {
  for (const chain of CHAINS) {
    if (!state.chainState[chain.id]) state.chainState[chain.id] = { active: false, step: 0, cooldown: 0 };
  }
}
function updateChainActivation() {
  for (const chain of CHAINS) {
    const st = state.chainState[chain.id];
    if (!st || st.active || st.step > 0) continue;
    /* ★ 一次性链：已激活过就不再出现 */
    if (chain.once && state.stats.chainsActivated.has(chain.id)) continue;
    const first = chain.steps[0];
    if (state.discovered.has(first.potion) && Math.random() < 0.18) {
      st.active = true;
      st.cooldown = 2000 + Math.random() * 6000;
      state.stats.chainsActivated.add(chain.id);
      log(`📖 新的委托链【${chain.title}】出现了……`, 'sage');
      if (chain.id === 'sick_wife') {
        addNews('农夫求助', '村口的农夫神情焦急，据说他的妻子身患重病，正在寻找炼金术士帮助。', 'info');
      } else if (chain.id === 'inventor_dream') {
        addNews('发明家的请求', '城中的发明家宣布正在研发一种前所未有的装置，并向炼金工坊求助。', 'info');
      }
    }
  }
}

/* ============================================================
   升级
   ============================================================ */
function buyUpgrade(id) {
  const u = UPGRADES.find(x => x.id === id);
  if (!u) return;
  const lvl = state.upgrades[id];
  if (lvl >= u.max) return;
  const cost = Math.round(u.base * Math.pow(u.mult, lvl));
  if (state.gold < cost) { log('金币不足。', 'warn'); return; }
  state.gold -= cost;
  state.upgrades[id]++;
  log(`⬆️ 升级【${u.name}】至 Lv.${lvl + 1}`, 'ok');
  safe(renderUpgrades, 'renderUpgrades');
  safe(() => renderHeader(true), 'renderHeader');
  safe(() => saveGame(true), 'saveGame');
}

/* ============================================================
   云游商人
   ============================================================ */
function tickMerchant(dt) {
  const m = state.merchant;
  if (m.active) {
    m.timeLeft -= dt;
    if (m.timeLeft <= 0) closeMerchant(true);
    else $('mTimerBar').style.width = Math.max(0, (m.timeLeft / MERCHANT_STAY) * 100) + '%';
  } else {
    if (brew.active) return;
    m.nextIn -= dt;
    if (m.nextIn <= 0) {
      if (!trySpawnMerchant()) m.nextIn = 12000;
      else m.nextIn = 55000 + Math.random() * 30000;
    }
  }
}

function trySpawnMerchant() {
  const offer = buildMerchantOffer();
  if (!offer) return false;
  state.merchant.active = true;
  state.merchant.offer = offer;
  state.merchant.timeLeft = MERCHANT_STAY;
  state.merchant.type = offer.type;
  renderMerchant();
  merchantModal.classList.add('show');
  log(`🧙 ${offer.type.icon}${offer.type.name}敲响了工坊的门……`, 'warn');
  return true;
}

function buildMerchantOffer() {
  const type = MERCHANT_TYPES[Math.floor(Math.random() * MERCHANT_TYPES.length)];
  const candidates = [];
  for (const r of RECIPES) {
    for (const v of VARIANT_ORDER) {
      const arr = potSlot(r.id, v);
      if (arr[0]+arr[1]+arr[2] > 0) candidates.push({ id:r.id, def:r, v, arr });
    }
  }
  if (hasSage()) {
    for (const t of TIER2) {
      for (const v of VARIANT_ORDER) {
        const arr = potSlot(t.id, v);
        if (arr[0]+arr[1]+arr[2] > 0) candidates.push({ id:t.id, def:t, v, arr });
      }
    }
  }
  if (candidates.length === 0) return null;
  if (type.id === 'collector') {
    const rare = candidates.filter(c => c.v !== 'standard');
    if (rare.length > 0) { shuffle(rare); candidates.length = 0; candidates.push(...rare); }
  }
  shuffle(candidates);
  const pickCount = Math.min(candidates.length, 2 + Math.floor(Math.random() * 3));
  const chosen = candidates.slice(0, pickCount);
  const items = [];
  let totalGold = 0;
  for (const c of chosen) {
    const totalStock = c.arr[0]+c.arr[1]+c.arr[2];
    const qty = Math.min(totalStock, 1 + Math.floor(Math.random() * 3));
    let need = qty;
    const picks = [];
    let gold = 0;
    for (let qi = 0; qi < 3 && need > 0; qi++) {
      const take = Math.min(c.arr[qi], need);
      if (take > 0) {
        picks.push({ q: qi, n: take });
        gold += take * c.def.price * QUALITY[qi].mult * VARIANTS[c.v].mult * 1.7 * type.goldMult;
        need -= take;
      }
    }
    gold = Math.round(gold);
    items.push({ potionId: c.id, def: c.def, variant: c.v, picks, qty, gold });
    totalGold += gold;
  }
  let gift;
  const undiscovered = RECIPES.filter(r => !state.discovered.has(r.id));
  if (type.gift === 'recipe' && undiscovered.length > 0) {
    const r = undiscovered[Math.floor(Math.random() * undiscovered.length)];
    gift = { type: 'recipe', id: r.id };
  } else {
    gift = { type: 'gold', amount: 150 + Math.floor(Math.random() * 250) };
  }
  return { items, totalGold, gift, type };
}

function renderMerchant() {
  const o = state.merchant.offer;
  if (!o) return;
  $('mName').textContent = o.type.icon + ' ' + o.type.name;
  $('mQuote').textContent = o.type.quote;
  $('mList').innerHTML = o.items.map(it => {
    const qtxt = it.picks.map(p => `${QUALITY[p.q].name}×${p.n}`).join(' ');
    const vd = VARIANTS[it.variant];
    const vTxt = vd.name ? `<span style="color:${vd.color}">${vd.icon}${vd.name}</span>` : '';
    return `<div class="m-item">
      <span class="mi-icon">${iconHTML(it.def.icon, 1.1)}</span>
      <span class="mi-name">${vTxt}${it.def.name}</span>
      <span class="mi-qty">${it.qty}瓶 · ${qtxt}</span>
      <span class="mi-gold">+${it.gold}💰</span>
    </div>`;
  }).join('');
  $('mTotalGold').textContent = o.totalGold + ' 💰';
  if (o.gift.type === 'recipe') {
    const r = getRecipe(o.gift.id);
    $('mGift').innerHTML = `📜 附赠配方残页：<b style="color:#e0d0ff">${r.name}</b>（${r.mats.map(m => iconHTML(ING[m].icon, 1)).join('')}）`;
  } else {
    $('mGift').innerHTML = `💰 额外奉上 <b style="color:#e0d0ff">${o.gift.amount}</b> 金币`;
  }
  $('mTimerBar').style.width = '100%';
}

function closeMerchant(timeout) {
  state.merchant.active = false;
  state.merchant.offer = null;
  state.merchant.type = null;
  merchantModal.classList.remove('show');
  if (timeout) log('🧙 商人摇了摇头，消失在暮色中。', 'warn');
}

function merchantAccept() {
  const o = state.merchant.offer;
  if (!o) return;
  for (const it of o.items) {
    const arr = potSlot(it.potionId, it.variant);
    for (const p of it.picks) if (arr[p.q] < p.n) { log('库存发生变化，交易取消。', 'warn'); closeMerchant(false); return; }
  }
  for (const it of o.items) {
    const arr = potSlot(it.potionId, it.variant);
    for (const p of it.picks) arr[p.q] -= p.n;
  }
  state.gold += o.totalGold;
  state.stats.merchantDeals++;
  let msg = `🧙 ${o.type.name}收走了 ${o.items.reduce((a,b)=>a+b.qty,0)} 瓶药剂，支付 ${o.totalGold}💰。`;
  if (o.gift.type === 'recipe') {
    state.discovered.add(o.gift.id);
    const r = getRecipe(o.gift.id);
    msg += ` 并留下了【${r.name}】的配方！`;
  } else {
    state.gold += o.gift.amount;
    msg += ` 还额外给了 ${o.gift.amount}💰。`;
  }
  log(msg, 'ok');
  closeMerchant(false);
  showVariantTip();
  safe(render, 'render');
  safe(() => renderHeader(true), 'renderHeader');
  safe(checkAllUnlocked, 'checkAllUnlocked');
  safe(checkWin, 'checkWin');
  checkAchievements();
  safe(() => saveGame(true), 'saveGame');
}

$('mAccept').addEventListener('click', merchantAccept);
$('mDecline').addEventListener('click', () => { log('🧙 你婉拒了商人的收购。', 'warn'); closeMerchant(false); });

/* ============================================================
   声誉事件
   ============================================================ */
function checkRepEvents() {
  for (let i = 0; i < REP_TIERS.length; i++) {
    const t = REP_TIERS[i];
    if (t.at > 0 && state.repTier < i + 1 && state.rep >= t.at) {
      triggerRepEvent(t);
      state.repTier = i + 1;
      break;
    }
    if (t.at < 0 && state.rep <= t.at && !t._triggered) { t._triggered = true; triggerRepEvent(t, true); }
  }
}

function triggerRepEvent(tier, negative) {
  showEventBanner(`${tier.icon} ${tier.name}`, tier.kind);
  log(`【${tier.name}】${tier.kind === 'good' ? '你的名声传开了。' : '人们对你的行径议论纷纷。'}`,
      tier.kind === 'good' ? 'sage' : 'bad');
  if (tier.name === '声名狼藉') {
    const fine = Math.min(state.gold, 80);
    state.gold -= fine;
    log(`👮 卫兵上门盘问，你被迫交出 ${fine}💰 打点关系。`, 'bad');
    addNews('卫兵盘问', '卫兵上门盘问了一位声名狼藉的炼金术士，据说对方被迫交出财物以平息事端。', 'bad');
  } else if (tier.name === '不受欢迎') {
    log('🚫 村民们开始提防你，进货变得困难。', 'bad');
    addNews('人心疏离', '近日城中流传着关于某位炼金术士的负面议论，村民们对其避而远之。', 'bad');
  } else if (tier.name === '小有名气') {
    state.merchant.nextIn = Math.min(state.merchant.nextIn, 12000);
    log('📮 商人们开始主动上门拜访。', 'ok');
    addNews('名声初显', '城里人开始谈论起一位新晋炼金术士的手艺，据说他的药剂颇为可靠。', 'good');
  } else if (tier.name === '远近闻名') {
    state.gold += 200;
    log('🎁 一位匿名仰慕者送来 200💰 的谢礼。', 'ok');
    addNews('匿名谢礼', '一位匿名仰慕者为某位炼金术士送来厚礼，附言：「感谢您为艾瑟瑞亚所做的一切。」', 'good');
  } else if (tier.name === '炼金大师') {
    log('🏆 所有订单报酬提升 20%。', 'sage');
    state.upgrades.sell++;
    addNews('炼金大师', '《炼金日报》头版：某位炼金术士的技艺已臻化境，被誉为「炼金大师」。', 'good');
  } else if (tier.name === '贤者之名') {
    state.gold += 500;
    state.rep += 100;
    log('🧙 你的名字被载入炼金史册，获得 500💰 100🏅。', 'sage');
    addNews('贤者之名', '艾瑟瑞亚的炼金史册上，新添了一个名字——一位被公认为「贤者」的炼金术士。', 'good');
  }
}

/* ============================================================
   标签切换
   ============================================================ */
document.querySelectorAll('.tab').forEach(t => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    const pane = panes[t.dataset.tab];
    if (pane) pane.classList.add('active');
  });
});

/* ============================================================
   气泡特效
   ============================================================ */
function spawnBubbles(n = 8) {
  for (let i = 0; i < n; i++) {
    const b = document.createElement('div');
    b.className = 'bubble';
    b.style.left = (8 + Math.random() * 82) + '%';
    b.style.animationDelay = (Math.random() * 0.5) + 's';
    b.style.setProperty('--size', (4 + Math.random() * 8).toFixed(1) + 'px');
    bubbleLayer.appendChild(b);
    setTimeout(() => b.remove(), 2400);
  }
}

/* ============================================================
   提示 / 胜利
   ============================================================ */
function checkAllUnlocked() {
  if (allBaseUnlocked() && !hasPrimarySage()) {
    log('📖 所有基础配方已解锁……贤者之石的奥秘，正在向你招手。', 'sage');
    safe(renderGrimoire, 'renderGrimoire');
  }
  updateChainActivation();
}

let winShown = false;
function checkWin() {
  if (winShown) return;
  if (state.finalSageOwned) {
    winShown = true;
    setTimeout(() => {
      log('🏆 你已炼制出最终贤者之石，抵达炼金术的终极彼岸。', 'ultimate');
      log(`最终成绩：${state.gold}💰　声望 ${state.rep}🏅`, 'sage');
    }, 700);
  }
}

/* ============================================================
   主循环
   ============================================================ */
let lastT = performance.now();
let uiAcc = 0, orderAcc = 0, etaAcc = 0, chainAcc = 0, saveAcc = 0, newsAcc = 0;

function loop(t) {
  const dt = Math.min(t - lastT, 200);
  lastT = t;
  uiAcc += dt; orderAcc += dt; etaAcc += dt; chainAcc += dt; saveAcc += dt; newsAcc += dt;

  safe(() => tickMerchant(dt), 'tickMerchant');
  if (etaAcc >= 250) { renderMerchantEta(); etaAcc = 0; }

  if (!state.merchant.active) {
    const gm = gatherMult();
    for (const id in ING) {
      if (state.stock[id] < ING[id].max) {
        state.acc[id] += dt / (ING[id].rate / gm);
        while (state.acc[id] >= 1 && state.stock[id] < ING[id].max) {
          state.acc[id] -= 1;
          state.stock[id]++;
        }
        if (state.stock[id] >= ING[id].max) state.acc[id] = 0;
      } else state.acc[id] = 0;
    }
    if (orderAcc >= 200) {
      safe(() => tickOrders(orderAcc), 'tickOrders');
      orderAcc = 0;
      safe(renderOrders, 'renderOrders');
    }
    if (chainAcc >= 25000) {
      safe(updateChainActivation, 'updateChainActivation');
      chainAcc = 0;
    }
    /* ★ 环境新闻生成 */
    state.nextAmbientNewsIn -= dt;
    if (state.nextAmbientNewsIn <= 0) {
      safe(spawnAmbientNews, 'spawnAmbientNews');
      state.nextAmbientNewsIn = 35000 + Math.random() * 25000;
    }
  } else orderAcc = 0;

  if (uiAcc >= 100) { uiAcc = 0; safe(renderIngredients, 'renderIngredients'); }
  if (saveAcc >= 15000) { saveAcc = 0; safe(() => saveGame(true), 'saveGame'); }

  requestAnimationFrame(loop);
}

/* ============================================================
   ★ 最终炼制浮窗
   ============================================================ */
const finalCraftModal = $('finalCraftModal');

const finalCraftState = {
  variant: 'standard',
  potionId: null,
  crafting: false,
};

function openFinalCraftModal() {
  if (!state.finalSageOwned) {
    log('需要先炼制出最终贤者之石。', 'warn');
    return;
  }
  finalCraftState.crafting = false;
  finalCraftState.potionId = null;
  finalCraftModal.classList.add('show');
  renderFinalCraft();
}

function closeFinalCraftModal() {
  if (finalCraftState.crafting) return;
  finalCraftModal.classList.remove('show');
}

function renderFinalCraft() {
  if (!finalCraftModal || !finalCraftModal.classList.contains('show')) {
    if (!finalCraftState.crafting) return;
  }

  const isCrafting = finalCraftState.crafting;

  const vRow = $('fcVariants');
  if (vRow) {
    vRow.innerHTML = '';
    for (const v of VARIANT_ORDER) {
      const vd = VARIANTS[v];
      const btn = document.createElement('button');
      btn.className = 'fc-v-btn' + (finalCraftState.variant === v ? ' active' : '');
      btn.innerHTML = vd.name ? `${vd.icon}${vd.name}` : '标准';
      btn.disabled = isCrafting;
      btn.addEventListener('click', () => {
        if (finalCraftState.crafting) return;
        finalCraftState.variant = v;
        renderFinalCraft();
      });
      vRow.appendChild(btn);
    }
  }

  const pList = $('fcPotions');
  if (pList) {
    pList.innerHTML = '';
    const potions = getSageCraftPotions().filter(p => p.id !== SAGE.id);
    for (const p of potions) {
      const btn = document.createElement('button');
      btn.className = 'fc-p-btn' + (finalCraftState.potionId === p.id ? ' active' : '');
      btn.innerHTML = `${iconHTML(p.icon, 1.1)}${p.name}`;
      btn.disabled = isCrafting;
      btn.addEventListener('click', () => {
        if (finalCraftState.crafting) return;
        finalCraftState.potionId = p.id;
        renderFinalCraft();
      });
      pList.appendChild(btn);
    }
  }

  const matsEl = $('fcMaterials');
  if (matsEl) {
    if (state.cauldron.length === 0) {
      matsEl.innerHTML = '<span class="fc-mat-empty">坩埚为空，请先在材料架中投入至少 2 种材料</span>';
    } else {
      matsEl.innerHTML = state.cauldron.map(id =>
        `<span class="fc-mat">${iconHTML(ING[id].icon, 1.1)}${ING[id].name}</span>`
      ).join('');
    }
  }

  const statusEl = $('fcStatus');
  const startBtn = $('finalCraftStartBtn');
  const closeBtn = $('finalCraftClose');
  if (!statusEl || !startBtn) return;

  if (isCrafting) {
    statusEl.textContent = '最终仪式进行中……';
    startBtn.disabled = true;
    if (closeBtn) closeBtn.disabled = true;
  } else {
    if (closeBtn) closeBtn.disabled = false;
    if (!finalCraftState.potionId) {
      statusEl.textContent = '请选择药剂与变种';
      startBtn.disabled = true;
    } else if (state.cauldron.length < 2) {
      statusEl.textContent = `坩埚材料不足（${state.cauldron.length}/2）`;
      startBtn.disabled = true;
    } else {
      const vd = VARIANTS[finalCraftState.variant];
      const def = potionDef(finalCraftState.potionId);
      const vTxt = vd.name ? `${vd.icon}${vd.name}` : '标准';
      statusEl.innerHTML = `将炼制：<b>完美品质【${vTxt}】${def.name}</b><br>
        <span style="color:#8a7a62;font-size:10.5px">最终仪式必定成功 · 消耗坩埚中全部材料</span>`;
      startBtn.disabled = false;
    }
  }
}

function startFinalCraft() {
  if (!state.finalSageOwned) return;
  if (finalCraftState.crafting) return;
  if (!finalCraftState.potionId) return;
  if (state.cauldron.length < 2) return;

  finalCraftState.crafting = true;
  renderFinalCraft();

  state.cauldron = [];
  safe(renderCauldron, 'renderCauldron');
  safe(renderIngredients, 'renderIngredients');

  const progEl = $('fcProgress');
  if (progEl) {
    progEl.classList.add('show');
    const bar = progEl.querySelector('i');
    if (bar) bar.style.width = '0%';

    let p = 0;
    const speed = midSageSpeedMult();
    const tick = () => {
      if (!finalCraftState.crafting) return;
      p += 3.5 * speed;
      if (bar) bar.style.width = Math.min(100, p) + '%';
      if (p < 100) {
        setTimeout(tick, 40);
      } else {
        finishFinalCraft();
      }
    };
    setTimeout(tick, 250);
  } else {
    setTimeout(finishFinalCraft, 800);
  }
}

function finishFinalCraft() {
  const variant = finalCraftState.variant;
  const potionId = finalCraftState.potionId;

  const def = potionDef(potionId);
  if (!def) {
    finalCraftState.crafting = false;
    renderFinalCraft();
    return;
  }

  potSlot(potionId, variant)[2]++;
  state.stats.potionsBrewed++;
  state.stats.perfectBrewed++;
  state.stats.sageCraftCount++;
  state.stats.variantsSeen.add(variant);

  const vd = VARIANTS[variant];
  const vTxt = vd.name ? `${vd.icon}${vd.name}` : '';

  cauldronEl.classList.add('glow-ultimate');
  setTimeout(() => cauldronEl.classList.remove('glow-ultimate'), 2200);
  spawnBubbles(30);
  showEventBanner('🌟 最终仪式完成！', 'ultimate');
  log(`🌟✨ 最终仪式凝练出【完美·${vTxt}${def.name}】！`, 'ultimate');

  finalCraftState.crafting = false;
  finalCraftState.potionId = null;

  setTimeout(() => {
    const progEl = $('fcProgress');
    if (progEl) {
      progEl.classList.remove('show');
      const bar = progEl.querySelector('i');
      if (bar) bar.style.width = '0%';
    }
    finalCraftModal.classList.remove('show');

    safe(render, 'render');
    safe(() => renderHeader(true), 'renderHeader');
    safe(checkAchievements, 'checkAchievements');
    safe(() => saveGame(true), 'saveGame');
  }, 1400);

  renderFinalCraft();
}

$('finalCraftBtn').addEventListener('click', openFinalCraftModal);
$('finalCraftClose').addEventListener('click', closeFinalCraftModal);
$('finalCraftStartBtn').addEventListener('click', startFinalCraft);
finalCraftModal.addEventListener('click', e => {
  if (e.target === finalCraftModal) closeFinalCraftModal();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && finalCraftModal.classList.contains('show')) {
    closeFinalCraftModal();
  }
});

/* ============================================================
   ★ 更新说明浮窗
   ============================================================ */
const updateModal = $('updateModal');
const updateBody  = $('updateBody');

function openUpdateModal() {
  updateModal.classList.add('show');
  updateBody.innerHTML = '<span class="u-loading">加载中…</span>';

  fetch('assets/update.txt', { cache: 'no-store' })
    .then(r => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    })
    .then(text => {
      if (!text || !text.trim()) {
        updateBody.innerHTML = '<span class="u-loading">暂无更新说明。</span>';
        return;
      }
      updateBody.textContent = text;
    })
    .catch(err => {
      updateBody.innerHTML =
        '<span class="u-err">⚠️ 无法读取 assets/update.txt<br><br>' +
        '可能原因：<br>' +
        '· 文件不存在或路径不正确<br>' +
        '· 通过 file:// 直接打开网页（浏览器会拦截本地文件读取）<br><br>' +
        '请使用 HTTP 服务器访问，例如在项目根目录执行：<br>' +
        '　　python -m http.server 8000<br>' +
        '然后访问 http://localhost:8000/</span>';
      console.warn('读取更新说明失败：', err);
    });
}

function closeUpdateModal() {
  updateModal.classList.remove('show');
}

$('updateBtn').addEventListener('click', openUpdateModal);
$('updateClose').addEventListener('click', closeUpdateModal);
updateModal.addEventListener('click', e => {
  if (e.target === updateModal) closeUpdateModal();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && updateModal.classList.contains('show')) closeUpdateModal();
});

/* ============================================================
   ★ 交付浮窗事件
   ============================================================ */
$('deliverClose').addEventListener('click', closeDeliverModal);
$('deliverConfirm').addEventListener('click', confirmDeliver);
$('deliverModal').addEventListener('click', e => {
  if (e.target === $('deliverModal')) closeDeliverModal();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('deliverModal').classList.contains('show')) closeDeliverModal();
});

/* ============================================================
   启动
   ============================================================ */
brewBtn.addEventListener('click', startBrew);
clearBtn.addEventListener('click', clearCauldron);
scCraftBtn.addEventListener('click', startSageCraft);
$('saveBtn').addEventListener('click', () => { saveGame(false); showEventBanner('💾 进度已保存', 'good'); });
$('resetBtn').addEventListener('click', resetGame);

window.addEventListener('beforeunload', () => { if (isResetting) return; saveGame(true); });

initChains();

const loaded = loadGame();
if (loaded) {
  initChains();
  log('📂 已载入上次进度。', 'ok');
} else {
  log(`欢迎来到${WORLD.name}，学徒。`);
  log(`——${WORLD.subtitle}——`);
  log('选取 2~3 种材料投入坩埚，点击「调配」开始。');
  log('❄️🔥 投料顺序会偏移舒适区，温度控制决定药剂变种。');
  log('💫 炼制过程中，舒适区会随机漂移——留意绿色温度带。');
  log('🔮 每 100 次炼药约有 8 次会自行踏入神秘的小径。');
  log('🔮 拥有中等贤者之石后，即可在贤者指定中直接炼制"神秘的"（80% 成功率）。');
  log('✨ 连续炼出 5 瓶相同药剂，可累积"纯净"概率。贤者指定炼制同样可以触发。');
  log('💧 重炼：把已有药水送上重炼台（🔄），60% 转为提神的。');
  log('🟣 集齐初级贤者之石与完美智慧药剂，可炼制中等贤者之石。');
  log('⏩ 每拥有 1 种中等贤者之石，炼制速度 +15%（最多 +60%）。');
  log('🧬 二阶药剂的变种会继承你最近一次贤者指定所选的变种。');
  log('📜 大多数订单不限变种——提交时可以选择投入哪种，剧情会悄然改变。');
  log('📰 城中见闻会出现在《炼金日报》上——它们与你的一举一动息息相关。');
  log('🌌 唯有纯净初等 + 5 种贤者之石 + 睿智药剂 + 神秘药剂，方能成就最终贤者之石。');

  /* 开局给几条背景新闻 */
  setTimeout(() => {
    addNews('艾瑟瑞亚 · 晨间', `${WORLD.subtitle}。${WORLD.description.slice(0, 60)}…`, 'info');
    addNews('炼金日报创刊', '《炼金日报》正式创刊——本刊致力于记录艾瑟瑞亚的每一桩炼金趣闻。', 'info');
  }, 800);
}

brew.active = false;
brew.pendingRecipe = null;
brew.isSage = false;
brew.mysteriousRoll = false;
brew.isRefine = false;
brew.isSageCraft = false;
brew.sageCraftTarget = null;
brew.progress = 0;
brew.rafId = null;

render();
renderHeader(false);
requestAnimationFrame(loop);