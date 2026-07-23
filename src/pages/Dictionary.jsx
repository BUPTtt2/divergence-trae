import { useState } from 'react';
import AppNav from '../components/AppNav';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

const T = {
  paper: '#F2EDE0',
  paperLight: '#FAF6EC',
  ink: '#1A1410',
  muted: '#7A7468',
  border: '#D9D2C0',
  accent: '#A8472E',
  gold: '#C8A850',
};

const GUA_DICTIONARY = [
  // 上经 30 卦
  { gua: '乾', trigram: '☰', element: '天', category: '纯阳', meaning: '刚健', verse: '元亨利贞', desc: '天行健，君子以自强不息', traits: ['积极', '进取', '领导', '开创'] },
  { gua: '坤', trigram: '☷', element: '地', category: '纯阴', meaning: '柔顺', verse: '元亨，利牝马之贞', desc: '地势坤，君子以厚德载物', traits: ['包容', '承载', '守成', '稳健'] },
  { gua: '屯', trigram: '☳', element: '雷', category: '始生', meaning: '萌芽', verse: '元亨利贞，勿用有攸往', desc: '云雷屯，君子以经纶', traits: ['初创', '积累', '谨慎', '蓄力'] },
  { gua: '蒙', trigram: '☵', element: '水', category: '启蒙', meaning: '蒙昧', verse: '亨。匪我求童蒙，童蒙求我', desc: '山下出泉，君子以果行育德', traits: ['学习', '成长', '探索', '启蒙'] },
  { gua: '需', trigram: '☰', element: '天', category: '等待', meaning: '需求', verse: '有孚，光亨，贞吉', desc: '云上于天，君子以饮食宴乐', traits: ['等待', '准备', '耐心', '机遇'] },
  { gua: '讼', trigram: '☵', element: '水', category: '争讼', meaning: '争端', verse: '有孚窒惕，中吉，终凶', desc: '天与水违行，君子以作事谋始', traits: ['争议', '谨慎', '沟通', '和解'] },
  { gua: '师', trigram: '☵', element: '水', category: '军队', meaning: '统帅', verse: '贞，丈人吉，无咎', desc: '地中有水，君子以容民畜众', traits: ['领导', '团队', '策略', '执行'] },
  { gua: '比', trigram: '☷', element: '地', category: '亲比', meaning: '亲近', verse: '吉。原筮元永贞，无咎', desc: '地上有水，先王以建万国，亲诸侯', traits: ['合作', '联盟', '人脉', '和谐'] },
  { gua: '小畜', trigram: '☰', element: '天', category: '小积蓄', meaning: '蓄积', verse: '亨。密云不雨，自我西郊', desc: '风行天上，君子以懿文德', traits: ['积累', '准备', '蓄力', '待时'] },
  { gua: '履', trigram: '☱', element: '泽', category: '践行', meaning: '履践', verse: '履虎尾，不咥人，亨', desc: '上天下泽，君子以辩上下，定民志', traits: ['行动', '谨慎', '实践', '守礼'] },
  { gua: '泰', trigram: '☰', element: '天', category: '通达', meaning: '太平', verse: '小往大来，吉亨', desc: '天地交，泰。后以财成天地之道', traits: ['顺利', '和谐', '通达', '繁荣'] },
  { gua: '否', trigram: '☷', element: '地', category: '阻塞', meaning: '否塞', verse: '否之匪人，不利君子贞', desc: '天地不交，否。君子以俭德辟难', traits: ['困境', '反思', '调整', '积蓄'] },
  { gua: '同人', trigram: '☲', element: '火', category: '同和', meaning: '亲和', verse: '同人于野，亨。利涉大川', desc: '天与火，同人。君子以类族辨物', traits: ['团结', '共识', '合作', '共赢'] },
  { gua: '大有', trigram: '☰', element: '天', category: '大获', meaning: '丰盛', verse: '元亨', desc: '火在天上，君子以遏恶扬善', traits: ['收获', '成功', '富足', '显扬'] },
  { gua: '谦', trigram: '☶', element: '山', category: '谦虚', meaning: '谦逊', verse: '亨，君子有终', desc: '地中有山，君子以裒多益寡', traits: ['谦虚', '低调', '包容', '进步'] },
  { gua: '豫', trigram: '☷', element: '地', category: '欢乐', meaning: '愉悦', verse: '利建侯行师', desc: '雷出地奋，先王以作乐崇德', traits: ['快乐', '放松', '庆祝', '规划'] },
  { gua: '随', trigram: '☳', element: '雷', category: '随从', meaning: '顺应', verse: '元亨利贞，无咎', desc: '泽中有雷，君子以向晦入宴息', traits: ['顺应', '灵活', '跟随', '适变'] },
  { gua: '蛊', trigram: '☴', element: '风', category: '整治', meaning: '革新', verse: '元亨，利涉大川', desc: '山下有风，君子以振民育德', traits: ['革新', '治理', '修复', '整顿'] },
  { gua: '临', trigram: '☱', element: '泽', category: '临近', meaning: '临莅', verse: '元亨利贞，至于八月有凶', desc: '泽上有地，君子以教思无穷', traits: ['进取', '临莅', '接近', '把握'] },
  { gua: '观', trigram: '☷', element: '地', category: '观察', meaning: '审视', verse: '盥而不荐，有孚顒若', desc: '风行地上，先王以省方观民', traits: ['观察', '审视', '体悟', '明察'] },
  { gua: '噬嗑', trigram: '☳', element: '雷', category: '咬合', meaning: '决断', verse: '亨，利用狱', desc: '雷电噬嗑，先王以明罚敕法', traits: ['决断', '刑罚', '清除', '果决'] },
  { gua: '贲', trigram: '☲', element: '火', category: '装饰', meaning: '修饰', verse: '亨，小利有攸往', desc: '山下有火，君子以明庶政无敢折狱', traits: ['修饰', '美化', '文采', '装饰'] },
  { gua: '剥', trigram: '☷', element: '地', category: '剥落', meaning: '衰退', verse: '不利有攸往', desc: '山附于地，上以厚下安宅', traits: ['衰退', '减损', '守成', '蓄力'] },
  { gua: '复', trigram: '☳', element: '雷', category: '回复', meaning: '复归', verse: '亨，出入无疾，朋来无咎', desc: '雷在地中，复。先王以至日闭关', traits: ['复归', '转机', '新生', '重启'] },
  { gua: '无妄', trigram: '☳', element: '雷', category: '无妄', meaning: '真实', verse: '元亨利贞，其匪正有眚', desc: '天下雷行，物与无妄', traits: ['真实', '正道', '无伪', '顺应'] },
  { gua: '大畜', trigram: '☰', element: '天', category: '大蓄', meaning: '蓄养', verse: '利贞，不家食吉', desc: '天在山中，大畜。君子以多识前言往行', traits: ['积累', '蓄养', '博学', '厚积'] },
  { gua: '颐', trigram: '☳', element: '雷', category: '养育', meaning: '养生', verse: '贞吉，观颐，自求口实', desc: '山下有雷，颐。君子以慎言语节饮食', traits: ['养生', '节制', '涵养', '自省'] },
  { gua: '大过', trigram: '☴', element: '风', category: '过度', meaning: '非常', verse: '栋桡，利有攸往，亨', desc: '泽灭木，大过。君子以独立不惧', traits: ['非常', '突破', '担当', '果敢'] },
  { gua: '坎', trigram: '☵', element: '水', category: '重险', meaning: '险阻', verse: '习坎，有孚，维心亨，行有尚', desc: '水洊至，习坎。君子以常德行', traits: ['险阻', '坚韧', '诚信', '历练'] },
  { gua: '离', trigram: '☲', element: '火', category: '光明', meaning: '依附', verse: '利贞，亨。畜牝牛吉', desc: '明两作，离。大人以继明照于四方', traits: ['光明', '依附', '文明', '照耀'] },
  // 下经 34 卦
  { gua: '咸', trigram: '☶', element: '山', category: '感应', meaning: '交感', verse: '亨，利贞，取女吉', desc: '山上有泽，咸。君子以虚受人', traits: ['感应', '交流', '情感', '共鸣'] },
  { gua: '恒', trigram: '☴', element: '风', category: '恒久', meaning: '恒常', verse: '亨，无咎，利贞', desc: '雷风，恒。君子以立不易方', traits: ['恒常', '持久', '守正', '稳定'] },
  { gua: '遁', trigram: '☶', element: '山', category: '退避', meaning: '退守', verse: '亨，小利贞', desc: '天下有山，遁。君子以远小人', traits: ['退守', '避让', '隐退', '明智'] },
  { gua: '大壮', trigram: '☰', element: '天', category: '强盛', meaning: '壮健', verse: '利贞', desc: '雷在天上，大壮。君子以非礼弗履', traits: ['强盛', '壮健', '刚健', '守礼'] },
  { gua: '晋', trigram: '☷', element: '地', category: '晋升', meaning: '上进', verse: '康侯用锡马蕃庶，昼日三接', desc: '明出地上，晋。君子以自昭明德', traits: ['晋升', '进取', '光明', '上进'] },
  { gua: '明夷', trigram: '☲', element: '火', category: '黯淡', meaning: '隐忍', verse: '利艰贞', desc: '明入地中，明夷。君子以莅众用晦而明', traits: ['隐忍', '守拙', '韬光', '晦藏'] },
  { gua: '家人', trigram: '☲', element: '火', category: '家和', meaning: '内治', verse: '利女贞', desc: '风自火出，家人。君子以言有物而行有恒', traits: ['和睦', '齐家', '内治', '团结'] },
  { gua: '睽', trigram: '☱', element: '泽', category: '乖离', meaning: '差异', verse: '小事吉', desc: '上火下泽，睽。君子以同而异', traits: ['差异', '独立', '求同', '存异'] },
  { gua: '蹇', trigram: '☶', element: '山', category: '艰难', meaning: '险阻', verse: '利西南，不利东北', desc: '山上有水，蹇。君子以反身修德', traits: ['困难', '险阻', '修德', '反省'] },
  { gua: '解', trigram: '☵', element: '水', category: '解脱', meaning: '化解', verse: '利西南，无所往，其来复吉', desc: '雷雨作，解。君子以赦过宥罪', traits: ['化解', '释放', '宽恕', '缓解'] },
  { gua: '损', trigram: '☱', element: '泽', category: '减损', meaning: '克制', verse: '有孚，元吉，无咎，可贞', desc: '山下有泽，损。君子以惩忿窒欲', traits: ['克制', '减省', '节制', '谦抑'] },
  { gua: '益', trigram: '☳', element: '雷', category: '增益', meaning: '增长', verse: '利有攸往，利涉大川', desc: '风雷，益。君子以见善则迁，有过则改', traits: ['增长', '益处', '改过', '迁善'] },
  { gua: '夬', trigram: '☰', element: '天', category: '决断', meaning: '果决', verse: '扬于王庭，孚号有厉', desc: '泽上于天，夬。君子以施禄及下', traits: ['决断', '果决', '清除', '决裂'] },
  { gua: '姤', trigram: '☴', element: '风', category: '相遇', meaning: '邂逅', verse: '女壮，勿用取女', desc: '天下有风，姤。后以施命诰四方', traits: ['邂逅', '机遇', '相遇', '警觉'] },
  { gua: '萃', trigram: '☷', element: '地', category: '聚集', meaning: '聚合', verse: '亨，王假有庙，利见大人', desc: '泽上于地，萃。君子以除戎器戒不虞', traits: ['聚合', '汇集', '团结', '防备'] },
  { gua: '升', trigram: '☴', element: '风', category: '上升', meaning: '晋升', verse: '元亨，用见大人，勿恤', desc: '地中生木，升。君子以顺德积小以高大', traits: ['上升', '晋升', '成长', '积累'] },
  { gua: '困', trigram: '☵', element: '水', category: '困境', meaning: '困顿', verse: '亨，贞，大人吉，无咎', desc: '泽无水，困。君子以致命遂志', traits: ['困顿', '坚守', '志向', '忍耐'] },
  { gua: '井', trigram: '☴', element: '风', category: '井养', meaning: '滋养', verse: '改邑不改井，无丧无得', desc: '木上有水，井。君子以劳民劝相', traits: ['滋养', '源泉', '守恒', '奉献'] },
  { gua: '革', trigram: '☲', element: '火', category: '变革', meaning: '革新', verse: '己日乃孚，元亨利贞，悔亡', desc: '泽中有火，革。君子以治历明时', traits: ['变革', '革新', '改易', '创新'] },
  { gua: '鼎', trigram: '☴', element: '风', category: '鼎新', meaning: '确立', verse: '元吉，亨', desc: '木上有火，鼎。君子以正位凝命', traits: ['鼎新', '确立', '稳固', '革新'] },
  { gua: '震', trigram: '☳', element: '雷', category: '震动', meaning: '警醒', verse: '亨，震来虩虩，笑言哑哑', desc: '洊雷，震。君子以恐惧修省', traits: ['震动', '警醒', '反思', '觉醒'] },
  { gua: '艮', trigram: '☶', element: '山', category: '静止', meaning: '知止', verse: '艮其背，不获其身', desc: '兼山，艮。君子以思不出其位', traits: ['静止', '知止', '守本', '安定'] },
  { gua: '渐', trigram: '☶', element: '山', category: '渐进', meaning: '循序', verse: '女归吉，利贞', desc: '山上有木，渐。君子以居贤德善俗', traits: ['渐进', '循序', '稳健', '成长'] },
  { gua: '归妹', trigram: '☱', element: '泽', category: '归终', meaning: '归宿', verse: '征凶，无攸利', desc: '泽上有雷，归妹。君子以永终知敝', traits: ['归宿', '终局', '慎重', '知敝'] },
  { gua: '丰', trigram: '☲', element: '火', category: '丰盛', meaning: '鼎盛', verse: '亨，王假之，勿忧，宜日中', desc: '雷电皆至，丰。君子以折狱致刑', traits: ['丰盛', '鼎盛', '光大', '明断'] },
  { gua: '旅', trigram: '☶', element: '山', category: '旅行', meaning: '行旅', verse: '小亨，旅贞吉', desc: '山上有火，旅。君子以明慎用刑', traits: ['行旅', '漂泊', '谨慎', '明察'] },
  { gua: '巽', trigram: '☴', element: '风', category: '顺从', meaning: '渗透', verse: '小亨，利有攸往，利见大人', desc: '随风，巽。君子以申命行事', traits: ['顺从', '沟通', '渐进', '渗透'] },
  { gua: '兑', trigram: '☱', element: '泽', category: '喜悦', meaning: '和乐', verse: '亨，利贞', desc: '丽泽，兑。君子以朋友讲习', traits: ['喜悦', '交流', '和乐', '沟通'] },
  { gua: '涣', trigram: '☵', element: '水', category: '涣散', meaning: '化解', verse: '亨，王假有庙，利涉大川', desc: '风行水上，涣。先王以享于帝立庙', traits: ['涣散', '化解', '流通', '聚合'] },
  { gua: '节', trigram: '☱', element: '泽', category: '节制', meaning: '适度', verse: '亨，苦节不可贞', desc: '泽上有水，节。君子以制数度议德行', traits: ['节制', '适度', '规范', '守度'] },
  { gua: '中孚', trigram: '☱', element: '泽', category: '诚信', meaning: '中道', verse: '豚鱼吉，利涉大川，利贞', desc: '泽上有风，中孚。君子以议狱缓死', traits: ['诚信', '感应', '中道', '虚心'] },
  { gua: '小过', trigram: '☶', element: '山', category: '小过', meaning: '谦恭', verse: '亨，利贞，可小事不可大事', desc: '山上有雷，小过。君子以行过乎恭', traits: ['小过', '谨慎', '谦恭', '守小'] },
  { gua: '既济', trigram: '☲', element: '火', category: '完成', meaning: '圆满', verse: '亨小，利贞，初吉终乱', desc: '水在火上，既济。君子以思患而预防', traits: ['完成', '圆满', '守成', '防患'] },
  { gua: '未济', trigram: '☵', element: '水', category: '未完成', meaning: '未竟', verse: '亨，小狐汔济，濡其尾', desc: '火在水上，未济。君子以慎辨物居方', traits: ['未竟', '期待', '转化', '新始'] },
];

