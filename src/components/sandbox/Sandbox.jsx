import { useState, useRef, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { NODES, TOPOLOGY } from '../../data/nodes';
import { useGame } from '../../context/GameContext';
import NodeCard from './NodeCard';
import Edge from './Edge';

export default function Sandbox() {
  const { state } = useGame();
  const containerRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    setZoom(z => Math.min(2, Math.max(0.5, z + delta)));
  }, []);

  const handleMouseDown = useCallback((e) => {
    if (e.target.closest('.node-card')) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  }, [pan]);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-paper select-none" style={{ cursor: isDragging ? 'grabbing' : 'grab' }}>
      {/* Vignette overlay */}
      <div className="absolute inset-0 pointer-events-none z-10"
        style={{ background: 'radial-gradient(ellipse at center, transparent 40%, rgba(26,26,26,0.2) 100%)' }} />

      {/* Pixel grid background */}
      <div className="absolute inset-0 opacity-30"
        style={{
          backgroundImage: 'linear-gradient(rgba(0,0,0,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.05) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }} />

      {/* 3D transformed sandbox board */}
      <div
        ref={containerRef}
        className="absolute inset-0"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          className="relative w-full h-full"
          style={{
            transform: 'perspective(1200px) rotateX(20deg) rotateZ(-1deg)',
            transformStyle: 'preserve-3d',
          }}
        >
          <div
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
              transition: isDragging ? 'none' : 'transform 0.2s ease-out',
            }}
          >
            {/* SVG edges layer */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
              {Object.entries(NODES).map(([nodeId, node]) => {
                if (!TOPOLOGY[nodeId]?.children) return null;
                return TOPOLOGY[nodeId].children.map(childId => {
                  const child = NODES[childId];
                  if (!child) return null;
                  const explored = state.visitedNodes.has(childId);
                  return (
                    <Edge
                      key={`${nodeId}-${childId}`}
                      fromX={node.position.x * 100}
                      fromY={node.position.y * 100}
                      toX={child.position.x * 100}
                      toY={child.position.y * 100}
                      explored={explored}
                      fromDepth={node.depth}
                      toDepth={child.depth}
                    />
                  );
                });
              })}
            </svg>

            {/* Nodes layer */}
            <div className="absolute inset-0" style={{ zIndex: 2 }}>
              {Object.entries(NODES).map(([nodeId, node]) => (
                <NodeCard
                  key={nodeId}
                  nodeId={nodeId}
                  node={node}
                  visited={state.visitedNodes.has(nodeId)}
                  revealed={state.revealedNodes.has(nodeId)}
                  active={state.currentNodeId === nodeId}
                  zoom={zoom}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Zoom indicator */}
      <div className="absolute bottom-4 right-4 z-20 bg-terminal/80 text-[10px] text-[#888] font-mono px-2 py-1 border border-[#444]">
        {Math.round(zoom * 100)}%
      </div>
    </div>
  );
}
