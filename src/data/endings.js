/**
 * Fate card data and dice configuration
 */

export const FATE_CARDS = {

  fate_accept: {
    id: 'fate_accept',
    title: '命运卡：跃迁之路',
    type: 'positive',
    border: 'linear-gradient(135deg, #E8A830, #00A86B)',

    summary: [
      '你接受了新 Offer，踏入 AI 赛道的未知领域。',
      '前三个月的混乱超出预期——新团队的沟通成本、',
      '空降总监的管理风格、不熟悉的技术栈，',
      '每一项都在考验你的适应力。',
      '',
      '但六个月后，你主导了一个核心模型应用项目，',
      '在团队里建立了不可替代的位置。',
      '你的成长速度甚至超过了最乐观的推演。',
    ],

    stats: [
      { label: '成长性', value: 9, max: 10, desc: '远超预期' },
      { label: '稳定性', value: 4, max: 10, desc: '阵痛期较长' },
      { label: '薪资收益', value: 8, max: 10, desc: '锚点已抬升' },
      { label: '幸福感', value: 7, max: 10, desc: '痛并快乐着' },
    ],

    epilogue: '一年后你偶然和前同事吃饭，聊起那段纠结的日子，你笑着说："当时确实怕，但现在回头看，那是这几年做得最对的决定。"',
    bonus: '隐藏成就解锁：孤注一掷者——在悲观信号下仍选择接受 Offer',
  },

  fate_reject: {
    id: 'fate_reject',
    title: '命运卡：稳守之策',
    type: 'neutral',
    border: 'linear-gradient(135deg, #7B8794, #A0AAB4)',

    summary: [
      '你拒绝了新 Offer，选择留在现公司继续深耕。',
      '最初几周，"本可以"的念头偶尔会在深夜冒出来，',
      '让你翻来覆去睡不着。',
      '',
      '但第三个月，你主动申请了一个跨部门项目，',
      '重新找到了工作中的兴奋感。',
      '半年后你开始带新人，发现了指导他人的乐趣。',
    ],

    stats: [
      { label: '成长性', value: 5, max: 10, desc: '内部新机会' },
      { label: '稳定性', value: 9, max: 10, desc: '环境可控' },
      { label: '薪资收益', value: 6, max: 10, desc: '稳健但有限' },
      { label: '幸福感', value: 8, max: 10, desc: '踏实安心' },
    ],

    epilogue: '半年后你听说那家 AI 公司因为融资不顺进行了一轮裁员。你并不庆幸，只是平静地关掉了消息推送。有时候最好的决定，不是最有野心的那个，而是最适合自己的那个。',
    bonus: '隐藏成就解锁：定力之盾——在乐观信号下仍选择拒绝 Offer',
  },
};

export const DICE_CONFIG = {
  sides: 6,
  highThreshold: 4, // 4-6 = optimistic
  thresholds: {
    optimistic: { min: 4, max: 6, label: '乐观', color: '#00A86B' },
    pessimistic: { min: 1, max: 3, label: '悲观', color: '#D94F4F' },
  },
  flavor: {
    1: '厄运当头...',
    2: '暗流涌动',
    3: '前路不明',
    4: '柳暗花明',
    5: '贵人相助',
    6: '天命所归!',
  },
};
