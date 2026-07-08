import { useState, useRef, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { NODES } from '../../data/nodes';
import { useGame } from '../../context/GameContext';
import MapNode from './MapNode';
import MapEdge from './MapEdge';

// Layout: nodes positioned in columns (layers)
const LAYER_X = [0.08, 0.30, 0.55, 0.75, 0.92]; // x positions for each depth layer

function getNodePosition(node) {
  const x = LAYER_X[node.depth] || 0.5;

  const yPositions = {
    0: [0.5],                           // root: center
    1: [0.2, 0.5, 0.8],                // 3 fog nodes
    2: [0.35, 0.65],                   // crossroad opt/pess
    3: [0.35, 0.65],                   // deep accept/reject
    4: [0.35, 0.65],                   // fate accept/reject
  };

  const siblings = Object.values(NODES).filter(n => n.depth === node.depth);
  const idx = siblings.indexOf(node);
  const layerYs = yPositions[node.depth] || [0.5];
  const y = layerYs[idx] || 0.5;

  return { x, y };
}

export default function RoguelikeMap() {
  const { state } = useGame();
  const containerRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    setZoom(z => Math.min(2, Math.max(0.5, z + delta)));
  }, []);

  const handleMouseDown = useCallback((e) => {
    if (e.target.closest('.map-node')) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  }, [pan]);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;
    setPan({ x: e.clientX - dragStartRef.current.x, y: e.clientY - dragStartRef.current.y });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => setIsDragging(false), []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // Build edges from actual game path + available branches
  const edges = [];
  state.pathHistory.forEach((nodeId, i) => {
    if (i === 0) return; // skip first (root has no parent in pathHistory)
    edges.push({ from: state.pathHistory[i - 1], to: nodeId, explored: true });
  });
  // Add unexplored edges from current node
  const currentNode = state.currentNodeId ? NODES[state.currentNodeId] : null;
  if (currentNode && currentNode.branches) {
    currentNode.branches.forEach(b => {
      if (!state.visitedNodes.has(b.targetId)) {
        edges.push({ from: state.currentNodeId, to: b.targetId, explored: false });
      }
    });
  }

  return (
    <div className="relative w-full h-full bg-[#EDE8DD] overflow-hidden select-none" style={{ cursor: isDragging ? 'grabbing' : 'grab' }}>
      {/* Paper texture background */}
      <div className="absolute inset-0" style={{
        backgroundImage: `
          radial-gradient(circle, rgba(0,0,0,0.04) 1px, transparent 1px),
          linear-gradient(rgba(0,0,0,0.02) 1px, transparent 1px)
        `,
        backgroundSize: '24px 24px, 24px 24px',
        backgroundPosition: '0 0, 12px 12px',
      }} />

      {/* Vignette */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse at center, transparent 30%, rgba(30,30,46,0.15) 100%)',
      }} />

      {/* Map board with shadow */}
      <div className="absolute" style={{
        top: '5%', left: '3%', right: '3%', bottom: '8%',
        boxShadow: '0 4px 24px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08)',
        border: '1px solid rgba(0,0,0,0.08)',
        borderRadius: '4px',
        background: 'rgba(253,250,245,0.5)',
      }}>
        {/* Coordinate decorations */}
        <div className="absolute top-2 left-3 text-[7px] text-[#bbb] font-mono">0,0</div>
        <div className="absolute top-2 right-3 text-[7px] text-[#bbb] font-mono">10,0</div>
        <div className="absolute bottom-2 left-3 text-[7px] text-[#bbb] font-mono">0,8</div>
        <div className="absolute bottom-2 right-3 text-[7px] text-[#bbb] font-mono">10,8</div>

        {/* Interactive area */}
        <div
          ref={containerRef}
          className="w-full h-full relative"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
            transition: isDragging ? 'none' : 'transform 0.15s ease-out',
            width: '100%',
            height: '100%',
          }}>
            {/* SVG Edges */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
              {edges.map((edge) => {
                const fromNode = NODES[edge.from];
                const toNode = NODES[edge.to];
                if (!fromNode || !toNode) return null;
                const from = getNodePosition(fromNode);
                const to = getNodePosition(toNode);
                return (
                  <MapEdge
                    key={`${edge.from}-${edge.to}`}
                    fromX={from.x} fromY={from.y}
                    toX={to.x} toY={to.y}
                    explored={edge.explored}
                  />
                );
              })}
            </svg>

            {/* Nodes */}
            <div className="absolute inset-0" style={{ zIndex: 2 }}>
              {Object.entries(NODES).map(([nodeId, node]) => {
                const pos = getNodePosition(node);
                return (
                  <MapNode
                    key={nodeId}
                    nodeId={nodeId}
                    node={node}
                    x={pos.x}
                    y={pos.y}
                    visited={state.visitedNodes.has(nodeId)}
                    revealed={state.revealedNodes.has(nodeId)}
                    active={state.currentNodeId === nodeId}
                    isAvailable={currentNode?.branches?.some(b => b.targetId === nodeId) || false}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Zoom indicator */}
      <motion.div
        className="absolute bottom-3 right-3 z-20 bg-[#1E1E2E]/80 text-[9px] text-[#888] font-mono px-2 py-1 border border-[#333]"
        animate={{ opacity: 1 }}
      >
        {Math.round(zoom * 100)}%
      </motion.div>
    </div>
  );
}
