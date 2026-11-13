import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  addToMeld,
  createGame,
  discardOpeningDrawAndRedraw,
  discardTile,
  drawFromStock,
  finishEmptyStock,
  GameRuleError,
  getMeldKind,
  keepOpeningDraw,
  layMeld,
  nextRound,
  sortTiles,
  sortTilesByNumber,
  takeDiscardPile,
  type GameState,
  type RoundScore,
  type Target,
  type Tile,
} from './game';
import { PointsDialog } from './components/PointsDialog';
import { GameTable, type MeldDensity } from './components/GameTable';
import { PlayerArea, type HandSortMode } from './components/PlayerArea';
import { RulesDialog } from './components/RulesDialog';
import { TileFace } from './components/TileFace';
import { WelcomeScreen } from './components/WelcomeScreen';
import { runComputerTurnSteps } from './computer';
import {
  logGameDebug,
  logGameError,
  setGameDebugEnabled,
  summarizeGameState,
  type BurakoDebugHelper,
} from './diagnostics';

const SAVE_KEY = 'burako-local-game-v1';
const AI_THINKING_DELAY_MS = 500;
const COMPUTER_MOVE_DELAY_MS = 700;
const RECENT_TILE_DURATION_MS = 1400;
const RECENT_DISCARD_DURATION_MS = RECENT_TILE_DURATION_MS * 2;
const TILE_FLIGHT_DURATION_MS = 560;
const MAX_UNDO_STEPS = 10;
type GameHistory = { states: GameState[]; cursor: number };
type TileFlight = {
  id: number;
  batchId: number;
  tile: Tile;
  from: { left: number; top: number; width: number; height: number };
  toZone: string;
  faceDown: boolean;
};
function formatTargetLabel(target: Target): string {
  return target === 'cut' ? 'Por Corte' : `A ${target.toLocaleString('es-AR')} pts`;
}

function sortHandForDisplay(hand: Tile[], mode: HandSortMode): Tile[] {
  if (mode === 'color') return sortTiles(hand);
  if (mode === 'number') return sortTilesByNumber(hand);
  return hand;
}

function getRecentlyChangedTileIds(previous: GameState, next: GameState): string[] {
  const changed = new Set<string>();
  const previousHumanHand = new Set(previous.players[0].hand.map((tile) => tile.id));
  for (const tile of next.players[0].hand) {
    if (!previousHumanHand.has(tile.id)) changed.add(tile.id);
  }

  const previousMeldTiles = new Set(previous.melds.flatMap((meld) => meld.tiles.map((tile) => tile.id)));
  for (const meld of next.melds) {
    for (const tile of meld.tiles) {
      if (!previousMeldTiles.has(tile.id)) changed.add(tile.id);
    }
  }

  const previousDiscard = new Set(previous.discard.map((tile) => tile.id));
  for (const tile of next.discard) {
    if (!previousDiscard.has(tile.id)) changed.add(tile.id);
  }
  return [...changed];
}

function getNewDiscardedTileIds(previous: GameState, next: GameState): string[] {
  const previousDiscard = new Set(previous.discard.map((tile) => tile.id));
  return next.discard.filter((tile) => !previousDiscard.has(tile.id)).map((tile) => tile.id);
}

function canLayMeldSelection(state: GameState, tileIds: string[]): boolean {
  try {
    layMeld(state, 0, tileIds);
    return true;
  } catch (issue) {
    if (issue instanceof GameRuleError) return false;
    throw issue;
  }
}

function loadSavedGame(): GameState | null {
  try {
    const saved = window.localStorage.getItem(SAVE_KEY);
    if (!saved) return null;
    const value = JSON.parse(saved) as { version?: number; game?: GameState };
    if (value.version !== 1 || !value.game || !Array.isArray(value.game.players) || value.game.players.length !== 2) return null;
    return value.game;
  } catch {
    return null;
  }
}

function getTileLocations(state: GameState): Map<string, string> {
  const locations = new Map<string, string>();
  for (const tile of state.stock) locations.set(tile.id, 'stock');
  for (const tile of state.discard) locations.set(tile.id, 'discard');
  for (const player of state.players) {
    for (const tile of player.hand) locations.set(tile.id, `hand-${player.id}`);
  }
  for (const meld of state.melds) {
    for (const tile of meld.tiles) locations.set(tile.id, `meld-${meld.team}`);
  }
  return locations;
}

function findAnimationElement(zone: string, tileId?: string): HTMLElement | null {
  if (zone === 'stock') return document.querySelector<HTMLElement>('[data-animation-anchor="stock"] .stack-back');
  const zones = document.querySelectorAll<HTMLElement>(`[data-animation-zone="${zone}"]`);
  for (const zoneElement of zones) {
    const tileElement = [...zoneElement.querySelectorAll<HTMLElement>('[data-tile-id]')]
      .find((element) => element.dataset.tileId === tileId);
    if (tileElement) return tileElement;
  }
  return null;
}

