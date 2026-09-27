/* ============================================================
   数据定义（纯静态数据，无副作用）
   ============================================================ */

const ING = {
  herb:     { name:'草药',     icon:'🌿', rate:2600, max:5, price:12, temp:'cold' },
  water:    { name:'泉水',     icon:'💧', rate:2000, max:5, price:12, temp:'cold' },
  mushroom: { name:'蘑菇',     icon:'🍄', rate:3400, max:5, price:14, temp:'neutral' },
  fire:     { name:'火之精华', icon:'🔥', rate:4600, max:4, price:25, temp:'hot' },
  ice:      { name:'冰晶',     icon:'❄️', rate:4600, max:4, price:25, temp:'cold' },
  thunder:  { name:'雷石',     icon:'⚡', rate:6200, max:3, price:32, temp:'hot' },
  moon:     { name:'月光草',   icon:'🌙', rate:6200, max:3, price:32, temp:'cold' },
  sulfur:   { name:'硫磺',     icon:'./assets/texture/materials/sulfur.png', rate:7600, max:3, price:42, temp:'hot' },
  crystal:  { name:'水晶',     icon:'💎', rate:8000, max:3, price:46, temp:'neutral' },
  phoenix:  { name:'凤凰羽',   icon:'./assets/texture/materials/feather.png', rate:9500, max:2, price:60, temp:'hot' },
};

const VARIANTS = {
  standard:   { name:'',     icon:'',  color:'#9aa0a6', mult:1.0 },
  gentle:     { name:'温和的', icon:'❄️', color:'#7ee787', mult:1.5 },
  burning:    { name:'炽热的', icon:'🔥', color:'#ff7b72', mult:1.5 },
  refreshing: { name:'提神的', icon:'💧', color:'#5aa9ff', mult:1.8 },
  mad:        { name:'疯狂的', icon:'🌀', color:'#c9b6ff', mult:2.2 },
  pure:       { name:'纯净的', icon:'✨', color:'#f5d76e', mult:3.0 },
  mysterious: { name:'神秘的', icon:'🔮', color:'#b16cff', mult:4.5 },
};
const VARIANT_ORDER = ['standard','gentle','burning','refreshing','mad','pure','mysterious'];

const SAGE_ALLOWED_VARIANTS = ['standard', 'gentle', 'burning', 'mad'];

const MID_SAGE = {
  name: '中等贤者之石',
  icon: '🟣',
  price: 2000,
  failChance: 0.3,
};

const PURE_SAGE = {
  name: '纯净的初等贤者之石',
  icon: '💠',
  price: 5000,
};

const FINAL_SAGE = {
  name: '最终贤者之石',
  icon: '🌌',
  price: 20000,
};

const SAGE_CRAFT = {
  minMaterials: 2,
  finalSageMysteryChance: 0.8,
};

const MID_SAGE_SPEED = {
  perStone: 0.15,
  max: 0.6,
};

/* ============================================================
   ★ 世界观
   ============================================================ */
const WORLD = {
  name: '艾瑟瑞亚',
  subtitle: '群山环抱的炼金之城',
  description:
    '艾瑟瑞亚坐落于两条灵脉交汇的峡谷。泉水含银，矿石含金，月光草在满月之夜遍地开花。' +
    '在这座城市里，炼金术不只是技艺，更是一种信仰——火与水，是万物之始；贤者之石，是通往真理的阶梯。' +
    '而每一位药剂师的声誉，都记录在城中的闲谈之上，被传颂，或被鞭挞。',
  motto: '火与水，是万物之始；声誉如薄冰，行之慎之。',
};

/* ============================================================
   ★ 环境新闻池
   ============================================================ */
