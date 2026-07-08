import React, { useRef, useEffect, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const DOT_LAYOUTS = {
  1: [[0, 0]],
  2: [[-0.2, 0.2], [0.2, -0.2]],
  3: [[-0.2, 0.2], [0, 0], [0.2, -0.2]],
  4: [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]],
  5: [[-0.2, -0.2], [0.2, -0.2], [0, 0], [-0.2, 0.2], [0.2, 0.2]],
  6: [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0], [0.2, 0], [-0.2, 0.2], [0.2, 0.2]],
};

function Dot({ position, color }) {
  return (
    <mesh position={position}>
      <sphereGeometry args={[0.05, 8, 8]} />
      <meshStandardMaterial color={color} roughness={0.9} metalness={0} />
    </mesh>
  );
}

function GemFace({ value, position, rotation, color }) {
  const dots = DOT_LAYOUTS[value];
  return (
    <group position={position} rotation={rotation}>
      <mesh>
        <planeGeometry args={[0.7, 0.7]} />
        <meshStandardMaterial color={color} side={THREE.DoubleSide} roughness={0.6} metalness={0.1} transparent opacity={0.9} />
      </mesh>
      {dots.map(([dx, dy], i) => (
        <Dot key={i} position={[dx, dy, 0.01]} color="#1A1A2A" />
      ))}
    </group>
  );
}

function GemDice({ rolling, result, onResult, position }) {
  const groupRef = useRef();
  const [phase, setPhase] = useState('idle');
  const startTimeRef = useRef(0);
  const startRotRef = useRef({ x: 0, y: 0, z: 0 });
  
  useEffect(() => {
    if (rolling) {
      setPhase('rolling');
      startTimeRef.current = performance.now();
      if (groupRef.current) {
        startRotRef.current = {
          x: groupRef.current.rotation.x,
          y: groupRef.current.rotation.y,
          z: groupRef.current.rotation.z,
        };
      }
    } else if (result != null) {
      setPhase('settled');
    }
  }, [rolling, result]);
  
  useEffect(() => {
    if (rolling) {
      const timer = setTimeout(() => {
        const finalResult = result || Math.floor(Math.random() * 6) + 1;
        if (onResult) onResult(finalResult);
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [rolling, result, onResult]);
  
  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    
    if (phase === 'rolling') {
      const elapsed = (performance.now() - startTimeRef.current) / 3500;
      const eased = 1 - Math.pow(1 - elapsed, 3);
      
      groupRef.current.rotation.x += 0.025 * (1 - eased * 0.6);
      groupRef.current.rotation.y += 0.035 * (1 - eased * 0.6);
      groupRef.current.rotation.z += 0.018 * (1 - eased * 0.6);
      
      const floatY = Math.sin(clock.getElapsedTime() * 2.5) * 0.12;
      groupRef.current.position.y = (position ? position[1] : 8) + floatY;
    } else if (phase === 'settled') {
      const floatY = Math.sin(clock.getElapsedTime() * 1.2) * 0.06;
      groupRef.current.position.y = (position ? position[1] : 8) + floatY;
      
      groupRef.current.rotation.x *= 0.98;
      groupRef.current.rotation.y += 0.003;
      groupRef.current.rotation.z *= 0.98;
    }
  });
  
  const glowColor = useMemo(() => {
    if (result == null) return '#9B8AC4';
    return result >= 4 ? '#FFD88A' : '#D88A8A';
  }, [result]);
  
  return (
    <group ref={groupRef} position={position || [0, 8, 0]}>
      <mesh>
        <octahedronGeometry args={[0.5]} />
        <meshStandardMaterial
          color="#E8E4D4"
          roughness={0.3}
          metalness={0.2}
          transparent
          opacity={0.85}
        />
      </mesh>
      
      <mesh>
        <octahedronGeometry args={[0.62]} />
        <meshStandardMaterial
          color={glowColor}
          transparent
          opacity={phase === 'settled' ? 0.15 : 0.08}
          emissive={glowColor}
          emissiveIntensity={phase === 'settled' ? 0.6 : 0.2}
          side={THREE.BackSide}
        />
      </mesh>
      
      <GemFace value={1} position={[0, 0, 0.41]} rotation={[0, 0, 0]} color="#E8E4D4" />
      <GemFace value={6} position={[0, 0, -0.41]} rotation={[0, Math.PI, 0]} color="#E8E4D4" />
      <GemFace value={2} position={[0.41, 0, 0]} rotation={[0, Math.PI / 2, 0]} color="#E8E4D4" />
      <GemFace value={5} position={[-0.41, 0, 0]} rotation={[0, -Math.PI / 2, 0]} color="#E8E4D4" />
      <GemFace value={3} position={[0, 0.41, 0]} rotation={[-Math.PI / 2, 0, 0]} color="#E8E4D4" />
      <GemFace value={4} position={[0, -0.41, 0]} rotation={[Math.PI / 2, 0, 0]} color="#E8E4D4" />
      
      <pointLight
        color={glowColor}
        intensity={phase === 'settled' ? 1.5 : 0.5}
        distance={5}
        decay={2}
      />
      
      {phase === 'settled' && (
        <>
          {[0, 72, 144, 216, 288].map((angle, i) => {
            const rad = (angle * Math.PI) / 180;
            return (
              <mesh key={i} position={[Math.cos(rad) * 0.7, Math.sin(rad) * 0.3, 0]}>
                <sphereGeometry args={[0.035, 8, 8]} />
                <meshStandardMaterial
                  color={glowColor}
                  transparent
                  opacity={0.7}
                  emissive={glowColor}
                  emissiveIntensity={2}
                />
              </mesh>
            );
          })}
        </>
      )}
    </group>
  );
}

export default function PhysicsDice({ rolling = false, result = null, onResult, position }) {
  return (
    <GemDice
      rolling={rolling}
      result={result}
      onResult={onResult}
      position={position}
    />
  );
}
