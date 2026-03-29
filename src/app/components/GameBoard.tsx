import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameState, GameConfig, Tile as TileType } from '../types';
import { createGame, drawTile, discardTile, passTurn, callTile, sortHand, sortHandRack, aiTurn, getCallOptions, aiShouldCall, CallGroupSize, CallOption, executeCharlestonPass, CharlestonDirection, blankTrade, findValidJokerExchanges, executeJokerExchange, JokerExchangeOption, getPassTarget, aiSelectCharlestonTiles, isSiameseMode, swapTileBetweenRacks, siamesePickDrawRack, declareMahJongg } from '../gameLogic';
import { TileComponent, TileBack } from './Tile';
import { NMJLCard, PlanHand, PatternDisplayCompact } from './NMJLCard';
import { DraggableHandTile } from './DraggableHandTile';
import { GameOverModal } from './GameOverModal';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { HelpCircle, RotateCcw, BookOpen, ArrowRight, ArrowUp, ArrowLeft, Lightbulb, ArrowUpDown, Pause, Play } from 'lucide-react';
const DISCARD_CALL_WINDOW_SECONDS = 20;
const OPPONENT_DECISION_SECONDS = 10;
const HUMAN_DRAW_DELAY_MS = 500;
const CHARLESTON_PASS_DELAY_MS = 1200;
const CHARLESTON_COMPLETE_DELAY_MS = 600;

type PendingActionKind =
  | 'call-window'
  | 'human-draw'
  | 'ai-turn'
  | 'charleston-next-pass'
  | 'charleston-start-playing';

interface PendingAction {
  kind: PendingActionKind;
  remainingMs: number;
  totalMs: number;
}

const CHARLESTON_STEPS: { direction: CharlestonDirection; label: string; group: string }[] = [
  { direction: 'right', label: 'Pass Right', group: 'First Charleston' },
  { direction: 'across', label: 'Pass Across', group: 'First Charleston' },
  { direction: 'left', label: 'Pass Left', group: 'First Charleston' },
  { direction: 'left', label: 'Pass Left', group: 'Second Charleston' },
  { direction: 'across', label: 'Pass Across', group: 'Second Charleston' },
  { direction: 'right', label: 'Pass Right', group: 'Second Charleston' },
];

interface GameBoardProps {
  config: GameConfig;
  onBackToSetup: () => void;
}