const AMBIENT_NEWS = {
  good: [
    { title:'城中最热的话题', text:'城中最近有了一位口碑极佳的药剂师，贵族与商会皆争相拜访。', kind:'good' },
    { title:'供不应求', text:'近来工坊的药水供不应求，市民排起长队，只为求购一瓶良药。', kind:'good' },
    { title:'月华草丰收', text:'满月之夜过后，月光草在城郊遍地盛开，采集者们欣喜若狂。', kind:'good' },
    { title:'贤者传闻', text:'有传言称，某位炼金术士正踏上贤者之路，或将成为数十年来的第一人。', kind:'good' },
  ],
  neutral: [
    { title:'城郊集市', text:'城郊集市熙熙攘攘，商人们兜售着各式草药与矿石。', kind:'info' },
    { title:'灵脉微涌', text:'近日灵脉轻微涌动，采集者称泉水品质略有提升。', kind:'info' },
    { title:'学徒招募', text:'炼金公会发布公告，正在招募新的学徒。', kind:'info' },
    { title:'夜色安宁', text:'入夜后城中一片寂静，唯有工坊的炉火微微跃动。', kind:'info' },
  ],
  bad: [
    { title:'人心惶惶', text:'近日城中流言四起，市民们对某些药剂师避之不及。', kind:'bad' },
    { title:'公会警告', text:'炼金公会发出警告：近期有药剂师涉嫌滥用癫狂之药，扰乱了城中秩序。', kind:'bad' },
    { title:'卫兵盘查', text:'卫兵在城中加强了巡逻，据说正在追查一批来路不明的药剂。', kind:'bad' },
    { title:'矿区枯竭', text:'硫磺矿区传出消息，矿工们的挖掘日益艰难，物价随之上涨。', kind:'bad' },
  ],
};

const RECIPES = [
  { id:'heal',     name:'治疗药水', icon:'🧪', price:50,  mats:['herb','water'],               hint:'植物与水，生命之始' },
  { id:'strength', name:'力量药剂', icon:'💪', price:60,  mats:['mushroom','fire'],            hint:'火光炙烤着阴暗的菌类' },
  { id:'frost',    name:'冰霜药剂', icon:'🧊', price:55,  mats:['ice','water'],                hint:'水与冰的共鸣' },
  { id:'acid',     name:'酸液',     icon:'🧫', price:45,  mats:['sulfur','water'],             hint:'硫磺没入清泉' },
  { id:'storm',    name:'雷暴药剂', icon:'🌩️', price:70,  mats:['thunder','fire'],             hint:'天雷引燃烈火' },
  { id:'moonlight',name:'月光药剂', icon:'🌙', price:65,  mats:['moon','water'],               hint:'月光沉入清泉' },
  { id:'static',   name:'静电药剂', icon:'🔋', price:60,  mats:['thunder','ice'],              hint:'雷霆冻结成霜' },
  { id:'invis',    name:'隐身药水', icon:'./assets/texture/potion/invisibility.png', price:80, mats:['moon','ice'], hint:'寒冰中的月影' },
  { id:'poison',   name:'剧毒药剂', icon:'☠️', price:75,  mats:['mushroom','sulfur'],          hint:'菌类与硫磺的恶意', negative:true },
  { id:'wisdom',   name:'智慧药剂', icon:'📘', price:95,  mats:['crystal','moon'],             hint:'水晶映照月华，启迪心智' },
  { id:'vitality', name:'活力药剂', icon:'💗', price:110, mats:['phoenix','herb'],             hint:'凤凰羽与草药，生生不息' },
  { id:'elixir',   name:'万灵药',   icon:'✨', price:150, mats:['herb','mushroom','water'],   hint:'草药、菌菇与泉水，传说之药' },
  { id:'dragon',   name:'巨龙之血', icon:'🐉', price:180, mats:['fire','thunder','mushroom'], hint:'雷霆、烈火与菌类之怒' },
];

const SAGE = {
  id:'philo', name:'初级贤者之石', icon:'🔴', price:500,
  mats:['fire','sulfur','moon'],
  hint:'火、硫磺与月光，贤者的终极奥秘',
};

