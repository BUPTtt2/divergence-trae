import { useNavigate } from 'react-router-dom';

export default function Privacy() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F2EDE0', color: '#1A1410', fontFamily: '"Noto Serif SC", serif' }}>
      <div className="max-w-3xl mx-auto px-6 py-16">
        <button onClick={() => navigate('/')} className="text-sm mb-8 hover:underline" style={{ color: '#7A7468' }}>返回首页</button>
        <h1 className="text-3xl font-bold mb-2">隐私政策</h1>
        <p className="text-sm mb-8" style={{ color: '#7A7468' }}>最后更新：2026年7月13日</p>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">1. 信息收集</h2>
          <p className="text-sm leading-relaxed mb-3" style={{ color: '#7A7468' }}>
            我们可能收集的信息包括：推演记录、对话内容、用户设置的自定义Agent信息、本地存储的笔记与偏好设置。
            我们不会收集用户的真实姓名、身份证号、银行卡等敏感个人信息。
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">2. 信息使用</h2>
          <p className="text-sm leading-relaxed mb-3" style={{ color: '#7A7468' }}>
            收集的信息仅用于提供推演服务、优化Agent回复质量、生成本地化记忆与推荐。
            对话内容可能被用于匿名化的模型效果分析，但不会与任何第三方共享可识别个人身份的数据。
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">3. 数据存储</h2>
          <p className="text-sm leading-relaxed mb-3" style={{ color: '#7A7468' }}>
            大部分数据（如笔记、推演记录、偏好）仅存储在您的浏览器本地（localStorage）。
            如需清除数据，可在浏览器设置中清除本站点的本地存储。
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">4. Cookie 与追踪</h2>
          <p className="text-sm leading-relaxed mb-3" style={{ color: '#7A7468' }}>
            本服务不使用第三方广告追踪 Cookie。仅使用必要的本地存储以维持登录状态与用户体验。
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">5. 联系方式</h2>
          <p className="text-sm leading-relaxed mb-3" style={{ color: '#7A7468' }}>
            如有隐私相关问题，请通过社区页面或邮件联系。
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