export function GameBoard({ config, onBackToSetup }: GameBoardProps) {
  const [game, setGame] = useState<GameState>(() => createGame(config));
  const [showHelp, setShowHelp] = useState(false);
  const [showNMJL, setShowNMJL] = useState(false);
  const [callCountdown, setCallCountdown] = useState<number | null>(null);
  const [planHands, setPlanHands] = useState<(PlanHand | null)[]>([null, null, null]);
  const [playerBarHeight, setPlayerBarHeight] = useState(0);
  const playerBarRef = useRef<HTMLDivElement | null>(null);
  const actionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const actionDeadlineRef = useRef<number | null>(null);
  const pendingActionRef = useRef<PendingAction | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  // Charleston state
  const [charlestonSubPhase, setCharlestonSubPhase] = useState<'pre' | 'selecting' | 'passed' | 'optOut' | 'courtesy' | 'done'>('pre');
  const [charlestonStep, setCharlestonStep] = useState(0);
  const [charlestonSelected, setCharlestonSelected] = useState<number[]>([]);
  const [charlestonReceivedCount, setCharlestonReceivedCount] = useState(0);

  // Blank trade & joker exchange modes
  const [blankTradeMode, setBlankTradeMode] = useState<{ blankIndex: number } | null>(null);
  const [jokerExchangeMode, setJokerExchangeMode] = useState(false);
  const [jokerExchangeOptions, setJokerExchangeOptions] = useState<JokerExchangeOption[]>([]);

  const humanPlayer = game.players[0];
  const tilesRemaining = game.wall.length;
  const tipsEnabled = config.tipsEnabled;
  const callWindowSeconds = DISCARD_CALL_WINDOW_SECONDS;
  const siamese = config.playerCount === 2;
  const activeRack = game.activeRack ?? 1;

  // Joker Exchange tip: detect if valid exchanges exist during human's discarding turn
  const isHumanDiscarding = game.phase === 'playing' && game.currentPlayerIndex === 0 && game.turnPhase === 'discarding';
  const jokerExchangeTipActive = tipsEnabled && isHumanDiscarding && !jokerExchangeMode && findValidJokerExchanges(game).length > 0;

  // Measure player bar height for NMJL modal positioning
  useEffect(() => {
    if (!playerBarRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setPlayerBarHeight(entry.contentRect.height + 3); // +3 for top border
      }
    });
    observer.observe(playerBarRef.current);
    return () => observer.disconnect();
  }, []);

  const clearSchedulerRefs = useCallback(() => {
    if (actionTimeoutRef.current) {
      clearTimeout(actionTimeoutRef.current);
      actionTimeoutRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    actionDeadlineRef.current = null;
  }, []);

  const clearPendingAction = useCallback((preserveCountdown = false) => {
    clearSchedulerRefs();
    pendingActionRef.current = null;
    setPendingAction(null);
    if (!preserveCountdown) {
      setCallCountdown(null);
    }
  }, [clearSchedulerRefs]);

  const schedulePendingAction = useCallback((kind: PendingActionKind, delayMs: number) => {
    const nextAction: PendingAction = {
      kind,
      remainingMs: delayMs,
      totalMs: delayMs,
    };
    pendingActionRef.current = nextAction;
    setPendingAction(nextAction);
    if (kind === 'call-window') {
      setCallCountdown(Math.max(0, Math.ceil(delayMs / 1000)));
    } else {
      setCallCountdown(null);
    }
  }, []);

  const resolveCallingPhase = useCallback(() => {
    setGame(prev => {
      if (prev.phase !== 'playing' || prev.turnPhase !== 'calling') return prev;
      if (prev.lastDiscardedBy === null) return passTurn(prev);
      for (let offset = 1; offset < prev.config.playerCount; offset++) {
        const i = (prev.lastDiscardedBy + offset) % prev.config.playerCount;
        if (prev.players[i].isHuman) continue;
        const aiCallSize = aiShouldCall(prev, i);
        if (aiCallSize !== null) {
          return callTile(prev, i, aiCallSize);
        }
      }
      return passTurn(prev);
    });
  }, []);

  const executePendingAction = useCallback((action: PendingAction) => {
    clearPendingAction();

    switch (action.kind) {
      case 'call-window':
        resolveCallingPhase();
        return;
      case 'human-draw':
        setGame(prev => {
          if (prev.phase !== 'playing' || prev.turnPhase !== 'drawing') return prev;
          if (isSiameseMode(prev)) {
            const drawRack = siamesePickDrawRack(prev.players[0]);
            return drawTile({ ...prev, activeRack: drawRack });
          }
          return drawTile(prev);
        });
        return;
      case 'ai-turn':
        setGame(prev => {
          if (prev.phase !== 'playing') return prev;
          const cp = prev.players[prev.currentPlayerIndex];
          if (cp.isHuman) return prev;

          let state = { ...prev };

          if (state.turnPhase === 'drawing') {
            if (isSiameseMode(state)) {
              const drawRack = siamesePickDrawRack(cp);
              state = { ...state, activeRack: drawRack };
            }
            state = drawTile(state);
            if (state.phase !== 'playing') return state;
          }

          if (state.turnPhase === 'discarding') {
            state = aiTurn(state);
          }

          return state;
        });
        return;
      case 'charleston-next-pass':
        setCharlestonSubPhase('selecting');
        setCharlestonReceivedCount(0);
        return;
      case 'charleston-start-playing':
        setCharlestonSubPhase('done');
        setGame(prev => ({
          ...prev,
          phase: 'playing',
          turnPhase: 'discarding',
          message: 'East discards first — select a tile to discard',
        }));
        return;
    }
  }, [clearPendingAction, resolveCallingPhase]);

  useEffect(() => {
    pendingActionRef.current = pendingAction;
  }, [pendingAction]);

  useEffect(() => {
    clearSchedulerRefs();

    if (!pendingAction || isPaused) {
      return;
    }

    const deadline = Date.now() + pendingAction.remainingMs;
    actionDeadlineRef.current = deadline;

    if (pendingAction.kind === 'call-window') {
      setCallCountdown(Math.max(0, Math.ceil(pendingAction.remainingMs / 1000)));
      countdownIntervalRef.current = setInterval(() => {
        const remainingMs = Math.max(0, deadline - Date.now());
        const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
        setCallCountdown(remainingSeconds);
      }, 250);
    } else {
      setCallCountdown(null);
    }

    actionTimeoutRef.current = setTimeout(() => {
      executePendingAction(pendingAction);
    }, pendingAction.remainingMs);

    return clearSchedulerRefs;
  }, [pendingAction, isPaused, clearSchedulerRefs, executePendingAction]);

  const handlePauseToggle = useCallback(() => {
    if (isPaused) {
      setIsPaused(false);
      return;
    }

    const activeAction = pendingActionRef.current;
    const deadline = actionDeadlineRef.current;

    if (activeAction && deadline !== null) {
      const remainingMs = Math.max(0, deadline - Date.now());
      const pausedAction = { ...activeAction, remainingMs };
      pendingActionRef.current = pausedAction;
      setPendingAction(pausedAction);
      if (pausedAction.kind === 'call-window') {
        setCallCountdown(Math.max(0, Math.ceil(remainingMs / 1000)));
      }
    }

    clearSchedulerRefs();
    setIsPaused(true);
  }, [isPaused, clearSchedulerRefs]);

  const canPauseGame = game.phase === 'playing' || game.phase === 'charleston';

  // Game loop
  useEffect(() => {
    if (game.phase === 'gameOver') {
      clearPendingAction();
      return;
    }

    if (isPaused) {
      return;
    }

    if (game.phase !== 'playing') {
      return;
    }

    const currentPlayer = game.players[game.currentPlayerIndex];

    // === CALLING PHASE ===
    if (game.turnPhase === 'calling') {
      if (pendingActionRef.current?.kind !== 'call-window') {
        schedulePendingAction('call-window', callWindowSeconds * 1000);
      }
      return;
    }

    // === HUMAN DRAWING ===
    if (currentPlayer.isHuman && game.turnPhase === 'drawing') {
      if (pendingActionRef.current?.kind !== 'human-draw') {
        schedulePendingAction('human-draw', HUMAN_DRAW_DELAY_MS);
      }
      return;
    }

    // === HUMAN DISCARDING - wait for input ===
    if (currentPlayer.isHuman && game.turnPhase === 'discarding') {
      if (pendingActionRef.current) {
        clearPendingAction();
      }
      return;
    }

    // === AI TURN ===
    if (!currentPlayer.isHuman) {
      if (pendingActionRef.current?.kind !== 'ai-turn') {
        schedulePendingAction('ai-turn', OPPONENT_DECISION_SECONDS * 1000);
      }
    }
  }, [game.currentPlayerIndex, game.turnPhase, game.phase, callWindowSeconds, isPaused, schedulePendingAction, clearPendingAction]);

  useEffect(() => {
    if (game.turnPhase !== 'calling' && pendingActionRef.current?.kind === 'call-window') {
      clearPendingAction();
    }
  }, [game.turnPhase, clearPendingAction]);

  // Handle clicking on a tile in hand
  const handleTileClick = useCallback((index: number) => {
    if (isPaused) return;

    // If in joker exchange mode, ignore hand clicks
    if (jokerExchangeMode) return;

    // If in blank trade mode, cancel on re-click
    if (blankTradeMode) {
      setBlankTradeMode(null);
      setGame(prev => ({ ...prev, message: 'Blank trade cancelled.' }));
      return;
    }

    // Charleston tile selection (including courtesy pass)
    if (game.phase === 'charleston' && (charlestonSubPhase === 'selecting' || charlestonSubPhase === 'courtesy')) {
      // Jokers may NEVER be passed during Charleston
      const tile = humanPlayer.hand[index];
      if (tile && tile.type === 'special' && tile.specialType === 'joker') {
        setGame(prev => ({ ...prev, message: 'Jokers cannot be passed during Charleston' }));
        return;
      }
      const maxSelect = charlestonSubPhase === 'courtesy' ? 3 : 3;
      setCharlestonSelected(prev => {
        if (prev.includes(index)) {
          return prev.filter(i => i !== index);
        }
        if (prev.length >= 3) return prev;
        return [...prev, index];
      });
      return;
    }

    // Check if the clicked tile is a blank during playing phase
    if (game.phase === 'playing') {
      const activeHand = siamese ? (activeRack === 2 ? humanPlayer.hand2 : humanPlayer.hand) : humanPlayer.hand;
      const tile = activeHand[index];
      if (tile && tile.type === 'special' && tile.specialType === 'blank') {
        if (game.discardPool.length > 0) {
          setBlankTradeMode({ blankIndex: index });
          setGame(prev => ({ ...prev, message: 'Blank Trade — select a tile from the discards to swap', selectedTileIndex: index }));
          return;
        } else {
          setGame(prev => ({ ...prev, message: 'No discarded tiles available to trade.' }));
          return;
        }
      }
    }

    setGame(prev => {
      if (prev.phase !== 'playing') return prev;
      if (prev.currentPlayerIndex !== 0) return prev;
      if (prev.turnPhase !== 'discarding') return prev;

      if (prev.selectedTileIndex === index) {
        // Second click = discard (pass rack info for Siamese)
        return discardTile(prev, index, siamese ? prev.activeRack : undefined);
      } else {
        // First click = select
        return { ...prev, selectedTileIndex: index };
      }
    });
  }, [isPaused, game.phase, game.discardPool.length, charlestonSubPhase, blankTradeMode, jokerExchangeMode, humanPlayer.hand, siamese]);

  // Handle selecting a discard tile during blank trade
  const handleBlankTradeSelect = useCallback((discardIndex: number) => {
    if (isPaused) return;
    if (!blankTradeMode) return;
    setGame(prev => blankTrade(prev, blankTradeMode.blankIndex, discardIndex, siamese ? prev.activeRack : undefined));
    setBlankTradeMode(null);
  }, [isPaused, blankTradeMode, siamese]);

  // Handle joker exchange button
  const handleJokerExchangeStart = useCallback(() => {
    if (isPaused) return;
    if (jokerExchangeMode) {
      setJokerExchangeMode(false);
      setJokerExchangeOptions([]);
      return;
    }
    const options = findValidJokerExchanges(game);
    if (options.length === 0) {
      alert('There are no tiles available to exchange for a Joker.');
      return;
    }
    setJokerExchangeMode(true);
    setJokerExchangeOptions(options);
    setGame(prev => ({ ...prev, message: 'Joker Exchange — click a Joker in an exposed set to swap' }));
  }, [isPaused, game, jokerExchangeMode]);

  // Handle clicking a joker in an exposure during joker exchange mode
  const handleJokerExchangeSelect = useCallback((tileId: string) => {
    if (isPaused) return;
    if (!jokerExchangeMode) return;
    const option = jokerExchangeOptions.find(o => o.jokerTile.id === tileId);
    if (!option) return;
    const handIndex = option.matchingHandIndices[0];
    setGame(prev => {
      const newState = executeJokerExchange(prev, option.targetPlayerIndex, option.exposureIndex, option.jokerIndexInExposure, handIndex);
      const newOptions = findValidJokerExchanges(newState);
      if (newOptions.length === 0) {
        setJokerExchangeMode(false);
        setJokerExchangeOptions([]);
      } else {
        setJokerExchangeOptions(newOptions);
      }
      return newState;
    });
  }, [isPaused, jokerExchangeMode, jokerExchangeOptions]);

  // Build a set of clickable joker tile IDs for exposure rendering
  const clickableJokerIds = new Set(jokerExchangeMode ? jokerExchangeOptions.map(o => o.jokerTile.id) : []);

  // Handle calling a discarded tile with a specific group size
  const handleCall = useCallback((groupSize?: CallGroupSize) => {
    if (isPaused) return;
    clearPendingAction();
    setGame(prev => callTile(prev, 0, groupSize));
  }, [isPaused, clearPendingAction]);

  // Handle ignoring a discarded tile
  const handleIgnore = useCallback(() => {
    if (isPaused) return;
    clearPendingAction();
    resolveCallingPhase();
  }, [isPaused, clearPendingAction, resolveCallingPhase]);

  const handleSort = useCallback((type: 'suit' | 'rank') => {
    if (siamese) {
      setGame(prev => sortHandRack(prev, 0, type, prev.activeRack));
    } else {
      setGame(prev => sortHand(prev, 0, type));
    }
  }, [siamese]);

  // Drag-and-drop tile reorder
  const handleMoveTile = useCallback((fromIndex: number, toIndex: number) => {
    setGame(prev => {
      const isSiam = isSiameseMode(prev);
      const rackField = isSiam && prev.activeRack === 2 ? 'hand2' : 'hand';
      const newPlayers = prev.players.map((p, i) => {
        if (i !== 0) return p;
        const newHand = [...(p as any)[rackField]] as typeof p.hand;
        const [moved] = newHand.splice(fromIndex, 1);
        newHand.splice(toIndex, 0, moved);
        return { ...p, [rackField]: newHand };
      });
      // If a tile was selected, track its new index after reorder
      let newSelectedIndex = prev.selectedTileIndex;
      if (newSelectedIndex !== null) {
        if (newSelectedIndex === fromIndex) {
          newSelectedIndex = toIndex;
        } else if (fromIndex < newSelectedIndex && toIndex >= newSelectedIndex) {
          newSelectedIndex--;
        } else if (fromIndex > newSelectedIndex && toIndex <= newSelectedIndex) {
          newSelectedIndex++;
        }
      }
      return { ...prev, players: newPlayers, selectedTileIndex: newSelectedIndex };
    });
    // Also update charleston selection indices if reordering during charleston
    if (charlestonSelected.length > 0) {
      setCharlestonSelected(prev => prev.map(idx => {
        if (idx === fromIndex) return toIndex;
        if (fromIndex < idx && toIndex >= idx) return idx - 1;
        if (fromIndex > idx && toIndex <= idx) return idx + 1;
        return idx;
      }));
    }
  }, [charlestonSelected.length]);

  const handleNewGame = useCallback(() => {
    clearPendingAction();
    setGame(createGame(config));
    setCharlestonSubPhase('pre');
    setCharlestonStep(0);
    setCharlestonSelected([]);
    setCharlestonReceivedCount(0);
    setBlankTradeMode(null);
    setJokerExchangeMode(false);
    setJokerExchangeOptions([]);
    setIsPaused(false);
  }, [config, clearPendingAction]);

  // Plan hand management
  const handleAddPlan = useCallback((hand: Omit<PlanHand, 'planLabel'>) => {
    setPlanHands(prev => {
      const labels: ('A' | 'B' | 'C')[] = ['A', 'B', 'C'];
      const firstEmptyIndex = prev.findIndex(p => p === null);
      if (firstEmptyIndex === -1) return prev;
      // Check if already added
      if (prev.some(p => p !== null && p.pattern === hand.pattern && p.category === hand.category)) return prev;
      const next = [...prev];
      next[firstEmptyIndex] = { ...hand, planLabel: labels[firstEmptyIndex] };
      return next;
    });
  }, []);

  const handleRemovePlan = useCallback((index: number) => {
    setPlanHands(prev => {
      const next = [...prev];
      next[index] = null;
      return next;
    });
  }, []);

  // Siamese: switch active rack
  const handleSwitchRack = useCallback((rack: 1 | 2) => {
    if (isPaused) return;
    setGame(prev => ({ ...prev, activeRack: rack, selectedTileIndex: null }));
  }, [isPaused]);

  // Siamese: move a tile from one rack to another
  const handleMoveTileToOtherRack = useCallback((tileIndex: number, fromRack: 1 | 2) => {
    if (isPaused) return;
    setGame(prev => swapTileBetweenRacks(prev, 0, fromRack, tileIndex));
  }, [isPaused]);

  // Declare Mah Jongg
  const handleDeclareMahJongg = useCallback(() => {
    if (isPaused) return;
    setGame(prev => declareMahJongg(prev, 0));
  }, [isPaused]);

  const hasPlanHands = planHands.some(p => p !== null);

  // Determine calling UI state
  const isCallingPhase = game.turnPhase === 'calling' &&
    game.lastDiscardedBy !== 0 &&
    game.lastDiscarded !== null &&
    game.phase === 'playing';

  const humanCallOptions: CallOption[] = isCallingPhase ? getCallOptions(game, 0) : [];
  const humanCanCall = humanCallOptions.length > 0;

  // ─── Charleston Helpers ─────────────────────────────────────────
  const currentCharlestonStepInfo = CHARLESTON_STEPS[charlestonStep] || CHARLESTON_STEPS[0];
  const isFirstCharleston = charlestonStep < 3;
  const stepInGroup = isFirstCharleston ? charlestonStep + 1 : charlestonStep - 2;

  const DirectionIcon = currentCharlestonStepInfo.direction === 'right'
    ? ArrowRight
    : currentCharlestonStepInfo.direction === 'left'
      ? ArrowLeft
      : ArrowUp;

  const handleStartCharleston = useCallback(() => {
    if (isPaused) return;
    setCharlestonSubPhase('selecting');
    setCharlestonSelected([]);
    setCharlestonStep(0);
    setGame(prev => ({
      ...prev,
      message: 'First Charleston — select 3 tiles to pass right',
    }));
  }, [isPaused]);

  // Start playing (East discards first — no draw needed since East has 14 tiles)
  const startPlaying = useCallback(() => {
    setCharlestonSubPhase('done');
    setGame(prev => ({
      ...prev,
      phase: 'playing',
      turnPhase: 'discarding',
      message: 'East discards first — select a tile to discard',
    }));
  }, []);

  // Helper: transition to courtesy pass or directly to play
  const goToCourtesyOrPlay = useCallback(() => {
    const oppositeIndex = getPassTarget(0, 'across', config.playerCount);
    if (oppositeIndex < 0) {
      // No opposite player (1-player) — skip courtesy, start game
      startPlaying();
      return;
    }
    setCharlestonSelected([]);
    setCharlestonReceivedCount(0);
    setCharlestonSubPhase('courtesy');
    setGame(prev => ({ ...prev, message: 'Courtesy Pass — optionally exchange 0–3 tiles with player across' }));
  }, [config.playerCount, startPlaying]);

  const handleCharlestonPass = useCallback(() => {
    if (isPaused) return;
    if (charlestonSelected.length !== 3) return;
    const stepInfo = CHARLESTON_STEPS[charlestonStep];
    if (!stepInfo) return;

    setGame(prev => {
      const toIndex = getPassTarget(0, stepInfo.direction, config.playerCount);
      const result = executeCharlestonPass(
        prev.players,
        0,
        toIndex,
        charlestonSelected,
        stepInfo.direction,
        config.playerCount,
        prev.wall
      );
      return {
        ...prev,
        players: result.players,
        wall: result.wall ?? prev.wall,
      };
    });

    setCharlestonReceivedCount(3);
    setCharlestonSelected([]);

    // Decide next sub-phase
    const nextStep = charlestonStep + 1;
    if (nextStep === 3) {
      // First charleston done — offer optional second
      setCharlestonSubPhase('optOut');
    } else if (nextStep >= 6) {
      // Second charleston done — go to courtesy pass
      goToCourtesyOrPlay();
    } else {
      // Move to next pass
      setCharlestonStep(nextStep);
      setCharlestonSubPhase('passed');
      schedulePendingAction('charleston-next-pass', CHARLESTON_PASS_DELAY_MS);
    }
  }, [isPaused, charlestonSelected, charlestonStep, goToCourtesyOrPlay, config.playerCount, schedulePendingAction]);

  // Courtesy pass handler
  const handleCourtesyPass = useCallback(() => {
    if (isPaused) return;
    if (charlestonSelected.length === 0) {
      // Skip courtesy pass
      startPlaying();
      return;
    }
    const oppositeIndex = getPassTarget(0, 'across', config.playerCount);
    if (oppositeIndex < 0) { startPlaying(); return; }

    setGame(prev => {
      const newPlayers = prev.players.map(p => ({ ...p, hand: [...p.hand] }));

      // Human's selected tiles
      const humanTiles = charlestonSelected.map(idx => newPlayers[0].hand[idx]);

      // AI selects same number of tiles to exchange
      const aiCandidates = aiSelectCharlestonTiles(newPlayers[oppositeIndex].hand);
      const aiIndices = aiCandidates.slice(0, charlestonSelected.length);
      const aiTiles = aiIndices.map(idx => newPlayers[oppositeIndex].hand[idx]);

      // Remove from both hands
      const humanPassedIds = new Set(humanTiles.map(t => t.id));
      newPlayers[0].hand = newPlayers[0].hand.filter(t => !humanPassedIds.has(t.id));

      const aiPassedIds = new Set(aiTiles.map(t => t.id));
      newPlayers[oppositeIndex].hand = newPlayers[oppositeIndex].hand.filter(t => !aiPassedIds.has(t.id));

      // Swap
      newPlayers[0].hand.push(...aiTiles);
      newPlayers[oppositeIndex].hand.push(...humanTiles);

      return { ...prev, players: newPlayers };
    });

    setCharlestonSelected([]);
    schedulePendingAction('charleston-start-playing', CHARLESTON_COMPLETE_DELAY_MS);
  }, [isPaused, charlestonSelected, config.playerCount, schedulePendingAction, startPlaying]);

  const handleContinueCharleston = useCallback(() => {
    if (isPaused) return;
    setCharlestonStep(3);
    setCharlestonSubPhase('selecting');
    setCharlestonReceivedCount(0);
  }, [isPaused]);

  const handleEndCharleston = useCallback(() => {
    if (isPaused) return;
    // Declining second charleston — go to courtesy pass
    goToCourtesyOrPlay();
  }, [isPaused, goToCourtesyOrPlay]);

  const handleSkipCharleston = useCallback(() => {
    if (isPaused) return;
    // Skipping Charleston entirely — East discards first, no courtesy pass
    setCharlestonSubPhase('done');
    setGame(prev => ({
      ...prev,
      phase: 'playing',
      turnPhase: 'discarding',
      message: 'East discards first — select a tile to discard',
    }));
  }, [isPaused]);

  const isCharlestonSelecting = game.phase === 'charleston' && (charlestonSubPhase === 'selecting' || charlestonSubPhase === 'courtesy');

  return (
    <DndProvider backend={HTML5Backend}>
    <div className="flex flex-col overflow-hidden select-none" style={{ background: '#1B2A4A', fontFamily: "'Jost', sans-serif", height: '100dvh', minHeight: '100dvh' }}>
      {/* Top Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 shrink-0" style={{ background: 'rgba(0,0,0,0.25)' }}>
        <div className="flex items-center gap-2">
          <button
            onClick={onBackToSetup}
            className="px-3 py-1 rounded text-[0.7rem] uppercase tracking-wider transition-colors hover:bg-white/10"
            style={{ color: '#D4A574', border: '1px solid rgba(212,165,116,0.3)' }}
          >
            Menu
          </button>
          <button
            onClick={handleNewGame}
            className="p-1.5 rounded transition-colors hover:bg-white/10"
            style={{ color: '#D4A574' }}
            title="New Game"
          >
            <RotateCcw size={14} />
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <span style={{
            color: '#FFFDF7',
            fontFamily: "'Futura', 'Trebuchet MS', sans-serif",
            fontSize: '1.1rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            lineHeight: 1,
          }}>
            Otto Online
          </span>
        </div>

        <div className="flex items-center gap-2">
          {canPauseGame && (
            <button
              onClick={handlePauseToggle}
              className="px-3 py-1 rounded text-[0.65rem] uppercase tracking-wider transition-colors hover:bg-white/10 flex items-center gap-1.5"
              style={{ color: isPaused ? '#FFFDF7' : '#D4A574', border: '1px solid rgba(212,165,116,0.3)', background: isPaused ? 'rgba(181,112,79,0.35)' : 'transparent' }}
              title={isPaused ? 'Resume game' : 'Pause game'}
            >
              {isPaused ? <Play size={12} /> : <Pause size={12} />}
              {isPaused ? 'Resume' : 'Pause'}
            </button>
          )}
          {tipsEnabled && (
            <span className="text-[0.55rem] px-2 py-0.5 rounded-full flex items-center gap-1" style={{
              background: 'rgba(45,106,79,0.25)',
              color: '#8BB59E',
              border: '1px solid rgba(45,106,79,0.35)',
              fontWeight: 600,
              letterSpacing: '0.08em',
            }}>
              <Lightbulb size={9} />
              TIPS
            </span>
          )}
          <span className="text-[0.6rem] px-2 py-0.5 rounded hidden sm:inline-block" style={{
            background: 'rgba(255,253,247,0.1)',
            color: 'rgba(255,253,247,0.5)',
          }}>
            {siamese ? 'Siamese' : `${config.playerCount}P`} &middot; {config.totalTiles} tiles &middot; {config.jokerCount}J
          </span>
          <button
            onClick={() => setShowNMJL(true)}
            className="p-1.5 rounded transition-colors hover:bg-white/10"
            style={{ color: '#D4A574' }}
            title="NMJL Card"
          >
            <BookOpen size={14} />
          </button>
          <button
            onClick={() => setShowHelp(!showHelp)}
            className="p-1.5 rounded transition-colors hover:bg-white/10"
            style={{ color: '#D4A574' }}
          >
            <HelpCircle size={14} />
          </button>
        </div>
      </div>

      {/* Game Area */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Playing Surface */}
        <div className="flex-1 flex flex-col min-h-0 relative" style={{
          background: '#11121E',
        }}>
          {/* Game content overlay */}
          <div className="flex-1 flex flex-col min-h-0 relative z-10">
          {/* Top Opponent */}
          {config.playerCount >= 3 && (
            <OpponentRow
              player={game.players[2]}
              isActive={game.currentPlayerIndex === 2}
              showDrawGap={game.phase === 'playing' && game.currentPlayerIndex === 2 && game.turnPhase === 'discarding'}
              clickableJokerIds={clickableJokerIds}
              onJokerClick={handleJokerExchangeSelect}
            />
          )}

          {/* Siamese: Top opponent (shows two rows of face-down tiles) */}
          {siamese && (
            <SiameseOpponentRow
              player={game.players[1]}
              isActive={game.currentPlayerIndex === 1}
              activeRack={activeRack}
              showDrawGap={game.phase === 'playing' && game.currentPlayerIndex === 1 && game.turnPhase === 'discarding'}
              clickableJokerIds={clickableJokerIds}
              onJokerClick={handleJokerExchangeSelect}
            />
          )}

          {/* Middle Section */}
          <div className="flex-1 flex min-h-0">
            {/* Left Opponent or Ghost Wall */}
            {config.playerCount >= 4 && (
              <OpponentColumn
                player={game.players[3]}
                isActive={game.currentPlayerIndex === 3}
                side="left"
                showDrawGap={game.phase === 'playing' && game.currentPlayerIndex === 3 && game.turnPhase === 'discarding'}
                clickableJokerIds={clickableJokerIds}
                onJokerClick={handleJokerExchangeSelect}
              />
            )}
            {config.playerCount === 3 && (
              <GhostWall />
            )}

            {/* Center: Charleston / Discard Pool + Actions
                On mobile reduce padding/gap to keep the discard pool as large
                as possible without the player area being pushed off screen. */}
            <div className="flex-1 flex flex-col items-center justify-center p-1 sm:p-2 min-h-0 gap-1 sm:gap-2">
              {game.phase === 'charleston' ? (
                <CharlestonUI
                  subPhase={charlestonSubPhase}
                  stepInfo={currentCharlestonStepInfo}
                  stepInGroup={stepInGroup}
                  isFirstCharleston={isFirstCharleston}
                  charlestonStep={charlestonStep}
                  charlestonSelected={charlestonSelected}
                  onStart={handleStartCharleston}
                  onSkip={handleSkipCharleston}
                  onPass={handleCharlestonPass}
                  onContinue={handleContinueCharleston}
                  onEnd={handleEndCharleston}
                  onCourtesyPass={handleCourtesyPass}
                  onCourtesySkip={startPlaying}
                  DirectionIcon={DirectionIcon}
                />
              ) : (
                <>
                  {/* Blank Trade / Joker Exchange mode banner */}
                  {(blankTradeMode || jokerExchangeMode) && (
                    <div className="flex items-center gap-2 px-4 py-2 rounded-lg" style={{
                      background: 'rgba(181,112,79,0.25)',
                      border: '1px solid rgba(181,112,79,0.5)',
                      boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
                    }}>
                      <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#B5704F' }} />
                      <span style={{ color: '#FFFDF7', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.05em' }}>
                        {blankTradeMode ? 'BLANK TRADE — Click a discard tile to swap' : 'JOKER EXCHANGE — Click a Joker in any exposed set'}
                      </span>
                      <button
                        onClick={() => { setBlankTradeMode(null); setJokerExchangeMode(false); setJokerExchangeOptions([]); }}
                        className="ml-2 px-2 py-0.5 rounded text-[0.55rem] uppercase tracking-wider hover:bg-white/10 transition-colors"
                        style={{ color: '#FFFDF7', border: '1px solid rgba(255,253,247,0.3)' }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {/* Discard Area
                      Mobile maxHeight is capped so the bottom rack and controls
                      stay in view while the center discard field remains readable. */}
                  <div className="rounded-lg p-2 sm:p-3 w-full max-w-lg overflow-auto" style={{
                    background: blankTradeMode ? 'rgba(181,112,79,0.2)' : 'rgba(255,253,247,0.1)',
                    border: blankTradeMode ? '2px solid rgba(181,112,79,0.6)' : '1px solid rgba(255,253,247,0.12)',
                    maxHeight: config.playerCount >= 3 ? 'min(34dvh, 18rem)' : 'min(42dvh, 20rem)',
                    transition: 'all 0.2s ease',
                  }}>
                    <div className="flex flex-wrap gap-1 justify-center min-h-[50px]">
                      {game.discardPool.length === 0 ? (
                        <div className="flex items-center justify-center w-full py-6" style={{
                          color: 'rgba(255,253,247,0.2)',
                          fontSize: '0.7rem',
                          letterSpacing: '0.2em',
                        }}>
                          DISCARDS
                        </div>
                      ) : (
                        game.discardPool.map((tile, di) => (
                          <div
                            key={tile.id}
                            className={blankTradeMode ? 'cursor-pointer rounded-sm transition-all hover:ring-2 hover:ring-[#B5704F] hover:scale-110' : ''}
                            onClick={blankTradeMode ? () => handleBlankTradeSelect(di) : undefined}
                          >
                            <TileComponent tile={tile} size="sm" />
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Calling UI with Countdown */}
                  {isCallingPhase && game.lastDiscarded && (
                    <div className="flex items-center gap-3 p-3 rounded-lg" style={{
                      background: 'rgba(0,0,0,0.35)',
                      border: '1px solid rgba(181,112,79,0.3)',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                    }}>
                      <div className="flex flex-col items-center gap-1">
                        <TileComponent tile={game.lastDiscarded} size="lg" />
                        <span style={{
                          color: 'rgba(255,253,247,0.5)',
                          fontSize: '0.55rem',
                          letterSpacing: '0.1em',
                        }}>
                          {game.players[game.lastDiscardedBy!]?.name}
                        </span>
                      </div>
                      <div className="flex flex-col items-center gap-2">
                        <div className="relative flex items-center justify-center" style={{ width: 44, height: 44 }}>
                          <svg width="44" height="44" viewBox="0 0 44 44" style={{ transform: 'rotate(-90deg)' }}>
                            <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,253,247,0.1)" strokeWidth="3" />
                            <circle cx="22" cy="22" r="18" fill="none"
                              stroke={callCountdown !== null && callCountdown <= 3 ? '#C4453E' : '#B5704F'}
                              strokeWidth="3" strokeLinecap="round"
                              strokeDasharray={`${2 * Math.PI * 18}`}
                              strokeDashoffset={`${2 * Math.PI * 18 * (1 - (callCountdown ?? 0) / callWindowSeconds)}`}
                              style={{ transition: 'stroke-dashoffset 0.25s linear' }}
                            />
                          </svg>
                          <span className="absolute" style={{
                            color: callCountdown !== null && callCountdown <= 3 ? '#C4453E' : '#FFFDF7',
                            fontSize: '0.85rem', fontWeight: 700, fontFamily: "'Jost', sans-serif",
                          }}>{callCountdown ?? 0}</span>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          {humanCanCall && (
                            <div className="flex flex-col gap-1 items-center">
                              <span style={{
                                color: 'rgba(255,253,247,0.5)',
                                fontSize: '0.5rem',
                                letterSpacing: '0.12em',
                                textTransform: 'uppercase',
                              }}>
                                Call as
                              </span>
                              <div className="flex gap-1">
                                {humanCallOptions.map(option => (
                                  <button
                                    key={option.size}
                                    onClick={() => handleCall(option.size)}
                                    className="px-3 py-1.5 rounded transition-all uppercase tracking-wider hover:brightness-110"
                                    style={{
                                      background: '#B5704F',
                                      color: '#FFFDF7',
                                      fontSize: '0.65rem',
                                      fontWeight: 600,
                                      boxShadow: '0 2px 8px rgba(181,112,79,0.4)',
                                      lineHeight: 1.2,
                                    }}
                                    title={`${option.label} (${option.size} tiles): ${option.matchUsed} matching + ${option.jokersUsed} joker${option.jokersUsed !== 1 ? 's' : ''}`}
                                  >
                                    <div>{option.label}</div>
                                    {option.jokersUsed > 0 && (
                                      <div style={{
                                        fontSize: '0.45rem',
                                        opacity: 0.75,
                                        fontWeight: 400,
                                        letterSpacing: '0.05em',
                                        marginTop: 1,
                                      }}>
                                        +{option.jokersUsed}J
                                      </div>
                                    )}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          <button onClick={handleIgnore}
                            className="px-6 py-1.5 rounded transition-all uppercase tracking-wider hover:bg-white/20"
                            style={{ background: 'rgba(255,253,247,0.12)', color: '#FFFDF7', fontSize: '0.75rem', fontWeight: 600, border: '1px solid rgba(255,253,247,0.2)' }}>
                            Ignore
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Status */}
                  <div className="text-center">
                    <p style={{ color: 'rgba(255,253,247,0.65)', fontSize: '0.7rem', maxWidth: 320 }}>
                      {game.message}
                    </p>
                    <span className="inline-block mt-1 px-2 py-0.5 rounded" style={{
                      background: 'rgba(0,0,0,0.15)', color: 'rgba(255,253,247,0.45)', fontSize: '0.6rem', letterSpacing: '0.1em',
                    }}>
                      {tilesRemaining} {siamese ? 'in pool' : 'tiles left'}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Right Opponent (not shown for 2-player Siamese — opponent is at top) */}
            {config.playerCount >= 2 && !siamese && (
              <OpponentColumn
                player={game.players[1]}
                isActive={game.currentPlayerIndex === 1}
                side="right"
                showDrawGap={game.phase === 'playing' && game.currentPlayerIndex === 1 && game.turnPhase === 'discarding'}
                clickableJokerIds={clickableJokerIds}
                onJokerClick={handleJokerExchangeSelect}
              />
            )}
          </div>

          {/* Human Player Exposures (in game area, above player bar) */}
          {(humanPlayer.exposures.length > 0 || (siamese && humanPlayer.exposures2.length > 0)) && (
            <div className="flex flex-col items-center gap-1 px-2 sm:px-4 py-1 sm:py-1.5 shrink-0">
              {/* Rack 1 exposures */}
              {humanPlayer.exposures.length > 0 && (
                <div className="flex items-center gap-2">
                  {siamese && (
                    <span className="text-[0.4rem] uppercase tracking-wider shrink-0" style={{ color: 'rgba(255,253,247,0.3)' }}>R1</span>
                  )}
                  {humanPlayer.exposures.map((group, gi) => (
                    <div key={gi} className="flex gap-0.5 px-1 py-0.5 rounded shrink-0" style={{ background: 'rgba(255,253,247,0.08)' }}>
                      {group.map((tile) => {
                        const isClickable = clickableJokerIds.has(tile.id);
                        return (
                          <div
                            key={tile.id}
                            className={isClickable ? 'cursor-pointer rounded-sm ring-2 ring-[#B5704F] animate-pulse transition-all hover:scale-110' : ''}
                            onClick={isClickable ? () => handleJokerExchangeSelect(tile.id) : undefined}
                          >
                            <TileComponent tile={tile} size="sm" />
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
              {/* Rack 2 exposures (Siamese only) */}
              {siamese && humanPlayer.exposures2.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-[0.4rem] uppercase tracking-wider shrink-0" style={{ color: 'rgba(255,253,247,0.3)' }}>R2</span>
                  {humanPlayer.exposures2.map((group, gi) => (
                    <div key={`r2-${gi}`} className="flex gap-0.5 px-1 py-0.5 rounded shrink-0" style={{ background: 'rgba(181,112,79,0.08)' }}>
                      {group.map((tile) => (
                        <TileComponent key={tile.id} tile={tile} size="sm" />
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          </div>
        </div>

        {/* Player's Area */}
        <div ref={playerBarRef} className="sticky bottom-0 z-20 shrink-0" style={{ background: '#FFFDF7', borderTop: '3px solid #B5704F', paddingBottom: 'env(safe-area-inset-bottom)' }}>
          {/* Controls — py reduced on mobile to keep full player area on-screen */}
          <div className="flex items-center justify-between px-2 sm:px-3 py-0.5 sm:py-1" style={{
            borderBottom: '1px solid rgba(27,42,74,0.06)',
          }}>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => handleSort('rank')}
                className="px-2.5 py-0.5 rounded text-[0.6rem] uppercase tracking-wider transition-colors hover:bg-[#F5F0E6]"
                style={{ color: '#1B2A4A', border: '1px solid rgba(27,42,74,0.12)' }}
              >
                Sort Rank
              </button>
              <button
                onClick={() => handleSort('suit')}
                className="px-2.5 py-0.5 rounded text-[0.6rem] uppercase tracking-wider transition-colors hover:bg-[#F5F0E6]"
                style={{ color: '#1B2A4A', border: '1px solid rgba(27,42,74,0.12)' }}
              >
                Sort Suit
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <div className="relative">
                <button
                  className={`px-3 py-0.5 rounded text-[0.6rem] uppercase tracking-wider transition-all hover:brightness-110 ${jokerExchangeTipActive ? 'animate-pulse' : ''}`}
                  style={{
                    background: jokerExchangeMode ? '#1B2A4A' : jokerExchangeTipActive ? '#B5704F' : '#2D6A4F',
                    color: '#FFFDF7',
                    fontWeight: 600,
                    border: jokerExchangeMode ? '2px solid #B5704F' : jokerExchangeTipActive ? '2px solid #D4A574' : 'none',
                    boxShadow: jokerExchangeMode
                      ? '0 0 8px rgba(181,112,79,0.4)'
                      : jokerExchangeTipActive
                        ? '0 0 12px rgba(181,112,79,0.6), 0 0 24px rgba(181,112,79,0.3)'
                        : 'none',
                  }}
                  onClick={handleJokerExchangeStart}
                >
                  {jokerExchangeMode ? 'Cancel' : 'Joker Exchange'}
                </button>
                {jokerExchangeTipActive && (
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-1 rounded pointer-events-none"
                    style={{
                      background: 'rgba(181,112,79,0.95)',
                      color: '#FFFDF7',
                      fontSize: '0.5rem',
                      fontWeight: 600,
                      letterSpacing: '0.05em',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                    }}>
                    <Lightbulb size={8} className="inline mr-1" style={{ verticalAlign: 'middle' }} />
                    You can swap a tile for a Joker!
                    <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0"
                      style={{
                        borderLeft: '4px solid transparent',
                        borderRight: '4px solid transparent',
                        borderTop: '4px solid rgba(181,112,79,0.95)',
                      }}
                    />
                  </div>
                )}
              </div>
              <button
                className="px-4 py-0.5 rounded text-[0.6rem] uppercase tracking-wider transition-all hover:brightness-110"
                style={{
                  background: game.phase === 'gameOver' ? '#2D6A4F' : '#C4453E',
                  color: '#FFFDF7',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                onClick={() => {
                  if (game.phase === 'gameOver') {
                    handleNewGame();
                  } else if (game.phase === 'playing') {
                    handleDeclareMahJongg();
                  }
                }}
              >
                {game.phase === 'gameOver'
                  ? (game.winner === 0 ? 'You Win!' : 'Game Over')
                  : 'Mah Jongg!'}
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <div className="px-2 py-0.5 rounded" style={{
                background: '#F5F0E6',
                fontSize: '0.6rem',
                color: '#1B2A4A',
                fontWeight: 600,
                letterSpacing: '0.08em',
              }}>
                {humanPlayer.seatWind.toUpperCase()}
              </div>
              {humanPlayer.exposures.length > 0 && (
                <span className="text-[0.55rem] px-1.5 py-0.5 rounded" style={{
                  background: '#F5F0E6',
                  color: '#6B5E4F',
                }}>
                  {humanPlayer.exposures.length} exp
                </span>
              )}
            </div>
          </div>

          {/* Player's Hand(s) */}
          {siamese ? (
            /* ─── Siamese Dual Racks ─── */
            <div className="flex flex-col">
              {([1, 2] as const).map((rackNum) => {
                const rackHand = rackNum === 1 ? humanPlayer.hand : humanPlayer.hand2;
                const rackExposures = rackNum === 1 ? humanPlayer.exposures : humanPlayer.exposures2;
                const isActive = activeRack === rackNum;
                const rackLabel = rackNum === 1 ? 'Rack 1' : 'Rack 2';
                return (
                  <div key={rackNum}
                    className="relative transition-all"
                    style={{
                      background: isActive ? '#FFFDF7' : '#F5F0E6',
                      borderTop: isActive ? '2px solid #B5704F' : '1px solid rgba(27,42,74,0.06)',
                      cursor: isActive ? 'default' : 'pointer',
                    }}
                    onClick={!isActive ? () => handleSwitchRack(rackNum) : undefined}
                  >
                    {/* Rack label */}
                    <div className="flex items-center gap-2 px-3 py-0.5">
                      <span className="text-[0.5rem] uppercase tracking-[0.12em]" style={{
                        color: isActive ? '#B5704F' : '#8B9D83',
                        fontWeight: 700,
                      }}>
                        {rackLabel}
                      </span>
                      <span className="text-[0.45rem] px-1.5 py-0.5 rounded" style={{
                        background: isActive ? 'rgba(181,112,79,0.1)' : 'rgba(139,157,131,0.1)',
                        color: isActive ? '#B5704F' : '#8B9D83',
                      }}>
                        {rackHand.length} tiles
                      </span>
                      {rackExposures.length > 0 && (
                        <span className="text-[0.45rem] px-1.5 py-0.5 rounded" style={{
                          background: 'rgba(45,106,79,0.08)',
                          color: '#2D6A4F',
                        }}>
                          {rackExposures.length} exp
                        </span>
                      )}
                      {!isActive && (
                        <span className="text-[0.45rem] ml-auto" style={{ color: '#8B9D83' }}>
                          Click to switch
                        </span>
                      )}
                    </div>
                    {/* Tiles */}
                    <div className="flex items-end justify-center gap-0.5 px-2 py-1 overflow-x-auto" style={{
                      opacity: isActive ? 1 : 0.6,
                      filter: isActive ? 'none' : 'grayscale(0.3)',
                      minHeight: isActive ? 'auto' : 40,
                    }}>
                      {rackHand.map((tile, index) => {
                        if (isActive) {
                          return (
                            <DraggableHandTile
                              key={tile.id}
                              index={index}
                              tileId={tile.id}
                              moveTile={handleMoveTile}
                              onClick={() => handleTileClick(index)}
                            >
                              <TileComponent
                                tile={tile}
                                size="lg"
                                selected={game.selectedTileIndex === index}
                                interactive
                              />
                              {/* Move-to-other-rack button on hover */}
                              {game.turnPhase === 'discarding' && game.currentPlayerIndex === 0 && (
                                <button
                                  className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20"
                                  style={{
                                    background: '#1B2A4A',
                                    border: '1px solid rgba(255,253,247,0.3)',
                                  }}
                                  onClick={(e) => { e.stopPropagation(); handleMoveTileToOtherRack(index, rackNum); }}
                                  title={`Move to ${rackNum === 1 ? 'Rack 2' : 'Rack 1'}`}
                                >
                                  <ArrowUpDown size={8} style={{ color: '#FFFDF7' }} />
                                </button>
                              )}
                            </DraggableHandTile>
                          );
                        }
                        // Inactive rack: smaller tiles, click to move
                        return (
                          <div key={tile.id}
                            className="cursor-pointer transition-transform hover:scale-105"
                            onClick={(e) => { e.stopPropagation(); handleMoveTileToOtherRack(index, rackNum); }}
                            title={`Move to ${rackNum === 1 ? 'Rack 2' : 'Rack 1'}`}
                          >
                            <TileComponent tile={tile} size="sm" />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ─── Standard Single Rack ─── */
            <div className="flex items-end justify-center gap-0.5 px-2 py-2 overflow-x-auto">
              {humanPlayer.hand.map((tile, index) => {
                const isCharlestonSelected = isCharlestonSelecting && charlestonSelected.includes(index);
                return (
                  <DraggableHandTile
                    key={tile.id}
                    index={index}
                    tileId={tile.id}
                    moveTile={handleMoveTile}
                    onClick={() => handleTileClick(index)}
                  >
                    <TileComponent
                      tile={tile}
                      size="lg"
                      selected={isCharlestonSelected || game.selectedTileIndex === index}
                      selectedColor={isCharlestonSelected ? '#B5704F' : undefined}
                      interactive
                    />
                    {isCharlestonSelected && (
                      <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center z-10"
                        style={{ background: '#B5704F', border: '2px solid #FFFDF7', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }}>
                        <span style={{ color: '#FFFDF7', fontSize: '0.5rem', fontWeight: 700 }}>
                          {charlestonSelected.indexOf(index) + 1}
                        </span>
                      </div>
                    )}
                  </DraggableHandTile>
                );
              })}
            </div>
          )}

          {/* Hint */}
          {game.phase === 'charleston' && charlestonSubPhase === 'selecting' && (
            <div className="text-center pb-1" style={{
              color: '#B5704F',
              fontSize: '0.55rem',
              letterSpacing: '0.05em',
              fontWeight: 600,
            }}>
              Select 3 tiles to pass {currentCharlestonStepInfo.direction} &middot; {charlestonSelected.length}/3 selected &middot; Jokers cannot be passed
            </div>
          )}
          {game.phase === 'charleston' && charlestonSubPhase === 'courtesy' && (
            <div className="text-center pb-1" style={{
              color: '#D4A574',
              fontSize: '0.55rem',
              letterSpacing: '0.05em',
              fontWeight: 600,
            }}>
              Courtesy Pass — select 0–3 tiles to exchange with player across &middot; {charlestonSelected.length}/3
            </div>
          )}
          {blankTradeMode && (
            <div className="text-center pb-1" style={{
              color: '#B5704F',
              fontSize: '0.55rem',
              letterSpacing: '0.05em',
              fontWeight: 600,
            }}>
              Blank Trade active — click a tile in the discard pool above to swap
            </div>
          )}
          {jokerExchangeMode && (
            <div className="text-center pb-1" style={{
              color: '#B5704F',
              fontSize: '0.55rem',
              letterSpacing: '0.05em',
              fontWeight: 600,
            }}>
              Joker Exchange active — click a highlighted Joker in any exposed set
            </div>
          )}
          {!blankTradeMode && !jokerExchangeMode && game.turnPhase === 'discarding' && game.currentPlayerIndex === 0 && game.phase === 'playing' && (
            <div className="text-center pb-1" style={{
              color: game.selectedTileIndex !== null ? '#B5704F' : '#8B9D83',
              fontSize: '0.55rem',
              letterSpacing: '0.05em',
              fontWeight: game.selectedTileIndex !== null ? 600 : 400,
            }}>
              {game.selectedTileIndex !== null
                ? 'Click the raised tile again to discard it'
                : 'Click to select \u00b7 Drag to reorder'}
            </div>
          )}

          {/* Plan Bar - Quick Reference Hands */}
          <div className="px-2 pb-1.5 overflow-x-auto" style={{
            borderTop: '1px solid rgba(27,42,74,0.06)',
            background: '#FAF7F0',
          }}>
            <div className="flex items-stretch gap-1.5 min-h-[28px]">
              {/* Label */}
              <div className="flex items-center shrink-0 pr-1" style={{ borderRight: '1px solid rgba(27,42,74,0.06)' }}>
                <span className="text-[0.5rem] uppercase tracking-[0.12em]" style={{
                  color: '#8B9D83',
                  fontWeight: 600,
                  writingMode: hasPlanHands ? 'vertical-rl' : undefined,
                  textOrientation: hasPlanHands ? 'mixed' : undefined,
                  transform: hasPlanHands ? 'rotate(180deg)' : undefined,
                  lineHeight: 1,
                }}>
                  {hasPlanHands ? 'PLANS' : 'MY PLANS'}
                </span>
              </div>

              {hasPlanHands ? (
                /* Filled plan slots */
                planHands.map((plan, index) => {
                  const label = (['A', 'B', 'C'] as const)[index];
                  const planColors = {
                    A: { bg: '#B5704F', border: 'rgba(181,112,79,0.2)' },
                    B: { bg: '#1B2A4A', border: 'rgba(27,42,74,0.15)' },
                    C: { bg: '#2D6A4F', border: 'rgba(45,106,79,0.15)' },
                  };
                  const pc = planColors[label];

                  if (!plan) {
                    return (
                      <button
                        key={`empty-${index}`}
                        onClick={() => setShowNMJL(true)}
                        className="flex items-center gap-1.5 px-2 py-1 rounded transition-colors hover:bg-[#F5F0E6] shrink-0"
                        style={{
                          border: `1px dashed rgba(139,157,131,0.35)`,
                          minWidth: 80,
                        }}
                      >
                        <span className="w-4 h-4 rounded-full flex items-center justify-center shrink-0" style={{
                          background: 'rgba(139,157,131,0.15)',
                          color: '#8B9D83',
                          fontSize: '0.5rem',
                          fontWeight: 700,
                        }}>
                          {label}
                        </span>
                        <span style={{ color: '#8B9D83', fontSize: '0.5rem', letterSpacing: '0.05em' }}>
                          + Add hand
                        </span>
                      </button>
                    );
                  }

                  return (
                    <div
                      key={`plan-${index}`}
                      className="flex items-center gap-1.5 px-2 py-1 rounded shrink-0 group"
                      style={{
                        background: '#FFFDF7',
                        border: `1px solid ${pc.border}`,
                      }}
                    >
                      <span className="w-4 h-4 rounded-full flex items-center justify-center shrink-0" style={{
                        background: pc.bg,
                        color: '#FFFDF7',
                        fontSize: '0.5rem',
                        fontWeight: 700,
                      }}>
                        {label}
                      </span>
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1">
                          <PatternDisplayCompact pattern={plan.pattern} colorPattern={plan.colorPattern} />
                          {plan.concealed && (
                            <span className="text-[0.45rem] px-1 rounded" style={{
                              background: 'rgba(181,112,79,0.1)',
                              color: '#B5704F',
                              fontWeight: 700,
                            }}>C</span>
                          )}
                        </div>
                        <span style={{ color: '#8B9D83', fontSize: '0.45rem', letterSpacing: '0.05em' }}>
                          {plan.category} &middot; {plan.value}pt
                        </span>
                      </div>
                      <button
                        onClick={() => handleRemovePlan(index)}
                        className="ml-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        style={{
                          background: 'rgba(196,69,62,0.1)',
                          color: '#C4453E',
                          fontSize: '0.55rem',
                          lineHeight: 1,
                        }}
                        title={`Remove Plan ${label}`}
                      >
                        &times;
                      </button>
                    </div>
                  );
                })
              ) : (
                /* Empty state */
                <button
                  onClick={() => setShowNMJL(true)}
                  className="flex items-center gap-2 px-3 py-1 rounded transition-colors hover:bg-[#F5F0E6]"
                  style={{
                    border: '1px dashed rgba(139,157,131,0.35)',
                  }}
                >
                  <BookOpen size={10} style={{ color: '#8B9D83' }} />
                  <span style={{ color: '#8B9D83', fontSize: '0.55rem', letterSpacing: '0.05em' }}>
                    Open NMJL Card to add Plan A, B, C hands for quick reference
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(27,42,74,0.75)' }}
          onClick={() => setShowHelp(false)}>
          <div className="rounded-lg p-6 max-w-md w-full"
            style={{ background: '#FFFDF7', maxHeight: '80vh', overflow: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="uppercase tracking-[0.1em]" style={{
                fontFamily: "'Jost', sans-serif",
                color: '#1B2A4A',
                fontSize: '1.1rem',
                fontWeight: 600,
              }}>
                How to Play
              </h3>
              <button onClick={() => setShowHelp(false)}
                className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#F5F0E6]"
                style={{ color: '#6B5E4F', fontSize: '1.2rem' }}>&times;</button>
            </div>
            <div className="space-y-3" style={{ color: '#6B5E4F', fontSize: '0.75rem', lineHeight: 1.6 }}>
              {/* Terminology */}
              <div>
                <p className="mb-1.5 uppercase tracking-[0.1em]" style={{ color: '#B5704F', fontWeight: 700, fontSize: '0.6rem' }}>Terminology</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5" style={{ fontSize: '0.7rem' }}>
                  <span><strong style={{ color: '#1B2A4A' }}>Run</strong> — consecutive numbers</span>
                  <span><strong style={{ color: '#1B2A4A' }}>Pair</strong> — 2 like tiles</span>
                  <span><strong style={{ color: '#1B2A4A' }}>Pung</strong> — 3 like tiles</span>
                  <span><strong style={{ color: '#1B2A4A' }}>Kong</strong> — 4 like tiles</span>
                  <span><strong style={{ color: '#1B2A4A' }}>Quint</strong> — 5 like tiles</span>
                  <span><strong style={{ color: '#1B2A4A' }}>Sextet</strong> — 6 like tiles</span>
                  <span><strong style={{ color: '#1B2A4A' }}>F</strong> — Flower</span>
                  <span><strong style={{ color: '#1B2A4A' }}>D</strong> — Dragon</span>
                  <span><strong style={{ color: '#1B2A4A' }}>X</strong> — Exposed</span>
                  <span><strong style={{ color: '#1B2A4A' }}>C</strong> — Concealed</span>
                </div>
              </div>

              <div style={{ borderTop: '1px solid rgba(27,42,74,0.08)', paddingTop: '0.5rem' }}>
                <p className="mb-1 uppercase tracking-[0.1em]" style={{ color: '#B5704F', fontWeight: 700, fontSize: '0.6rem' }}>Tile Suits &amp; Matching Dragons</p>
                <div className="grid grid-cols-1 gap-0.5" style={{ fontSize: '0.7rem' }}>
                  <span><span style={{ color: '#2D6A4F', fontWeight: 700 }}>Bamboo (Bam)</span> — matches <span style={{ color: '#2D6A4F', fontWeight: 700 }}>Green Dragon</span></span>
                  <span><span style={{ color: '#1B2A4A', fontWeight: 700 }}>Character (Crak)</span> — matches <span style={{ color: '#C4453E', fontWeight: 700 }}>Red Dragon</span></span>
                  <span><span style={{ color: '#B5704F', fontWeight: 700 }}>Dot</span> — matches <span style={{ color: '#8B9D83', fontWeight: 700 }}>White/Soap Dragon</span></span>
                </div>
              </div>

              <div style={{ borderTop: '1px solid rgba(27,42,74,0.08)', paddingTop: '0.5rem' }}>
                <p className="mb-1 uppercase tracking-[0.1em]" style={{ color: '#B5704F', fontWeight: 700, fontSize: '0.6rem' }}>Dealing</p>
                <p>East receives <strong style={{ color: '#1B2A4A' }}>14 tiles</strong>, all other players 13. East discards first without drawing.</p>
              </div>

              <div style={{ borderTop: '1px solid rgba(27,42,74,0.08)', paddingTop: '0.5rem' }}>
                <p className="mb-1 uppercase tracking-[0.1em]" style={{ color: '#B5704F', fontWeight: 700, fontSize: '0.6rem' }}>Charleston</p>
                <p><strong style={{ color: '#1B2A4A' }}>1st Charleston</strong> (compulsory): Pass 3 tiles Right → Across → Left.</p>
                <p><strong style={{ color: '#1B2A4A' }}>2nd Charleston</strong> (optional): Left → Across → Right.</p>
                <p><strong style={{ color: '#1B2A4A' }}>Courtesy Pass</strong> (optional): Exchange 0–3 tiles with player across after Charleston.</p>
                <p style={{ color: '#C4453E' }}>Jokers may <strong>never</strong> be passed during Charleston.</p>
              </div>

              <div style={{ borderTop: '1px solid rgba(27,42,74,0.08)', paddingTop: '0.5rem' }}>
                <p className="mb-1 uppercase tracking-[0.1em]" style={{ color: '#B5704F', fontWeight: 700, fontSize: '0.6rem' }}>Gameplay</p>
                <p>Players draw and discard in turn. Click a tile once to select, click again to discard.</p>
                <p><strong style={{ color: '#1B2A4A' }}>Reorder:</strong> Click and drag any tile in your hand to rearrange your rack.</p>
                <p><strong style={{ color: '#1B2A4A' }}>Blank Tiles:</strong> Click a blank in your hand to trade it for any tile in the discard pool.</p>
              </div>

              <div style={{ borderTop: '1px solid rgba(27,42,74,0.08)', paddingTop: '0.5rem' }}>
                <p className="mb-1 uppercase tracking-[0.1em]" style={{ color: '#B5704F', fontWeight: 700, fontSize: '0.6rem' }}>Joker Rules</p>
                <p>Jokers substitute in <strong style={{ color: '#1B2A4A' }}>Pungs, Kongs, Quints, and Sextets</strong> (groups of 3+).</p>
                <p style={{ color: '#C4453E' }}>Jokers may <strong>never</strong> be used in a single tile or any part of a pair.</p>
                <p><strong style={{ color: '#1B2A4A' }}>Joker Exchange:</strong> During your turn, use the "Joker Exchange" button to swap a matching tile from your hand for a Joker in any player's exposed set.</p>
              </div>

              <div style={{ borderTop: '1px solid rgba(27,42,74,0.08)', paddingTop: '0.5rem' }}>
                <p className="mb-1 uppercase tracking-[0.1em]" style={{ color: '#B5704F', fontWeight: 700, fontSize: '0.6rem' }}>Claiming Discards</p>
                <p>When an opponent discards, you have <strong style={{ color: '#1B2A4A' }}>{callWindowSeconds} seconds</strong> to claim. You can use matching tiles and/or Jokers from your hand to form the group.</p>
                <p><strong style={{ color: '#1B2A4A' }}>Group sizes:</strong> Choose Pung (3), Kong (4), Quint (5), or Sextet (6) when calling. Each button shows how many Jokers will be used.</p>
                <p><strong style={{ color: '#1B2A4A' }}>Priority:</strong> Mah Jongg claims always beat exposure claims. For equal claims, next-in-turn has preference.</p>
              </div>

              <div style={{ borderTop: '1px solid rgba(27,42,74,0.08)', paddingTop: '0.5rem' }}>
                <p className="mb-1 uppercase tracking-[0.1em]" style={{ color: '#B5704F', fontWeight: 700, fontSize: '0.6rem' }}>Pacing &amp; Pause</p>
                <p>Opponents take about <strong style={{ color: '#1B2A4A' }}>{OPPONENT_DECISION_SECONDS} seconds</strong> to choose a discard or joker exchange line, giving you time to read table state.</p>
                <p>Use the <strong style={{ color: '#1B2A4A' }}>Pause</strong> button at any time to freeze timers, turn progress, and countdowns until you resume.</p>
              </div>

              <div style={{ borderTop: '1px solid rgba(27,42,74,0.08)', paddingTop: '0.5rem' }}>
                <p className="mb-1 uppercase tracking-[0.1em]" style={{ color: '#B5704F', fontWeight: 700, fontSize: '0.6rem' }}>Winning</p>
                <p>Declare <strong style={{ color: '#1B2A4A' }}>Mah Jongg</strong> when your hand matches a pattern on the NMJL card. Any tile except a Joker may be called for Mah Jongg.</p>
                <p>Click <BookOpen size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /> in the top bar to view the NMJL reference card and plan hands.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* NMJL Card Modal */}
      <NMJLCard isOpen={showNMJL} onClose={() => setShowNMJL(false)} planHands={planHands} onAddPlan={handleAddPlan} playerBarHeight={playerBarHeight} />

      {isPaused && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 pointer-events-none" style={{ background: 'rgba(17,18,30,0.4)' }}>
          <div
            className="rounded-xl px-5 py-4 text-center pointer-events-auto"
            style={{ background: 'rgba(27,42,74,0.92)', border: '1px solid rgba(212,165,116,0.35)', boxShadow: '0 12px 32px rgba(0,0,0,0.35)' }}
          >
            <div className="flex items-center justify-center gap-2 mb-2" style={{ color: '#FFFDF7' }}>
              <Pause size={16} />
              <span className="uppercase tracking-[0.14em]" style={{ fontSize: '0.72rem', fontWeight: 700 }}>Game Paused</span>
            </div>
            <p style={{ color: 'rgba(255,253,247,0.72)', fontSize: '0.72rem', maxWidth: 260 }}>
              Timers and turn progress are frozen. Tap Resume in the top bar to continue from this exact state.
            </p>
          </div>
        </div>
      )}

      {/* Game Over Modal */}
      {game.phase === 'gameOver' && (
        <GameOverModal
          winner={game.winner}
          players={game.players}
          isDraw={game.winner === null}
          onPlayAgain={handleNewGame}
          onSettings={onBackToSetup}
          planHands={planHands}
          isSiamese={siamese}
        />
      )}
    </div>
    </DndProvider>
  );
}

// ─── Charleston UI Component ─────────────────────────────────────────
function CharlestonUI({
  subPhase,
  stepInfo,
  stepInGroup,
  isFirstCharleston,
  charlestonStep,
  charlestonSelected,
  onStart,
  onSkip,
  onPass,
  onContinue,
  onEnd,
  onCourtesyPass,
  onCourtesySkip,
  DirectionIcon,
}: {
  subPhase: string;
  stepInfo: { direction: string; label: string; group: string };
  stepInGroup: number;
  isFirstCharleston: boolean;
  charlestonStep: number;
  charlestonSelected: number[];
  onStart: () => void;
  onSkip: () => void;
  onPass: () => void;
  onContinue: () => void;
  onEnd: () => void;
  onCourtesyPass: () => void;
  onCourtesySkip: () => void;
  DirectionIcon: React.ElementType;
}) {
  return (
    <div className="flex flex-col items-center gap-3 w-full max-w-md">
      {subPhase === 'pre' && (
        <div className="rounded-lg p-5 text-center" style={{
          background: 'rgba(0,0,0,0.35)',
          border: '1px solid rgba(181,112,79,0.3)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        }}>
          <StarburstIcon />
          <h3 className="mt-2 mb-1 uppercase tracking-[0.12em]" style={{
            fontFamily: "'Jost', sans-serif",
            color: '#FFFDF7',
            fontSize: '1rem',
            fontWeight: 700,
          }}>
            The Charleston
          </h3>
          <p className="mb-3" style={{
            color: 'rgba(255,253,247,0.6)',
            fontSize: '0.7rem',
            lineHeight: 1.5,
            maxWidth: 280,
            margin: '0 auto',
          }}>
            Before play begins, exchange tiles with other players. Pass 3 tiles right, across, then left. You may also do an optional second round.
          </p>
          <div className="flex flex-col gap-2 items-center">
            <button
              onClick={onStart}
              className="px-8 py-2 rounded uppercase tracking-wider transition-all hover:brightness-110"
              style={{
                background: 'linear-gradient(135deg, #B5704F, #C4805F)',
                color: '#FFFDF7',
                fontSize: '0.8rem',
                fontWeight: 600,
                boxShadow: '0 3px 12px rgba(181,112,79,0.4)',
              }}
            >
              Start Charleston
            </button>
            <button
              onClick={onSkip}
              className="px-4 py-1 rounded text-[0.65rem] uppercase tracking-wider transition-colors hover:bg-white/10"
              style={{
                color: 'rgba(255,253,247,0.45)',
                border: '1px solid rgba(255,253,247,0.12)',
              }}
            >
              Skip &amp; Start Playing
            </button>
          </div>
        </div>
      )}

      {(subPhase === 'selecting' || subPhase === 'passed') && (
        <div className="rounded-lg p-4 w-full" style={{
          background: 'rgba(0,0,0,0.35)',
          border: '1px solid rgba(181,112,79,0.25)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="text-[0.55rem] uppercase tracking-[0.15em]" style={{
                color: isFirstCharleston ? '#B5704F' : '#8BB59E',
              }}>
                {stepInfo.group}
              </span>
              <h4 className="uppercase tracking-[0.1em]" style={{
                fontFamily: "'Jost', sans-serif",
                color: '#FFFDF7',
                fontSize: '0.9rem',
                fontWeight: 700,
              }}>
                Step {stepInGroup} of 3
              </h4>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md" style={{
              background: 'rgba(181,112,79,0.2)',
              border: '1px solid rgba(181,112,79,0.3)',
            }}>
              <DirectionIcon size={16} style={{ color: '#B5704F' }} />
              <span className="uppercase tracking-wider" style={{
                color: '#FFFDF7',
                fontSize: '0.7rem',
                fontWeight: 600,
              }}>
                {stepInfo.label}
              </span>
            </div>
          </div>

          {/* Progress dots */}
          <div className="flex items-center gap-1.5 mb-3">
            {[0, 1, 2, 3, 4, 5].map(s => {
              const isActive = s === charlestonStep;
              const isDone = s < charlestonStep;
              const isSecondHalf = s >= 3;
              if (isSecondHalf && charlestonStep < 3) return null;
              return (
                <div key={s} className="flex items-center gap-1">
                  {s === 3 && <div className="w-px h-3 mx-0.5" style={{ background: 'rgba(255,253,247,0.15)' }} />}
                  <div
                    className="rounded-full transition-all"
                    style={{
                      width: isActive ? 10 : 6,
                      height: isActive ? 10 : 6,
                      background: isDone ? '#2D6A4F' : isActive ? '#B5704F' : 'rgba(255,253,247,0.15)',
                      boxShadow: isActive ? '0 0 8px rgba(181,112,79,0.5)' : 'none',
                    }}
                  />
                </div>
              );
            })}
          </div>

          {/* Selection status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <div key={i} className="rounded-sm flex items-center justify-center"
                    style={{
                      width: 28, height: 36,
                      background: i < charlestonSelected.length ? '#B5704F' : 'rgba(255,253,247,0.08)',
                      border: `1px solid ${i < charlestonSelected.length ? '#B5704F' : 'rgba(255,253,247,0.15)'}`,
                      transition: 'all 0.2s ease',
                    }}>
                    {i < charlestonSelected.length ? (
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6L5 9L10 3" stroke="#FFFDF7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <span style={{ color: 'rgba(255,253,247,0.2)', fontSize: '0.6rem' }}>?</span>
                    )}
                  </div>
                ))}
              </div>
              <span style={{
                color: charlestonSelected.length === 3 ? '#8BB59E' : 'rgba(255,253,247,0.5)',
                fontSize: '0.65rem',
              }}>
                {subPhase === 'passed'
                  ? 'Tiles passed! Received 3 new tiles.'
                  : `${charlestonSelected.length}/3 tiles selected`}
              </span>
            </div>

            <button
              onClick={onPass}
              disabled={charlestonSelected.length !== 3 || subPhase === 'passed'}
              className="px-5 py-1.5 rounded uppercase tracking-wider transition-all"
              style={{
                background: charlestonSelected.length === 3 && subPhase !== 'passed' ? '#B5704F' : 'rgba(255,253,247,0.08)',
                color: charlestonSelected.length === 3 && subPhase !== 'passed' ? '#FFFDF7' : 'rgba(255,253,247,0.3)',
                fontSize: '0.7rem',
                fontWeight: 600,
                cursor: charlestonSelected.length === 3 && subPhase !== 'passed' ? 'pointer' : 'default',
                boxShadow: charlestonSelected.length === 3 && subPhase !== 'passed' ? '0 2px 8px rgba(181,112,79,0.4)' : 'none',
              }}
            >
              Pass Tiles
            </button>
          </div>

          <p className="mt-2 text-center" style={{
            color: 'rgba(255,253,247,0.35)',
            fontSize: '0.55rem',
            letterSpacing: '0.05em',
          }}>
            {subPhase === 'passed'
              ? 'Preparing next pass...'
              : 'Click tiles in your hand below to select them for passing'}
          </p>
        </div>
      )}

      {subPhase === 'optOut' && (
        <div className="rounded-lg p-5 text-center" style={{
          background: 'rgba(0,0,0,0.35)',
          border: '1px solid rgba(45,106,79,0.3)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        }}>
          <div className="flex items-center justify-center gap-1 mb-2">
            <svg width="16" height="16" viewBox="0 0 12 12" fill="none">
              <path d="M2 6L5 9L10 3" stroke="#2D6A4F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-[0.6rem] uppercase tracking-[0.15em]" style={{ color: '#8BB59E' }}>
              First Charleston Complete
            </span>
          </div>
          <h4 className="mb-2 uppercase tracking-[0.1em]" style={{
            fontFamily: "'Jost', sans-serif",
            color: '#FFFDF7',
            fontSize: '0.95rem',
            fontWeight: 700,
          }}>
            Continue with Second Charleston?
          </h4>
          <p className="mb-4" style={{
            color: 'rgba(255,253,247,0.5)',
            fontSize: '0.65rem',
            lineHeight: 1.5,
            maxWidth: 260,
            margin: '0 auto',
          }}>
            The second Charleston is optional. You'll pass left, across, then right — the reverse order.
          </p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={onContinue}
              className="px-6 py-1.5 rounded uppercase tracking-wider transition-all hover:brightness-110"
              style={{
                background: '#2D6A4F',
                color: '#FFFDF7',
                fontSize: '0.7rem',
                fontWeight: 600,
                boxShadow: '0 2px 8px rgba(45,106,79,0.4)',
              }}
            >
              Continue
            </button>
            <button
              onClick={onEnd}
              className="px-6 py-1.5 rounded uppercase tracking-wider transition-all hover:bg-white/10"
              style={{
                color: '#FFFDF7',
                fontSize: '0.7rem',
                fontWeight: 600,
                border: '1px solid rgba(255,253,247,0.2)',
              }}
            >
              End &amp; Play
            </button>
          </div>
        </div>
      )}

      {subPhase === 'courtesy' && (
        <div className="rounded-lg p-5 text-center" style={{
          background: 'rgba(0,0,0,0.35)',
          border: '1px solid rgba(212,165,116,0.3)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        }}>
          <h4 className="mb-1 uppercase tracking-[0.12em]" style={{
            fontFamily: "'Jost', sans-serif",
            color: '#FFFDF7',
            fontSize: '0.95rem',
            fontWeight: 700,
          }}>
            Courtesy Pass
          </h4>
          <p className="mb-3" style={{
            color: 'rgba(255,253,247,0.55)',
            fontSize: '0.65rem',
            lineHeight: 1.5,
            maxWidth: 280,
            margin: '0 auto',
          }}>
            Optionally exchange 0–3 tiles with the player across. Select tiles below, then exchange. Jokers cannot be passed.
          </p>
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="flex gap-1">
              {[0, 1, 2].map(i => (
                <div key={i} className="rounded-sm flex items-center justify-center"
                  style={{
                    width: 24, height: 32,
                    background: i < charlestonSelected.length ? '#D4A574' : 'rgba(255,253,247,0.08)',
                    border: `1px solid ${i < charlestonSelected.length ? '#D4A574' : 'rgba(255,253,247,0.15)'}`,
                    transition: 'all 0.2s ease',
                  }}>
                  {i < charlestonSelected.length ? (
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6L5 9L10 3" stroke="#FFFDF7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <span style={{ color: 'rgba(255,253,247,0.2)', fontSize: '0.5rem' }}>?</span>
                  )}
                </div>
              ))}
            </div>
            <span style={{
              color: 'rgba(255,253,247,0.5)',
              fontSize: '0.6rem',
            }}>
              {charlestonSelected.length}/3 selected
            </span>
          </div>
          <div className="flex gap-2 justify-center">
            <button
              onClick={onCourtesyPass}
              disabled={charlestonSelected.length === 0}
              className="px-5 py-1.5 rounded uppercase tracking-wider transition-all hover:brightness-110"
              style={{
                background: charlestonSelected.length > 0 ? '#D4A574' : 'rgba(255,253,247,0.08)',
                color: charlestonSelected.length > 0 ? '#FFFDF7' : 'rgba(255,253,247,0.3)',
                fontSize: '0.7rem',
                fontWeight: 600,
                cursor: charlestonSelected.length > 0 ? 'pointer' : 'default',
              }}
            >
              Exchange {charlestonSelected.length > 0 ? `(${charlestonSelected.length})` : ''}
            </button>
            <button
              onClick={onCourtesySkip}
              className="px-5 py-1.5 rounded uppercase tracking-wider transition-all hover:bg-white/10"
              style={{
                color: '#FFFDF7',
                fontSize: '0.7rem',
                fontWeight: 600,
                border: '1px solid rgba(255,253,247,0.2)',
              }}
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {subPhase === 'done' && (
        <div className="rounded-lg p-4 text-center" style={{
          background: 'rgba(0,0,0,0.3)',
          border: '1px solid rgba(45,106,79,0.25)',
        }}>
          <p style={{
            color: '#8BB59E',
            fontSize: '0.75rem',
            fontWeight: 600,
            letterSpacing: '0.1em',
          }}>
            Charleston complete — starting game...
          </p>
        </div>
      )}
    </div>
  );
}

function StarburstIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 28 28" fill="none">
      <path d="M14 0L16.5 10.5L28 14L16.5 17.5L14 28L11.5 17.5L0 14L11.5 10.5Z" fill="#B5704F" />
    </svg>
  );
}

const MOBILE_TOP_RACK_MASK_HEIGHT = 18;
const MOBILE_SIDE_RACK_MASK_WIDTH = 22;
const MOBILE_TOP_RACK_STEP = 32;
const MOBILE_SIDE_RACK_STEP = 24;
const MOBILE_DRAW_TILE_GAP = 8;

function renderExposureRows(groups: TileType[][], clickableJokerIds?: Set<string>, onJokerClick?: (id: string) => void, tone: 'default' | 'alt' = 'default') {
  if (groups.length === 0) return null;

  return (
    <div className="flex gap-2 flex-wrap justify-center">
      {groups.map((group, gi) => (
        <div
          key={gi}
          className="flex gap-[2px] px-1 py-1 rounded-md"
          style={{ background: tone === 'alt' ? 'rgba(181,112,79,0.08)' : 'rgba(255,253,247,0.08)' }}
        >
          {group.map((tile) => {
            const isClickable = clickableJokerIds?.has(tile.id);
            return (
              <div
                key={tile.id}
                className={isClickable ? 'cursor-pointer rounded-sm ring-2 ring-[#B5704F] animate-pulse transition-all hover:scale-110' : ''}
                onClick={isClickable ? () => onJokerClick?.(tile.id) : undefined}
              >
                <TileComponent tile={tile} size="sm" />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function renderExposureColumns(groups: TileType[][], tileRotation: string, clickableJokerIds?: Set<string>, onJokerClick?: (id: string) => void) {
  if (groups.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 items-center shrink-0 py-1">
      {groups.map((group, gi) => (
        <div key={gi} className="flex flex-col gap-[2px] items-center px-1 py-1 rounded-md" style={{ background: 'rgba(255,253,247,0.08)' }}>
          {group.map((tile) => {
            const isClickable = clickableJokerIds?.has(tile.id);
            return (
              <div
                key={tile.id}
                style={{ transform: tileRotation }}
                className={isClickable ? 'cursor-pointer rounded-sm ring-2 ring-[#B5704F] animate-pulse transition-all hover:scale-110' : ''}
                onClick={isClickable ? () => onJokerClick?.(tile.id) : undefined}
              >
                <TileComponent tile={tile} size="sm" />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function MobileTopConcealedRack({ tileCount, showDrawGap = false }: { tileCount: number; showDrawGap?: boolean }) {
  if (tileCount <= 0) return null;

  const totalWidth = 32 + Math.max(0, tileCount - 1) * MOBILE_TOP_RACK_STEP + (showDrawGap && tileCount > 1 ? MOBILE_DRAW_TILE_GAP : 0);

  return (
    <div className="relative w-full overflow-hidden" style={{ height: MOBILE_TOP_RACK_MASK_HEIGHT }}>
      <div className="absolute left-1/2 top-0 -translate-x-1/2" style={{ width: totalWidth, height: MOBILE_TOP_RACK_MASK_HEIGHT }}>
        {Array.from({ length: tileCount }).map((_, i) => {
          const left = i * MOBILE_TOP_RACK_STEP + (showDrawGap && i === tileCount - 1 && tileCount > 1 ? MOBILE_DRAW_TILE_GAP : 0);
          return (
            <div key={i} className="absolute" style={{ left, top: -(44 - MOBILE_TOP_RACK_MASK_HEIGHT) }}>
              <TileBack size="sm" />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MobileSideConcealedRack({
  tileCount,
  side,
  showDrawGap = false,
}: {
  tileCount: number;
  side: 'left' | 'right';
  showDrawGap?: boolean;
}) {
  if (tileCount <= 0) return null;

  const tileAngle = side === 'left' ? 45 : -45;
  const totalHeight = 52 + Math.max(0, tileCount - 1) * MOBILE_SIDE_RACK_STEP + (showDrawGap && tileCount > 1 ? MOBILE_DRAW_TILE_GAP : 0);
  const tileLeft = side === 'left' ? -(44 - MOBILE_SIDE_RACK_MASK_WIDTH) : -2;

  return (
    <div
      className="shrink-0 overflow-y-auto"
      style={{ width: MOBILE_SIDE_RACK_MASK_WIDTH, minWidth: MOBILE_SIDE_RACK_MASK_WIDTH }}
    >
      <div className="relative" style={{ width: 32, height: totalHeight }}>
        {Array.from({ length: tileCount }).map((_, i) => {
          const top = i * MOBILE_SIDE_RACK_STEP + (showDrawGap && i === tileCount - 1 && tileCount > 1 ? MOBILE_DRAW_TILE_GAP : 0);
          return (
            <div
              key={i}
              className="absolute"
              style={{
                top,
                left: tileLeft,
                transform: `rotate(${tileAngle}deg)`,
                transformOrigin: side === 'left' ? 'right center' : 'left center',
              }}
            >
              <TileBack size="sm" />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OpponentRow({
  player,
  isActive,
  showDrawGap = false,
  clickableJokerIds,
  onJokerClick,
}: {
  player: any;
  isActive: boolean;
  showDrawGap?: boolean;
  clickableJokerIds?: Set<string>;
  onJokerClick?: (id: string) => void;
}) {
  const exposureGroups = renderExposureRows(player.exposures, clickableJokerIds, onJokerClick);

  return (
    <div className="flex flex-col items-center shrink-0 px-2">
      <div className="sm:hidden w-full flex flex-col items-center gap-1 pt-1">
        <div className="flex items-center gap-1.5 flex-wrap justify-center">
          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? 'animate-pulse' : ''}`} style={{
            background: isActive ? '#D4A574' : 'rgba(255,253,247,0.2)',
          }} />
          <span className="text-[0.5rem] uppercase tracking-wider" style={{ color: 'rgba(255,253,247,0.65)' }}>
            {player.name}
          </span>
          <span className="text-[0.45rem] px-1.5 py-0.5 rounded-full" style={{
            background: 'rgba(255,253,247,0.08)',
            color: 'rgba(255,253,247,0.42)',
          }}>
            {player.seatWind.toUpperCase()} · {player.hand.length} concealed
          </span>
          {showDrawGap && (
            <span className="text-[0.42rem] px-1.5 py-0.5 rounded-full" style={{
              background: 'rgba(212,165,116,0.16)',
              color: '#D4A574',
            }}>
              deciding
            </span>
          )}
        </div>
        <MobileTopConcealedRack tileCount={player.hand.length} showDrawGap={showDrawGap} />
        {exposureGroups && <div className="mt-0.5">{exposureGroups}</div>}
      </div>

      <div className="hidden sm:flex flex-col items-center py-1.5">
        <div className="flex items-center gap-2 mb-1">
          <div className={`w-2 h-2 rounded-full shrink-0 ${isActive ? 'animate-pulse' : ''}`} style={{
            background: isActive ? '#D4A574' : 'rgba(255,253,247,0.2)',
          }} />
          <span className="text-[0.6rem] uppercase tracking-wider" style={{ color: 'rgba(255,253,247,0.65)' }}>
            {player.name}
          </span>
          <span className="text-[0.5rem] px-1 py-0.5 rounded" style={{
            background: 'rgba(255,253,247,0.06)',
            color: 'rgba(255,253,247,0.35)',
          }}>
            {player.seatWind.toUpperCase()} &middot; {player.hand.length}
          </span>
        </div>
        <div className="flex gap-0.5 flex-wrap justify-center max-w-md">
          {player.hand.map((_: any, i: number) => (
            <TileBack key={`${player.id}_top_${i}`} size="sm" />
          ))}
        </div>
        {exposureGroups && <div className="mt-1">{exposureGroups}</div>}
      </div>
    </div>
  );
}

function OpponentColumn({
  player,
  isActive,
  side,
  showDrawGap = false,
  clickableJokerIds,
  onJokerClick,
}: {
  player: any;
  isActive: boolean;
  side: 'left' | 'right';
  showDrawGap?: boolean;
  clickableJokerIds?: Set<string>;
  onJokerClick?: (id: string) => void;
}) {
  const tileRotation = side === 'left' ? 'rotate(90deg)' : 'rotate(-90deg)';

  const wallColumnFull = (
    <div className="flex flex-col gap-0.5 items-center shrink-0">
      {player.hand.map((_: any, i: number) => (
        <TileBack key={`${player.id}_side_${i}`} size="sm" horizontal />
      ))}
    </div>
  );

  const exposuresColumn = renderExposureColumns(player.exposures, tileRotation, clickableJokerIds, onJokerClick);

  return (
    <div className="shrink-0 overflow-y-auto">
      <div className="hidden sm:flex items-start justify-center py-2 px-1">
        <div className="flex flex-col items-center w-8 shrink-0 pt-0.5">
          <div className={`w-2 h-2 rounded-full mb-1 shrink-0 ${isActive ? 'animate-pulse' : ''}`} style={{
            background: isActive ? '#D4A574' : 'rgba(255,253,247,0.2)',
          }} />
          <span className="text-[0.45rem] uppercase tracking-wider mb-0.5 text-center shrink-0" style={{
            color: 'rgba(255,253,247,0.55)',
            writingMode: 'vertical-lr',
          }}>
            {player.name.split(' ')[0]}
          </span>
          <span className="text-[0.4rem] shrink-0 px-1 py-0.5 rounded" style={{
            background: 'rgba(255,253,247,0.06)',
            color: 'rgba(255,253,247,0.3)',
          }}>
            {player.hand.length}
          </span>
        </div>
        {side === 'left' ? (
          <>{wallColumnFull}{exposuresColumn}</>
        ) : (
          <>{exposuresColumn}{wallColumnFull}</>
        )}
      </div>

      <div className="sm:hidden flex items-stretch gap-1 py-1 h-full">
        {side === 'left' && <MobileSideConcealedRack tileCount={player.hand.length} side={side} showDrawGap={showDrawGap} />}
        <div className="flex flex-col items-center justify-center gap-2 min-h-0">
          <div className="flex flex-col items-center gap-1">
            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? 'animate-pulse' : ''}`} style={{
              background: isActive ? '#D4A574' : 'rgba(255,253,247,0.2)',
            }} />
            <span className="text-[0.42rem] uppercase tracking-[0.18em]" style={{
              color: 'rgba(255,253,247,0.45)',
              writingMode: 'vertical-lr',
            }}>
              {player.seatWind.toUpperCase()}
            </span>
            <span className="text-[0.42rem] px-1 py-0.5 rounded-full" style={{
              background: 'rgba(255,253,247,0.08)',
              color: 'rgba(255,253,247,0.4)',
            }}>
              {player.hand.length}
            </span>
          </div>
          {exposuresColumn}
        </div>
        {side === 'right' && <MobileSideConcealedRack tileCount={player.hand.length} side={side} showDrawGap={showDrawGap} />}
      </div>
    </div>
  );
}

// ─── Siamese Opponent Row (shows two racks of face-down tiles) ────────

function SiameseOpponentRow({
  player,
  isActive,
  activeRack,
  showDrawGap = false,
  clickableJokerIds,
  onJokerClick,
}: {
  player: any;
  isActive: boolean;
  activeRack: 1 | 2;
  showDrawGap?: boolean;
  clickableJokerIds?: Set<string>;
  onJokerClick?: (id: string) => void;
}) {
  const totalTiles = player.hand.length + player.hand2.length;

  const exposureRows = (player.exposures.length > 0 || player.exposures2.length > 0) ? (
    <div className="flex gap-2 flex-wrap justify-center">
      {renderExposureRows(player.exposures, clickableJokerIds, onJokerClick)}
      {renderExposureRows(player.exposures2, clickableJokerIds, onJokerClick, 'alt')}
    </div>
  ) : null;

  return (
    <div className="flex flex-col items-center shrink-0 px-2">
      <div className="sm:hidden w-full flex flex-col items-center gap-1 pt-1">
        <div className="flex items-center gap-1.5 py-0.5 flex-wrap justify-center">
          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? 'animate-pulse' : ''}`} style={{
            background: isActive ? '#D4A574' : 'rgba(255,253,247,0.2)',
          }} />
          <span className="text-[0.5rem] uppercase tracking-wider" style={{ color: 'rgba(255,253,247,0.55)' }}>
            {player.name}
          </span>
          <span className="text-[0.45rem] px-1 rounded" style={{
            background: 'rgba(255,253,247,0.06)',
            color: 'rgba(255,253,247,0.3)',
          }}>
            {player.seatWind.toUpperCase()} · {totalTiles}
          </span>
        </div>
        <div className="w-full flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-[0.4rem] uppercase tracking-[0.16em] shrink-0 w-6" style={{ color: 'rgba(255,253,247,0.3)' }}>R1</span>
            <div className="flex-1">
              <MobileTopConcealedRack tileCount={player.hand.length} showDrawGap={showDrawGap && activeRack === 1} />
            </div>
            <span className="text-[0.42rem] px-1 py-0.5 rounded-full shrink-0" style={{
              background: 'rgba(255,253,247,0.08)',
              color: 'rgba(255,253,247,0.42)',
            }}>
              {player.hand.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[0.4rem] uppercase tracking-[0.16em] shrink-0 w-6" style={{ color: 'rgba(255,253,247,0.3)' }}>R2</span>
            <div className="flex-1">
              <MobileTopConcealedRack tileCount={player.hand2.length} showDrawGap={showDrawGap && activeRack === 2} />
            </div>
            <span className="text-[0.42rem] px-1 py-0.5 rounded-full shrink-0" style={{
              background: 'rgba(255,253,247,0.08)',
              color: 'rgba(255,253,247,0.42)',
            }}>
              {player.hand2.length}
            </span>
          </div>
        </div>
        {exposureRows && <div className="mt-1">{exposureRows}</div>}
      </div>
      <div className="hidden sm:flex flex-col items-center py-1.5">
        <div className="flex items-center gap-2 mb-1">
          <div className={`w-2 h-2 rounded-full shrink-0 ${isActive ? 'animate-pulse' : ''}`} style={{
            background: isActive ? '#D4A574' : 'rgba(255,253,247,0.2)',
          }} />
          <span className="text-[0.6rem] uppercase tracking-wider" style={{ color: 'rgba(255,253,247,0.65)' }}>
            {player.name}
          </span>
          <span className="text-[0.5rem] px-1 py-0.5 rounded" style={{
            background: 'rgba(255,253,247,0.06)',
            color: 'rgba(255,253,247,0.35)',
          }}>
            {player.seatWind.toUpperCase()} &middot; {totalTiles}
          </span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[0.4rem] uppercase tracking-wider shrink-0 w-4 text-right" style={{ color: 'rgba(255,253,247,0.25)' }}>R1</span>
            <div className="flex gap-0.5 flex-wrap justify-center max-w-md">
              {player.hand.map((_: any, i: number) => (
                <TileBack key={`${player.id}_r1_${i}`} size="sm" />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[0.4rem] uppercase tracking-wider shrink-0 w-4 text-right" style={{ color: 'rgba(255,253,247,0.25)' }}>R2</span>
            <div className="flex gap-0.5 flex-wrap justify-center max-w-md">
              {player.hand2.map((_: any, i: number) => (
                <TileBack key={`${player.id}_r2_${i}`} size="sm" />
              ))}
            </div>
          </div>
        </div>
        {exposureRows && <div className="mt-1">{exposureRows}</div>}
      </div>

    </div>
  );
}

// ─── Ghost Wall (3-player: indicates the empty 4th seat) ────────────

function GhostWall() {
  return (
    <div className="shrink-0">
      {/* Mobile: just a hairline placeholder so the flex row still has a left column */}
      <div className="sm:hidden h-full" style={{ width: 6, background: 'rgba(255,253,247,0.02)' }} />
      {/* Desktop: labelled ghost column */}
      <div className="hidden sm:flex items-center justify-center py-2 px-2 h-full" style={{ width: 48 }}>
        <div className="flex flex-col items-center gap-1.5">
          <div className="w-2 h-2 rounded-full" style={{ background: 'rgba(255,253,247,0.06)' }} />
          <span className="text-[0.4rem] uppercase tracking-wider text-center" style={{
            color: 'rgba(255,253,247,0.15)',
            writingMode: 'vertical-lr',
            letterSpacing: '0.15em',
          }}>
            Ghost Wall
          </span>
          <div className="flex flex-col gap-0.5 items-center">
            {[0, 1, 2].map(i => (
              <div key={i} className="rounded-sm" style={{
                width: 16, height: 20,
                background: 'rgba(255,253,247,0.03)',
                border: '1px dashed rgba(255,253,247,0.06)',
              }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