const TIER2 = [
  { id:'t2heal',     name:'高等治疗药水', icon:'🩹', price:230, base:['heal'],              mats:['moon','herb'] },
  { id:'t2strength', name:'泰坦之力药剂', icon:'🦾', price:210, base:['strength'],          mats:['sulfur'] },
  { id:'t2frost',    name:'绝对零度药剂', icon:'🧊', price:220, base:['frost'],             mats:['thunder'] },
  { id:'t2acid',     name:'王水',         icon:'⚗️', price:280, base:['acid'],              mats:['sulfur','fire'] },
  { id:'t2storm',    name:'天罚药剂',     icon:'🌩️', price:260, base:['storm'],             mats:['fire'] },
  { id:'t2moon',     name:'月影药剂',     icon:'🌌', price:240, base:['moonlight'],         mats:['ice'] },
  { id:'t2invis',    name:'虚无之影',     icon:'🫥', price:300, base:['invis'],             mats:['moon'], negative:true },
  { id:'t2poison',   name:'九头蛇毒',     icon:'🐍', price:290, base:['poison'],            mats:['mushroom','sulfur'], negative:true },
  { id:'t2wisdom',   name:'睿智药剂',     icon:'🔮', price:320, base:['wisdom'],            mats:['crystal'] },
  { id:'t2vitality', name:'凤凰之血',     icon:'🪶', price:340, base:['vitality'],          mats:['phoenix','fire'] },
  { id:'t2blizzard', name:'暴风雪药剂',   icon:'🌨️', price:320, base:['frost','storm'],     mats:[] },
  { id:'t2star',     name:'星辰隐身药剂', icon:'✨', price:380, base:['invis','moonlight'], mats:[] },
  { id:'t2elixir',   name:'生命之泉',     icon:'💧', price:480, base:['elixir'],            mats:['moon','herb'] },
  { id:'t2dragon',   name:'龙神之怒',     icon:'🐲', price:560, base:['dragon'],            mats:['fire','sulfur'] },
];

const QUALITY = [
  { key:'normal',  name:'普通', mult:1.0, color:'#9aa0a6' },
  { key:'fine',    name:'优秀', mult:1.6, color:'#5aa9ff' },
  { key:'perfect', name:'完美', mult:2.5, color:'#d4af37' },
];

const UPGRADES = [
  { id:'gather', name:'采集加速', icon:'⏩', desc:'材料恢复速度 +25%', max:4, base:120, mult:1.7 },
  { id:'sell',   name:'炼金精通', icon:'💰', desc:'药水售价 +15%',     max:4, base:150, mult:1.7 },
  { id:'orders', name:'商业人脉', icon:'📜', desc:'订单栏位 +1',        max:2, base:220, mult:2.0 },
  { id:'thermo', name:'保温坩埚', icon:'🌡️', desc:'温度舒适区 +5',     max:3, base:180, mult:1.7 },
  { id:'sage',   name:'贤者之触', icon:'✨', desc:'炼药速度 +20%',     max:3, base:200, mult:1.8 },
  { id:'charm',  name:'声望口碑', icon:'🏅', desc:'订单声望 +30%',     max:3, base:160, mult:1.8 },
];

const HUE = {
  herb:130, water:200, mushroom:25, fire:12, ice:190, thunder:52,
  moon:275, sulfur:45, crystal:220, phoenix:30
};

