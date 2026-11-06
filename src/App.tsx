import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rulesMarkdown from '../reglas-burako.md?raw';
import {
  addToMeld,
  createGame,
  discardOpeningDrawAndRedraw,
  discardTile,
  drawFromStock,
  finishEmptyStock,
  GameRuleError,
  getMeldKind,
  isCanasta,
  isCleanMeld,
  keepOpeningDraw,
  layMeld,
  nextRound,
  sortTiles,
  sortTilesByNumber,
  takeDiscardPile,
  type GameState,
  type Target,
  type Tile,
} from './game';
import { runComputerTurnSteps } from './computer';

const COLOR_NAMES: Record<string, string> = {
  red: 'rojo',
  blue: 'azul',
  green: 'verde',
  yellow: 'amarillo',
};
const SAVE_KEY = 'burako-local-game-v1';
const AI_THINKING_DELAY_MS = 500;
const COMPUTER_MOVE_DELAY_MS = 700;
const RECENT_TILE_DURATION_MS = 1400;
const RECENT_DISCARD_DURATION_MS = RECENT_TILE_DURATION_MS * 2;
type HandSortMode = 'original' | 'color' | 'number';
const TARGET_OPTIONS = [
  { label: 'A 2000 pts', value: 2000 },
  { label: 'A 3000 pts', value: 3000 },
  { label: 'A 5000 pts', value: 5000 },
  { label: 'Por Corte', value: 'cut' },
] as const;

function formatTargetLabel(target: Target): string {
  return target === 'cut' ? 'Por Corte' : `A ${target.toLocaleString('es-AR')} pts`;
}

function sortHandForDisplay(hand: Tile[], mode: HandSortMode): Tile[] {
  if (mode === 'color') return sortTiles(hand);
  if (mode === 'number') return sortTilesByNumber(hand);
  return hand;
}

function sortLegTiles(tiles: Tile[]): Tile[] {
  const wildcards = tiles.filter((tile) => tile.kind === 'joker' || tile.value === 2);
  const naturalTiles = tiles.filter((tile) => tile.kind !== 'joker' && tile.value !== 2);
  return [...sortTiles(wildcards), ...sortTiles(naturalTiles)];
}