function getTileFlights(previous: GameState, next: GameState, firstId: number, revealOpponentHand: boolean): TileFlight[] {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return [];

  const previousLocations = getTileLocations(previous);
  const nextLocations = getTileLocations(next);
  const nextTiles = new Map<string, Tile>();
  for (const player of next.players) for (const tile of player.hand) nextTiles.set(tile.id, tile);
  for (const tile of next.discard) nextTiles.set(tile.id, tile);
  for (const meld of next.melds) for (const tile of meld.tiles) nextTiles.set(tile.id, tile);
  for (const tile of previous.stock) if (!nextTiles.has(tile.id)) nextTiles.set(tile.id, tile);
  for (const tile of previous.discard) if (!nextTiles.has(tile.id)) nextTiles.set(tile.id, tile);
  for (const player of previous.players) for (const tile of player.hand) if (!nextTiles.has(tile.id)) nextTiles.set(tile.id, tile);

  const flights: TileFlight[] = [];
  for (const [tileId, fromZone] of previousLocations) {
    const toZone = nextLocations.get(tileId);
    if (!toZone || fromZone === toZone) continue;
    const isDraw = fromZone === 'stock' && toZone.startsWith('hand-');
    const isDiscardPickup = fromZone === 'discard' && toZone.startsWith('hand-');
    const isPlay = fromZone.startsWith('hand-') && (toZone.startsWith('meld-') || toZone === 'discard');
    if (!isDraw && !isDiscardPickup && !isPlay) continue;

    const source = findAnimationElement(fromZone, tileId);
    const tile = nextTiles.get(tileId);
    if (!source || !tile) continue;
    const rect = source.getBoundingClientRect();
    const destinationPlayer = toZone.startsWith('hand-') ? Number(toZone.slice('hand-'.length)) : null;
    flights.push({
      id: firstId + flights.length,
      batchId: firstId,
      tile,
      from: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      toZone,
      faceDown: destinationPlayer === 1 && !revealOpponentHand,
    });
  }
  return flights;
}