const CLIENTS = {
  mercenary: {
    name:'佣兵', icon:'⚔️', cls:'mercenary',
    goldMult:1.6, repMult:0.8, timeMult:0.62, minQuality:0,
    quotes:['越快越好，钱不是问题。','我的队伍明天就出发。','别磨蹭，我还有仗要打。','这东西能保命，懂吗？']
  },
  noble: {
    name:'贵族', icon:'👑', cls:'noble',
    goldMult:2.2, repMult:1.6, timeMult:1.35, minQuality:2,
    quotes:['我只要最好的，懂？','品质若差，分文不付。','我的耐心有限，先生。','这是为晚宴准备的。']
  },
  farmer: {
    name:'农夫', icon:'🌾', cls:'farmer',
    goldMult:0.55, repMult:2.8, timeMult:1.5, minQuality:0,
    quotes:['我只有这么多了……','谢谢您，大人。','我家孩子病了。','村里人都指望着您呢。']
  },
  alchemist: {
    name:'炼金术士', icon:'🧪', cls:'alchemist',
    goldMult:1.3, repMult:1.3, timeMult:1.0, minQuality:1,
    quotes:['我需要特定的变种。','你懂变种炼法吗？','别拿普通货糊弄我。','温度控制是关键，你懂的。']
  },
  stranger: {
    name:'神秘人', icon:'🕶️', cls:'stranger',
    goldMult:3.2, repMult:-4.5, timeMult:1.1, minQuality:0, dark:true,
    quotes:['别问用途。','这点小事，你不会想知道的。','金币管够，闭上嘴。','我的主人需要它，别多问。']
  },
  healer: {
    name:'医师', icon:'⚕️', cls:'healer',
    goldMult:1.2, repMult:1.8, timeMult:1.2, minQuality:0,
    quotes:['病人等不了太久。','我需要最纯净的药剂。','救死扶伤，全仰仗您了。','村里正闹瘟疫，求您救救大家。']
  },
  commander: {
    name:'将军', icon:'🛡️', cls:'commander',
    goldMult:2.6, repMult:1.4, timeMult:0.9, minQuality:1,
    quotes:['战事吃紧，军需优先。','士兵的命，就系在您手上。','此药能定乾坤。','龙神之怒——我听说过它的传说。']
  },
};

const CHAINS = [
  {
    id:'sick_wife', title:'生病的妻子', client:'farmer', chainClass:'', once:true,
    steps:[
      { potion:'heal', qty:1, variant:'any',
        text:'我妻子病了，需要一瓶治疗药水……请您务必救救她。' },
    ]
  },
  {
    id:'mercenary_mission', title:'佣兵的任务', client:'mercenary', chainClass:'',
    steps:[
      { potion:'strength', qty:1, variant:'any', text:'先来瓶力量药剂，老子要冲锋。' },
      { potion:'strength', qty:1, variant:'burning',  text:'再来一瓶，要够烈的！', bonusGold:120 },
    ]
  },
  {
    id:'noble_feast', title:'贵族的晚宴', client:'noble', chainClass:'',
    steps:[
      { potion:'moonlight', qty:1, variant:'any', text:'晚宴上需要些助兴的东西。' },
      { potion:'moonlight', qty:1, variant:'pure',     text:'上次的尚可，这次我要最好的。', bonusGold:200, bonusRep:50 },
    ]
  },
  {
    id:'stranger_deal', title:'神秘人的委托', client:'stranger', chainClass:'',
    steps:[
      { potion:'poison', qty:1, variant:'any', text:'一瓶剧毒药剂，别问。' },
      { potion:'poison', qty:1, variant:'mad',      text:'还不够……再疯一点。', bonusGold:300 },
    ]
  },
  {
    id:'alchemist_study', title:'炼金术士的研究', client:'alchemist', chainClass:'',
    steps:[
      { potion:'storm', qty:1, variant:'any', text:'我要研究稳定温度下的雷暴。' },
      { potion:'static', qty:1, variant:'mad',       text:'那么，再给我一瓶疯狂点的静电。', bonusRep:30 },
    ]
  },
  {
    /* ★ 发明家之梦：全局仅一次 */
    id:'inventor_dream', title:'发明家之梦', client:'alchemist', chainClass:'dream', once:true,
    steps:[
      { potion:'wisdom',   qty:1, variant:'any',
        text:'我在研制一种能解析万物结构的装置，需要智慧药剂作为核心能源。' },
      { potion:'t2wisdom', qty:1, variant:'any',
        text:'原型成功了！但能量场极不稳定，我需要睿智药剂来校准它。' },
      { potion:'t2wisdom', qty:1, variant:'any',
        text:'最后一步——把它推向极限。请再给我一瓶睿智药剂。',
        bonusGold:600, bonusRep:80 },
    ]
  },
  {
    id:'plague', title:'瘟疫蔓延', client:'healer', chainClass:'plague',
    steps:[
      { potion:'heal', qty:2, variant:'any',
        text:'医生！镇上的病人越来越多，先给我两瓶治疗药水应急！' },
      { potion:'elixir', qty:1, variant:'any',
        text:'普通药剂已经压不住瘟疫了……只有万灵药才能救他们。' },
      { potion:'elixir', qty:1, variant:'pure',
        text:'万灵药起效了！但疫源未除，我需要一瓶纯净的万灵药做解药配方。', bonusGold:300 },
      { potion:'t2elixir', qty:1, variant:'any',
        text:'这是最后一战——生命之泉能净化整条水源。拜托了。',
        bonusGold:800, bonusRep:120 },
    ]
  },
  {
    id:'war', title:'战争的阴云', client:'commander', chainClass:'war',
    steps:[
      { potion:'strength', qty:2, variant:'burning',
        text:'边境告急。士兵们需要最烈的力量药剂。' },
      { potion:'t2dragon', qty:1, variant:'any',
        text:'敌军有巨龙助阵。给我一瓶龙神之怒，我们要以龙制龙。', bonusGold:400 },
      { potion:'t2elixir', qty:1, variant:'any',
        text:'伤亡惨重，生命之泉能救回大半伤员。' },
      { potion:'t2dragon', qty:1, variant:'mad',
        text:'决战在即。给我一瓶疯狂的龙神之怒——我要让敌人记住今天。',
        bonusGold:1200, bonusRep:150 },
    ]
  },
];

