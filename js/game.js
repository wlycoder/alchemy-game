/* ============================================================
   状态
   ============================================================ */
const SAVE_KEY = 'alchemy_save_v3';

const state = {
  gold: 40, rep: 0,
  stock:{}, acc:{},
  cauldron: [],
  discovered: new Set(),
  potions: {},
  orders: [],
  upgrades: {},
  orderUid: 0,
  nextOrderIn: 4000,
  sageVariants: new Set(),
  activeSageVariant: 'standard',
  merchant: { active:false, offer:null, timeLeft:0, nextIn:48000, type:null },
  chainState: {},
  repTier: 0,
  achievements: new Set(),
  variantTipsShown: new Set(),
  /* 纯净的连击系统 */
  streakPotion: null,      // 当前连击的药剂 id
  streakCount: 0,          // 已连续炼出的数量
  pureChance: 0.5,         // 当前纯净概率
  stats: {
    potionsBrewed: 0,
    perfectBrewed: 0,
    tier2Crafted: 0,
    chainsCompleted: 0,
    merchantDeals: 0,
    purchases: 0,
    ordersRejected: 0,
    variantsSeen: new Set(),
    chainsDone: new Set(),
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
};

/* 重置标志：防止 beforeunload 在重置时重新保存 */
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
const shelfEl=$('shelf');
const panes={
  orders:$('pane-orders'), tier2:$('pane-tier2'),
  upgrades:$('pane-upgrades'), achievements:$('pane-achievements'),
  codex:$('pane-codex'), grimoire:$('pane-grimoire')
};
const merchantModal=$('merchantModal');
const eventBanner=$('eventBanner');
const achievementPopup=$('achievementPopup');
const ingEls={};

/* ============================================================
   图标渲染：支持 emoji 和图片路径
   ============================================================ */
function iconHTML(icon, sizeEm) {
  if (icon === undefined || icon === null || icon === '') return '';
  const sz = sizeEm || 1;
  /* 图片路径识别 */
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
   工具函数
   ============================================================ */
const gatherMult = () => 1 + 0.25 * state.upgrades.gather;
const sellMult   = () => 1 + 0.15 * state.upgrades.sell;
const sageMult   = () => 1 + 0.20 * state.upgrades.sage;
const repBonusMult = () => 1 + 0.30 * state.upgrades.charm;
const maxOrders  = () => 2 + state.upgrades.orders;

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
function hasSage() { return state.sageVariants.size > 0; }

function pickSageVariantFor() {
  if (state.sageVariants.has(state.activeSageVariant)) return state.activeSageVariant;
  return VARIANT_ORDER.find(v => state.sageVariants.has(v)) || null;
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
  showEventBanner._t = setTimeout(() => {
    eventBanner.classList.remove('show');
  }, 4200);
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
  showAchievementPopup._t = setTimeout(() => {
    achievementPopup.classList.remove('show');
  }, 4000);
}

function safe(fn, label) {
  try { fn(); }
  catch (e) { console.error(`[${label}]`, e); }
}

/* ============================================================
   纯净的连击系统
   ============================================================ */
function recordBrewStreak(recipeId) {
  if (state.streakPotion === recipeId) {
    state.streakCount++;
  } else {
    state.streakPotion = recipeId;
    state.streakCount = 1;
    state.pureChance = PURE_STREAK.baseChance;
  }
}

/* 尝试掷骰纯净，返回 true 表示成功 */
function rollPure() {
  if (state.streakCount <= PURE_STREAK.required) return false;
  if (Math.random() < state.pureChance) {
    /* 成功：清零 */
    state.streakCount = 0;
    state.streakPotion = null;
    state.pureChance = PURE_STREAK.baseChance;
    return true;
  } else {
    /* 失败：概率 +10% */
    state.pureChance = Math.min(PURE_STREAK.maxChance, state.pureChance + PURE_STREAK.increment);
    return false;
  }
}

/* 判断当前是否处于连击状态（用于 UI 提示） */
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
      version: 3,
      gold: state.gold,
      rep: state.rep,
      stock: state.stock,
      acc: state.acc,
      cauldron: state.cauldron,
      discovered: [...state.discovered],
      potions: state.potions,
      orders: state.orders,
      upgrades: state.upgrades,
      orderUid: state.orderUid,
      nextOrderIn: state.nextOrderIn,
      sageVariants: [...state.sageVariants],
      activeSageVariant: state.activeSageVariant,
      merchantNextIn: state.merchant.nextIn,
      chainState: state.chainState,
      repTier: state.repTier,
      achievements: [...state.achievements],
      variantTipsShown: [...state.variantTipsShown],
      streakPotion: state.streakPotion,
      streakCount: state.streakCount,
      pureChance: state.pureChance,
      stats: {
        potionsBrewed: state.stats.potionsBrewed,
        perfectBrewed: state.stats.perfectBrewed,
        tier2Crafted: state.stats.tier2Crafted,
        chainsCompleted: state.stats.chainsCompleted,
        merchantDeals: state.stats.merchantDeals,
        purchases: state.stats.purchases,
        ordersRejected: state.stats.ordersRejected,
        variantsSeen: [...state.stats.variantsSeen],
        chainsDone: [...state.stats.chainsDone],
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
    if (!s || s.version !== 3) return false;

    state.gold = s.gold ?? 40;
    state.rep = s.rep ?? 0;
    state.stock = Object.assign({}, state.stock, s.stock || {});
    state.acc = Object.assign({}, state.acc, s.acc || {});
    state.cauldron = Array.isArray(s.cauldron) ? s.cauldron.filter(id => ING[id]) : [];
    state.discovered = new Set(s.discovered || []);
    state.potions = s.potions || {};
    state.orders = (s.orders || []).map(o => ({ ...o }));
    state.upgrades = Object.assign({}, state.upgrades, s.upgrades || {});
    state.orderUid = s.orderUid || 0;
    state.nextOrderIn = s.nextOrderIn ?? 4000;
    state.sageVariants = new Set(s.sageVariants || []);
    state.activeSageVariant = s.activeSageVariant || 'standard';
    state.merchant.nextIn = s.merchantNextIn ?? 48000;
    state.chainState = s.chainState || {};
    state.repTier = s.repTier ?? 0;
    state.achievements = new Set(s.achievements || []);
    state.variantTipsShown = new Set(s.variantTipsShown || []);
    state.streakPotion = s.streakPotion ?? null;
    state.streakCount = s.streakCount ?? 0;
    state.pureChance = s.pureChance ?? PURE_STREAK.baseChance;

    const st = s.stats || {};
    state.stats.potionsBrewed = st.potionsBrewed || 0;
    state.stats.perfectBrewed = st.perfectBrewed || 0;
    state.stats.tier2Crafted = st.tier2Crafted || 0;
    state.stats.chainsCompleted = st.chainsCompleted || 0;
    state.stats.merchantDeals = st.merchantDeals || 0;
    state.stats.purchases = st.purchases || 0;
    state.stats.ordersRejected = st.ordersRejected || 0;
    state.stats.variantsSeen = new Set(st.variantsSeen || []);
    state.stats.chainsDone = new Set(st.chainsDone || []);
    return true;
  } catch (e) {
    console.warn('读档失败', e);
    return false;
  }
}

/* ★ 修复：重置前设置 isResetting 标志，防止 beforeunload 重新保存 */
function resetGame() {
  if (!confirm('确定要重置游戏吗？所有进度将被清除。')) return;
  isResetting = true;
  try { localStorage.removeItem(SAVE_KEY); } catch(e){}
  try {
    location.reload();
  } catch (e) {
    isResetting = false;
    location.href = location.pathname + '?_r=' + Date.now();
  }
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

/* ============================================================
   变种提示
   ============================================================ */
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
    el.btn.disabled = (n <= 0) || brew.active;
    el.bar.style.width = (n >= ING[id].max) ? '0%' : Math.min(100, state.acc[id] * 100) + '%';
    el.buy.classList.toggle('off', n >= ING[id].max || brew.active);
  }
}