function getLegNumber(tiles: Tile[]): number {
  return tiles.find((tile) => tile.kind !== 'joker' && tile.value !== 2)?.value
    ?? tiles.find((tile) => tile.kind !== 'joker')?.value
    ?? 14;
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

function previewMeldAddition(state: GameState, meldId: string, tileIds: string[]): Tile[] | null {
  try {
    const preview = addToMeld(state, 0, meldId, tileIds);
    return preview.melds.find((meld) => meld.id === meldId)?.tiles ?? null;
  } catch (issue) {
    if (issue instanceof GameRuleError) return null;
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

function TileFace({ tile, selected = false, className = '' }: { tile: Tile; selected?: boolean; className?: string }) {
  const isWildTwo = tile.kind === 'number' && tile.value === 2;
  const label = tile.kind === 'joker'
    ? 'comodín especial'
    : `${tile.value} ${COLOR_NAMES[tile.color ?? '']}${isWildTwo ? ', comodín' : ''}`;
  return (
    <span className={`tile-face ${tile.kind === 'joker' ? 'tile-joker' : `tile-${tile.color}`} ${isWildTwo ? 'tile-two-wild' : ''} ${selected ? 'is-selected' : ''} ${className}`} role="img" aria-label={label}>
      {tile.kind !== 'joker' && <span className="tile-mark" aria-hidden="true">●</span>}
      <strong>{tile.kind === 'joker' ? '★' : tile.value}</strong>
      {tile.kind === 'joker' && <small>COMODÍN</small>}
    </span>
  );
}

function ScorePairSummary({ label, scores }: { label: string; scores: [number, number] }) {
  return (
    <span className="result-score-pair">
      {label}: vos <span className={scores[0] >= scores[1] ? 'is-leading-score' : ''}>{scores[0].toLocaleString('es-AR')}</span>
      {' · '}computadora <span className={scores[1] >= scores[0] ? 'is-leading-score' : ''}>{scores[1].toLocaleString('es-AR')}</span>
    </span>
  );
}

export default function App() {
  const [game, setGame] = useState<GameState | null>(loadSavedGame);
  const [target, setTarget] = useState<Target>(2000);
  const [selection, setSelection] = useState<string[]>([]);
  const [recentlyChangedTileIds, setRecentlyChangedTileIds] = useState<string[]>([]);
  const [recentlyDiscardedTileIds, setRecentlyDiscardedTileIds] = useState<string[]>([]);
  const [recentTileDuration, setRecentTileDuration] = useState(RECENT_TILE_DURATION_MS);
  const [computerTurnInProgress, setComputerTurnInProgress] = useState(false);
  const [error, setError] = useState('');
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [discardSortMode, setDiscardSortMode] = useState<HandSortMode>('original');
  const [handSortMode, setHandSortMode] = useState<HandSortMode>('original');
  const [showAvatarNames, setShowAvatarNames] = useState(false);
  const [touchDragPosition, setTouchDragPosition] = useState<{ x: number; y: number } | null>(null);
  const touchReorderRef = useRef<{ pointerId: number; tileId: string; startX: number; startY: number; dragging: boolean } | null>(null);
  const ignoreNextTileClickRef = useRef(false);
  const discardDialogRef = useRef<HTMLDialogElement>(null);
  const pointsDialogRef = useRef<HTMLDialogElement>(null);
  const rulesDialogRef = useRef<HTMLDialogElement>(null);
  const playerAreaRef = useRef<HTMLElement>(null);
  const computerTurnInProgressRef = useRef(false);
  const computerTimerRef = useRef<number | null>(null);
  const computerWaitResolverRef = useRef<(() => void) | null>(null);
  const computerTurnIdRef = useRef(0);
  const componentMountedRef = useRef(true);

  const cancelComputerTurn = () => {
    computerTurnIdRef.current += 1;
    if (computerTimerRef.current !== null) window.clearTimeout(computerTimerRef.current);
    computerTimerRef.current = null;
    computerWaitResolverRef.current?.();
    computerWaitResolverRef.current = null;
    computerTurnInProgressRef.current = false;
    setComputerTurnInProgress(false);
  };

  useEffect(() => {
    componentMountedRef.current = true;
    return () => {
      componentMountedRef.current = false;
      computerTurnIdRef.current += 1;
      if (computerTimerRef.current !== null) window.clearTimeout(computerTimerRef.current);
      computerWaitResolverRef.current?.();
      computerWaitResolverRef.current = null;
      computerTurnInProgressRef.current = false;
    };
  }, []);

  useEffect(() => {
    try {
      if (game) window.localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 1, game }));
      else window.localStorage.removeItem(SAVE_KEY);
    } catch {
      setError('No se pudo guardar la partida en este dispositivo.');
    }
  }, [game]);

  useEffect(() => {
    if (recentlyChangedTileIds.length === 0) return;
    const timer = window.setTimeout(() => {
      setRecentlyChangedTileIds([]);
      setRecentlyDiscardedTileIds([]);
    }, recentTileDuration);
    return () => window.clearTimeout(timer);
  }, [recentTileDuration, recentlyChangedTileIds]);

  useEffect(() => {
    if (!game || game.currentPlayer !== 1 || game.phase === 'match-over' || game.phase === 'round-over' || computerTurnInProgressRef.current) return;
    const turnStart = game;
    const turnId = ++computerTurnIdRef.current;
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
    const playTurn = async () => {
      try {
        await wait(AI_THINKING_DELAY_MS);
        if (!componentMountedRef.current || turnId !== computerTurnIdRef.current) return;
        const steps = runComputerTurnSteps(turnStart);
        let previous = turnStart;
        for (const next of steps) {
          await wait(COMPUTER_MOVE_DELAY_MS);
          if (!componentMountedRef.current || turnId !== computerTurnIdRef.current) return;
          const discardedTileIds = getNewDiscardedTileIds(previous, next);
          setRecentlyChangedTileIds(getRecentlyChangedTileIds(previous, next));
          setRecentlyDiscardedTileIds(discardedTileIds);
          setRecentTileDuration(discardedTileIds.length ? RECENT_DISCARD_DURATION_MS : RECENT_TILE_DURATION_MS);
          setGame(next);
          setError('');
          previous = next;
          if (discardedTileIds.length && next.currentPlayer !== 1) {
            await wait(RECENT_DISCARD_DURATION_MS);
            if (!componentMountedRef.current || turnId !== computerTurnIdRef.current) return;
          }
        }
      } catch (issue) {
        if (turnId !== computerTurnIdRef.current) return;
        console.error('Error al completar el turno de la computadora:', issue, issue instanceof Error ? issue.stack : undefined);
        console.error('Estado de la partida al producirse el error:\n', JSON.stringify(turnStart, null, 2));
        setError('La computadora no pudo completar su turno por un problema técnico. Esto puede deberse a datos corruptos de la partida o a que retomaste una partida de una versión anterior del juego. Lo sentimos. Presioná «Salir» y comenzá una partida nueva para seguir jugando.');
      } finally {
        if (turnId === computerTurnIdRef.current) {
          computerTurnInProgressRef.current = false;
          if (componentMountedRef.current) setComputerTurnInProgress(false);
        }
      }
    };
    void playTurn();
  }, [game?.currentPlayer]);

  const startGame = (gameTarget: Target) => {
    cancelComputerTurn();
    setGame(createGame(gameTarget));
    setRecentlyChangedTileIds([]);
    setRecentlyDiscardedTileIds([]);
    setRecentTileDuration(RECENT_TILE_DURATION_MS);
    setHandSortMode('original');
    setSelection([]);
    setError('');
  };

  const begin = () => startGame(target);

  const perform = (action: (current: GameState) => GameState) => {
    if (!game) return;
    try {
      const next = action(game);
      setRecentlyChangedTileIds(getRecentlyChangedTileIds(game, next));
      setRecentlyDiscardedTileIds([]);
      setRecentTileDuration(RECENT_TILE_DURATION_MS);
      setGame(next);
      setSelection([]);
      setError('');
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'No se pudo realizar esa jugada.');
    }
  };

  const toggleTile = (id: string) => {
    setSelection((selected) => selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
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
    const players = [...game.players];
    players[0] = { ...players[0], hand };
    setGame({ ...game, players });
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
  const rulesDialog = (
    <dialog
      ref={rulesDialogRef}
      className="rules-dialog"
      aria-labelledby="rules-dialog-title"
      onClick={(event) => { if (event.target === event.currentTarget) rulesDialogRef.current?.close(); }}
    >
      <div className="rules-dialog-content">
        <header className="rules-dialog-header">
          <div>
            <p className="discard-dialog-eyebrow">Guía rápida</p>
            <h2 id="rules-dialog-title">Reglas del Burako</h2>
          </div>
          <button className="discard-dialog-close" type="button" aria-label="Cerrar reglas" autoFocus onClick={() => rulesDialogRef.current?.close()}>×</button>
        </header>
        <div className="rules-dialog-scroll">
          <article className="rules-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{rulesMarkdown}</ReactMarkdown>
          </article>
        </div>
      </div>
    </dialog>
  );

  if (!game) {
    return (
      <main className="welcome">
        <header className="topbar">
          <span className="brand-mark tile-face tile-red" aria-hidden="true">
            <span className="tile-mark">●</span>
            <strong>B</strong>
          </span>
          <span className="brand-name">Burako</span>
          <a
            className="github-link"
            href="https://github.com/lcapalbo/burako"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Repositorio de Burako en GitHub"
            title="Ver repositorio en GitHub"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.04c-3.34.73-4.04-1.42-4.04-1.42-.55-1.39-1.33-1.76-1.33-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.8 1.3 3.49.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.34-5.47-5.94 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.1-3.17 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.29-1.23 3.29-1.23.65 1.65.24 2.87.12 3.17.77.84 1.23 1.91 1.23 3.22 0 4.61-2.8 5.63-5.47 5.93.43.37.81 1.09.81 2.22v3.29c0 .32.22.69.83.57A12 12 0 0 0 12 .5Z" />
            </svg>
          </a>
        </header>
        <section className="welcome-copy">
          <p className="eyebrow">La mesa está lista</p>
          <h1>Tu próximo<br /><em>burako</em> empieza acá.</h1>
          <p className="intro">Jugá una partida contra la computadora.</p>
          <p className="intro rules-invitation">Si sos nuevo, <button className="rules-inline-link" type="button" onClick={openRules}>estas son las reglas</button>.</p>
          <div className="target-picker" role="group" aria-label="Objetivo de la partida">
            {TARGET_OPTIONS.map(({ label, value }) => (
              <button key={label} type="button" className={target === value ? 'target-option active' : 'target-option'} onClick={() => setTarget(value)}>{label}</button>
            ))}
          </div>
          <button className="start-button" type="button" onClick={begin}>Comenzar partida <span aria-hidden="true">→</span></button>
          <p className="offline-note">Sin cuenta ni publicidad · La partida se juega en tu dispositivo</p>
        </section>
        <aside className="tile-composition" aria-label="Fichas de ejemplo">
          <TileFace tile={{ id: 'welcome-red-7', color: 'red', value: 7, kind: 'number' }} className="tile-one" />
          <TileFace tile={{ id: 'welcome-green-8', color: 'green', value: 8, kind: 'number' }} className="tile-two" />
          <TileFace tile={{ id: 'welcome-blue-9', color: 'blue', value: 9, kind: 'number' }} className="tile-three" />
          <TileFace tile={{ id: 'welcome-yellow-2', color: 'yellow', value: 2, kind: 'number' }} className="tile-wild" />
        </aside>
        {rulesDialog}
      </main>
    );
  }

  const human = game.players[0];
  const computer = game.players[1];
  const selectedTiles = human.hand.filter((tile) => selection.includes(tile.id));
  const canLaySelectedMeld = getMeldKind(selectedTiles) !== null;
  const roundClosed = game.phase === 'round-over' || game.phase === 'match-over';
  const revealComputerHand = roundClosed && !(computer.indirectDead && !computer.playedAfterDead);
  const displayedHand = sortHandForDisplay(human.hand, handSortMode);
  const handSortLabel = handSortMode === 'original' ? 'Ordenar por color' : handSortMode === 'color' ? 'Ordenar por número' : 'Orden original';
  const discardSortLabel = discardSortMode === 'original' ? 'Ordenar por color' : discardSortMode === 'color' ? 'Ordenar por número' : 'Orden original';
  const humanTurn = !computerTurnInProgress && game.currentPlayer === 0 && (game.phase === 'draw' || game.phase === 'opening-choice' || game.phase === 'play');
  const openingChoice = humanTurn && game.phase === 'opening-choice';
  const canReorderHand = humanTurn && selection.length === 0 && game.phase !== 'opening-choice';
  const playerHeaderText = !humanTurn ? `${human.hand.length} fichas` : game.phase === 'draw' ? 'Robá para empezar' : 'Tu turno';
  const selectedTileIds = selection;
  const canDiscard = humanTurn && game.phase === 'play' && selection.length === 1;
  const canDrawFromStock = humanTurn && game.phase === 'draw' && game.stock.length > 0;
  const canFinishEmptyStock = humanTurn && game.phase === 'draw' && game.stock.length === 0;
  const canLiftDiscard = humanTurn && game.phase === 'draw' && game.discard.length > 0 && human.hand.length + game.discard.length >= 5;
  const canUseDiscardPile = canDiscard || canLiftDiscard;
  const visibleDiscard = game.discard.slice(-3);
  const draggedTile = draggedId ? human.hand.find((tile) => tile.id === draggedId) : undefined;
  const recentlyChangedTileIdSet = new Set(recentlyChangedTileIds);
  const recentlyDiscardedTileIdSet = new Set(recentlyDiscardedTileIds);
  const meldsForTeam = (team: number) => game.melds
    .filter((meld) => meld.team === team)
    .sort((first, second) => Number(first.kind === 'leg') - Number(second.kind === 'leg'));
  const cycleHandSort = () => setHandSortMode((mode) => mode === 'original' ? 'color' : mode === 'color' ? 'number' : 'original');
  const cycleDiscardSort = () => setDiscardSortMode((mode) => mode === 'original' ? 'color' : mode === 'color' ? 'number' : 'original');
  const pointsHistory = game.roundHistory ?? [];
  const currentRoundScore = pointsHistory.length ? pointsHistory[pointsHistory.length - 1] : null;
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
  const formatHandPoints = (points: number) => points > 0
    ? `+${points.toLocaleString('es-AR')}`
    : points.toLocaleString('es-AR');

  return (
    <main className="game-page">
      <header className="game-header">
        <a className="game-brand" href="#" onClick={(event) => { event.preventDefault(); cancelComputerTurn(); setGame(null); }}>
          <span className="brand-mark tile-face tile-red" aria-hidden="true">
            <span className="tile-mark">●</span>
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

      <section className="opponent-bar" aria-label="Atril de la computadora">
        {revealComputerHand
          ? <div className="opponent-rack" aria-label="Fichas del atril de la computadora">{computer.hand.map((tile) => <TileFace tile={tile} key={tile.id} />)}</div>
          : !roundClosed && <div className="hidden-tiles" aria-hidden="true">{Array.from({ length: computer.hand.length }, (_, index) => <span key={index} />)}</div>}
      </section>

      <section
        className={`felt-table ${game.phase === 'round-over' || game.phase === 'match-over' ? '' : computerTurnInProgress || game.currentPlayer === 1 ? 'is-computer-turn' : 'is-human-turn'} ${canDiscard || canLaySelectedMeld ? 'has-table-action' : ''}`}
        aria-label="Mesa de juego"
        onClick={(event) => {
          if (!(event.target instanceof Element)) return;
          if (event.target.closest('button, a, [role="button"]')) return;
          if (canLaySelectedMeld && game.phase === 'play' && game.currentPlayer === 0) {
            perform((current) => layMeld(current, 0, selectedTileIds));
          } else if (canDiscard) {
            perform((current) => discardTile(current, 0, selectedTileIds[0]));
          }
        }}
      >
        <button
          className={`table-avatar table-avatar-computer ${!roundClosed && (game.currentPlayer === 1 || computerTurnInProgress) ? 'is-turn' : ''}`}
          type="button"
          aria-label="Mostrar nombre de computadora"
          aria-expanded={showAvatarNames}
          onClick={() => setShowAvatarNames((visible) => !visible)}
        >
          <svg className="opponent-avatar" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
            <circle cx="16" cy="16" r="16" fill="currentColor" />
            <path d="M16 5.5v3M13 5.5h6" fill="none" stroke="white" strokeLinecap="round" strokeWidth="1.6" />
            <rect x="8" y="10" width="16" height="13" rx="4" fill="none" stroke="white" strokeWidth="1.8" />
            <circle cx="12.5" cy="15.5" r="1.2" fill="white" />
            <circle cx="19.5" cy="15.5" r="1.2" fill="white" />
            <path d="M12.5 19h7" fill="none" stroke="white" strokeLinecap="round" strokeWidth="1.5" />
          </svg>
          {showAvatarNames && <span className="avatar-tooltip">Computadora</span>}
        </button>
        <button
          className={`table-avatar table-avatar-player ${humanTurn ? 'is-turn' : ''}`}
          type="button"
          aria-label="Mostrar nombre de jugador"
          aria-expanded={showAvatarNames}
          onClick={() => setShowAvatarNames((visible) => !visible)}
        >
          <svg className="player-avatar" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
            <circle cx="16" cy="16" r="16" fill="currentColor" />
            <circle cx="16" cy="11.5" r="4" fill="white" />
            <path d="M7 27c.7-5.5 4-8.5 9-8.5s8.3 3 9 8.5" fill="white" />
          </svg>
          {showAvatarNames && <span className="avatar-tooltip">Vos</span>}
        </button>
        <div className="piles-row">
          <button
            className="stock-pile pile-action"
            type="button"
            disabled={!canDrawFromStock && !openingChoice && !canFinishEmptyStock}
            aria-label={openingChoice ? 'Descartar la ficha inicial y robar otra del montón' : canFinishEmptyStock ? 'Terminar la mano porque se agotó el montón' : `Robar ficha del montón (${game.stock.length} restantes)`}
            title={openingChoice ? 'Descartar la ficha inicial y robar otra' : canFinishEmptyStock ? 'Terminar la mano' : 'Robar ficha del montón'}
            onClick={() => openingChoice
              ? perform((current) => discardOpeningDrawAndRedraw(current, 0))
              : canFinishEmptyStock
                ? perform((current) => finishEmptyStock(current, 0))
                : perform((current) => drawFromStock(current, 0))}
          >
            {game.stock.length > 0
              ? <span className="stack-back"><i /><i /><i /></span>
              : <span className="empty-stock">Montón vacío</span>}
            <div className="stock-pile-label"><small>MONTÓN</small><span className="pile-count">{game.stock.length}</span></div>
          </button>
          <div className="discard-pile">
            {visibleDiscard.length > 0 ? (
              <button
                className="discard-stack pile-action"
                type="button"
                disabled={!canUseDiscardPile && !openingChoice}
                aria-label={openingChoice ? 'Descartar la ficha inicial y robar otra del montón' : canDiscard ? 'Descartar ficha seleccionada en el pozo' : `Levantar todo el pozo (${game.discard.length} fichas)`}
                title={openingChoice ? 'Descartar la ficha inicial y robar otra' : canDiscard ? 'Descartar ficha seleccionada' : 'Levantar todo el pozo'}
                style={{ width: `${42 + (visibleDiscard.length - 1) * 16}px` }}
                onClick={() => openingChoice
                  ? perform((current) => discardOpeningDrawAndRedraw(current, 0))
                  : canDiscard
                    ? perform((current) => discardTile(current, 0, selectedTileIds[0]))
                    : perform((current) => takeDiscardPile(current, 0))}
              >
                {visibleDiscard.map((tile, index) => (
                  <span className="discard-stack-card" key={tile.id} style={{ '--discard-depth': index } as React.CSSProperties}>
                    <TileFace tile={tile} className={recentlyChangedTileIdSet.has(tile.id) ? recentlyDiscardedTileIdSet.has(tile.id) ? 'is-recent is-recent-discard' : 'is-recent' : ''} />
                  </span>
                ))}
              </button>
            ) : canDiscard || openingChoice
              ? <button className="empty-discard pile-action" type="button" aria-label={openingChoice ? 'Descartar la ficha inicial y robar otra del montón' : 'Descartar ficha seleccionada en el pozo vacío'} title={openingChoice ? 'Descartar la ficha inicial y robar otra' : 'Descartar ficha seleccionada'} onClick={() => openingChoice
                ? perform((current) => discardOpeningDrawAndRedraw(current, 0))
                : perform((current) => discardTile(current, 0, selectedTileIds[0]))}>Pozo vacío</button>
              : <span className="empty-discard">Pozo vacío</span>}
            <button className="pile-view-button" type="button" disabled={!game.discard.length} onClick={() => { setDiscardSortMode('original'); discardDialogRef.current?.showModal(); }}>VER POZO <span className="pile-count">{game.discard.length}</span></button>
          </div>
        </div>
        <div className="meld-area">
          {([1, 0] as const).map((team) => {
            const teamMelds = meldsForTeam(team);
            const deadTaken = game.players.find((player) => player.team === team)?.deadTaken ?? false;
            const categories = [
              { key: 'run', label: 'Escaleras', melds: teamMelds.filter((meld) => meld.kind === 'run') },
              { key: 'leg', label: 'Piernas', melds: teamMelds.filter((meld) => meld.kind === 'leg').sort((first, second) => getLegNumber(first.tiles) - getLegNumber(second.tiles)) },
            ].filter((category) => category.melds.length > 0);
            const teamName = team === 1 ? 'Mesa oponente' : 'Tu mesa';
            const isTurnTeam = game.phase !== 'round-over'
              && game.phase !== 'match-over'
              && game.players.find((player) => player.id === game.currentPlayer)?.team === team;
            return (
              <section className={`meld-team ${isTurnTeam ? 'is-turn' : ''}`} key={team} aria-label={`Juegos de ${teamName}`}>
                <header className="meld-team-header">
                  <h3 className="meld-team-heading">{teamName}</h3>
                  <span className={`meld-dead-status ${deadTaken ? 'is-taken' : ''}`}>Muerto {deadTaken ? 'levantado' : 'pendiente'}</span>
                </header>
                {teamMelds.length === 0
                  ? <p className="empty-team-melds">Sin juegos bajados</p>
                  : <div className="meld-categories">{categories.map((category) => (
                    <section className="meld-category" key={category.key} aria-label={category.label}>
                      <div className="meld-category-games">{category.melds.map((meld) => (
                        (() => {
                          const previewTiles = selection.length > 0 && game.phase === 'play' && game.currentPlayer === 0 && meld.team === 0
                            ? previewMeldAddition(game, meld.id, selectedTileIds)
                            : null;
                          const canAddSelection = previewTiles !== null;
                          const addSelection = () => perform((current) => addToMeld(current, 0, meld.id, selectedTileIds));
                          const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
                            if (!canAddSelection || (event.key !== 'Enter' && event.key !== ' ')) return;
                            event.preventDefault();
                            addSelection();
                          };
                          const tilesToDisplay = previewTiles ?? meld.tiles;
                          const shownTiles = meld.kind === 'leg' ? sortLegTiles(tilesToDisplay) : tilesToDisplay;
                          return <div
                            className={`meld-group ${canAddSelection ? 'meld-target' : ''}`}
                            key={meld.id}
                            role={canAddSelection ? 'button' : undefined}
                            tabIndex={canAddSelection ? 0 : undefined}
                            aria-label={canAddSelection ? `Agregar ${selection.length} fichas seleccionadas a este juego` : undefined}
                            onClick={canAddSelection ? addSelection : undefined}
                            onKeyDown={canAddSelection ? handleKeyDown : undefined}
                          >
                          <div className="meld-tiles">
                            {shownTiles.map((tile) => {
                              const selectedForPreview = canAddSelection && selectedTileIds.includes(tile.id);
                              return <TileFace
                                tile={tile}
                                key={tile.id}
                                className={selectedForPreview
                                  ? 'is-preview'
                                  : recentlyChangedTileIdSet.has(tile.id) ? 'is-recent' : ''}
                              />;
                            })}
                            {isCanasta(meld) && <strong className="canasta-badge canasta-overlay">{isCleanMeld(meld) ? 'Canasta limpia' : 'Canasta sucia'}</strong>}
                          </div>
                          </div>;
                        })()
                      ))}</div>
                    </section>
                  ))}</div>}
              </section>
            );
          })}
        </div>
      </section>

      <dialog
        ref={discardDialogRef}
        className="discard-dialog"
        aria-labelledby="discard-dialog-title"
        onClose={() => setDiscardSortMode('original')}
        onClick={(event) => { if (event.target === event.currentTarget) discardDialogRef.current?.close(); }}
      >
        <div className="discard-dialog-content">
          <header className="discard-dialog-header">
            <div>
              <p className="discard-dialog-eyebrow">Pozo de descartes</p>
              <h2 id="discard-dialog-title">{game.discard.length} {game.discard.length === 1 ? 'ficha' : 'fichas'}</h2>
            </div>
            <button className="discard-dialog-close" type="button" aria-label="Cerrar pozo" autoFocus onClick={() => discardDialogRef.current?.close()}>×</button>
          </header>
          <ol className="discard-tile-list" aria-label="Fichas del pozo">
            {sortHandForDisplay(game.discard, discardSortMode).map((tile) => (
              <li className="discard-tile" key={tile.id}>
                <TileFace tile={tile} className={recentlyChangedTileIdSet.has(tile.id) ? 'is-recent' : ''} />
              </li>
            ))}
          </ol>
          <footer className="discard-dialog-footer">
            <button className="sort-button" type="button" onClick={cycleDiscardSort}>{discardSortLabel}</button>
            <button className="primary-action" type="button" onClick={() => discardDialogRef.current?.close()}>Cerrar</button>
          </footer>
        </div>
      </dialog>

      <dialog
        ref={pointsDialogRef}
        className="discard-dialog points-dialog"
        aria-labelledby="points-dialog-title"
        onClick={(event) => { if (event.target === event.currentTarget) pointsDialogRef.current?.close(); }}
      >
        <div className="discard-dialog-content">
          <header className="discard-dialog-header">
            <div>
              <p className="discard-dialog-eyebrow">Resumen de la partida</p>
              <h2 id="points-dialog-title">Detalle de puntos</h2>
            </div>
            <button className="discard-dialog-close" type="button" aria-label="Cerrar detalle de puntos" autoFocus onClick={() => pointsDialogRef.current?.close()}>×</button>
          </header>
          <div className="points-table-scroll">
            {pointsHistory.length > 0 && pointsHistory[0].round > 1 && <p className="points-history-note">El detalle de manos anteriores a esta versión no está disponible.</p>}
            {!currentRoundScore && <p className="points-history-note">El detalle de esta mano no está disponible para esta partida guardada.</p>}
            <table className="points-table">
              <thead>
                <tr><th scope="col">Detalle</th><th scope="col">Vos</th><th scope="col">Computadora</th></tr>
              </thead>
              <tbody>
                {previousRoundScores.map((roundScore) => (
                  <tr key={roundScore.round}>
                    <th scope="row">Mano {roundScore.round}</th>
                    <td>{formatHandPoints(roundScore.scores[0].total)}</td>
                    <td>{formatHandPoints(roundScore.scores[1].total)}</td>
                  </tr>
                ))}
                {currentRoundScore && <>
                  {game.round > 1 && <tr className="points-section-row"><th colSpan={3}>Detalle de la mano {currentRoundScore.round}</th></tr>}
                  {pointsRows.map((row) => (
                    <tr key={row.label}>
                      <th scope="row">{row.label}</th>
                      <td>{formatHandPoints(row.scores[0])}</td>
                      <td>{formatHandPoints(row.scores[1])}</td>
                    </tr>
                  ))}
                  <tr className="points-round-total">
                    <th scope="row">Total de la mano</th>
                    <td>{formatHandPoints(currentRoundScore.scores[0].total)}</td>
                    <td>{formatHandPoints(currentRoundScore.scores[1].total)}</td>
                  </tr>
                </>}
                {game.round > 1 && <tr className="points-match-total">
                  <th scope="row">Total final</th>
                  <td>{game.scores[0].toLocaleString('es-AR')}</td>
                  <td>{game.scores[1].toLocaleString('es-AR')}</td>
                </tr>}
              </tbody>
            </table>
          </div>
          <footer className="discard-dialog-footer">
            <button className="primary-action" type="button" onClick={() => pointsDialogRef.current?.close()}>Cerrar</button>
          </footer>
        </div>
      </dialog>

      <section ref={playerAreaRef} className="player-area" aria-label="Tu atril">
        {game.result && <section className={`result-banner ${game.phase === 'match-over' ? 'is-final' : ''}`} role="status">
          <strong>{game.result}</strong>
          {(game.phase === 'match-over' || (game.target !== 'cut' && game.phase === 'round-over')) && <span className="result-score-summary">
            {currentHandScores
              ? <ScorePairSummary label="Puntaje de la mano" scores={currentHandScores} />
              : <>Puntaje de la mano no disponible para esta partida guardada.</>}
            {hasPreviousRounds && <>
              {' · '}
              <ScorePairSummary label="Acumulado de partida" scores={[game.scores[0], game.scores[1]]} />
            </>}
          </span>}
          <div className="result-actions">
            <button className="points-detail-button" type="button" onClick={() => pointsDialogRef.current?.showModal()}>Ver detalle de puntos</button>
            {game.phase === 'round-over' && <button type="button" onClick={() => perform(nextRound)}>Repartir la próxima mano <span aria-hidden="true">→</span></button>}
            {game.phase === 'match-over' && <button type="button" onClick={() => startGame(game.target)}>Jugar de nuevo</button>}
          </div>
        </section>}
        {error && <p className="error-message" role="alert">{error}</p>}
        <div className="player-heading">
          <div className="player-header-meta">
            <span className="hand-count">{playerHeaderText}</span>
          </div>
          <div className="hand-tools">
            <button className="sort-button" type="button" disabled={!humanTurn} onClick={cycleHandSort}>{handSortLabel}</button>
          </div>
        </div>
        <div
          className={`hand-tiles ${human.hand.length >= 20 ? 'is-compact' : ''}`}
          onDragOver={(event) => event.preventDefault()}
          onPointerDown={handleTouchReorderStart}
          onPointerMove={handleTouchReorderMove}
          onPointerUp={finishTouchReorder}
          onPointerCancel={cancelTouchReorder}
        >
          {displayedHand.map((tile, index) => {
            const openingChoiceTile = game.phase === 'opening-choice' && game.openingDrawTileId === tile.id;
            return (
              <button
                className={`hand-tile ${canReorderHand ? 'is-reorderable' : ''} ${selection.includes(tile.id) ? 'selected' : ''} ${draggedId === tile.id ? 'is-touch-dragging' : ''}`}
                type="button"
                key={tile.id}
                data-hand-tile-id={tile.id}
                draggable={canReorderHand}
                disabled={!humanTurn}
                aria-pressed={selection.includes(tile.id)}
                aria-label={`${tile.kind === 'joker' ? 'Comodín' : `${tile.value} ${COLOR_NAMES[tile.color ?? '']}`}${selection.includes(tile.id) ? ', seleccionada' : ''}`}
                onClick={() => {
                  if (ignoreNextTileClickRef.current) {
                    ignoreNextTileClickRef.current = false;
                    return;
                  }
                  if (openingChoiceTile) {
                    perform((current) => keepOpeningDraw(current, 0));
                    return;
                  }
                  toggleTile(tile.id);
                }}
                onDragStart={(event) => { if (!canReorderHand) event.preventDefault(); else setDraggedId(tile.id); }}
                onDragEnd={() => setDraggedId(null)}
                onDrop={(event) => { event.preventDefault(); if (canReorderHand && draggedId) reorderHand(draggedId, tile.id); setDraggedId(null); }}
                style={{ '--tile-index': index } as React.CSSProperties}
              ><TileFace
                tile={tile}
                selected={selection.includes(tile.id)}
                className={openingChoiceTile ? 'is-preview' : recentlyChangedTileIdSet.has(tile.id) && !selection.includes(tile.id) ? 'is-recent' : ''}
              /></button>
            );
          })}
        </div>
        {draggedTile && touchDragPosition && <div
          className="touch-drag-ghost"
          aria-hidden="true"
          style={{ left: touchDragPosition.x, top: touchDragPosition.y }}
        ><TileFace tile={draggedTile} /></div>}
      </section>

      {rulesDialog}
    </main>
  );
}