const MERCHANT_TYPES = [
  { id:'collector', name:'收藏家', icon:'🎩', goldMult:1.6, quote:'"我专收稀有之物，尤其是变种药剂。"', gift:'recipe' },
  { id:'smuggler',  name:'走私犯', icon:'🗝️', goldMult:0.85, quote:'"价格嘛，好商量……但得听我的。"', gift:'gold' },
  { id:'scholar',   name:'游方学者', icon:'📚', goldMult:1.1, quote:'"我用知识换你的手艺，如何？"', gift:'recipe' },
  { id:'mystery',   name:'神秘人', icon:'🕶️', goldMult:2.4, quote:'"我不问来处，你也别问去处。"', gift:'gold' },
];

const MERCHANT_STAY = 42000;

const REP_TIERS = [
  { at: -60, name:'声名狼藉', icon:'💀', kind:'bad'  },
  { at: -20, name:'不受欢迎', icon:'⚠️', kind:'bad'  },
  { at: 60,  name:'小有名气', icon:'⭐', kind:'good' },
  { at: 150, name:'远近闻名', icon:'🌟', kind:'good' },
  { at: 300, name:'炼金大师', icon:'👑', kind:'good' },
  { at: 500, name:'贤者之名', icon:'🧙', kind:'good' },
];

const VARIANT_THRESHOLDS = {
  gentleAvgTemp: 48,
  burningAvgTemp: 63,
  madEscapes: 4,
};

const ZONE_DRIFT = {
  firstDelayMin: 6000,
  firstDelayMax: 10000,
  intervalMin: 7000,
  intervalMax: 13000,
  shiftMin: 9,
  shiftMax: 17,
};

const MYSTERIOUS_CHANCE = 0.08;
const PURE_STREAK = { required: 5, baseChance: 0.5, increment: 0.1, maxChance: 0.95 };
const REFINE_CHANCE = 0.6;

/* ★ 材料价格浮动：声誉与剧情影响 */
const PRICE_MOD = {
  repTiers: [
    { at: 500, mult: 0.70 },
    { at: 300, mult: 0.80 },
    { at: 150, mult: 0.90 },
    { at: 60,  mult: 0.95 },
    { at: -20, mult: 1.25 },
    { at: -60, mult: 1.50 },
  ],
  warHotIng: { sulfur: 1.8, thunder: 1.8 },
};

