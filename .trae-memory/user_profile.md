## User Preferences
- Communication language: Chinese
- Visual design: Values '水墨山水画 × 八卦推演 × 纪念碑谷极简几何' style with '纪念碑谷几何极简 × 光遇空灵梦幻 × 符文神秘感' aesthetic, requires '克制'动效 (0.8-1.5s, 缓入缓出, 无弹跳/爆炸/快速闪烁), '漂浮感' (缓慢漂浮/旋转), 水墨留白, 传统色彩 (水墨灰、宣纸白, 点缀朱砂红、石青绿、赭石黄、黛紫), 表面有卦象符文, 漂浮空灵带水墨晕染朦胧感, 背景为水墨八卦虚空, 底色 #FAF8F0, 远景水墨山峦轮廓, 中景八卦卦象纹理, 近景薄雾粒子
- UI/UX: Agent 对话需浮在 Agent 上方 (非侧边栏), 一段时间后自动消失, 点击 Agent 符号可查看说过的话/做过的选择, 侧边栏历史对话栏默认收起, 顶部导航栏提示, 世界线需明确区分当前线、初始线和走过的线, 世界线需通过颜色区分不同线
- Special effects: 不要屏幕震动或摇晃, 不要天/地/雷/风悬浮助手, 不要金色背景圆环
- Game design: 偏好有意义且多样的游戏机制, 清晰的引导和永久解锁内容, 简化的角色升级选项, 剧情和任务增强游戏深度, 渐进式敌人难度缩放, 可见且具有挑战性的 boss 特殊攻击, 不喜欢过度的武器震动、频繁的非必要掉落和需要点击屏幕的非固定位置宝箱, 符文阵需有适当的难度、距离和激活后可见的变化, Agent 提问需递进式, 每个环节需等待用户点击继续, 希望用户模拟的路径选择由Agent实时生成，同一事件选项可能不同，同一选项可能维持当前世界线或偏移至另一世界线，下一个选项也不同，游戏化深度为重量（完整RPG式进度）
- AI interaction: Prefers assistant to present operations in multiple-choice format to avoid new conversation starts, prefers assistant to automatically make changes after completing tasks, requires strict handling for production deployment and use of multiple-choice tools for any issues without stopping

## Tech Stack
- Game development: Familiar with Phaser framework
- Development tools: Uses local server for testing (localhost)