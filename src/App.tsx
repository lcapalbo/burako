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
import { runComputerTurn } from './computer';

const COLOR_NAMES: Record<string, string> = {
  red: 'rojo',
  blue: 'azul',
  green: 'verde',
  yellow: 'amarillo',
};
const SAVE_KEY = 'burako-local-game-v1';
const AI_THINKING_DELAY_MS = 1500;
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
  const [error, setError] = useState('');
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [discardSortMode, setDiscardSortMode] = useState<HandSortMode>('original');
  const [handSortMode, setHandSortMode] = useState<HandSortMode>('original');
  const [touchDragPosition, setTouchDragPosition] = useState<{ x: number; y: number } | null>(null);
  const touchReorderRef = useRef<{ pointerId: number; tileId: string; startX: number; startY: number; dragging: boolean } | null>(null);
  const ignoreNextTileClickRef = useRef(false);
  const discardDialogRef = useRef<HTMLDialogElement>(null);
  const pointsDialogRef = useRef<HTMLDialogElement>(null);
  const rulesDialogRef = useRef<HTMLDialogElement>(null);
  const opponentBarRef = useRef<HTMLElement>(null);
  const playerAreaRef = useRef<HTMLElement>(null);
  const pendingScrollTargetRef = useRef<'player' | 'computer' | null>(null);

  useEffect(() => {
    const target = pendingScrollTargetRef.current;
    if (!target) return;
    pendingScrollTargetRef.current = null;
    const frame = window.requestAnimationFrame(() => {
      const section = target === 'player' ? playerAreaRef.current : opponentBarRef.current;
      section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [game]);

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
    const timer = window.setTimeout(() => setRecentlyChangedTileIds([]), 1400);
    return () => window.clearTimeout(timer);
  }, [recentlyChangedTileIds]);

  useEffect(() => {
    if (!game || game.currentPlayer !== 1 || game.phase === 'match-over' || game.phase === 'round-over') return;
    const timer = window.setTimeout(() => {
      try {
        const next = runComputerTurn(game);
        setRecentlyChangedTileIds(getRecentlyChangedTileIds(game, next));
        setGame(next);
        setError('');
      } catch (issue) {
        console.error('Error al completar el turno de la computadora:', issue, issue instanceof Error ? issue.stack : undefined);
        console.error('Estado de la partida al producirse el error:\n', JSON.stringify(game, null, 2));
        setError('La computadora no pudo completar su turno por un problema técnico. Esto puede deberse a datos corruptos de la partida o a que retomaste una partida de una versión anterior del juego. Lo sentimos. Presioná «Salir» y comenzá una partida nueva para seguir jugando.');
      }
    }, AI_THINKING_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [game]);

  const startGame = (gameTarget: Target) => {
    setGame(createGame(gameTarget));
    setRecentlyChangedTileIds([]);
    setHandSortMode('original');
    setSelection([]);
    setError('');
  };

  const begin = () => startGame(target);

  const perform = (action: (current: GameState) => GameState, scrollTarget?: 'player' | 'computer') => {
    if (!game) return;
    try {
      const next = action(game);
      const scrollToPlayer = scrollTarget === 'player' && next.currentPlayer === 0
        && (next.phase === 'draw' || next.phase === 'opening-choice' || next.phase === 'play');
      const scrollToComputer = scrollTarget === 'computer' && next.currentPlayer === 1
        && (next.phase === 'draw' || next.phase === 'play');
      pendingScrollTargetRef.current = scrollToPlayer ? 'player' : scrollToComputer ? 'computer' : null;
      setRecentlyChangedTileIds(getRecentlyChangedTileIds(game, next));
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
  const humanTurn = game.currentPlayer === 0 && (game.phase === 'draw' || game.phase === 'opening-choice' || game.phase === 'play');
  const openingChoice = game.phase === 'opening-choice' && game.currentPlayer === 0;
  const canReorderHand = humanTurn && selection.length === 0 && game.phase !== 'opening-choice';
  const playerHeaderText = !humanTurn ? `${human.hand.length} fichas` : game.phase === 'draw' ? 'Robá para empezar' : 'Tu turno';
  const selectedTileIds = selection;
  const canDiscard = game.phase === 'play' && game.currentPlayer === 0 && selection.length === 1;
  const canDrawFromStock = humanTurn && game.phase === 'draw' && game.stock.length > 0;
  const canLiftDiscard = humanTurn && game.phase === 'draw' && game.discard.length > 0 && human.hand.length + game.discard.length >= 5;
  const canUseDiscardPile = canDiscard || canLiftDiscard;
  const visibleDiscard = game.discard.slice(-3);
  const draggedTile = draggedId ? human.hand.find((tile) => tile.id === draggedId) : undefined;
  const recentlyChangedTileIdSet = new Set(recentlyChangedTileIds);
  const meldsForTeam = (team: number) => game.melds
    .filter((meld) => meld.team === team)
    .sort((first, second) => Number(first.kind === 'leg') - Number(second.kind === 'leg'));
  const admissibleMeldCount = selection.length > 0 && game.phase === 'play' && game.currentPlayer === 0
    ? meldsForTeam(0).filter((meld) => previewMeldAddition(game, meld.id, selectedTileIds) !== null).length
    : 0;
  const selectionLabel = `${selection.length} seleccionada${selection.length === 1 ? '' : 's'}`;
  const admissibleMeldHint = admissibleMeldCount > 0
    ? ` - admisible${selection.length === 1 ? '' : 's'} en ${admissibleMeldCount} juego${admissibleMeldCount === 1 ? '' : 's'} bajado${admissibleMeldCount === 1 ? '' : 's'}. Tocá ${admissibleMeldCount === 1 ? 'el juego' : 'uno de esos juegos'} para agregar${selection.length === 1 ? 'la' : 'las'}.`
    : '';
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
        <a className="game-brand" href="#" onClick={(event) => { event.preventDefault(); setGame(null); }}>
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
        <button className="quiet-button" type="button" onClick={() => setGame(null)}>Salir</button>
      </header>

      <section ref={opponentBarRef} className="opponent-bar" aria-label="Atril de la computadora">
        <svg className={`opponent-avatar ${!roundClosed && game.currentPlayer === 1 ? 'is-turn' : ''}`} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
          <circle cx="16" cy="16" r="16" fill="currentColor" />
          <path d="M16 5.5v3M13 5.5h6" fill="none" stroke="white" strokeLinecap="round" strokeWidth="1.6" />
          <rect x="8" y="10" width="16" height="13" rx="4" fill="none" stroke="white" strokeWidth="1.8" />
          <circle cx="12.5" cy="15.5" r="1.2" fill="white" />
          <circle cx="19.5" cy="15.5" r="1.2" fill="white" />
          <path d="M12.5 19h7" fill="none" stroke="white" strokeLinecap="round" strokeWidth="1.5" />
        </svg>
        <div className="opponent-name"><strong>La computadora</strong><span>{roundClosed ? `${computer.hand.length} fichas` : game.currentPlayer === 1 ? error || 'Está pensando…' : `${computer.hand.length} fichas`}</span></div>
        {revealComputerHand
          ? <div className="opponent-rack" aria-label="Fichas del atril de la computadora">{computer.hand.map((tile) => <TileFace tile={tile} key={tile.id} />)}</div>
          : !roundClosed && <div className="hidden-tiles" aria-hidden="true">{Array.from({ length: Math.min(computer.hand.length, 8) }, (_, index) => <span key={index} />)}</div>}
      </section>

      <section
        className={`felt-table ${game.phase === 'round-over' || game.phase === 'match-over' ? '' : game.currentPlayer === 1 ? 'is-computer-turn' : 'is-human-turn'} ${canDiscard || canLaySelectedMeld ? 'has-table-action' : ''}`}
        aria-label="Mesa de juego"
        onClick={(event) => {
          if (!(event.target instanceof Element)) return;
          if (event.target.closest('button, a, [role="button"]')) return;
          if (canLaySelectedMeld && game.phase === 'play' && game.currentPlayer === 0) {
            perform((current) => layMeld(current, 0, selectedTileIds));
          } else if (canDiscard) {
            perform((current) => discardTile(current, 0, selectedTileIds[0]), 'computer');
          }
        }}
      >
        <div className="piles-row">
          <button
            className="stock-pile pile-action"
            type="button"
            disabled={!canDrawFromStock && !openingChoice}
            aria-label={openingChoice ? 'Descartar la ficha inicial y robar otra del montón' : `Robar ficha del montón (${game.stock.length} restantes)`}
            title={openingChoice ? 'Descartar la ficha inicial y robar otra' : 'Robar ficha del montón'}
            onClick={() => openingChoice
              ? perform((current) => discardOpeningDrawAndRedraw(current, 0), 'player')
              : perform((current) => drawFromStock(current, 0), 'player')}
          >
            <span className="stack-back"><i /><i /><i /></span>
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
                  ? perform((current) => discardOpeningDrawAndRedraw(current, 0), 'player')
                  : canDiscard
                    ? perform((current) => discardTile(current, 0, selectedTileIds[0]), 'computer')
                    : perform((current) => takeDiscardPile(current, 0), 'player')}
              >
                {visibleDiscard.map((tile, index) => (
                  <span className="discard-stack-card" key={tile.id} style={{ '--discard-depth': index } as React.CSSProperties}>
                    <TileFace tile={tile} className={recentlyChangedTileIdSet.has(tile.id) ? 'is-recent' : ''} />
                  </span>
                ))}
              </button>
            ) : canDiscard || openingChoice
              ? <button className="empty-discard pile-action" type="button" aria-label={openingChoice ? 'Descartar la ficha inicial y robar otra del montón' : 'Descartar ficha seleccionada en el pozo vacío'} title={openingChoice ? 'Descartar la ficha inicial y robar otra' : 'Descartar ficha seleccionada'} onClick={() => openingChoice
                ? perform((current) => discardOpeningDrawAndRedraw(current, 0), 'player')
                : perform((current) => discardTile(current, 0, selectedTileIds[0]), 'computer')}>Pozo vacío</button>
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
            const teamName = team === 1 ? 'Computadora' : 'Vos';
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

      <section ref={playerAreaRef} className="player-area" aria-label="Tu atril">
        <div className="player-heading">
          <div className="player-header-meta">
            <svg className={`player-avatar ${humanTurn ? 'is-turn' : ''}`} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
              <circle cx="16" cy="16" r="16" fill="currentColor" />
              <circle cx="16" cy="11.5" r="4" fill="white" />
              <path d="M7 27c.7-5.5 4-8.5 9-8.5s8.3 3 9 8.5" fill="white" />
            </svg>
            <div className="player-name">
              <strong>Vos</strong>
              <span className="hand-count">{playerHeaderText}</span>
            </div>
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

      {error && <p className="error-message" role="alert">{error}</p>}
      <footer className="action-bar">
        {game.phase === 'opening-choice' && game.currentPlayer === 0 ? <>
          <span className="action-hint">La primera ficha puede cambiarse por otra del montón</span>
          <button className="primary-action" type="button" onClick={() => perform((current) => keepOpeningDraw(current, 0))}>Jugar con esta ficha</button>
          <button className="secondary-action" type="button" disabled={game.stock.length === 0} onClick={() => perform((current) => discardOpeningDrawAndRedraw(current, 0), 'player')}>Descartar y robar otra</button>
        </> : game.phase === 'draw' && game.currentPlayer === 0 ? <>
          <span className="action-hint">Elegí cómo robar para empezar tu turno</span>
          <button className="primary-action" type="button" disabled={game.stock.length === 0} onClick={() => perform((current) => drawFromStock(current, 0), 'player')}>Robar ficha del montón</button>
          <button className="secondary-action" type="button" disabled={!game.discard.length || human.hand.length + game.discard.length < 5} onClick={() => perform((current) => takeDiscardPile(current, 0), 'player')}>Levantar todo el pozo</button>
          {game.stock.length === 0 && <button className="text-action" type="button" onClick={() => perform((current) => finishEmptyStock(current, 0))}>Terminar la mano</button>}
        </> : game.phase === 'play' && game.currentPlayer === 0 ? <>
          <span className="action-hint">{selection.length
            ? `${selectionLabel}${admissibleMeldHint}`
            : 'Seleccioná fichas del atril'}</span>
          <button className="primary-action" type="button" disabled={!canLaySelectedMeld} onClick={() => perform((current) => layMeld(current, 0, selectedTileIds))}>Bajar nuevo juego</button>
          <button className="secondary-action" type="button" disabled={!canDiscard} onClick={() => perform((current) => discardTile(current, 0, selectedTileIds[0]), 'computer')}>Descartar</button>
        </> : <span className="action-hint ai-hint">{game.phase === 'match-over' || game.phase === 'round-over' ? 'La mano está cerrada' : 'La computadora está jugando'}</span>}
      </footer>
      {rulesDialog}
    </main>
  );
}