const VARIANT_TIPS = [
  { v:'gentle',     tip:'📖 变种手册：「温和的」——全程均温保持在 48° 以下即可。' },
  { v:'burning',    tip:'📖 变种手册：「炽热的」——全程均温保持在 63° 以上即可。' },
  { v:'refreshing', tip:'📖 变种手册：「提神的」——将已炼成的药水重新投入坩埚重炼，60% 概率转化为提神的；失败则原样退回。' },
  { v:'mad',        tip:'📖 变种手册：「疯狂的」——频繁逃出舒适区（≥4 次）就会癫狂。' },
  { v:'pure',       tip:'📖 变种手册：「纯净的」——连续炼出 5 瓶相同药剂后，下一瓶有 50% 概率成为纯净；失败则概率 +10%，成功则清零重来。' },
  { v:'mysterious', tip:'📖 变种手册：「神秘的」——每 100 次炼药约有 8 次会自行踏入这条小径。拥有中等贤者之石后，可在贤者炼制中直接指定。' },
  { v:'midsage',    tip:'📖 贤者进阶：1 个初级贤者之石 + 1 瓶完美品质智慧药剂，可炼制中等贤者之石，30% 失败率。' },
  { v:'sagecraft',  tip:'📖 贤者指定：持有中等贤者之石后，可指定任意药剂与变种，投入任意 2 种材料直接炼制（完美品质）。' },
  { v:'puresage',   tip:'📖 纯净贤者：集齐 4 种中等贤者之石后，消耗 1 瓶纯净的万灵药 + 4 瓶完美品质智慧药剂，可炼制纯净的初等贤者之石。' },
  { v:'finalsage',  tip:'📖 贤者之极：4 种中等贤者之石 + 1 个纯净的初等贤者之石 + 1 瓶睿智药剂 + 1 瓶任意神秘的药剂。最终贤者之石可指定任意变种；选择神秘的时 80% 成功率。' },
  { v:'midsagespeed', tip:'📖 贤者加速：每拥有 1 种中等贤者之石，炼制速度 +15%（最多 +60%），手动炼制与贤者指定炼制均生效。' },
  { v:'tier2variant', tip:'📖 二级加工：二阶药剂的变种会继承你最近一次贤者指定炼制所选的变种（"神秘的"除外）；未指定时则继承基础药剂的变种。' },
  { v:'orderchoice',  tip:'📖 订单变种：大多数订单不限变种。提交时可自行选择投入哪种变种，不同的变种会悄然改变剧情的走向。' },
  { v:'materialprice',tip:'📖 材料行情：材料价格随你的声誉涨落——声誉越高，进货越便宜；声誉越低，奸商越猖狂。' },
  { v:'storybranch',  tip:'📖 命运岔路：某些委托的变种选择会改写这座城市的命运，也会改变订单的流向。' },
];

