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
}) {
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
        gl={{ antialias: true, alpha: false }}
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
        />
      </Canvas>
    </div>
  );
}
