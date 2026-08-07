/* ============================================================
   cyberRitual.js
   赛博算命感 · 流程仪式模块（纯函数/纯逻辑，不依赖 React）
   统一提供 9 大仪式节点的构造函数，由 useGameFlow 调度 + Game.jsx 渲染

   设计原则（"流程赛博算命"不是CSS动画）：
   1. 用户必须"做些什么"（输入心念数字 / 连点6次投爻 / 勾选三忌三要），
      而不是纯被动看动画 —— 做的动作越多，"灵机"映射越强。
   2. 每个阶段都有"可追溯的数字仪式产物"（签号ID / 装卦日志 / 符命），
      最终都会印在命牌上，像真实算命一样你能带走一张东西。
   3. 全程半文半白 + 工程黑话混排（比如：
      "此卦纳甲入库 · 乾金乘旺 · 然API层有冲"），
      这才是"赛博"——不是未来感，是"古典玄学 × 数字工程"的混血感。
   ============================================================ */

// ============================================================
// 【0】工具：64 卦 元数据表（含宫/五行/动爻辞/四句七言签语模板）
// 不做完整易经，取赛博算命常用 30+ 卦 + 兜底机制，足够用了
// ============================================================
const GUA_64 = [
  { idx: 1,  name: '乾',   palace: '乾',   wuxing: '金', trigram: '☰',
    verse: '元亨利贞。天行健，君子以自强不息。',
    lineMeanings: ['潜龙勿用','见龙在田','终日乾乾','或跃在渊','飞龙在天','亢龙有悔'] },
  { idx: 2,  name: '坤',   palace: '坤',   wuxing: '土', trigram: '☷',
    verse: '元亨。利牝马之贞。君子有攸往，先迷后得。',
    lineMeanings: ['履霜坚冰至','直方大不习无不利','含章可贞','括囊无咎','黄裳元吉','龙战于野其血玄黄'] },
  { idx: 11, name: '泰',   palace: '坤',   wuxing: '土', trigram: '☷',
    verse: '小往大来，吉亨。天地交而万物通也。',
    lineMeanings: ['拔茅茹','包荒','勿恤其孚','翩翩不富以其邻','帝乙归妹','城复于隍'] },
  { idx: 12, name: '否',   palace: '乾',   wuxing: '金', trigram: '☰',
    verse: '否之匪人，不利君子贞。大往小来。',
    lineMeanings: ['拔茅茹','包承','包羞','有命无咎','休否','倾否'] },
  { idx: 13, name: '同人', palace: '离',   wuxing: '火', trigram: '☲',
    verse: '同人于野，亨。利涉大川，利君子贞。',
    lineMeanings: ['同人于门','同人于宗','伏戎于莽','乘其墉','同人先号咷而后笑','同人于郊'] },
  { idx: 14, name: '大有', palace: '乾',   wuxing: '金', trigram: '☰',
    verse: '元亨。火在天上，大有。君子以遏恶扬善，顺天休命。',
    lineMeanings: ['无交害','大车以载','公用亨于天子','匪其彭','厥孚交如威如','自天祐之吉无不利'] },
  { idx: 17, name: '随',   palace: '震',   wuxing: '木', trigram: '☳',
    verse: '随，元亨利贞，无咎。泽中有雷，随。',
    lineMeanings: ['官有渝','系小子','系丈夫','随有获','孚于嘉','拘系之'] },
  { idx: 18, name: '蛊',   palace: '巽',   wuxing: '木', trigram: '☴',
    verse: '元亨。利涉大川。先甲三日，后甲三日。',
    lineMeanings: ['幹父之蛊','幹母之蛊','幹父之蛊','裕父之蛊','幹父之蛊','不事王侯高尚其事'] },
  { idx: 19, name: '临',   palace: '坤',   wuxing: '土', trigram: '☷',
    verse: '元亨利贞。至于八月有凶。泽上有地，临。',
    lineMeanings: ['咸临','咸临','甘临','至临','知临','敦临'] },
  { idx: 24, name: '复',   palace: '坤',   wuxing: '土', trigram: '☷',
    verse: '亨。出入无疾，朋来无咎。反复其道，七日来复。',
    lineMeanings: ['不远复','休复','频复','中行独复','敦复','迷复'] },
  { idx: 25, name: '无妄', palace: '乾',   wuxing: '金', trigram: '☰',
    verse: '元亨利贞。其匪正有眚，不利有攸往。',
    lineMeanings: ['无妄往','不耕获','无妄之灾','可贞','无妄之疾','无妄行有眚'] },
  { idx: 26, name: '大畜', palace: '艮',   wuxing: '土', trigram: '☶',
    verse: '利贞。不家食吉，利涉大川。天在山中，大畜。',
    lineMeanings: ['有厉利已','舆说輹','良马逐','童牛之牿','豮豕之牙','何天之衢'] },
  { idx: 27, name: '颐',   palace: '巽',   wuxing: '木', trigram: '☴',
    verse: '贞吉。自求口实。山下有雷，颐。',
    lineMeanings: ['舍尔灵龟','颠颐拂经','拂颐贞凶','颠颐吉','拂经居贞吉','由颐厉吉'] },
  { idx: 28, name: '大过', palace: '兑',   wuxing: '金', trigram: '☱',
    verse: '栋桡，利有攸往，亨。泽灭木，大过。',
    lineMeanings: ['藉用白茅','枯杨生稊','栋桡凶','栋隆吉','枯杨生华','过涉灭顶凶'] },
  { idx: 29, name: '坎',   palace: '坎',   wuxing: '水', trigram: '☵',
    verse: '习坎有孚，维心亨，行有尚。水洊至，习坎。',
    lineMeanings: ['习坎入于坎窞','坎有险','来之坎坎','樽酒簋贰','坎不盈祇既平','系用徽纆寘于丛棘'] },
  { idx: 30, name: '离',   palace: '离',   wuxing: '火', trigram: '☲',
    verse: '利贞，亨。畜牝牛吉。明两作，离。',
    lineMeanings: ['履错然敬之','黄离元吉','日昃之离','突如其来如','出涕沱若','王用出征有嘉折首'] },
  { idx: 31, name: '咸',   palace: '兑',   wuxing: '金', trigram: '☱',
    verse: '亨利贞，取女吉。山上有泽，咸。',
    lineMeanings: ['咸其拇','咸其腓','咸其股','憧憧往来','咸其脢','咸其辅颊舌'] },
  { idx: 32, name: '恒',   palace: '震',   wuxing: '木', trigram: '☳',
    verse: '亨无咎利贞。利有攸往。雷风，恒。',
    lineMeanings: ['浚恒贞凶','悔亡','不恒其德或承之羞','田无禽','恒其德妇人吉夫子凶','振恒凶'] },
  { idx: 33, name: '遁',   palace: '乾',   wuxing: '金', trigram: '☰',
    verse: '亨小利贞。天下有山，遁。',
    lineMeanings: ['遁尾厉','执之用黄牛之革','系遁有疾厉','好遁君子吉小人否','嘉遁贞吉','肥遁无不利'] },
  { idx: 34, name: '大壮', palace: '坤',   wuxing: '土', trigram: '☷',
    verse: '利贞。雷在天上，大壮。',
    lineMeanings: ['壮于趾','贞吉','小人用壮君子用罔','贞吉悔亡藩决不羸','丧羊于易','羝羊触藩不能退不能遂'] },
  { idx: 35, name: '晋',   palace: '离',   wuxing: '火', trigram: '☲',
    verse: '康侯用锡马蕃庶，昼日三接。明出地上，晋。',
    lineMeanings: ['晋如摧如','晋如愁如','众允','晋如鼫鼠','悔亡失得勿恤','晋其角'] },
  { idx: 36, name: '明夷', palace: '坎',   wuxing: '水', trigram: '☵',
    verse: '利艰贞。明入地中，明夷。',
    lineMeanings: ['明夷于飞垂其翼','明夷夷于左股','明夷于南狩','入于左腹','箕子之明夷利贞','不明晦初登于天后入于地'] },
  { idx: 37, name: '家人', palace: '巽',   wuxing: '木', trigram: '☴',
    verse: '利女贞。风自火出，家人。',
    lineMeanings: ['闲有家','无攸遂在中馈','家人嗃嗃','富家','王假有家','有孚威如终吉'] },
  { idx: 38, name: '睽',   palace: '离',   wuxing: '火', trigram: '☲',
    verse: '小事吉。上火下泽，睽。',
    lineMeanings: ['悔亡丧马勿逐','遇主于巷','见舆曳其牛掣','睽孤遇元夫','厥宗噬肤','睽孤见豕负涂'] },
  { idx: 39, name: '蹇',   palace: '坎',   wuxing: '水', trigram: '☵',
    verse: '利西南不利东北。利见大人，贞吉。山上有水，蹇。',
    lineMeanings: ['往蹇来誉','王臣蹇蹇','往蹇来反','往蹇来连','大蹇朋来','往蹇来硕'] },
  { idx: 40, name: '解',   palace: '震',   wuxing: '木', trigram: '☳',
    verse: '利西南。无所往，其来复吉。雷雨作而百果草木皆甲坼。',
    lineMeanings: ['无咎','田获三狐','负且乘','解而拇朋至斯孚','君子维有解','公用射隼于高墉之上'] },
  { idx: 41, name: '损',   palace: '艮',   wuxing: '土', trigram: '☶',
    verse: '有孚，元吉。山下有泽，损。损下益上，其道上行。',
    lineMeanings: ['已事遄往','利贞征凶弗损益之','三人行则损一人','损其疾使遄有喜','或益之十朋之龟','弗损益之'] },
  { idx: 42, name: '益',   palace: '巽',   wuxing: '木', trigram: '☴',
    verse: '利有攸往，利涉大川。风雷益。损上益下，民说无疆。',
    lineMeanings: ['利用为大作','或益之十朋之龟','益之用凶事','中行告公从','有孚惠心','莫益之或击之'] },
  { idx: 43, name: '夬',   palace: '兑',   wuxing: '金', trigram: '☱',
    verse: '扬于王庭，孚号有厉。泽上于天，夬。',
    lineMeanings: ['壮于前趾不胜','惕号莫夜有戎','壮于頄有凶','臀无肤牵羊悔亡','苋陆夬夬中行无咎','无号终有凶'] },
  { idx: 44, name: '姤',   palace: '乾',   wuxing: '金', trigram: '☰',
    verse: '女壮，勿用取女。天下有风，姤。',
    lineMeanings: ['系于金柅','包有鱼','臀无肤其行次且','包无鱼起凶','以杞包瓜','姤其角'] },
  { idx: 45, name: '萃',   palace: '兑',   wuxing: '金', trigram: '☱',
    verse: '亨。王假有庙。泽上于地，萃。',
    lineMeanings: ['有孚不终乃乱乃萃','引吉无咎','萃如嗟如','大吉无咎','萃有位','赍咨涕洟'] },
  { idx: 46, name: '升',   palace: '巽',   wuxing: '木', trigram: '☴',
    verse: '元亨。用见大人，勿恤，南征吉。地中生木，升。',
    lineMeanings: ['允升大吉','孚乃利用禴','升虚邑','王用亨于岐山','贞吉升阶','冥升利于不息之贞'] },
  { idx: 47, name: '困',   palace: '兑',   wuxing: '金', trigram: '☱',
    verse: '亨。贞大人吉，无咎。有言不信。泽无水，困。',
    lineMeanings: ['臀困于株木','困于酒食','困于石据于蒺藜','来徐徐困于金车','劓刖困于赤绂','困于葛藟于臲卼'] },
  { idx: 48, name: '井',   palace: '坎',   wuxing: '水', trigram: '☵',
    verse: '改邑不改井，无丧无得。木上有水，井。',
    lineMeanings: ['井泥不食','井谷射鲋','井渫不食','井甃','井冽寒泉食','井收勿幕有孚元吉'] },
  { idx: 49, name: '革',   palace: '兑',   wuxing: '金', trigram: '☱',
    verse: '巳日乃孚，元亨利贞，悔亡。泽中有火，革。',
    lineMeanings: ['巩用黄牛之革','巳日乃革之','革言三就有孚','悔亡有孚改命吉','大人虎变','君子豹变小人革面'] },
  { idx: 50, name: '鼎',   palace: '离',   wuxing: '火', trigram: '☲',
    verse: '元吉，亨。木上有火，鼎。',
    lineMeanings: ['鼎颠趾','鼎有实','鼎耳革其行塞','鼎折足','鼎黄耳金铉','鼎玉铉大吉'] },
  { idx: 51, name: '震',   palace: '震',   wuxing: '木', trigram: '☳',
    verse: '亨。震来虩虩，笑言哑哑。洊雷震。',
    lineMeanings: ['震来虩虩笑言哑哑','震来厉亿丧贝','震苏苏震行无眚','震遂泥','震往来厉','震索索视矍矍'] },
  { idx: 52, name: '艮',   palace: '艮',   wuxing: '土', trigram: '☶',
    verse: '艮其背，不获其身。无咎。兼山，艮。',
    lineMeanings: ['艮其趾','艮其腓不拯其随','艮其限列其夤','艮其身无咎','艮其辅言有序','敦艮吉'] },
  { idx: 53, name: '渐',   palace: '艮',   wuxing: '土', trigram: '☶',
    verse: '女归吉，利贞。山上有木，渐。',
    lineMeanings: ['鸿渐于干','鸿渐于磐','鸿渐于陆','鸿渐于木','鸿渐于陵','鸿渐于陆其羽可用为仪'] },
  { idx: 54, name: '归妹', palace: '兑',   wuxing: '金', trigram: '☱',
    verse: '征凶，无攸利。泽上有雷，归妹。',
    lineMeanings: ['归妹以娣','眇能视利幽人之贞','归妹以须反归以娣','归妹愆期迟归有时','帝乙归妹','女承筐无实士刲羊无血'] },
  { idx: 55, name: '丰',   palace: '震',   wuxing: '木', trigram: '☳',
    verse: '亨，王假之，勿忧，宜日中。雷电皆至，丰。',
    lineMeanings: ['遇其配主','丰其蔀日中见斗','丰其沛日中见沫','丰其蔀日中见斗','来章有庆誉','丰其屋天际翔也'] },
  { idx: 56, name: '旅',   palace: '离',   wuxing: '火', trigram: '☲',
    verse: '小亨，旅贞吉。山上有火，旅。',
    lineMeanings: ['旅琐琐','旅即次怀其资','旅焚其次丧其童仆','旅于处得其资斧','射雉一矢亡','鸟焚其巢旅人先笑后号咷'] },
  { idx: 57, name: '巽',   palace: '巽',   wuxing: '木', trigram: '☴',
    verse: '小亨。利有攸往，利见大人。随风，巽。',
    lineMeanings: ['进退利武人之贞','巽在床下','频巽吝','悔亡田获三品','贞吉悔亡无不利','巽在床下丧其资斧'] },
  { idx: 58, name: '兑',   palace: '兑',   wuxing: '金', trigram: '☱',
    verse: '亨，利贞。丽泽，兑。',
    lineMeanings: ['和兑吉','孚兑吉','来兑凶','商兑未宁介疾有喜','孚于剥','引兑'] },
  { idx: 59, name: '涣',   palace: '巽',   wuxing: '木', trigram: '☴',
    verse: '亨。王假有庙，利涉大川，利贞。风行水上，涣。',
    lineMeanings: ['用拯马壮吉','涣奔其机悔亡','涣其躬无悔','涣其群元吉','涣汗其大号','涣其血去逖出'] },
  { idx: 60, name: '节',   palace: '坎',   wuxing: '水', trigram: '☵',
    verse: '亨。苦节不可贞。泽上有水，节。',
    lineMeanings: ['不出户庭无咎','不出门庭凶','不节若则嗟若无咎','安节亨','甘节吉往有尚','苦节贞凶悔亡'] },
  { idx: 61, name: '中孚', palace: '巽',   wuxing: '木', trigram: '☴',
    verse: '豚鱼吉，利涉大川，利贞。泽上有风，中孚。',
    lineMeanings: ['虞吉','鸣鹤在阴其子和之','得敌或鼓或罢','月几望马匹亡','有孚挛如','翰音登于天贞凶'] },
  { idx: 62, name: '小过', palace: '兑',   wuxing: '金', trigram: '☱',
    verse: '亨，利贞。可小事，不可大事。山上有雷，小过。',
    lineMeanings: ['飞鸟以凶','过其祖遇其妣','弗过防之从或戕之','无咎弗过遇之','密云不雨自我西郊','弗遇过之飞鸟离之'] },
  { idx: 63, name: '既济', palace: '坎',   wuxing: '水', trigram: '☵',
    verse: '亨小，利贞。初吉终乱。水在火上，既济。',
    lineMeanings: ['曳其轮濡其尾','妇丧其茀勿逐七日得','高宗伐鬼方三年克之','繻有衣袽终日戒','东邻杀牛不如西邻之禴祭','濡其首厉'] },
  { idx: 64, name: '未济', palace: '离',   wuxing: '火', trigram: '☲',
    verse: '亨。小狐汔济，濡其尾，无攸利。火在水上，未济。',
    lineMeanings: ['濡其尾','曳其轮贞吉','未济征凶利涉大川','贞吉悔亡震用伐鬼方','贞吉无悔君子之光','有孚于饮酒'] },
];
const GUA_BY_IDX = Object.fromEntries(GUA_64.map(g => [g.idx, g]));
const GUA_BY_NAME = Object.fromEntries(GUA_64.map(g => [g.name, g]));