const ACHIEVEMENTS = [
  { id:'first_potion',   name:'初出茅庐', icon:'🌱', desc:'炼出第一瓶药剂',
    check: s => s.stats.potionsBrewed >= 1 },
  { id:'first_perfect',  name:'完美主义', icon:'💎', desc:'炼出一瓶完美品质药剂',
    check: s => s.stats.perfectBrewed >= 1 },
  { id:'variant_scholar',name:'变种学者', icon:'📘', desc:'收集到 5 种不同变种',
    check: s => s.stats.variantsSeen.size >= 5 },
  { id:'variant_master', name:'变种大师', icon:'🎓', desc:'收集到全部 7 种变种',
    check: s => s.stats.variantsSeen.size >= 7 },
  { id:'sage_path',      name:'贤者之路', icon:'🔴', desc:'炼成初级贤者之石',
    check: s => s.sageVariants.size >= 1 },
  { id:'sage_triad',     name:'贤者三重', icon:'🧙', desc:'拥有 3 种初级贤者之石变种',
    check: s => s.sageVariants.size >= 3 },
  { id:'mid_sage',       name:'贤者进阶', icon:'🟣', desc:'炼制出中等贤者之石',
    check: s => s.midSageVariants.size >= 1 },
  { id:'mid_sage_all',   name:'贤者大成', icon:'🌌', desc:'集齐 4 种变种的中等贤者之石',
    check: s => s.midSageVariants.size >= 4 },
  { id:'pure_sage',      name:'纯净贤者', icon:'💠', desc:'炼制出纯净的初等贤者之石',
    check: s => s.pureSageOwned },
  { id:'final_sage',     name:'终极贤者', icon:'🌌', desc:'炼制出最终贤者之石',
    check: s => s.finalSageOwned },
  { id:'sage_crafter',   name:'贤者之手', icon:'🖐️', desc:'使用中等贤者之石指定炼制 10 次',
    check: s => s.stats.sageCraftCount >= 10 },
  { id:'merchant_friend',name:'商人的朋友', icon:'🤝', desc:'与云游商人完成 10 次交易',
    check: s => s.stats.merchantDeals >= 10 },
  { id:'rich',           name:'炼金首富', icon:'💎', desc:'金币达到 5000',
    check: s => s.gold >= 5000 },
  { id:'famous',         name:'名满天下', icon:'🌟', desc:'声望达到 300',
    check: s => s.rep >= 300 },
  { id:'all_recipes',    name:'炼金全典', icon:'📖', desc:'解锁全部基础配方',
    check: s => RECIPES.every(r => s.discovered.has(r.id)) },
  { id:'first_t2',       name:'二次加工', icon:'⚗️', desc:'首次制作二级药剂',
    check: s => s.stats.tier2Crafted >= 1 },
  { id:'chain_master',   name:'一诺千金', icon:'📜', desc:'完成任意一条订单链',
    check: s => s.stats.chainsCompleted >= 1 },
  { id:'mad_scientist',  name:'疯狂科学家', icon:'🌀', desc:'炼出疯狂的变种',
    check: s => s.stats.variantsSeen.has('mad') },
  { id:'big_buyer',      name:'大手笔', icon:'🛒', desc:'购买 50 次材料',
    check: s => s.stats.purchases >= 50 },
  { id:'plague_hero',    name:'瘟疫救星', icon:'⚕️', desc:'完成【瘟疫蔓延】委托链',
    check: s => s.stats.chainsDone.has('plague') },
  { id:'war_hero',       name:'战争英雄', icon:'🛡️', desc:'完成【战争的阴云】委托链',
    check: s => s.stats.chainsDone.has('war') },
  { id:'mystery_seeker', name:'神秘学者', icon:'🔮', desc:'炼出「神秘的」变种',
    check: s => s.stats.variantsSeen.has('mysterious') },
  { id:'pure_master',    name:'纯净之心', icon:'✨', desc:'炼出「纯净的」变种',
    check: s => s.stats.variantsSeen.has('pure') },
  { id:'refiner',        name:'重炼师',   icon:'💧', desc:'重炼出「提神的」变种',
    check: s => s.stats.variantsSeen.has('refreshing') && s.stats.refineCount >= 1 },
  { id:'good_doctor',    name:'仁心仁术', icon:'⚕️', desc:'以温和之药救治农夫的妻子',
    check: s => s.stats.goodDoctorFlag === true },
  { id:'dream_maker',    name:'梦想共筑', icon:'💡', desc:'完成【发明家之梦】委托链',
    check: s => s.stats.chainsDone.has('inventor_dream') },
  { id:'maker_sage',     name:'制造贤者', icon:'🏰', desc:'见证「万用颗粒」的诞生',
    check: s => s.storyFlags && s.storyFlags.inventorGenius === true },
  { id:'war_maker',      name:'战火引线', icon:'🔥', desc:'见证「真正的战争」',
    check: s => s.storyFlags && s.storyFlags.inventorWar === true },
];