export default function App() {
  const [game, setGame] = useState<GameState | null>(loadSavedGame);
  const [revealOpponentHandForDebug, setRevealOpponentHandForDebug] = useState(false);
  const [target, setTarget] = useState<Target>(2000);
  const [selection, setSelection] = useState<string[]>([]);
  const [recentlyChangedTileIds, setRecentlyChangedTileIds] = useState<string[]>([]);
  const [recentlyDiscardedTileIds, setRecentlyDiscardedTileIds] = useState<string[]>([]);
  const [tileFlights, setTileFlights] = useState<TileFlight[]>([]);
  const [recentTileDuration, setRecentTileDuration] = useState(RECENT_TILE_DURATION_MS);
  const [computerTurnInProgress, setComputerTurnInProgress] = useState(false);
  const [meldDensity, setMeldDensity] = useState<MeldDensity>('normal');
  const [discardDensity, setDiscardDensity] = useState<MeldDensity>('normal');
  const [error, setErrorState] = useState('');
  const setError = (message: string, state: GameState | null = game, cause?: unknown) => {
    if (message) logGameError(message, state, cause);
    setErrorState(message);
  };
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [handSortMode, setHandSortMode] = useState<HandSortMode>('original');
  const [showAvatarNames, setShowAvatarNames] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [touchDragPosition, setTouchDragPosition] = useState<{ x: number; y: number } | null>(null);
  const touchReorderRef = useRef<{ pointerId: number; tileId: string; startX: number; startY: number; dragging: boolean } | null>(null);
  const ignoreNextTileClickRef = useRef(false);
  const pointsDialogRef = useRef<HTMLDialogElement>(null);
  const rulesDialogRef = useRef<HTMLDialogElement>(null);
  const playerAreaRef = useRef<HTMLElement>(null);
  const feltTableRef = useRef<HTMLElement>(null);
  const computerTurnInProgressRef = useRef(false);
  const pauseComputerTurnRef = useRef(false);
  const humanHandOrderRef = useRef<string[]>(game?.players[0].hand.map((tile) => tile.id) ?? []);
  const computerTimerRef = useRef<number | null>(null);
  const computerWaitResolverRef = useRef<(() => void) | null>(null);
  const computerTurnIdRef = useRef(0);
  const componentMountedRef = useRef(true);
  const nextTileFlightIdRef = useRef(0);
  const tileFlightNodesRef = useRef(new Map<number, HTMLElement>());
  const startedTileFlightsRef = useRef(new Set<number>());
  const tileFlightTimersRef = useRef(new Map<number, number>());
  const gameHistoryRef = useRef<GameHistory>(game ? { states: [game], cursor: 0 } : { states: [], cursor: -1 });
  const [computerTurnResumeToken, setComputerTurnResumeToken] = useState(0);
  const debugActionsRef = useRef<{ undo: () => boolean; redo: () => boolean; resumeComputerTurn: () => void }>({
    undo: () => false,
    redo: () => false,
    resumeComputerTurn: () => {},
  });

  const cancelComputerTurn = () => {
    computerTurnIdRef.current += 1;
    if (computerTimerRef.current !== null) window.clearTimeout(computerTimerRef.current);
    computerTimerRef.current = null;
    computerWaitResolverRef.current?.();
    computerWaitResolverRef.current = null;
    computerTurnInProgressRef.current = false;
    setComputerTurnInProgress(false);
  };

  const commitGame = (previous: GameState, next: GameState) => {
    const history = gameHistoryRef.current;
    const states = history.states.slice(0, history.cursor + 1);
    const previousIsTerminal = previous.phase === 'round-over' || previous.phase === 'match-over';
    const nextIsTerminal = next.phase === 'round-over' || next.phase === 'match-over';
    if (!previousIsTerminal && (previous.currentPlayer !== next.currentPlayer || nextIsTerminal)) {
      states.push(next);
      if (states.length > MAX_UNDO_STEPS + 1) states.shift();
    }
    gameHistoryRef.current = { states, cursor: states.length - 1 };
    setGame(next);
  };

  const resetGameHistory = (initialGame: GameState | null) => {
    gameHistoryRef.current = initialGame
      ? { states: [initialGame], cursor: 0 }
      : { states: [], cursor: -1 };
  };

  const restoreHistory = (cursor: number): boolean => {
    const history = gameHistoryRef.current;
    if (!game || cursor < 0 || cursor >= history.states.length) return false;
    const restoredGame = history.states[cursor];
    cancelComputerTurn();
    pauseComputerTurnRef.current = true;
    gameHistoryRef.current = { ...history, cursor };
    setGame(restoredGame);
    setSelection([]);
    setRecentlyChangedTileIds([]);
    setRecentlyDiscardedTileIds([]);
    setTileFlights([]);
    setError('');
    return true;
  };

  const undoGame = () => restoreHistory(gameHistoryRef.current.cursor - 1);
  const redoGame = () => restoreHistory(gameHistoryRef.current.cursor + 1);
  const resumeComputerTurn = () => {
    pauseComputerTurnRef.current = false;
    setComputerTurnResumeToken((token) => token + 1);
  };
  debugActionsRef.current = { undo: undoGame, redo: redoGame, resumeComputerTurn };

  useEffect(() => {
    const helper: BurakoDebugHelper = {
      enableLogging: () => setGameDebugEnabled(true),
      disableLogging: () => setGameDebugEnabled(false),
      revealOpponentHand: () => setRevealOpponentHandForDebug(true),
      hideOpponentHand: () => setRevealOpponentHandForDebug(false),
      undo: () => debugActionsRef.current.undo(),
      redo: () => debugActionsRef.current.redo(),
      resumeComputerTurn: () => debugActionsRef.current.resumeComputerTurn(),
    };
    window.burakoDebug = helper;
    return () => {
      if (window.burakoDebug === helper) delete window.burakoDebug;
    };
  }, []);

  useEffect(() => {
    componentMountedRef.current = true;
    return () => {
      componentMountedRef.current = false;
      computerTurnIdRef.current += 1;
      if (computerTimerRef.current !== null) window.clearTimeout(computerTimerRef.current);
      for (const timer of tileFlightTimersRef.current.values()) window.clearTimeout(timer);
      tileFlightTimersRef.current.clear();
      computerWaitResolverRef.current?.();
      computerWaitResolverRef.current = null;
      computerTurnInProgressRef.current = false;
    };
  }, []);

  useEffect(() => {
    try {
      if (game) window.localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 1, game }));
      else window.localStorage.removeItem(SAVE_KEY);
    } catch (issue) {
      setError('No se pudo guardar la partida en este dispositivo.', game, issue);
    }
  }, [game]);

  useEffect(() => {
    if (!game || computerTurnInProgress || game.currentPlayer !== 0 || game.phase !== 'draw' || game.stock.length > 0) return;
    const humanCanLiftDiscard = game.discard.length > 0
      && game.players[0].hand.length + game.discard.length >= 5;
    if (humanCanLiftDiscard) return;
    commitGame(game, finishEmptyStock(game, 0));
    setSelection([]);
    setError('');
  }, [computerTurnInProgress, game]);

  useEffect(() => {
    if (recentlyChangedTileIds.length === 0) return;
    const timer = window.setTimeout(() => {
      setRecentlyChangedTileIds([]);
      setRecentlyDiscardedTileIds([]);
    }, recentTileDuration);
    return () => window.clearTimeout(timer);
  }, [recentTileDuration, recentlyChangedTileIds]);

  useLayoutEffect(() => {
    for (const flight of tileFlights) {
      if (startedTileFlightsRef.current.has(flight.id)) continue;
      const target = findAnimationElement(flight.toZone, flight.tile.id);
      const element = tileFlightNodesRef.current.get(flight.id);
      if (!target || !element) {
        setTileFlights((current) => current.filter((item) => item.id !== flight.id));
        continue;
      }

      const targetRect = target.getBoundingClientRect();
      const deltaX = targetRect.left - flight.from.left;
      const deltaY = targetRect.top - flight.from.top;
      const startScaleX = flight.from.width / targetRect.width;
      const startScaleY = flight.from.height / targetRect.height;
      element.style.width = `${targetRect.width}px`;
      element.style.height = `${targetRect.height}px`;
      if (!flight.faceDown) {
        const flightFace = element.querySelector<HTMLElement>('.tile-flight-face');
        for (const selector of ['strong', '.tile-mark', 'small']) {
          const targetText = target.querySelector<HTMLElement>(selector);
          const flightText = flightFace?.querySelector<HTMLElement>(selector);
          if (!targetText || !flightText) continue;
          const targetTextStyle = window.getComputedStyle(targetText);
          flightText.style.fontFamily = targetTextStyle.fontFamily;
          flightText.style.fontSize = targetTextStyle.fontSize;
          flightText.style.fontWeight = targetTextStyle.fontWeight;
          flightText.style.letterSpacing = targetTextStyle.letterSpacing;
          flightText.style.lineHeight = targetTextStyle.lineHeight;
          if (selector === '.tile-mark') {
            flightText.style.top = targetTextStyle.top;
            flightText.style.left = targetTextStyle.left;
          }
        }
      }
      startedTileFlightsRef.current.add(flight.id);
      let completed = false;
      const delay = (flight.id - flight.batchId) * 28;
      const finishFlight = () => {
        if (completed) return;
        completed = true;
        const timer = tileFlightTimersRef.current.get(flight.id);
        if (timer !== undefined) window.clearTimeout(timer);
        tileFlightTimersRef.current.delete(flight.id);
        startedTileFlightsRef.current.delete(flight.id);
        tileFlightNodesRef.current.delete(flight.id);
        setTileFlights((current) => current.filter((item) => item.id !== flight.id));
      };
      const animation = element.animate([
        { transform: `translate(0, 0) scale(${startScaleX}, ${startScaleY})` },
        { transform: `translate(${deltaX}px, ${deltaY}px) scale(1, 1)` },
      ], {
        duration: TILE_FLIGHT_DURATION_MS,
        delay,
        easing: 'cubic-bezier(.22, .72, .24, 1)',
        fill: 'forwards',
      });
      animation.onfinish = finishFlight;
      animation.oncancel = finishFlight;
      const timer = window.setTimeout(finishFlight, TILE_FLIGHT_DURATION_MS + delay + 100);
      tileFlightTimersRef.current.set(flight.id, timer);
    }
  }, [tileFlights]);

  useEffect(() => {
    setMeldDensity('normal');
    setDiscardDensity('normal');
  }, [game?.round]);

  useLayoutEffect(() => {
    const table = feltTableRef.current;
    if (!table) return;

    const measureOverflow = () => {
      if (game?.discard.length === 0) setDiscardDensity('normal');

      const teamAreas = table.querySelectorAll<HTMLElement>('.meld-team');
      const meldsOverflow = () => [...teamAreas].some((teamArea) => teamArea.scrollHeight > teamArea.clientHeight + 1);
      if (meldsOverflow()) {
        if (meldDensity === 'normal') {
          table.classList.add('is-compact-melds');
          const compactMeldsOverflow = meldsOverflow();
          table.classList.remove('is-compact-melds');
          setMeldDensity(compactMeldsOverflow ? 'minimum' : 'compact');
        } else if (meldDensity === 'compact') {
          setMeldDensity('minimum');
        }
      }

      const discardStack = table.querySelector<HTMLElement>('.discard-stack');
      if (discardStack) {
        const pileTiles = [...discardStack.children]
          .filter((tile) => !tile.classList.contains('discard-action-badge'));
        const actualTileRects = pileTiles
          .filter((tile) => !tile.classList.contains('discard-preview-tile'))
          .map((tile) => tile.getBoundingClientRect());
        if (actualTileRects.length > 0) {
          const lastRowTop = Math.max(...actualTileRects.map((rect) => rect.top));
          const lastRowRects = actualTileRects.filter((rect) => Math.abs(rect.top - lastRowTop) < 2);
          const lastRowCenter = (Math.min(...lastRowRects.map((rect) => rect.left))
            + Math.max(...lastRowRects.map((rect) => rect.right))) / 2;
          discardStack.style.setProperty('--discard-action-center-x', `${lastRowCenter - discardStack.getBoundingClientRect().left}px`);
        }
        const rowTops = pileTiles
          .map((tile) => tile.getBoundingClientRect().top)
          .filter((top, index, tops) => tops.findIndex((otherTop) => Math.abs(otherTop - top) < 2) === index);
        setDiscardDensity((density) => {
          if (density === 'normal' && rowTops.length > 1) return 'compact';
          if (density === 'compact' && rowTops.length > 1) return 'minimum';
          return density;
        });
      }
    };
    const resizeObserver = new ResizeObserver(measureOverflow);
    const observeContent = () => {
      resizeObserver.disconnect();
      resizeObserver.observe(table);
      table.querySelectorAll<HTMLElement>('.meld-team, .meld-games, .meld-tiles').forEach((element) => resizeObserver.observe(element));
      measureOverflow();
    };
    const mutationObserver = new MutationObserver(observeContent);

    observeContent();
    mutationObserver.observe(table, { childList: true, subtree: true, characterData: true });
    const handleResize = () => {
      setMeldDensity('normal');
      setDiscardDensity('normal');
    };
    window.addEventListener('resize', handleResize);
    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [Boolean(game), meldDensity, discardDensity, selection, game?.phase, game?.discard.length, game?.players[0].hand.length]);

  useEffect(() => {
    if (!game || game.currentPlayer !== 1 || game.phase === 'match-over' || game.phase === 'round-over'
      || computerTurnInProgressRef.current || pauseComputerTurnRef.current) return;
    const turnStart = game;
    humanHandOrderRef.current = turnStart.players[0].hand.map((tile) => tile.id);
    const turnId = ++computerTurnIdRef.current;
    logGameDebug('computer:thinking-start', { turnId, state: summarizeGameState(turnStart) });
    computerTurnInProgressRef.current = true;
    setComputerTurnInProgress(true);
    const wait = (duration: number) => new Promise<void>((resolve) => {
      let timer = 0;
      const finish = () => {
        if (computerTimerRef.current === timer) computerTimerRef.current = null;
        if (computerWaitResolverRef.current === finish) computerWaitResolverRef.current = null;
        resolve();
      };
      computerWaitResolverRef.current = finish;
      timer = window.setTimeout(() => {
        finish();
      }, duration);
      computerTimerRef.current = timer;
    });
    let lastAppliedState = turnStart;
    const playTurn = async () => {
      try {
        logGameDebug('computer:thinking-delay-start', { turnId, durationMs: AI_THINKING_DELAY_MS });
        await wait(AI_THINKING_DELAY_MS);
        if (!componentMountedRef.current || turnId !== computerTurnIdRef.current) return;
        const steps = runComputerTurnSteps(turnStart);
        logGameDebug('computer:plan-ready', { turnId, stepCount: steps.length });
        let previous = turnStart;
        for (const [index, next] of steps.entries()) {
          logGameDebug('computer:step-delay-start', { turnId, step: index + 1, stepCount: steps.length, durationMs: COMPUTER_MOVE_DELAY_MS });
          await wait(COMPUTER_MOVE_DELAY_MS);
          if (!componentMountedRef.current || turnId !== computerTurnIdRef.current) return;
          const handOrder = new Map(humanHandOrderRef.current.map((tileId, position) => [tileId, position]));
          const players = [...next.players];
          players[0] = {
            ...players[0],
            hand: [...players[0].hand].sort((left, right) =>
              (handOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (handOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER)),
          };
          const nextWithOrderedHand = { ...next, players };
          const discardedTileIds = getNewDiscardedTileIds(previous, nextWithOrderedHand);
          const flights = getTileFlights(previous, nextWithOrderedHand, nextTileFlightIdRef.current, revealOpponentHandForDebug);
          nextTileFlightIdRef.current += flights.length;
          if (flights.length) setTileFlights((current) => [...current, ...flights]);
          setRecentlyChangedTileIds(getRecentlyChangedTileIds(previous, next));
          setRecentlyDiscardedTileIds(discardedTileIds);
          setRecentTileDuration(discardedTileIds.length ? RECENT_DISCARD_DURATION_MS : RECENT_TILE_DURATION_MS);
          commitGame(previous, nextWithOrderedHand);
          setError('');
          previous = nextWithOrderedHand;
          lastAppliedState = nextWithOrderedHand;
          logGameDebug('computer:step-committed', { turnId, step: index + 1, state: summarizeGameState(nextWithOrderedHand) });
        }
      } catch (issue) {
        if (turnId !== computerTurnIdRef.current) return;
        setError('La computadora no pudo completar su turno por un problema técnico. Esto puede deberse a datos corruptos de la partida o a que retomaste una partida de una versión anterior del juego. Lo sentimos. Presioná «Salir» y comenzá una partida nueva para seguir jugando.', turnStart, issue);
      } finally {
        logGameDebug('computer:turn-finished', {
          turnId,
          cancelled: turnId !== computerTurnIdRef.current || !componentMountedRef.current,
          state: summarizeGameState(lastAppliedState),
        });
        if (turnId === computerTurnIdRef.current) {
          computerTurnInProgressRef.current = false;
          if (componentMountedRef.current) setComputerTurnInProgress(false);
        }
      }
    };
    void playTurn();
  }, [game?.currentPlayer, game?.phase, computerTurnResumeToken]);

  const startGame = (gameTarget: Target) => {
    logGameDebug('user:action', { action: 'nueva-partida', target: gameTarget });
    cancelComputerTurn();
    const nextGame = createGame(gameTarget);
    resetGameHistory(nextGame);
    pauseComputerTurnRef.current = false;
    setGame(nextGame);
    setDiscardDensity('normal');
    setRecentlyChangedTileIds([]);
    setRecentlyDiscardedTileIds([]);
    setTileFlights([]);
    setRecentTileDuration(RECENT_TILE_DURATION_MS);
    setHandSortMode('original');
    setSelection([]);
    setError('');
  };

  const begin = () => startGame(target);

  const perform = (action: (current: GameState) => GameState, actionName = 'jugada') => {
    if (!game) return;
    try {
      const next = action(game);
      pauseComputerTurnRef.current = false;
      const flights = getTileFlights(game, next, nextTileFlightIdRef.current, revealOpponentHandForDebug);
      nextTileFlightIdRef.current += flights.length;
      if (flights.length) setTileFlights((current) => [...current, ...flights]);
      logGameDebug('user:action', {
        action: actionName,
        before: summarizeGameState(game),
        after: summarizeGameState(next),
      });
      setRecentlyChangedTileIds(getRecentlyChangedTileIds(game, next));
      setRecentlyDiscardedTileIds([]);
      setRecentTileDuration(RECENT_TILE_DURATION_MS);
      commitGame(game, next);
      setSelection([]);
      setError('');
    } catch (issue) {
      logGameDebug('user:action-failed', { action: actionName, message: issue instanceof Error ? issue.message : String(issue), state: summarizeGameState(game) });
      setError(issue instanceof Error ? issue.message : 'No se pudo realizar esa jugada.', game, issue);
    }
  };

  const toggleTile = (id: string) => {
    const newTile = human.hand.find((tile) => tile.id === id);
    setSelection((selected) => {
      if (selected.includes(id)) return selected.filter((item) => item !== id);
      if (selected.length === 0 || !newTile) return [...selected, id];

      const selectedTiles = human.hand.filter((tile) => selected.includes(tile.id));
      const isWildcard = (tile: Tile) => tile.kind === 'joker' || tile.value === 2;
      const isRelatedToAll = selectedTiles.every((tile) => isWildcard(tile)
        || isWildcard(newTile)
        || tile.color === newTile.color
        || tile.value === newTile.value);
      return isRelatedToAll ? [...selected, id] : [id];
    });
    setError('');
  };

  const reorderHand = (fromId: string, toId: string) => {
    if (!game || !canReorderHand || fromId === toId) return;
    const hand = [...sortHandForDisplay(game.players[0].hand, handSortMode)];
    const from = hand.findIndex((tile) => tile.id === fromId);
    const to = hand.findIndex((tile) => tile.id === toId);
    if (from < 0 || to < 0) return;
    const [tile] = hand.splice(from, 1);
    hand.splice(to, 0, tile);
    humanHandOrderRef.current = hand.map((item) => item.id);
    const players = [...game.players];
    players[0] = { ...players[0], hand };
    commitGame(game, { ...game, players });
    setHandSortMode('original');
  };

  const handleTouchReorderStart = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!canReorderHand || event.pointerType === 'mouse' || event.button !== 0) return;
    const tileButton = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-hand-tile-id]');
    const tileId = tileButton?.dataset.handTileId;
    if (!tileId) return;
    ignoreNextTileClickRef.current = false;
    setTouchDragPosition(null);
    touchReorderRef.current = {
      pointerId: event.pointerId,
      tileId,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
    };
    tileButton.setPointerCapture(event.pointerId);
  };

  const handleTouchReorderMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = touchReorderRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.dragging && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= 8) {
      drag.dragging = true;
      setDraggedId(drag.tileId);
    }
    if (drag.dragging) {
      setTouchDragPosition({ x: event.clientX, y: event.clientY });
      event.preventDefault();
    }
  };

  const finishTouchReorder = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = touchReorderRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.dragging) {
      const dropTarget = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-hand-tile-id]');
      const dropId = dropTarget?.dataset.handTileId;
      if (dropId) reorderHand(drag.tileId, dropId);
      ignoreNextTileClickRef.current = true;
    }
    touchReorderRef.current = null;
    setDraggedId(null);
    setTouchDragPosition(null);
  };

  const cancelTouchReorder = (event: React.PointerEvent<HTMLDivElement>) => {
    if (touchReorderRef.current?.pointerId !== event.pointerId) return;
    touchReorderRef.current = null;
    setDraggedId(null);
    setTouchDragPosition(null);
  };

  const openRules = () => rulesDialogRef.current?.showModal();

  if (!game) {
    return <WelcomeScreen
      target={target}
      onTargetChange={setTarget}
      onBegin={begin}
      onOpenRules={openRules}
      rulesDialogRef={rulesDialogRef}
    />;
  }

  const human = game.players[0];
  const computer = game.players[1];
  const flightTileIds = new Set(tileFlights.map((flight) => flight.tile.id));
  const selectedTiles = human.hand.filter((tile) => selection.includes(tile.id));
  const canLaySelectedMeld = getMeldKind(selectedTiles) !== null && canLayMeldSelection(game, selection);
  const roundClosed = game.phase === 'round-over' || game.phase === 'match-over';
  const revealComputerHand = revealOpponentHandForDebug
    || (roundClosed && !(computer.indirectDead && !computer.playedAfterDead));
  const displayedHand = sortHandForDisplay(human.hand, handSortMode);
  const humanTurn = !computerTurnInProgress && game.currentPlayer === 0 && (game.phase === 'draw' || game.phase === 'opening-choice' || game.phase === 'play');
  const openingChoice = humanTurn && game.phase === 'opening-choice';
  const canDrawFromStock = humanTurn && game.phase === 'draw' && game.stock.length > 0;
  const canFinishEmptyStock = humanTurn && game.phase === 'draw' && game.stock.length === 0;
  const canLiftDiscard = humanTurn && game.phase === 'draw' && game.discard.length > 0 && human.hand.length + game.discard.length >= 5;
  const canReorderHand = !roundClosed && selection.length === 0
    && !(humanTurn && game.phase === 'opening-choice') && !canFinishEmptyStock;
  const playerHeaderText = !humanTurn
    ? `${human.hand.length} fichas`
    : game.phase === 'draw'
      ? game.turnNumber === 0 && game.roundStarter === 0 && canDrawFromStock
        ? 'Abrís vos. Robá para empezar'
        : canFinishEmptyStock
          ? canLiftDiscard
            ? 'Levantá el pozo, o tocá en tu atril para terminar'
            : 'La mano termina: no podés levantar el pozo'
          : canDrawFromStock && canLiftDiscard
            ? 'Robá o levantá el pozo para empezar'
            : 'Robá para empezar'
      : game.phase === 'opening-choice'
        ? 'Conservá o descartá tu primera ficha'
        : 'Seleccioná fichas. Tocá las vistas previas para mover';
  const canDiscard = humanTurn && game.phase === 'play' && selection.length === 1 && selection[0] !== game.restrictedDiscardTileId;
  const canUseDiscardPile = canDiscard || canLiftDiscard;
  const shouldShowHandControls = !roundClosed && human.hand.length > 0;
  const discardPreviewTile = openingChoice
    ? human.hand.find((tile) => tile.id === game.openingDrawTileId)
    : canDiscard ? selectedTiles[0] : undefined;
  const draggedTile = draggedId ? human.hand.find((tile) => tile.id === draggedId) : undefined;
  const recentlyChangedTileIdSet = new Set(recentlyChangedTileIds);
  const recentlyDiscardedTileIdSet = new Set(recentlyDiscardedTileIds);
  const handleHandSortMode = (mode: HandSortMode) => {
    setHandSortMode(mode);
    setSortMenuOpen(false);
  };
  const pointsHistory = game.roundHistory ?? [];
  const currentRoundScore: RoundScore | null = pointsHistory.length ? pointsHistory[pointsHistory.length - 1] : null;
  const previousRoundScores = currentRoundScore ? pointsHistory.slice(0, -1) : pointsHistory;
  const hasPreviousRounds = game.round > 1;
  const currentHandScores: [number, number] | null = currentRoundScore
    ? [currentRoundScore.scores[0].total, currentRoundScore.scores[1].total]
    : game.round === 1 ? [game.scores[0], game.scores[1]] : null;
  const pointsRows = currentRoundScore ? [
    { label: 'Canastas limpias', scores: currentRoundScore.scores.map((score) => score.cleanCanastas) },
    { label: 'Canastas sucias', scores: currentRoundScore.scores.map((score) => score.dirtyCanastas) },
    { label: 'Bono del muerto', scores: currentRoundScore.scores.map((score) => score.dead) },
    { label: 'Bono de cierre', scores: currentRoundScore.scores.map((score) => score.closure) },
    { label: 'Fichas en juegos bajados', scores: currentRoundScore.scores.map((score) => score.meldTiles) },
    { label: 'Fichas en atril', scores: currentRoundScore.scores.map((score) => score.rackTiles) },
  ] : [];
  const handleHandTileClick = (tileId: string, openingChoiceTile: boolean) => {
    if (ignoreNextTileClickRef.current) {
      ignoreNextTileClickRef.current = false;
      return;
    }
    if (canFinishEmptyStock) {
      perform((current) => finishEmptyStock(current, 0), 'terminar-mano-por-monton-vacio');
      return;
    }
    if (openingChoiceTile) {
      perform((current) => keepOpeningDraw(current, 0), 'conservar-robo-inicial');
      return;
    }
    toggleTile(tileId);
  };
  return (
    <main className="game-page" onContextMenu={(event) => event.preventDefault()}>
      <div className="tile-flight-layer" aria-hidden="true">
        {tileFlights.map((flight) => <span
          className="tile-flight"
          key={flight.id}
          ref={(element) => {
            if (element) tileFlightNodesRef.current.set(flight.id, element);
            else tileFlightNodesRef.current.delete(flight.id);
          }}
          style={{ left: flight.from.left, top: flight.from.top, width: flight.from.width, height: flight.from.height }}
        >{flight.faceDown
          ? <span className="tile-flight-back" />
          : <TileFace tile={flight.tile} className="tile-flight-face" />}</span>)}
      </div>
      <header className="game-header">
        <a className="game-brand" href="#" onClick={(event) => { event.preventDefault(); cancelComputerTurn(); setGame(null); }}>
          <span className="brand-mark tile-face tile-blue" aria-hidden="true">
            <span className="tile-mark" />
            <strong>B</strong>
          </span>
          <span>Burako</span>
        </a>
        <div className="match-meta">
          <div className="match-meta-details">{game.target !== 'cut' && <><span>Mano {game.round}</span><span className="meta-divider" /></>}{formatTargetLabel(game.target)}</div>
          {game.target !== 'cut' && (game.scores[0] !== 0 || game.scores[1] !== 0) && <span className="match-score" aria-label={`Puntaje: ${game.scores[0].toLocaleString('es-AR')} (vos) a ${game.scores[1].toLocaleString('es-AR')}`}>
            Puntaje: {game.scores[0].toLocaleString('es-AR')} (vos) a {game.scores[1].toLocaleString('es-AR')}
          </span>}
        </div>
        <a className="quiet-button game-rules-link" href="#reglas" onClick={(event) => { event.preventDefault(); openRules(); }}>Reglas</a>
        <button className="quiet-button" type="button" onClick={() => { cancelComputerTurn(); setGame(null); }}>Salir</button>
      </header>

      <GameTable
        game={game}
        feltTableRef={feltTableRef}
        computerTurnInProgress={computerTurnInProgress}
        roundClosed={roundClosed}
        revealComputerHand={revealComputerHand}
        humanTurn={humanTurn}
        showAvatarNames={showAvatarNames}
        onToggleAvatarNames={() => setShowAvatarNames((visible) => !visible)}
        meldDensity={meldDensity}
        discardDensity={discardDensity}
        selection={selection}
        selectedTiles={selectedTiles}
        canLaySelectedMeld={canLaySelectedMeld}
        canDrawFromStock={canDrawFromStock}
        canFinishEmptyStock={canFinishEmptyStock}
        canUseDiscardPile={canUseDiscardPile}
        canDiscard={canDiscard}
        openingChoice={openingChoice}
        discardPreviewTile={discardPreviewTile}
        flightTileIds={flightTileIds}
        recentlyChangedTileIdSet={recentlyChangedTileIdSet}
        recentlyDiscardedTileIdSet={recentlyDiscardedTileIdSet}
        onFinishEmptyStock={() => perform((current) => finishEmptyStock(current, 0), 'terminar-mano-por-monton-vacio')}
        onDrawFromStock={() => perform((current) => drawFromStock(current, 0), 'robar-del-monton')}
        onDiscardOpeningDrawAndRedraw={() => perform((current) => discardOpeningDrawAndRedraw(current, 0), 'rechazar-robo-inicial-y-robar-otra')}
        onDiscardTile={(tileId) => perform((current) => discardTile(current, 0, tileId), 'descartar')}
        onTakeDiscardPile={() => perform((current) => takeDiscardPile(current, 0), 'levantar-pozo')}
        onLayMeld={(tileIds) => perform((current) => layMeld(current, 0, tileIds), 'bajar-combinacion')}
        onAddToMeld={(meldId, tileIds) => perform((current) => addToMeld(current, 0, meldId, tileIds), 'agregar-a-juego')}
      />

      <PointsDialog
        dialogRef={pointsDialogRef}
        game={game}
        pointsHistory={pointsHistory}
        currentRoundScore={currentRoundScore}
        previousRoundScores={previousRoundScores}
        pointsRows={pointsRows}
      />

      <PlayerArea
        game={game}
        playerAreaRef={playerAreaRef}
        error={error}
        humanTurn={humanTurn}
        currentHandScores={currentHandScores}
        hasPreviousRounds={hasPreviousRounds}
        shouldShowHandControls={shouldShowHandControls}
        playerHeaderText={playerHeaderText}
        sortMenuOpen={sortMenuOpen}
        handSortMode={handSortMode}
        onToggleSortMenu={() => setSortMenuOpen((open) => !open)}
        onHandSortModeChange={handleHandSortMode}
        displayedHand={displayedHand}
        selection={selection}
        flightTileIds={flightTileIds}
        draggedId={draggedId}
        draggedTile={draggedTile}
        touchDragPosition={touchDragPosition}
        canReorderHand={canReorderHand}
        canFinishEmptyStock={canFinishEmptyStock}
        recentlyChangedTileIdSet={recentlyChangedTileIdSet}
        onShowPoints={() => pointsDialogRef.current?.showModal()}
        onNextRound={() => perform(nextRound, 'repartir-proxima-mano')}
        onPlayAgain={startGame}
        onFinishEmptyStock={() => perform((current) => finishEmptyStock(current, 0), 'terminar-mano-por-monton-vacio')}
        onHandTileClick={handleHandTileClick}
        onDraggedIdChange={(tileId) => setDraggedId(tileId)}
        onReorderHand={reorderHand}
        onPointerDown={handleTouchReorderStart}
        onPointerMove={handleTouchReorderMove}
        onPointerUp={finishTouchReorder}
        onPointerCancel={cancelTouchReorder}
      />

      <RulesDialog dialogRef={rulesDialogRef} />
    </main>
  );
}