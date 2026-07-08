import { createContext, useContext, useReducer, useCallback } from 'react';
import { PHASE, TOTAL_NODES } from '../utils/constants';
import { NODES } from '../data/nodes';
import { TOPOLOGY } from '../data/topology';
import { FATE_CARDS, DICE_CONFIG } from '../data/endings';

const GameContext = createContext(null);

const initialState = {
  phase: PHASE.IDLE,
  userInput: '',
  currentNodeId: null,
  visitedNodes: new Set(),
  pathHistory: [],
  choices: [],
  actualParents: {},
  diceResult: null,
  diceRolling: false,
  gameStartTime: null,
  agentOpinions: {},
  log: [],
  revealedNodes: new Set(),
  fateCard: null,
  luckState: 'neutral', // optimistic | pessimistic | neutral
};

function gameReducer(state, action) {
  switch (action.type) {
    case 'START_GAME': {
      const initialRevealed = new Set(['root']);
      // Reveal root's children so they appear on the map after first debate
      const rootTopo = TOPOLOGY['root'];
      if (rootTopo && rootTopo.children) {
        rootTopo.children.forEach(cid => initialRevealed.add(cid));
      }
      return {
        ...initialState,
        phase: PHASE.INPUT,
        userInput: action.payload,
        gameStartTime: Date.now(),
        currentNodeId: 'root',
        visitedNodes: new Set(['root']),
        revealedNodes: initialRevealed,
      };
    }

    case 'SELECT_BRANCH': {
      const { fromNodeId, targetId, branch } = action.payload;
      const newVisited = new Set(state.visitedNodes);
      newVisited.add(targetId);
      const newRevealed = new Set(state.revealedNodes);
      newRevealed.add(targetId);
      // Reveal children of target in topology
      const topo = TOPOLOGY[targetId];
      if (topo && topo.children) {
        topo.children.forEach(cid => newRevealed.add(cid));
      }
      return {
        ...state,
        currentNodeId: targetId,
        choices: [...state.choices, { from: fromNodeId, to: targetId, branch }],
        pathHistory: [...state.pathHistory, targetId],
        actualParents: { ...state.actualParents, [targetId]: fromNodeId },
        visitedNodes: newVisited,
        revealedNodes: newRevealed,
        log: [...state.log, {
          time: Date.now(),
          action: `选择分支：${branch.label}`,
        }],
      };
    }

    case 'SET_PHASE':
      return { ...state, phase: action.payload };

    case 'SET_DICE_ROLLING':
      return { ...state, diceRolling: action.payload };

    case 'SET_DICE_RESULT': {
      const result = action.payload;
      const luckState = result >= DICE_CONFIG.highThreshold ? 'optimistic' : 'pessimistic';
      return {
        ...state,
        diceResult: result,
        luckState,
        log: [...state.log, {
          time: Date.now(),
          action: `骰子结果：${result} (${luckState === 'optimistic' ? '乐观' : '悲观'})`,
        }],
      };
    }

    case 'RECORD_AGENT_OPINIONS': {
      const { nodeId, opinions } = action.payload;
      return {
        ...state,
        agentOpinions: { ...state.agentOpinions, [nodeId]: opinions },
      };
    }

    case 'SHOW_FATE_CARD':
      return { ...state, phase: PHASE.FATE_REVEAL, fateCard: action.payload };

    case 'ADD_LOG':
      return { ...state, log: [...state.log, { time: Date.now(), action: action.payload }] };

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(gameReducer, initialState);

  const startGame = useCallback((input) => {
    dispatch({ type: 'START_GAME', payload: input });
  }, []);

  const selectBranch = useCallback((fromNodeId, targetId, branch) => {
    dispatch({ type: 'SELECT_BRANCH', payload: { fromNodeId, targetId, branch } });
  }, []);

  const setPhase = useCallback((phase) => {
    dispatch({ type: 'SET_PHASE', payload: phase });
  }, []);

  const setDiceRolling = useCallback((rolling) => {
    dispatch({ type: 'SET_DICE_ROLLING', payload: rolling });
  }, []);

  const rollDice = useCallback(() => {
    const result = Math.floor(Math.random() * 6) + 1;
    dispatch({ type: 'SET_DICE_RESULT', payload: result });
    return result;
  }, []);

  const recordAgentOpinions = useCallback((nodeId, opinions) => {
    dispatch({ type: 'RECORD_AGENT_OPINIONS', payload: { nodeId, opinions } });
  }, []);

  const showFateCard = useCallback((cardId) => {
    dispatch({ type: 'SHOW_FATE_CARD', payload: FATE_CARDS[cardId] });
  }, []);

  const addLog = useCallback((action) => {
    dispatch({ type: 'ADD_LOG', payload: action });
  }, []);

  const resetGame = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  const getProgress = useCallback(() => {
    const node = NODES[state.currentNodeId];
    const depth = node ? node.depth : 0;
    return {
      depth,
      percentage: Math.round((state.visitedNodes.size / TOTAL_NODES) * 100),
    };
  }, [state.currentNodeId, state.visitedNodes]);

  const value = {
    state,
    startGame,
    selectBranch,
    setPhase,
    setDiceRolling,
    rollDice,
    recordAgentOpinions,
    showFateCard,
    addLog,
    resetGame,
    getProgress,
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const context = useContext(GameContext);
  if (!context) throw new Error('useGame must be used within GameProvider');
  return context;
}

export default GameContext;
