import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import Board3D from './Board3D';

export default function GameBoard({
  phase,
  activeAgentIdx,
  activeAgents,
  agentDialogues,
  onAgentClick,
  choices,
  onChoiceSelect,
  selectedChoice,
  userInput,
  showQuestion,
  inference,
  yanOptions,
  deliberationOracle,
  deliberationSessionId,
  fateRevealed = false,
}) {
  // 移动端/iPad 3D性能降级
  const isMobile = typeof window !== 'undefined' && (window.innerWidth <= 768 || /iPad|iPhone|Android/i.test(navigator.userAgent));
  // iPad 单独降级：DPR 1.5（介于移动端1与桌面2之间）；抗锯齿随 isMobile 一并关闭
  const isIPad = typeof window !== 'undefined' && (/iPad/i.test(navigator.userAgent) || (window.innerWidth > 768 && window.innerWidth <= 1024));
  const dpr = isIPad ? 1.5 : (isMobile ? 1 : Math.min(window.devicePixelRatio || 1, 2));

  return (
    <div className="relative w-full h-full" style={{ background: '#1A1410' }}>
      <Canvas
        camera={{
          fov: 45,
          near: 0.1,
          far: 100,
          position: [0, 3, 7],
        }}
        style={{ width: '100%', height: '100%', background: '#1A1410' }}
        gl={{ antialias: !isMobile, alpha: false, powerPreference: 'high-performance' }}
        dpr={dpr}
      >
        <color attach="background" args={['#1A1410']} />

        <OrbitControls
          enablePan={false}
          enableZoom={true}
          minDistance={4}
          maxDistance={12}
          minPolarAngle={Math.PI * 0.2}
          maxPolarAngle={Math.PI * 0.55}
          target={[0, 1, 0]}
          enableDamping
          dampingFactor={0.08}
          rotateSpeed={0.5}
        />

        <Board3D
          phase={phase}
          activeAgentIdx={activeAgentIdx}
          activeAgents={activeAgents}
          agentDialogues={agentDialogues}
          onAgentClick={onAgentClick}
          choices={choices}
          onChoiceSelect={onChoiceSelect}
          selectedChoice={selectedChoice}
          userInput={userInput}
          showQuestion={showQuestion}
          inference={inference}
          yanOptions={yanOptions}
          deliberationOracle={deliberationOracle}
          deliberationSessionId={deliberationSessionId}
          fateRevealed={fateRevealed}
        />
      </Canvas>
    </div>
  );
}
