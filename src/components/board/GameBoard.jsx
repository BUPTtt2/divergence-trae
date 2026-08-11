import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import Board3D from './Board3D';
import ArenaHud from './ArenaHud';
import { useMemo, useState } from 'react';
import * as THREE from 'three';

function CeremonyCameraRig({ active }) {
  const { camera } = useThree();
  const position = useMemo(() => new THREE.Vector3(0, 2.45, 6.25), []);
  const target = useMemo(() => new THREE.Vector3(0.05, 1.02, 0.12), []);

  useFrame(() => {
    if (!active) return;
    camera.position.lerp(position, 0.085);
    camera.lookAt(target);
  });
  return null;
}

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
  destinyArtwork = null,
  arenaView,
  directResult,
  onDirectChoice,
  processingNarrative,
  presentationMode = false,
}) {
  const [selectedArenaNode, setSelectedArenaNode] = useState(null);
  // 移动端/iPad 3D性能降级
  const isMobile = typeof window !== 'undefined' && (window.innerWidth <= 768 || /iPad|iPhone|Android/i.test(navigator.userAgent));
  // iPad 单独降级：DPR 1.5（介于移动端1与桌面2之间）；抗锯齿随 isMobile 一并关闭
  const isIPad = typeof window !== 'undefined' && (/iPad/i.test(navigator.userAgent) || (window.innerWidth > 768 && window.innerWidth <= 1024));
  const dpr = isIPad ? 1.5 : (isMobile ? 1 : Math.min(window.devicePixelRatio || 1, 2));
  const ceremonyActive = ['path_reveal', 'committing', 'final'].includes(phase);

  return (
    <div className={`relative w-full h-full${presentationMode ? ' arena-presentation-mode' : ''}`} style={{
      background: 'radial-gradient(circle at 50% 56%, #2a2117 0%, #17110d 36%, #080706 78%)',
    }}>
      <Canvas
        camera={{
          fov: 45,
          near: 0.1,
          far: 100,
          position: [0, 3, 7],
        }}
        style={{ width: '100%', height: '100%', background: 'transparent' }}
        gl={{ antialias: !isMobile, alpha: false, powerPreference: 'high-performance' }}
        dpr={dpr}
      >
        <color attach="background" args={['#100c09']} />

        <CeremonyCameraRig active={ceremonyActive} />
        <OrbitControls
          enabled={!ceremonyActive}
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
          destinyArtwork={destinyArtwork}
          arenaView={arenaView}
          onArenaNodeSelect={setSelectedArenaNode}
          presentationMode={presentationMode}
        />
      </Canvas>
      <ArenaHud
        view={arenaView}
        selectedNode={presentationMode ? null : selectedArenaNode}
        onClose={() => setSelectedArenaNode(null)}
        directResult={directResult}
        onDirectChoice={onDirectChoice}
        processingNarrative={processingNarrative}
      />
    </div>
  );
}
