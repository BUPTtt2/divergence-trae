import { useNavigate } from 'react-router-dom';

export default function Legal() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F2EDE0', color: '#1A1410', fontFamily: '"Noto Serif SC", serif' }}>
      <div className="max-w-3xl mx-auto px-6 py-16">
        <button onClick={() => navigate('/')} className="text-sm mb-8 hover:underline" style={{ color: '#7A7468' }}>返回首页</button>
        <h1 className="text-3xl font-bold mb-2">用户服务协议</h1>
        <p className="text-sm mb-8" style={{ color: '#7A7468' }}>最后更新：2026年7月13日</p>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">1. 服务说明</h2>
          <p className="text-sm leading-relaxed mb-3" style={{ color: '#7A7468' }}>
            「演策」是一款基于人工智能的决策辅助工具。本服务提供的推演结果、卦象解读、Agent发言等内容仅供参考，不构成专业建议。
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">2. 免责声明</h2>
          <p className="text-sm leading-relaxed mb-3" style={{ color: '#7A7468' }}>
            <strong style={{ color: '#A8472E' }}>重要提示：</strong>演策的推演结果由AI生成，可能包含不准确内容。涉及医疗、法律、金融等重大决策时，请务必咨询专业人士。
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">3. AI生成内容标识</h2>
          <p className="text-sm leading-relaxed mb-3" style={{ color: '#7A7468' }}>
            本服务中所有Agent（智囊）的发言、卦象解读、推演总结等内容均由人工智能生成，并非真人观点。
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">4. 未成年人保护</h2>
          <p className="text-sm leading-relaxed mb-3" style={{ color: '#7A7468' }}>
            本服务面向年满18周岁的成年人提供。未满18周岁的用户请在监护人指导下使用。
          </p>
        </section>

        <div className="mt-12 pt-6 text-center" style={{ borderTop: '1px solid #D9D2C0' }}>
          <button onClick={() => navigate('/')} className="px-6 py-2 text-sm" style={{ backgroundColor: '#1A1410', color: '#F2EDE0', borderRadius: 3 }}>
            返回首页
          </button>
        </div>
      </div>
    </div>
  );
}