function renderCauldron() {
  slots.forEach((s, i) => {
    const id = state.cauldron[i];
    s.innerHTML = '';
    if (id && ING[id]) {
      s.innerHTML = iconHTML(ING[id].icon, 1.1) + `<span class="order-num">${i + 1}</span>`;
      s.classList.add('filled');
      s.title = ING[id].name;
    } else {
      s.classList.remove('filled');
      s.title = '';
    }
  });

  if (state.cauldron.length === 0) {
    liquidEl.style.background = 'linear-gradient(180deg,#33334a,#181822)';
    liquidEl.style.height = '22%';
    liquidEl.style.boxShadow = '0 -6px 22px rgba(120,180,255,.15) inset';
  } else {
    const avg = state.cauldron.reduce((a,id) => a + (HUE[id] || 200), 0) / state.cauldron.length;
    liquidEl.style.background = `linear-gradient(180deg,hsl(${avg} 75% 58%),hsl(${avg} 85% 32%))`;
    liquidEl.style.height = (22 + state.cauldron.length * 13) + '%';
    liquidEl.style.boxShadow = `0 -8px 30px hsla(${avg},90%,60%,.5) inset`;
  }

  brewBtn.disabled = brew.active || state.cauldron.length < 2;
  clearBtn.disabled = brew.active || state.cauldron.length === 0;
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
    div.className = 'order' +
      (ready ? ' ready' : '') +
      (ratio < 0.28 ? ' urgent' : '') +
      (client.dark ? ' dark' : '') +
      (o.chain ? ' chain ' + chainClass : '');

    const vLabel = vd && vd.name
      ? `<span style="color:${vd.color}">${vd.icon}${vd.name}</span>`
      : (variant === 'any'
          ? '<span style="color:#6f6a8a;font-size:10.5px">［任意变种］</span>'
          : '');

    const repTxt = o.repReward >= 0
      ? `+${o.repReward}🏅`
      : `<span class="neg">${o.repReward}🏅</span>`;

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
      refreshing: '待在舒适区的时间占比超过 62%。',
      mad: '频繁逃出舒适区（≥4 次）就会癫狂。',
      pure: '连续炼出 5 瓶相同药剂后，下一瓶有 50% 概率成为纯净；每次失败概率 +10%，成功则清零重来；换成其他药剂则连击中断。',
      mysterious: '传说中，每 100 次炼药约有 3 次会自行踏入这条小径——可遇不可求。',
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
  s2.textContent = '委 托 链 传 闻';
  pane.appendChild(s2);

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
    pane.innerHTML = '<div class="shelf-empty">🔒 需要先获得【初级贤者之石】<br>才能开启二次加工之道。<br><br>将已炼成的药剂投入坩埚，<br>以贤者之石之力再度淬炼。</div>';
    return;
  }
  pane.innerHTML = '';
  for (const t of TIER2) {
    const can = canCraftTier2(t);
    let totalStock = 0;
    for (const v of VARIANT_ORDER) totalStock += potTotal(t.id, v);

    const div = document.createElement('div');
    div.className = 'upg t2' + (can ? ' ready' : '');
    const matsList = t.mats.map(m => ING[m].icon + ING[m].name).join(' + ');
    const baseList = t.base.map(b => { const d = potionDef(b); return d.icon + d.name; }).join(' + ');
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
  if (hasSage()) {
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
}

function renderShelf() {
  shelfEl.innerHTML = '';
  let any = false;

  function addGroup(def, t2) {
    for (const v of VARIANT_ORDER) {
      const arr = potSlot(def.id, v);
      const total = arr[0]+arr[1]+arr[2];
      if (total === 0) continue;
      any = true;
      const vd = VARIANTS[v];

      const item = document.createElement('div');
      item.className = 'shelf-item' + (t2 ? ' t2' : '');
      if (v === 'mysterious') {
        item.style.borderColor = 'rgba(177,108,255,.7)';
        item.style.boxShadow = '0 0 14px rgba(177,108,255,.4)';
      } else if (v === 'pure') {
        item.style.borderColor = 'rgba(245,215,110,.6)';
        item.style.boxShadow = '0 0 12px rgba(245,215,110,.35)';
      }
      let badges = '';
      for (let i = 0; i < 3; i++) {
        if (arr[i] > 0) {
          badges += `<button class="badge ${QUALITY[i].key}" data-q="${i}" data-v="${v}">${QUALITY[i].name[0]} ${arr[i]}</button>`;
        }
      }
      const vTxt = vd.name ? `<span class="s-variant" style="color:${vd.color}">${vd.icon}${vd.name}</span>` : '';
      item.innerHTML = `
        <span class="s-icon">${iconHTML(def.icon, 1.1)}</span>
        <span class="s-name">${def.name}</span>
        ${vTxt}
        <div class="s-badges">${badges}</div>`;

      item.querySelectorAll('.badge').forEach(b => {
        b.addEventListener('click', () => sellPotion(def.id, b.dataset.v, +b.dataset.q));
      });
      shelfEl.appendChild(item);
    }
  }

  for (const r of RECIPES) addGroup(r, false);
  if (hasSage()) for (const t of TIER2) addGroup(t, true);

  if (!any) shelfEl.innerHTML = '<div class="shelf-empty">还没有库存药水。</div>';
}

function renderBrewUI() {
  const t = brew.temp;
  heatFill.style.width = t + '%';
  heatMarker.style.left = t + '%';

  const inZone = t >= brew.zoneMin && t <= brew.zoneMax;
  const overheat = t > 92;

  if (overheat) {
    heatFill.style.background = 'linear-gradient(90deg,rgba(255,80,80,.5),rgba(220,40,40,.8))';
  } else if (inZone) {
    heatFill.style.background = 'linear-gradient(90deg,rgba(126,231,135,.5),rgba(63,185,80,.75))';
  } else {
    heatFill.style.background = 'linear-gradient(90deg,rgba(255,213,79,.45),rgba(255,152,0,.65))';
  }

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

  /* 提示行：加入连击信息 */
  let hintHTML = `均温 <b style="color:#e0d0ff">${avg.toFixed(0)}°</b> · 逃离舒适区 <b style="color:#ffb677">${brew.escapeCount}</b> 次`;
  if (brew.pendingRecipe && isPrimaryRecipe(brew.pendingRecipe.id)) {
    if (isInStreak(brew.pendingRecipe.id)) {
      hintHTML += ` · <b style="color:#f5d76e">连击×${state.streakCount} 纯净 ${(state.pureChance*100).toFixed(0)}%</b>`;
    } else if (state.streakPotion === brew.pendingRecipe.id && state.streakCount > 0) {
      hintHTML += ` · <b style="color:#b8a9e8">连击 ${state.streakCount}/${PURE_STREAK.required}</b>`;
    }
  }
  brewHint.innerHTML = hintHTML;
}

function renderSageSelector() {
  if (!hasSage()) { sageSelector.classList.remove('show'); return; }
  sageSelector.classList.add('show');
  sageRow.innerHTML = '';
  for (const v of VARIANT_ORDER) {
    const vd = VARIANTS[v];
    const owned = state.sageVariants.has(v);
    const b = document.createElement('button');
    b.className = 'ss-btn' + (state.activeSageVariant === v ? ' active' : '');
    b.disabled = !owned;
    b.innerHTML = vd.name ? `${vd.icon}${vd.name}` : '标准';
    b.title = owned ? '自动炼制使用此变种' : '尚未拥有此变种的贤者之石';
    b.addEventListener('click', () => {
      state.activeSageVariant = v;
      renderSageSelector();
      safe(() => saveGame(true), 'saveGame');
    });
    sageRow.appendChild(b);
  }
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
  safe(() => renderHeader(false), 'renderHeader');
  safe(renderMerchantEta, 'renderMerchantEta');
}

/* ============================================================
   材料交互
   ============================================================ */
function addToCauldron(id) {
  if (brew.active) return;
  if (state.stock[id] <= 0) { log(`${ING[id].name}不足，正在凝聚中…`, 'warn'); return; }
  if (state.cauldron.length >= 3) { log('坩埚已满，请先调配或清空。', 'warn'); return; }
  if (state.cauldron.includes(id)) { log('同一种材料只能投放一份。', 'warn'); return; }

  state.stock[id]--;
  state.cauldron.push(id);
  spawnBubbles(5);
  log(`投入了 ${ING[id].name}（第${state.cauldron.length}份）`);
  safe(renderCauldron, 'renderCauldron');
  safe(renderIngredients, 'renderIngredients');
  safe(() => saveGame(true), 'saveGame');
}

function clearCauldron() {
  if (brew.active) return;
  for (const id of state.cauldron) {
    if (ING[id]) state.stock[id] = Math.min(ING[id].max, state.stock[id] + 1);
  }
  if (state.cauldron.length) log('材料已全部取回。');
  state.cauldron = [];
  safe(renderCauldron, 'renderCauldron');
  safe(renderIngredients, 'renderIngredients');
  safe(() => saveGame(true), 'saveGame');
}

function buyIngredient(id) {
  const d = ING[id];
  if (brew.active) return;
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
   变种判定（纯净已抽出，由连击系统处理）
   ============================================================ */
function predictVariant(avgTemp, escapeCount, inZoneRatio, quality) {
  const T = VARIANT_THRESHOLDS;
  if (avgTemp < T.gentleAvgTemp) return 'gentle';
  if (avgTemp > T.burningAvgTemp) return 'burning';
  if (escapeCount >= T.madEscapes) return 'mad';
  if (inZoneRatio > T.refreshingRatio) return 'refreshing';
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

  if (Math.abs(newCenter - brew.zoneCenter) < 4) {
    scheduleNextDrift(false);
    return;
  }

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
   炼药
   ============================================================ */
function startBrew() {
  if (brew.active) return;
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

  brew.mysteriousRoll = Math.random() < MYSTERIOUS_CHANCE;

  if (hasSage() && !isSage) {
    autoBrew(recipe);
    return;
  }

  startManualBrew(recipe, isSage);
}

function startManualBrew(recipe, isSage) {
  brew.active = true;
  brew.isSage = isSage;
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
  if (isIn) pr = 38 * sageMult();
  else if (overheat) pr = -55;
  else pr = -20;
  brew.progress = Math.max(0, Math.min(100, brew.progress + pr * dt));

  if (isIn && Math.random() < 0.35) spawnBubbles(1);

  safe(renderBrewUI, 'renderBrewUI');
  if (brew.progress >= 100) { finishBrew(); return; }
  brew.rafId = requestAnimationFrame(brewLoop);
}

/* ============================================================
   ★ 炼药完成（含连击/纯净系统）★
   ============================================================ */
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

  /* 立刻清理 brew 状态 */
  brew.active = false;
  if (brew.rafId) {
    try { cancelAnimationFrame(brew.rafId); } catch(e){}
    brew.rafId = null;
  }
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

    /* ========================================================
       决定变种：
       1. 神秘（3%）优先级最高
       2. 纯净（连击系统）次之（仅一级配方）
       3. 温度/舒适区决定的其他变种
       ======================================================== */
    let variant;

    /* 更新连击（仅一级配方；贤者之石不参与连击系统） */
    if (!isSage && isPrimaryRecipe(recipe.id)) {
      recordBrewStreak(recipe.id);
    }

    if (mysteriousRoll) {
      variant = 'mysterious';
    } else if (!isSage && isPrimaryRecipe(recipe.id) && rollPure()) {
      variant = 'pure';
    } else {
      variant = predictVariant(avgTemp, escapeCount, ratio, qi);
    }

    const vd = VARIANTS[variant];

    /* 视觉反馈 */
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
      if (variant === 'mysterious') {
        log(`🔮✨ 不可思议——你炼出了【${vName}初级贤者之石】！`, 'mystery');
      } else {
        log(`🔴 炼成了【${vName}初级贤者之石】！`, 'sage');
      }
      log('⚗️ 该变种药剂现在可以自动炼制。', 'sage');
      state.gold += 200;
      state.rep += 50;
      if (!state.activeSageVariant || !state.sageVariants.has(state.activeSageVariant)) {
        state.activeSageVariant = variant;
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

      /* 连击提示 */
      if (isPrimaryRecipe(recipe.id)) {
        if (isInStreak(recipe.id)) {
          log(`📈 连击 ×${state.streakCount}　下次纯净概率 ${(state.pureChance*100).toFixed(0)}%`, 'warn');
        }
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

/* ============================================================
   ★ 贤者之石自动炼药（也接入连击系统）
   ============================================================ */
function autoBrew(recipe) {
  const sageVar = pickSageVariantFor();
  if (!sageVar) { startManualBrew(recipe, false); return; }

  brew.active = true;
  brew.isSage = false;
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

      /* 更新连击 */
      if (isPrimaryRecipe(recipe.id)) {
        recordBrewStreak(recipe.id);
      }

      /* 决定变种 */
      let variant;
      if (mysteriousRoll) {
        variant = 'mysterious';
      } else if (isPrimaryRecipe(recipe.id) && rollPure()) {
        variant = 'pure';
      } else {
        variant = sageVar;
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
      if (variant === 'mysterious') {
        log(`🔮✨ 贤者之石凝练出【完美·${vTxt}${recipe.name}】——神秘降临！`, 'mystery');
      } else if (variant === 'pure') {
        log(`✨ 连击达成！贤者之石凝练出【完美·${vTxt}${recipe.name}】`, 'pure');
      } else if (isNew) {
        state.gold += 30;
        state.rep += 15;
        log(`✨ 首次调配出【完美·${vTxt}${recipe.name}】！奖励 30💰 15🏅`, 'ok');
        checkAllUnlocked();
      } else {
        state.rep += 2;
        log(`贤者之石凝练出【完美·${vTxt}${recipe.name}】`, 'ok');
      }

      /* 连击提示 */
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
   二级药剂加工
   ============================================================ */
function craftTier2(t) {
  if (!hasSage()) return;
  if (!canCraftTier2(t)) { log('材料或药剂不足，无法加工。', 'warn'); return; }

  let consumedVariant = 'standard';
  let foundBase = false;

  for (const b of t.base) {
    let picked = null;
    for (const v of VARIANT_ORDER) {
      if (potTotal(b, v) > 0) { picked = v; break; }
    }
    if (!picked) continue;
    if (!foundBase) { consumedVariant = picked; foundBase = true; }
    const arr = potSlot(b, picked);
    for (let qi = 0; qi < 3; qi++) if (arr[qi] > 0) { arr[qi]--; break; }
  }

  for (const m of t.mats) state.stock[m]--;

  let outVariant = consumedVariant;
  if (outVariant === 'standard' && Math.random() < 0.18) outVariant = 'pure';

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
  const chainOrder = tryChainOrder();
  if (chainOrder) return chainOrder;

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

  let variant = 'any';
  if (client === CLIENTS.alchemist && Math.random() < 0.65) {
    const opts = ['gentle','burning','refreshing','mad','pure','mysterious'];
    variant = opts[Math.floor(Math.random() * opts.length)];
  }

  const totalTime = (65000 + Math.random() * 55000) * client.timeMult;

  let reward = Math.round(def.price * qty * 1.85 * (minQuality > 0 ? 1.45 : 1) * client.goldMult);
  if (variant !== 'standard' && variant !== 'any') {
    reward = Math.round(reward * (1 + VARIANTS[variant].mult * 0.3));
  }

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
    const variant = step.variant || 'standard';
    const vd = VARIANTS[variant];

    const totalTime = 90000 * client.timeMult;
    let reward = Math.round(def.price * step.qty * 1.95 * client.goldMult);
    if (variant !== 'standard') reward = Math.round(reward * (1 + vd.mult * 0.4));
    reward += step.bonusGold || 0;
    let repReward = Math.round((8 + def.price / 6) * client.repMult * repBonusMult());
    if (def.negative) repReward = -Math.abs(repReward);
    repReward += step.bonusRep || 0;

    return {
      uid: ++state.orderUid,
      potionId: step.potion, qty: step.qty,
      minQuality: step.minQuality || 0,
      variant,
      client: chain.client,
      quote: step.text,
      chain: chain.id,
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

function deliverOrder(uid) {
  const idx = state.orders.findIndex(o => o.uid === uid);
  if (idx < 0) return;
  const o = state.orders[idx];

  let need = o.qty;
  const taken = [];

  if (o.variant === 'any') {
    for (let qi = o.minQuality; qi < 3 && need > 0; qi++) {
      for (const v of VARIANT_ORDER) {
        if (need <= 0) break;
        const arr = potSlot(o.potionId, v);
        const use = Math.min(arr[qi], need);
        if (use > 0) { taken.push({ v, qi, n: use }); need -= use; }
      }
    }
    if (need > 0) { log('库存不足，无法交付。', 'warn'); return; }
    for (const t of taken) potSlot(o.potionId, t.v)[t.qi] -= t.n;
  } else {
    const arr = potSlot(o.potionId, o.variant);
    for (let qi = o.minQuality; qi < 3 && need > 0; qi++) {
      const use = Math.min(arr[qi], need);
      if (use > 0) taken.push({ qi, n: use });
      need -= use;
    }
    if (need > 0) { log('库存不足，无法交付。', 'warn'); return; }
    for (const t of taken) arr[t.qi] -= t.n;
  }

  state.gold += o.goldReward;
  state.rep += o.repReward;
  state.orders.splice(idx, 1);
  state.nextOrderIn = Math.min(state.nextOrderIn, 2500);

  const def = potionDef(o.potionId);
  const client = CLIENTS[o.client] || CLIENTS.alchemist;
  const repTxt = o.repReward >= 0 ? `+${o.repReward}🏅` : `${o.repReward}🏅`;
  log(`✅ ${client.icon}${client.name}收货【${def ? def.name : '?'}】，获得 ${o.goldReward}💰 ${repTxt}`,
      o.repReward < 0 ? 'dark' : 'ok');

  if (o.chain) {
    const chain = CHAINS.find(c => c.id === o.chain);
    const st = state.chainState[o.chain];
    if (chain && st) {
      st.step++;
      if (st.step >= chain.steps.length) {
        st.active = false;
        st.step = 0;
        state.stats.chainsCompleted++;
        state.stats.chainsDone.add(o.chain);
        log(`🎉 完成了【${chain.title}】的全部委托！`, 'sage');
        if (chain.id === 'plague') {
          state.gold += 500;
          state.rep += 80;
          log('⚕️ 瘟疫平息了，全镇的人都在感谢你。', 'sage');
        } else if (chain.id === 'war') {
          state.gold += 1000;
          state.rep += 100;
          log('🛡️ 战争结束了。你的药剂拯救了无数生命。', 'sage');
        }
      } else {
        st.cooldown = 6000;
        log(`📖 【${chain.title}】的下一环委托即将到来……`, 'sage');
      }
    }
  }

  safe(render, 'render');
  safe(() => renderHeader(true), 'renderHeader');
  safe(checkRepEvents, 'checkRepEvents');
  checkAchievements();
  safe(() => saveGame(true), 'saveGame');
}

/* ============================================================
   订单链激活
   ============================================================ */
function initChains() {
  for (const chain of CHAINS) {
    if (!state.chainState[chain.id]) {
      state.chainState[chain.id] = { active: false, step: 0, cooldown: 0 };
    }
  }
}
function updateChainActivation() {
  for (const chain of CHAINS) {
    const st = state.chainState[chain.id];
    if (!st || st.active || st.step > 0) continue;
    const first = chain.steps[0];
    if (state.discovered.has(first.potion) && Math.random() < 0.5) {
      st.active = true;
      st.cooldown = 2000 + Math.random() * 6000;
      log(`📖 新的委托链【${chain.title}】出现了……`, 'sage');
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
    if (rare.length > 0) {
      shuffle(rare);
      candidates.length = 0;
      candidates.push(...rare);
    }
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
    for (const p of it.picks) {
      if (arr[p.q] < p.n) { log('库存发生变化，交易取消。', 'warn'); closeMerchant(false); return; }
    }
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
$('mDecline').addEventListener('click', () => {
  log('🧙 你婉拒了商人的收购。', 'warn');
  closeMerchant(false);
});

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
    if (t.at < 0 && state.rep <= t.at && !t._triggered) {
      t._triggered = true;
      triggerRepEvent(t, true);
    }
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
  } else if (tier.name === '不受欢迎') {
    log('🚫 村民们开始提防你，进货变得困难。', 'bad');
  } else if (tier.name === '小有名气') {
    state.merchant.nextIn = Math.min(state.merchant.nextIn, 12000);
    log('📮 商人们开始主动上门拜访。', 'ok');
  } else if (tier.name === '远近闻名') {
    state.gold += 200;
    log('🎁 一位匿名仰慕者送来 200💰 的谢礼。', 'ok');
  } else if (tier.name === '炼金大师') {
    log('🏆 所有订单报酬提升 20%。', 'sage');
    state.upgrades.sell++;
  } else if (tier.name === '贤者之名') {
    state.gold += 500;
    state.rep += 100;
    log('🧙 你的名字被载入炼金史册，获得 500💰 100🏅。', 'sage');
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
  if (allBaseUnlocked() && !hasSage()) {
    log('📖 所有基础配方已解锁……贤者之石的奥秘，正在向你招手。', 'sage');
    safe(renderGrimoire, 'renderGrimoire');
  }
  updateChainActivation();
}

let winShown = false;
function checkWin() {
  if (winShown) return;
  if (hasSage() && allBaseUnlocked() && state.sageVariants.size >= 3) {
    winShown = true;
    setTimeout(() => {
      log('🏆 你已掌握贤者之石的多重变种，抵达炼金术的巅峰。', 'sage');
      log(`最终成绩：${state.gold}💰　声望 ${state.rep}🏅`, 'sage');
    }, 700);
  }
}

/* ============================================================
   主循环
   ============================================================ */
let lastT = performance.now();
let uiAcc = 0, orderAcc = 0, etaAcc = 0, chainAcc = 0, saveAcc = 0;

function loop(t) {
  const dt = Math.min(t - lastT, 200);
  lastT = t;
  uiAcc += dt; orderAcc += dt; etaAcc += dt; chainAcc += dt; saveAcc += dt;

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

    if (chainAcc >= 15000) {
      safe(updateChainActivation, 'updateChainActivation');
      chainAcc = 0;
    }
  } else {
    orderAcc = 0;
  }

  if (uiAcc >= 100) { uiAcc = 0; safe(renderIngredients, 'renderIngredients'); }

  if (saveAcc >= 15000) {
    saveAcc = 0;
    safe(() => saveGame(true), 'saveGame');
  }

  requestAnimationFrame(loop);
}

/* ============================================================
   启动
   ============================================================ */
brewBtn.addEventListener('click', startBrew);
clearBtn.addEventListener('click', clearCauldron);
$('saveBtn').addEventListener('click', () => { saveGame(false); showEventBanner('💾 进度已保存', 'good'); });
$('resetBtn').addEventListener('click', resetGame);

/* ★ 修复：重置时阻止自动保存覆盖 */
window.addEventListener('beforeunload', () => {
  if (isResetting) return;
  saveGame(true);
});

initChains();

const loaded = loadGame();
if (loaded) {
  initChains();
  log('📂 已载入上次进度。', 'ok');
} else {
  log('欢迎来到炼金工坊，学徒。');
  log('选取 2~3 种材料投入坩埚，点击「调配」开始。');
  log('❄️🔥 投料顺序会偏移舒适区，温度控制决定药剂变种。');
  log('💫 炼制过程中，舒适区会随机漂移——留意绿色温度带。');
  log('🔮 每 100 次炼药约有 3 次会自行踏入神秘的小径。');
  log('✨ 连续炼出 5 瓶相同药剂，可累积"纯净"概率。');
  log('🧙 与云游商人成交后会揭示一种变种的制作秘诀。');
  log('📖 手册页可查看已知变种与委托链传闻。');
  log('🔴 解锁全部配方后，贤者之石将现世。');
}

/* 启动时清理炼药残留状态 */
brew.active = false;
brew.pendingRecipe = null;
brew.isSage = false;
brew.mysteriousRoll = false;
brew.progress = 0;
brew.rafId = null;

render();
renderHeader(false);
requestAnimationFrame(loop);