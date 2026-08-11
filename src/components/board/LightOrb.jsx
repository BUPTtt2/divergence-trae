import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { createBaguaCompassTexture } from '../../utils/trigramTextures';

const SPEED_BY_MODE = Object.freeze({
  idle: 0.015,
  direct: 0.01,
  understanding: 0.055,
  assembling: 0.09,
  deliberating: 0.16,
  synthesizing: 0.07,
  resolved: 0.025,
});

function LivingPlate({ view }) {
  const plateRef = useRef();
  const texture = useMemo(() => createBaguaCompassTexture(768), []);

  useFrame((_, delta) => {
    const speed = SPEED_BY_MODE[view?.mode] ?? SPEED_BY_MODE.idle;
    if (plateRef.current) plateRef.current.rotation.z += speed * delta;
  });

  return (
    <group position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh ref={plateRef}>
        <circleGeometry args={[1.26, 96]} />
        <meshBasicMaterial map={texture} transparent opacity={0.92} depthWrite={false} />
      </mesh>
    </group>
  );
}

export default function LightOrb({ phase, position = [0, 1.5, 0], arenaView, minimal = false }) {
  const label = arenaView?.mode === 'direct' ? '答' : arenaView?.mode === 'resolved' ? '定' : '演';
  const status = arenaView?.statusLine || (phase === 'input' ? '待你提出问题' : '正在建立推演现场');
  const hub = arenaView?.statusHub;

  return (
    <group>
      <LivingPlate view={arenaView} />
      {!minimal && <Html center position={[position[0], position[1], position[2]]} distanceFactor={8.2} style={{ pointerEvents: 'none' }}>
        <div className="living-bagua__core">
          <strong>{label}</strong>
          <small>{hub?.stage || status}</small>
          {hub && <>
            <em>{hub.workingAgent} · {hub.waitingFor}</em>
            <span>
              <b>已确认 {hub.counts.facts}</b>
              <b>关键未知 {hub.counts.blockingUnknowns}</b>
              <b>智囊 {hub.counts.advisors}</b>
              <b>证据 {hub.counts.evidence}</b>
            </span>
          </>}
        </div>
      </Html>}
    </group>
  );
}