const ELEMENTS = ['全部', '天', '地', '雷', '风', '水', '火', '山', '泽'];

export default function Dictionary() {
  const navigate = useNavigate();
  const [selectedGua, setSelectedGua] = useState(null);
  const [filterElement, setFilterElement] = useState('全部');

  const filteredGua = filterElement === '全部' 
    ? GUA_DICTIONARY 
    : GUA_DICTIONARY.filter(g => g.element === filterElement);

  return (
    <div className="min-h-screen" style={{ backgroundColor: T.paper, color: T.ink, fontFamily: '"Ma Shan Zheng", "ZCOOL XiaoWei", "Noto Serif SC", serif' }}>

      <div className="pt-14 max-w-[1000px] mx-auto px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <p className="text-[10px] font-mono tracking-[0.25em] mb-4" style={{ color: T.muted }}>DICTIONARY / 卦象词典</p>
          <h1 className="text-4xl md:text-5xl font-serif font-bold">六十四卦详解</h1>
          <p className="text-[14px] mt-4" style={{ color: T.muted }}>
            每卦皆藏天地之理，推演人事吉凶。
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex flex-wrap justify-center gap-2 mb-10"
        >
          {ELEMENTS.map((el) => (
            <button
              key={el}
              onClick={() => setFilterElement(el)}
              className="px-4 py-2 text-[11px] font-mono transition-all"
              style={{
                backgroundColor: filterElement === el ? T.accent : T.paperLight,
                color: filterElement === el ? T.paperLight : T.ink,
                border: `1px solid ${T.border}`,
                borderRadius: 3,
                cursor: 'pointer',
              }}
            >
              {el}
            </button>
          ))}
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredGua.map((gua, i) => (
            <motion.div
              key={gua.gua}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => setSelectedGua(gua)}
              className="p-5 cursor-pointer"
              style={{
                backgroundColor: T.paperLight,
                border: `1px solid ${T.border}`,
                borderRadius: 6,
              }}
            >
              <div className="text-center">
                <span className="text-4xl font-serif">{gua.trigram}</span>
                <div className="text-xl font-serif font-bold mt-2">{gua.gua}</div>
                <div className="text-[10px] font-mono mt-1" style={{ color: T.muted }}>
                  {gua.element} · {gua.category}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {selectedGua && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6"
            style={{ backgroundColor: 'rgba(20,16,12,0.85)' }}
            onClick={() => setSelectedGua(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="max-w-[500px] w-full p-8"
              style={{ backgroundColor: T.paper, borderRadius: 8 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center mb-8">
                <span className="text-7xl font-serif">{selectedGua.trigram}</span>
                <div className="text-3xl font-serif font-bold mt-4">{selectedGua.gua}</div>
                <div className="flex items-center justify-center gap-4 mt-2">
                  <span className="text-[10px] font-mono px-2 py-1" style={{ backgroundColor: `${T.accent}12`, borderRadius: 2 }}>
                    {selectedGua.element}
                  </span>
                  <span className="text-[10px] font-mono px-2 py-1" style={{ backgroundColor: `${T.gold}12`, borderRadius: 2 }}>
                    {selectedGua.category}
                  </span>
                  <span className="text-[10px] font-mono px-2 py-1" style={{ backgroundColor: `${T.muted}12`, borderRadius: 2 }}>
                    {selectedGua.meaning}
                  </span>
                </div>
              </div>

              <div className="mb-6">
                <div className="text-[10px] font-mono mb-2" style={{ color: T.muted }}>卦辞</div>
                <div className="text-xl font-serif italic text-center" style={{ color: T.accent }}>
                  {selectedGua.verse}
                </div>
              </div>

              <div className="mb-6">
                <div className="text-[10px] font-mono mb-2" style={{ color: T.muted }}>象传</div>
                <div className="text-[14px] leading-relaxed text-center">
                  {selectedGua.desc}
                </div>
              </div>

              <div className="flex flex-wrap justify-center gap-2">
                {selectedGua.traits.map((t) => (
                  <span
                    key={t}
                    className="text-[11px] font-mono px-3 py-1"
                    style={{
                      backgroundColor: T.paperLight,
                      border: `1px solid ${T.border}`,
                      borderRadius: 3,
                    }}
                  >
                    {t}
                  </span>
                ))}
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setSelectedGua(null)}
                className="w-full mt-8 py-3 text-[12px] font-medium"
                style={{
                  backgroundColor: T.ink,
                  color: T.paperLight,
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
              >
                关闭
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}