// ============================================================
// 【1】起念数字：把用户心念 + 时间戳 + 1~108 数字 → 熵种子，
//              最终映射到一个卦索引（1-64）和一个动爻（1-6）
// ============================================================
function mulberry32(seed) {
  return function() {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 生成"起念熵种子" + 映射 64卦 + 1动爻
 * @param {string} question 用户问题
 * @param {number} userMindNum 用户输入的 1~108 起念数字
 * @param {number[]} sixThrows 六次真投爻结果 [1/2]，长度为6（1=少阴/老阴？不，简化：奇数=阳，偶数=阴，其中动爻由 throw 取 3 为老阳，4 为老阴；这里赛博化，用 throw 的 timing 决定）
 * @returns {{seed: string, guaIdx:number, movingLine:number, yaoArray: number[]}}
 */
export function generateQinianSeed(question, userMindNum, sixThrows) {
  const q = String(question || '').trim();
  const mind = Number.isFinite(userMindNum) ? Math.max(1, Math.min(108, userMindNum|0)) : ((Date.now() % 108) + 1);
  const throws = Array.isArray(sixThrows) && sixThrows.length >= 6
    ? sixThrows.slice(0, 6).map(t => (Number(t) || 0))
    : Array.from({ length: 6 }, () => 2 + ((Date.now() + Math.random() * 999) | 0) % 2);

  // 用字符串 + 数字做一个哈希 seed
  let hash = 0;
  const seedStr = `${q.length}|${q.slice(0, 40)}|${mind}|${throws.join('-')}|${new Date().toISOString().slice(0,13)}`;
  for (let i = 0; i < seedStr.length; i++) {
    hash = ((hash << 5) - hash) + seedStr.charCodeAt(i);
    hash |= 0;
  }
  const abs = Math.abs(hash) || 1;
  const rand = mulberry32(abs + mind * 131 + throws.reduce((a,b)=>a+b,0) * 7);

  const guaIdx = 1 + Math.floor(rand() * GUA_64.length) % GUA_64.length;
  const movingLine = 1 + Math.floor(rand() * 6) % 6;

  // 六爻阴阳数组：[初,二,三,四,五,上]，奇数阳 偶数阴
  const yaoArray = throws.map((t, i) => (t + (guaIdx >> i)) % 2 === 0 ? 0 : 1); // 0=阴，1=阳

  return { seed: seedStr.slice(0, 64) + `|h${abs}`, guaIdx, movingLine, yaoArray };
}

// ============================================================
// 【2】本卦签号：贯穿全程在顶栏显示，用户能直观感受到"这是本卦，你的卦"
// ============================================================
/**
 * 生成【本卦签号】：#YYYYMMDDHHmm-卦序-动爻-时辰-灵机校验位
 * 例：#2026080615-14-3-申-72  代表 8月6日下午3点 · 大有卦 · 第三爻动 · 申时 · 灵机熵72
 */
export function makeGuaSignId(guaIdx, movingLine, mindNum, now = new Date()) {
  const pad = (n, w=2) => String(n).padStart(w, '0');
  const YYYY = now.getFullYear();
  const MM = pad(now.getMonth()+1);
  const DD = pad(now.getDate());
  const HH = pad(now.getHours());
  const mm = pad(now.getMinutes());
  const shichen = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'][Math.floor((now.getHours() + 1) % 24 / 2)];
  const entropy = ((mindNum || 1) + (movingLine || 0)) % 100;
  return `#${YYYY}${MM}${DD}${HH}${mm}-${guaIdx}-${movingLine}-${shichen}-${pad(entropy)}`;
}

// ============================================================
// 【3】装卦日志（终端面板内容）：纳甲配爻 → 安世应 → 定六亲 → 取用神
//     纯代码生成，不调用 LLM，秒出，像真实"卦师在给你装卦"
// ============================================================
const SIX_QIN = ['父母', '官鬼', '妻财', '子孙', '兄弟'];
// 简化赛博版纳甲：把问题类型直接映射到【用神】+ 每爻附个赛博工程名词
function inferYongShenByQuestionType(q) {
  const t = (q || '').toLowerCase();
  if (/工作|offer|职|辞|跳槽|晋升|领导|公司|老板|项目|面试/.test(t)) return { yongShen: '官鬼', wuxing: '金', topic: '仕途职场' };
  if (/爱|恋|感情|对象|分手|婚|表白|恋爱|相亲|男友|女友|伴侣/.test(t)) return { yongShen: '妻财/官鬼', wuxing: '木', topic: '情感姻缘' };
  if (/钱|投资|赚|房|消费|工资|存款|借钱|债|股|基金|理财|亏损/.test(t)) return { yongShen: '妻财', wuxing: '土', topic: '财务损益' };
  if (/学|考|研|留学|考试|学校|论文|毕业|书|成绩/.test(t)) return { yongShen: '父母', wuxing: '火', topic: '学业文书' };
  if (/减|肥|健|身体|生病|体检|病|睡|焦虑|心理|医院|吃|饮食/.test(t)) return { yongShen: '子孙', wuxing: '水', topic: '健康颐养' };
  if (/租|房|搬家|装修|住|公寓|买房/.test(t)) return { yongShen: '父母', wuxing: '土', topic: '家居住宅' };
  if (/旅行|去|玩|攻略|出差|搬家|走/.test(t)) return { yongShen: '父母(驿马)', wuxing: '木', topic: '出行迁徙' };
  if (/父母|妈|爸|婆|孩子|小孩|朋友|同学|亲戚|家人|沟通/.test(t)) return { yongShen: '父母/兄弟', wuxing: '火', topic: '六亲关系' };
  return { yongShen: '世爻', wuxing: '金', topic: '人生决策' };
}

/**
 * 生成装卦日志（终端 8-10 行，逐行"打印"）
 * @param {object} gua 卦对象
 * @param {number} movingLine 动爻 1-6
 * @param {number[]} yaoArray 阴阳爻 [初..上]
 * @param {string} question 用户问题
 * @param {string} signId 签号
 * @returns {Array<{t:string, lvl:'log'|'warn'|'ok'|'head'}>}
 */
export function buildZhuangGuaLog(gua, movingLine, yaoArray, question, signId) {
  const yong = inferYongShenByQuestionType(question);
  const g = gua || GUA_64[0];
  const lines = [];
  lines.push({ t: `> 起卦 · 立命签 ${signId || ''}`, lvl: 'head' });
  lines.push({ t: `> 用户灵机序列：${(yaoArray||[1,1,0,1,0,0]).map(x=>x?'—':'- -').join(' ')}`, lvl: 'log' });
  lines.push({ t: `[1/4] 纳甲 · 装卦入库 · 本卦${g.name}（${g.trigram||''} ${g.palace||''}宫 · 属${g.wuxing||'金'}）`, lvl: 'ok' });
  lines.push({ t: `[2/4] 安世应 · 世爻居${movingLine}，应爻居${(((movingLine-1)+3)%6)+1} · 世应间距三爻为正局`, lvl: 'ok' });
  // 给每爻分配赛博六亲（随机但稳定）
  const qinFixed = ['父母(文书)','兄弟(同辈)','官鬼(事业)','妻财(货财)','子孙(福德)','父母(长辈)'];
  for (let i = 0; i < 6; i++) {
    const mark = (i+1 === movingLine) ? '◉动→' : '│';
    const yaoName = yaoArray?.[i] ? '阳爻' : '阴爻';
    lines.push({
      t: `    ${mark} 第${i+1}爻 · ${yaoName} · ${qinFixed[(movingLine + i) % qinFixed.length]} · ${['初','二','三','四','五','上'][i]}位`,
      lvl: (i+1 === movingLine) ? 'warn' : 'log',
    });
  }
  lines.push({ t: `[3/4] 定六亲 · 本卦用神取【${yong.yongShen}】· 维度：${yong.topic} · 五行偏${yong.wuxing}`, lvl: 'ok' });
  lines.push({ t: `[4/4] 排五行 · 全局旺衰：${yong.wuxing}${(movingLine%2===0?'乘旺':'有气')} · 动爻冲合：第${movingLine}爻${yaoArray?.[movingLine-1]?'阳动变阴':'阴动变阳'}`, lvl: movingLine>=5 ? 'warn' : 'log' });
  lines.push({ t: `> 装卦完毕，耗时 ${(Math.random()*3+0.3).toFixed(2)}ms · 演算力已校准至你此刻灵机熵值。`, lvl: 'head' });
  return lines;
}

/**
 * 【用神校准问题】：演向用户确认"你确认用神是xxx吗？"
 */
export function buildYongShenConfirm(question) {
  const yong = inferYongShenByQuestionType(question);
  const tips = {
    '仕途职场': '比如：Offer/跳槽/晋升/和老板博弈 —— 看官鬼爻。',
    '情感姻缘': '比如：追/分/复合/结婚 —— 女看官鬼，男看妻财。',
    '财务损益': '比如：投不投/买不买/借不借/赔没赔 —— 看妻财爻。',
    '学业文书': '比如：考研/留学/论文/考试 —— 看父母爻。',
    '健康颐养': '比如：减肥/体检/生病/失眠焦虑 —— 看子孙爻（福德）。',
    '家居住宅': '比如：租/买/搬/装修 —— 看父母爻。',
    '出行迁徙': '比如：旅行/出差/搬家/出国 —— 看驿马+父母爻。',
    '六亲关系': '比如：父母/婆媳/朋友/孩子 —— 看父母/兄弟爻。',
  };
  return {
    yongShen: yong.yongShen,
    topic: yong.topic,
    question: `演按卦理，取【${yong.yongShen}】为用神，维度偏向「${yong.topic}」。\n${tips[yong.topic] || ''}\n确认吗？不确认演会换一版用神重新推演。`,
  };
}

// ============================================================
// 【4】按卦象推荐 3 个合局智囊：不是随便选，按"用神 × 问题类型 × 卦体"三重打
// ============================================================
/**
 * 按卦象/用神，从 agent 池子里挑 3 个"最合此卦"的
 * @param {Array} allAgents 全部Agent [{id,name,stance,tags,desc,role}]
 * @param {string} question 用户问题
 * @param {object} gua 卦
 * @param {number} topK 默认3
 * @returns {string[]} agentId列表
 */
export function recommendAgentsByGua(allAgents, question, gua, topK = 3) {
  const pool = (allAgents || []).filter(a => a && a.role !== 'master' && a.role !== 'system');
  if (pool.length === 0) return [];
  const yong = inferYongShenByQuestionType(question);
  const yongStr = `${yong.yongShen}|${yong.topic}|${gua?.name||''}|${gua?.wuxing||''}`.toLowerCase();

  const scored = pool.map(a => {
    const text = `${a.name||''} ${a.stance||''} ${(a.tags||[]).join(' ')} ${a.desc||''}`.toLowerCase();
    let s = 0;
    // 用神强匹配：妻财/官鬼/父母/子孙/兄弟 关键词 + 问题主题关键词
    const tokenMap = {
      '妻财': ['财','钱','投资','消费','资产','成本','收益','增值','回报','财务','经济'],
      '官鬼': ['职','工作','offer','晋升','职场','老板','领导','管理','权力','规则','事业','公司'],
      '父母': ['学','考','文书','论文','学历','留学','考试','知识','老师','房子','证件','父母','长辈','健康'],
      '子孙': ['健','身体','养','生理','医','睡眠','压力','焦虑','心理','孩子','福','放松','兴趣'],
      '兄弟': ['朋友','同辈','沟通','合作','竞争','队友','兄弟','人际','同事'],
      '驿马': ['旅','出','走','行','搬家','机票','攻略'],
      '仕途职场': ['职','工作','offer','跳槽','创业','管理','商业','老板','同事'],
      '情感姻缘': ['感','情','恋爱','爱','婚','分手','表白','亲密','性','关系'],
      '财务损益': ['钱','投资','消费','成本','收益','风险','贷款','基金','股'],
      '学业文书': ['学','考','研','留学','毕业','论文','知识','认知','成长'],
      '健康颐养': ['健','身体','养','医','睡','焦虑','心理','减','肥','吃','饮食'],
      '家居住宅': ['房','租','搬','装修','家','住'],
      '出行迁徙': ['旅','出','走','行','攻略','搬'],
      '六亲关系': ['家人','父母','朋友','沟通','婆','孩子'],
      '人生决策': ['选择','权衡','后悔','长期','短期','风险','机会'],
    };
    for (const token of Object.keys(tokenMap)) {
      if (yongStr.includes(token)) {
        for (const kw of tokenMap[token]) {
          if (text.includes(kw)) s += 24;
        }
      }
    }
    // 卦体匹配：乾/艮/坎/震/巽/离/坤/兑 分别倾向不同 stance
    const guaName = String(gua?.name||'').toLowerCase();
    const guaBias = {
      '乾': ['进取','进攻','刚健','商业','领导','管理','投资','创业'],
      '坤': ['保守','稳健','家庭','父母','长期','关系','人际','心理学'],
      '坎': ['风险','止损','安全','法律','诉讼','健康','冷静','分析'],
      '离': ['爱情','文化','艺术','教育','火','表达','演讲','曝光','营销'],
      '震': ['行动','执行','快速','冒险','现场','体验','运动','第一时间'],
      '艮': ['稳健','守住','不动','稳定','学习','深度','研究','长期主义'],
      '巽': ['灵活','沟通','传播','营销','风','网络','机会','试验'],
      '兑': ['快乐','体验','情感','关系','娱乐','消费','放松','朋友'],
    };
    for (const nameKey of Object.keys(guaBias)) {
      if (guaName.includes(nameKey)) {
        for (const kw of guaBias[nameKey]) {
          if (text.includes(kw)) s += 18;
        }
      }
    }
    // 兜底：如果一个都没命中，按 stance 长度打散（随机但稳定）
    if (s === 0) {
      s = Math.abs(((a.name||'x').charCodeAt(0) + ((a.id||'').length*13)) % 60);
    }
    return { a, s };
  }).sort((x,y) => y.s - x.s);

  // 前 N 个，但做一下"立场去重"——避免三个都是"风险视角"，最多同立场 2 个
  const picked = [];
  const stanceCount = {};
  for (const { a } of scored) {
    const stanceKey = (a.stance||'').slice(0, 5);
    if ((stanceCount[stanceKey] || 0) >= 2) continue;
    picked.push(a.id);
    stanceCount[stanceKey] = (stanceCount[stanceKey] || 0) + 1;
    if (picked.length >= topK) break;
  }
  return picked;
}

// ============================================================
// 【5】演·点破：每条智囊发言下，一行小字点评"他是从什么视角取象"
// ============================================================
export function yanBreakDown(agent, dialogueText, yongShenObj) {
  if (!agent) return '';
  const name = agent.name || '智囊';
  const stance = (agent.stance || '旁观者').replace(/视角$/, '');
  const text = String(dialogueText || '');
  // 按关键词从对话里抽一句"取象"
  const imagePool = [
    { k: ['风险','最坏','止损','别冲动','慎'], v: '取坎象，讲险与边界' },
    { k: ['钱','成本','收益','投资','划算','预算','债','亏'], v: '取妻财象，讲损益账本' },
    { k: ['时间','周期','月','年','长期','短期','死线','截止','三天','一周'], v: '取时象，讲节奏窗口' },
    { k: ['人','关系','沟通','朋友','家人','父母','老板','同事','对象'], v: '取应爻象，讲关键人' },
    { k: ['做','行动','干','先动','执行','第一步','今晚','立刻'], v: '取震象，讲先动再补' },
    { k: ['学','考','论文','知识','成长','认知','思维','毕业'], v: '取父母文书象，讲积累' },
    { k: ['身','健','睡','焦虑','压','情绪','心理','吃','病'], v: '取子孙福德象，讲身心底线' },
    { k: ['选','二选一','权衡','两难','纠结','或者','还是'], v: '取互卦象，讲分叉权重' },
    { k: ['试','实验','小步','先看看','验证','30天','小范围'], v: '取巽象，讲低成本试错' },
    { k: ['守','稳','不进','等一等','观望','现在不动','守住'], v: '取艮象，讲停住即安' },
  ];
  let image = '取世爻本位象';
  for (const { k, v } of imagePool) {
    if (k.some(w => text.includes(w))) { image = v; break; }
  }
  const yong = yongShenObj?.yongShen || '世爻';
  const yongAlign = (text.includes(yong.slice(0, 1))) || (stance.includes(yong.slice(0, 1)))
    ? '合用神' : '旁支佐断';
  return `演·点破 ${name}（${stance}）：${image} · ${yongAlign}`;
}

// ============================================================
// 【6】三变定局：三忌 / 三要 / 两径抉择 → 数字符牒
//     纯本地规则生成，不调用 LLM，保证秒出
// ============================================================
/**
 * 从 问题类型 + 卦名 + 动爻 生成三忌三要两径
 */
export function buildSanBian(question, gua, agents) {
  const yong = inferYongShenByQuestionType(question);
  const g = gua || GUA_64[0];
  const core = (question || '').slice(0, 14);
  // 三忌
  const banPool = {
    '仕途职场': ['忌深夜 23:00 后做最终决定（官鬼临玄武，信息不对称）','忌只听直属领导的面辞，去找那个比他大一级的人聊 20 分钟','忌朋友圈/群里吐槽或放狠话（事后都会变成雷）'],
    '情感姻缘': ['忌在吵架后 24h 内说分手/求和（情绪上头不是真心）','忌翻手机查聊天记录（一查就没有回头路）','忌为了给对方证明自己去花远超你能力的钱'] ,
    '财务损益': ['忌用信用卡/消费贷补仓位（利滚利能把小事拖成大事）','忌看别人赚了就追（你看到的都是幸存者偏差）','忌把 3 个月生活费以外的钱，全投进一个标的'] ,
    '学业文书': ['忌同时开 3 个方向（考试/实习/创业都想抓，最后都抓不住）','忌堆资料不翻（先买 20 本书不如今天把第 1 章翻完）','忌以"我学过了"代替"我做过了"'] ,
    '健康颐养': ['忌突然加量到原来 2 倍的运动（第二天身体会罢工）','忌把"睡不好"当成小事硬扛（一周以上就去看，别拖）','忌情绪不好就胡吃海塞（情绪不会好，体重还会涨）'] ,
    '家居住宅': ['忌只看照片就签合同（必须白天+晚上各去一次，看邻居和噪音）','忌签 1 年以上不写"转租条款"（工作一变就亏押金）','忌信口头承诺，任何东西都落白字+拍照'] ,
    '出行迁徙': ['忌不看退票/退订规则就下单（计划一变全是手续费）','忌把所有贵重物品放同一件行李箱（丢了就全没了）','忌 0 点到陌生城市再找酒店（你找不到的）'] ,
    '六亲关系': ['忌在饭桌上讲正事（饭是吃饭的，讲事必吵）','忌用"为你好"开头（对方听不进第二句）','忌讲道理，先讲情绪："我觉得你最近有点累"比"你怎么这样"强一百倍'] ,
    '人生决策': ['忌一周内连改三次（改到第四次你会恨自己）','忌只问同辈，去问比你大十岁、现在过得不纠结的人','忌用"大家都这样"来给自己做决定——你不是大家'] ,
  };
  const doPool = {
    '仕途职场': ['今晚列一张清单：你想从这份工作里拿到什么？写满 5 条，按重要度排序','3 天内约一个你佩服的前辈吃顿饭，别带具体问题，就问他"你这几年最后悔什么"','把你要跳/要接的那个岗位，写 18 个月目标——再反推这 18 个月你每天在干嘛'] ,
    '情感姻缘': ['今晚 10 分钟，不带手机，一个人写：如果现在立刻结束，我最舍不得的是什么？','3 天内约一个 TA 以外、你们共同认识的朋友聊半小时，看你有没有美化对方','写 3 条"如果在一起/复合，我不能妥协的底线"，以后任何时候破了就走'] ,
    '财务损益': ['写 3 个数字：最坏损失 / 最理想收益 / 你能睡得着的仓位比例','3 天内去问一个"在这件事上亏过钱"的人，他 10 分钟顶你看 100 篇成功贴','先拿 1/10 的仓位走一遍全流程（买/卖/止盈/止损），熟悉了再谈大的'] ,
    '学业文书': ['今天先把第一页/第一题做完——做完再谈要不要开始','设一个固定的" 90 分钟专注块"，每天同一时间开，别等有状态','每周日晚上写本周 3 件真的做了的事，别写计划，写结果'] ,
    '健康颐养': ['从 1 个最小改变开始：今晚早睡 30 分钟，或今天多走 3000 步，只选 1 个','把体检报告找出来，看 3 个异常指标，写对应 3 个日常动作（别写"要健康"这种空词）','每周固定 1 天做让自己真的放松的事——不是刷手机，是心能静下来的事'] ,
    '家居住宅': ['实地去看 3 次：周三下午、周六白天、周日晚上。三个时间噪音/采光/邻居状态完全不同','把合同里"押金/违约金/转租/维修"四条划出来读 3 遍，看不懂就问','列 3 条不能妥协：比如"必须朝南/独卫/地铁站步行 10 分钟内"，不满足就不签'] ,
    '出行迁徙': ['把行程单/酒店/车票截图存到手机相册 + 打印一份（手机没电也有备份）','出发前 3 天查一次目的地最近 7 天的新闻/天气/当地防疫或特殊规定','带一个"万能随身包"：充电宝+数据线+现金200+身份证复印件+常用药+伞'] ,
    '六亲关系': ['今晚回家先抱一下/说一句"你今天也辛苦了"，别讲道理','对方说任何抱怨，你前 3 句先不说"但是"，只说"嗯，这个确实很烦/很难/很气"','每周固定 1 次"无手机聊天时间"，30 分钟就够，别刷短视频'] ,
    '人生决策': ['写 3 个版本：1年后最好/最坏/一般——现在的决定能接受哪一个？','列"绝对不能做的 3 件事"，守住这个底线，上面的空间你可以大胆','给"来自一年后自己的忠告"写一句话，放在钱包/锁屏里，犹豫时就看'] ,
  };

  const bans = (banPool[yong.topic] || banPool['人生决策']).map(s => `①②③`[0] + ' ' + s);
  const dos  = (doPool[yong.topic]  || doPool['人生决策']).map((s, i) => ['一','二','三'][i] + '、' + s);
  // 替换首字带圈
  bans[0] = '① ' + bans[0].replace(/^[①②③一、二、三\s\d\.]+/, '');
  bans[1] = '② ' + bans[1].replace(/^[①②③一、二、三\s\d\.]+/, '');
  bans[2] = '③ ' + bans[2].replace(/^[①②③一、二、三\s\d\.]+/, '');

  // ★ Q4 修复：twoPaths 两径抉择：针对问题类别 + 问题本身生成具体、可读、非空泛的 A/B 选项
  //   原则：A 是"现在/近期就行动，附 3 条可执行前置条件"；B 是"再等等/准备充分再动，附 3 条前置+观察点"
  //   standpoint 直接对应卦象+判断（用户问「要不要游泳」就能看到「今天去」还是「改日去」，不是"径甲径乙"）
  const q = String(question || '').trim();
  const guaName = g.gua || g.name || '大有';
  const guaTrigram = g.trigram || '☰';
  const movingLine = g.movingLine;
  const waterKws = ['游泳','泳池','水','海边','河','湖','潜水','冲浪','泡澡'];
  const travelKws = ['旅游','旅行','出远门','飞','机票','高铁','酒店','去玩','出行'];
  const loveKws = ['表白','分手','复合','约会','追','爱','在一起','结婚'];
  const jobKws = ['辞职','跳槽','入职','offer','面试','换工作','加薪','转岗'];
  const investKws = ['买','卖','投','加仓','减仓','股票','基金','币','理财','开店'];
  const studyKws = ['考研','考公','考试','报名','学习','报班','留学','申请'];
  const moveKws = ['搬家','租房','买房','签合同','装修'];
  const has = (arr) => arr.some(w => q.includes(w));

  let pathA, pathB;
  if (has(waterKws) && (yong.topic === '健康颐养' || yong.topic === '出行迁徙' || yong.topic === '人生决策')) {
    pathA = { label: '今天/此刻就去', standpoint: '此卦水得济：先热身15分钟、选有人值守的浅水区、约上1位朋友一起、时长控制在1小时内，4条全满足就安全吉。', risks: '空腹/刚吃饱/熬夜/酒后→不要下；雷雨天→不下；没热身→不下' };
    pathB = { label: '改日再去', standpoint: '此卦水含险：先把手头要收尾的事做完，看天气预报选晴天白天（14-17点水温最高），提前确认水质/救生员/淋浴环境再去。', risks: '今天如果情绪烦、肚子饿、没睡够，硬下容易出事；宁等3天，不抢1小时' };
  } else if (has(travelKws) && yong.topic === '出行迁徙') {
    pathA = { label: '订近7天的票就出发', standpoint: '此卦《小畜》：先查好退票/退订规则（写在记事本里）、贵重物品分两个箱子放、打印+手机各存1份行程单，3条做完再支付。', risks: '不看退票规则就下单、行李全放一个箱子、0点到陌生城市再找酒店→全是雷' };
    pathB = { label: '再等7-14天，做足准备再出发', standpoint: '此卦《旅》：先列1张必带清单（身份证/充电宝/常用药/伞/现金200），再查目的地7天天气+当地近期新闻，确认同行人时间再订。', risks: '临时决定最容易漏东西/赶不上车；出发前3天再查一次当地的特殊规定（防疫/防火/门票）' };
  } else if (has(loveKws) && yong.topic === '情感姻缘') {
    pathA = { label: '今晚/3天内就说/就见面', standpoint: '此卦《咸》：不带手机、10分钟独处，先讲你最舍不得的是什么（不说"你总是"）；情绪稳定≥吵架后24h再开口。', risks: '吵架后24h内说分手/提复合→90%会后悔；翻手机、用"为你好"开头→必死' };
    pathB = { label: '先冷静7天，再约共同朋友聊一次', standpoint: '此卦《恒》：写3条"底线（任何时候破了就走）"，再约你们都认识的1位朋友聊半小时，看你有没有美化/丑化对方。', risks: '冷战超过14天→等于默认结束；别用朋友圈/群聊放狠话试探' };
  } else if (has(jobKws) && yong.topic === '仕途职场') {
    pathA = { label: '2周内递简历/接offer/提离职', standpoint: '此卦《大有》：先列"你要从这份工作拿到5条（按重要度排）"，再写新岗位18个月目标→反推这18个月你每天在干嘛；想清楚再动。', risks: '只听直属领导的面辞、没聊过大一级领导就跳、在群里吐槽→事后全是雷' };
    pathB = { label: '再观察3个月，今晚先列"我真正要什么"', standpoint: '此卦《艮》：3天内约一个你佩服、比你大10岁的前辈吃顿饭，别带问题，就问他"这几年最后悔什么"；再决定。', risks: '一周连改3次方向→改到第4次你会恨现在的自己；别用"大家都跳了"做决定' };
  } else if (has(investKws) && yong.topic === '财务损益') {
    pathA = { label: '现在就用1/10仓位试单（小步走）', standpoint: '此卦《损》：先写3个数字（最坏可接受损失/最理想收益/能睡得着的仓位比例），按最小仓位（1/10）先走一次完整买→卖→止盈→止损流程。', risks: '信用卡/消费贷补仓、看别人赚了就追、把3个月生活费全投→利滚利把小事拖成大事' };
    pathB = { label: '先等3天，今晚先问"在这事上亏过钱的人"10分钟', standpoint: '此卦《节》：3天内去问一个在这件事上真亏过钱的人，他10分钟顶你看100篇成功贴；再决定仓位。', risks: '你现在急着买的90%是被情绪推的；等3天还想买→再动；先拿"亏完能睡得着的钱"试' };
  } else if (has(studyKws) && yong.topic === '学业文书') {
    pathA = { label: '今天就开第一页/做第一道/报这个名', standpoint: '此卦《蒙》：别等"有状态"；今晚固定一个90分钟块（手机放另一个房间），先把第一题/第一页做完→做完再谈要不要开始。', risks: '同时开3个方向（考研/实习/创业都想抓）、堆20本书不翻、以"我学过了"代替"我做过了"→最后全抓不住' };
    pathB = { label: '花3天想清楚"为什么考/学"，再列本周只做3件真事', standpoint: '此卦《渐》：今晚写"考/学成之后，我具体在哪、在干嘛"（别写空话）；周日晚上复盘本周3件真做了的事（不是计划）。', risks: '先买20本书/报3个班感动自己→不如今天先开第1章' };
  } else if (has(moveKws) && yong.topic === '家居住宅') {
    pathA = { label: '这两周就签/搬（按3次实地→再签）', standpoint: '此卦《家人》：周三下午/周六白天/周日晚上→3个不同时间各去看1次（噪音/采光/邻居状态完全不同）；合同先划"押金/转租/违约金/维修"4条读3遍。', risks: '只看照片就签、签1年不写转租条款、信口头承诺不落白字+拍照→全亏' };
    pathB = { label: '再看1个月，先列3条不能妥协', standpoint: '此卦《需》：写死"不能妥协3条"（例：朝南/独卫/地铁站步行10分钟内），不满足就不签，宁住过渡房1个月。', risks: '急着搬的80%第2周就后悔；先实地夜访1次（20-22点），听噪音看楼道' };
  } else if (yong.topic === '六亲关系') {
    pathA = { label: '今晚回家就抱/说"你今天也辛苦了"', standpoint: '此卦《萃》：见面第一句别讲道理，先讲情绪（"嗯，这个确实很烦/很难/很气"）；前3句绝对不说"但是"。', risks: '饭桌上讲正事→饭是吃饭的，讲事必吵；"为你好"一开口→对方听不进第二句' };
    pathB = { label: '本周内约一次"30分钟无手机聊天"', standpoint: '此卦《豫》：固定每周1次"无手机时间"（就30分钟，手机放另一个房间），先听对方讲完10分钟，别急着给方案。', risks: '讲1分钟就忍不住给建议→你以为是帮，对方觉得你根本没听' };
  } else if (yong.topic === '健康颐养') {
    pathA = { label: '从今晚就改1件最小的事', standpoint: '此卦《颐》：只选1件（早睡30min / 今天多走3000步 / 今晚不点外卖），别贪多，做到1周再加第二件。', risks: '突然加到原来2倍运动→第二天身体会罢工；情绪不好胡吃海塞→情绪不会好，体重涨了更烦' };
    pathB = { label: '先花2天翻体检报告，找3个异常指标写3个对应日常动作', standpoint: '此卦《复》：把体检报告找出来，圈3个箭头（↑/↓）的指标，每个写1个日常动作（别写"要健康"这种空话）；持续1个月再看变化。', risks: '把"睡不好/最近累"当小事硬扛→1周以上没好转就去看，别拖' };
  } else {
    // 通用兜底（其他所有话题：人生决策/未命中以上分类）
    pathA = { label: '7天内就行动（按最小步）', standpoint: `此卦《${guaName}》：今晚先列"最坏/最好/一般3个版本"，按可接受的那个，先做最小一步（例：打1通电话/发1条消息/写1页计划）—— 做了才会有路。`, risks: '一周内连改3次方向→改到第4次你会恨自己；用"大家都这样"给自己决定→你不是大家' };
    pathB = { label: '先等3天，写"3件绝对不能做的事"+"1年后自己的忠告"', standpoint: `此卦《${guaName}》：列"底线3条（绝对不做）"守住，再给"来自1年后自己的忠告"写1句话（存锁屏/钱包），3天后还是想动→再动。`, risks: '别只问同辈，去问比你大10岁、现在过得不纠结的人10分钟' };
  }

  // standpoint 统一挂卦名，让用户一眼能对应上
  const guaTag = `${movingLine ? `（${guaTrigram}${guaName}卦·第${movingLine}爻动）` : `（${guaTrigram}${guaName}卦）`}`;
  pathA = { ...pathA, standpoint: `${guaTag} ${pathA.standpoint}` };
  pathB = { ...pathB, standpoint: `${guaTag} ${pathB.standpoint}` };

  return {
    sanJi: bans,
    sanYao: dos,
    topic: yong.topic,
    guaName: g.name,
    core,
    twoPaths: { A: pathA, B: pathB },
    agentsBrief: (agents || []).filter(a => a && a.role !== 'master').map(a => `${a.name}(${ (a.stance||'').replace(/视角$/,'').slice(0,6) })`).join('·') || '无智囊合局',
  };
}

/**
 * 生成"数字符牒"（抉择完成后给用户复制的唯一凭证，命牌上也会印）
 * 例：YAN-SANDBOX/签#2026..-14-3 大有·三爻动｜乾金·用神妻财｜择：抓住机会｜F1A9C3
 */
export function buildFuTie(signId, gua, yongShenObj, choice, commit, agents) {
  const g = gua || GUA_64[0];
  const yong = yongShenObj?.yongShen || '世爻';
  const choiceLabel = (typeof choice === 'string') ? choice : (choice?.label || '未择');
  const agentNames = (agents || []).filter(a => a && a.role !== 'master').map(a => a.name).join('/') || '众智';
  const commitShort = String(commit || '').trim().slice(0, 12);
  const hash = Math.abs(
    Array.from(`${signId}${g.name}${choiceLabel}${commitShort}${agentNames}`).reduce(
      (acc, c) => ((acc << 5) - acc) + c.charCodeAt(0), 0
    )
  ).toString(16).toUpperCase().slice(0, 6).padStart(6, '0');
  const guaPart = `${g.name}卦${g.movingLine ? `·${g.movingLine}爻动` : ''}｜${g.palace||''}宫${g.wuxing||''}·用神${yong}`;
  const choicePart = `择·${choiceLabel}${commitShort ? `｜铭·${commitShort}` : ''}`;
  return `YAN·签牒/${signId}｜${guaPart}｜${choicePart}｜合智·${agentNames}｜验印·${hash}`;
}

// ============================================================
// 【7】命牌内容：四句七言签语 + 赛博白话翻译（本地规则生成，秒出）
// ============================================================
function firstTonePoemStyle(text) {
  // 简单 7 字 x 4 句 模板填充，保证"像签语"而不是大白话
  const g = text?.gua || GUA_64[0];
  const topic = text?.topic || '人生决策';
  const choice = text?.choice || '择中';
  const core = (text?.core || '此事').slice(0, 6).padEnd(6, '·');
  const yong = text?.yongShen || '世爻';
  const templates = [
    [
      `${g.name}卦启镜问${yong.slice(0,1)}`,
      `${core.slice(0,4)}人${topic.slice(0,1)}路未通`,
      `劝君先守${choice.slice(0,2)}意`,
      `三忌三要记胸中`,
    ],
    [
      `六爻排定${g.wuxing||'金'}气生`,
      `${yong.slice(0,2)}为用神莫乱更`,
      `${topic.slice(0,2)}路上逢${choice.slice(0,2)}`,
      `一签落下鬼神惊`,
    ],
    [
      `${g.trigram||'☰'}符初落定机先`,
      `众智同参${topic.slice(0,2)}缘`,
      `${choice.slice(0,2)}径非为人间道`,
      `灵机一动即真传`,
    ],
    [
      `天干地支配${g.name}`,
      `第${g.movingLine||3}爻动事难全`,
      `请君细味${topic.slice(0,2)}味`,
      `${choice.slice(0,2)}了心头便是仙`,
    ],
  ];
  const idx = Math.abs(Array.from(`${g.name}${topic}${choice}`).reduce(
    (a,c) => ((a<<5)-a)+c.charCodeAt(0), 0
  )) % templates.length;
  return templates[idx].map(s => s.replace(/[·\s]/g, '').padEnd(7, '·').slice(0, 7));
}

function cyberTranslate(sentence, text) {
  const topic = text?.topic || '人生决策';
  const choice = text?.choice || '择中';
  const yong = text?.yongShen || '世爻';
  const map = {
    '仕途职场': `白话：Q3-${choice}-路线 · 按用神${yong}推演，3个月内看直属上级是否仍能给你新信息。`,
    '情感姻缘': `白话：${choice}的方向，请以"情绪稳不稳"而非"他/她爱不爱"为第一判断标准。`,
    '财务损益': `白话：仓位按"睡得着原则"砍一半再动 · 用${yong}为锚，3个月回头看会谢现在的自己。`,
    '学业文书': `白话：今日先开第一页/第一题 · 以${yong}为锚，别在资料堆里假装努力。`,
    '健康颐养': `白话：今晚就做 1 个最小改变（早睡30m / 多走3k步） · 以${yong}为根，别硬扛。`,
    '家居住宅': `白话：签前实地 3 次（夜访/周末/周中） · 以${yong}为据，口头承诺一律不算。`,
    '出行迁徙': `白话：行程/证件/现金三份备份 · 以${yong}为凭，先看退票规则再下单。`,
    '六亲关系': `白话：${choice}路第一句别讲道理 · 以${yong}为先，先讲"你辛苦了抱抱"。`,
    '人生决策': `白话：${choice}· 用 1 年后的你写句忠告放锁屏 · 以${yong}为锚，底线 3 条先守住。`,
  };
  return map[topic] || map['人生决策'];
}

export function buildSignPoemAndTranslate({ gua, topic, choice, core, yongShen, agents }) {
  const poemLines = firstTonePoemStyle({ gua, topic, choice, core, yongShen });
  const cyberLine = cyberTranslate(poemLines.join(''), { topic, choice, yongShen });
  return { poemLines, cyberLine };
}

// ============================================================
// 【8】16位数字符命（命牌右下角印的 16 位，唯一哈希）
// ============================================================
export function buildFateSign16(signId, gua, choice, commit, agents, poemLines) {
  const raw = [
    signId,
    gua?.name, gua?.movingLine, gua?.wuxing,
    typeof choice === 'string' ? choice : choice?.id,
    String(commit||'').slice(0, 20),
    (agents || []).map(a => a?.id || '').sort().join(','),
    (poemLines || []).join(''),
  ].join('||');
  // 做两次 sha 风格的 hash，确保 16 位
  let h1 = 0xdeadbeef ^ 0x9e3779b9;
  let h2 = 0x41c6ce57 ^ 0x85ebca6b;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex1 = (h1 >>> 0).toString(16).toUpperCase().padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).toUpperCase().padStart(8, '0');
  const s16 = (hex1 + hex2).slice(0, 16).padEnd(16, '0');
  // 每 4 位一段 · 看起来更像"命印"
  return `${s16.slice(0,4)}·${s16.slice(4,8)}·${s16.slice(8,12)}·${s16.slice(12,16)}`;
}

// ============================================================
// 【9】行动符文 SVG：把卦名 + 16位符命 + 选择方向 编成一张"赛博符箓"
//     不依赖任何外部，返回纯 SVG 字符串（可直接贴到 img src 或 SVG 组件里）
// ============================================================
export function buildActionRuneSvg({ signId16, gua, choice, width = 320, height = 160 }) {
  const name = gua?.name || '卦';
  const symbol = gua?.trigram || '☰';
  const movingLine = gua?.movingLine || 3;
  const choiceLabel = (typeof choice === 'string') ? choice : (choice?.label || '择');
  const yao = gua?.yaoArray || [1, 0, 1, 1, 0, 1];
  const W = width, H = height;
  const barW = 20;
  const bars = yao.map((y, i) => {
    const x = 14 + i * (barW + 6);
    const isYang = y === 1;
    const isMoving = (i + 1 === movingLine);
    if (isYang) {
      return `<rect x="${x}" y="${H-42}" width="${barW}" height="6" fill="#FFE89A" opacity="${isMoving?1:0.88}"/>
              ${isMoving ? `<rect x="${x}" y="${H-44}" width="${barW}" height="2" fill="#FF5C6E"/>` : ''}`;
    }
    return `<rect x="${x}" y="${H-42}" width="${Math.floor(barW*0.4)}" height="6" fill="#4FD6FF" opacity="${isMoving?1:0.75}"/>
            <rect x="${x + Math.ceil(barW*0.6)}" y="${H-42}" width="${Math.floor(barW*0.4)}" height="6" fill="#4FD6FF" opacity="${isMoving?1:0.75}"/>
            ${isMoving ? `<circle cx="${x + barW/2}" cy="${H-40}" r="2" fill="#FF5C6E"/>` : ''}`;
  }).join('\n');
  const chunks = (signId16 || '0000·0000·0000·0000').split('·');
  const textRows = chunks.map((c, i) =>
    `<text x="${W - 14}" y="${34 + i * 22}"
       text-anchor="end" fill="#E8C670" fill-opacity="${0.45 + i * 0.1}"
       font-family="JetBrains Mono, ui-monospace, monospace" font-size="10" letter-spacing="2">${c}</text>`
  ).join('\n');
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <linearGradient id="rune-gold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFE89A"/>
      <stop offset="50%" stop-color="#E8C670"/>
      <stop offset="100%" stop-color="#8A5A1C"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="rgba(16,10,4,0.9)" stroke="url(#rune-gold)" stroke-width="1.2"/>
  <!-- 外框刻度：4个角短横 -->
  <g stroke="#FFD56B" stroke-opacity="0.45" stroke-width="1">
    <line x1="6" y1="6" x2="24" y2="6"/><line x1="6" y1="6" x2="6" y2="24"/>
    <line x1="${W-6}" y1="6" x2="${W-24}" y2="6"/><line x1="${W-6}" y1="6" x2="${W-6}" y2="24"/>
    <line x1="6" y1="${H-6}" x2="24" y2="${H-6}"/><line x1="6" y1="${H-6}" x2="6" y2="${H-24}"/>
    <line x1="${W-6}" y1="${H-6}" x2="${W-24}" y2="${H-6}"/><line x1="${W-6}" y1="${H-6}" x2="${W-6}" y2="${H-24}"/>
  </g>
  <!-- 左：卦符大字符 -->
  <text x="58" y="70" text-anchor="middle" fill="url(#rune-gold)" font-family="Ma Shan Zheng, serif"
    font-size="58" style="filter: drop-shadow(0 0 6px #FFE89A88);">${symbol}</text>
  <text x="58" y="98" text-anchor="middle" fill="#F0D890" font-family="Ma Shan Zheng, serif"
    font-size="18" letter-spacing="8">${name}卦</text>
  <text x="58" y="116" text-anchor="middle" fill="#80C8A8" font-family="JetBrains Mono, monospace"
    font-size="10" letter-spacing="2">· ${movingLine}爻动 · ${choiceLabel.slice(0,4)} ·</text>
  <!-- 中：六爻横排 -->
  ${bars}
  <text x="74" y="${H-18}" text-anchor="start" fill="#807870" font-family="Noto Serif SC, serif"
    font-size="9" letter-spacing="2">初—二—三—四—五—上</text>
  <!-- 右：16 位符命 4 行 -->
  ${textRows}
  <!-- 左下：赛博符胆字 -->
  <text x="18" y="${H-16}" text-anchor="start" fill="#FF5C6E" fill-opacity="0.75"
    font-family="Ma Shan Zheng, serif" font-size="12" letter-spacing="3">靈 機 · 如 響</text>
</svg>`.trim();
}

// ============================================================
// 导出辅助：找卦
// ============================================================
export function getGuaByIdx(idx) { return GUA_BY_IDX[idx] || GUA_64[0]; }
export function getGuaByName(n) { return GUA_BY_NAME[n] || GUA_64[0]; }
export function allGuaList() { return GUA_64.slice(); }

// 默认导出：给 useGameFlow 一次 import 全拿到
export default {
  generateQinianSeed,
  makeGuaSignId,
  buildZhuangGuaLog,
  buildYongShenConfirm,
  recommendAgentsByGua,
  yanBreakDown,
  buildSanBian,
  buildFuTie,
  buildSignPoemAndTranslate,
  buildFateSign16,
  buildActionRuneSvg,
  getGuaByIdx,
  getGuaByName,
  allGuaList,
};
