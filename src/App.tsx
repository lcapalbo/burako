import { useEffect, useRef, useState } from 'react';
import {
  addToMeld,
  createGame,
  discardOpeningDrawAndRedraw,
  discardTile,
  drawFromStock,
  finishEmptyStock,
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
type HandSortMode = 'original' | 'color' | 'number';

function sortHandForDisplay(hand: Tile[], mode: HandSortMode): Tile[] {
  if (mode === 'color') return sortTiles(hand);
  if (mode === 'number') return sortTilesByNumber(hand);
  return hand;
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

function TileFace({ tile, selected = false }: { tile: Tile; selected?: boolean }) {
  const label = tile.kind === 'joker' ? 'comodín especial' : `${tile.value} ${COLOR_NAMES[tile.color ?? '']}`;
  return (
    <span className={`tile-face ${tile.kind === 'joker' ? 'tile-joker' : `tile-${tile.color}`} ${selected ? 'is-selected' : ''}`} role="img" aria-label={label}>
      <span className="tile-mark" aria-hidden="true">{tile.kind === 'joker' ? '★' : '●'}</span>
      <strong>{tile.kind === 'joker' ? '★' : tile.value}</strong>
      {tile.kind === 'joker' && <small>COMODÍN</small>}
    </span>
  );
}

export default function App() {
  const [game, setGame] = useState<GameState | null>(loadSavedGame);
  const [target, setTarget] = useState<Target>(2000);
  const [selection, setSelection] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [discardSortMode, setDiscardSortMode] = useState<HandSortMode>('original');
  const [handSortMode, setHandSortMode] = useState<HandSortMode>('original');
  const discardDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    try {
      if (game) window.localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 1, game }));
      else window.localStorage.removeItem(SAVE_KEY);
    } catch {
      setError('No se pudo guardar la partida en este dispositivo.');
    }
  }, [game]);

  useEffect(() => {
    if (!game || game.currentPlayer !== 1 || game.phase === 'match-over' || game.phase === 'round-over') return;
    const timer = window.setTimeout(() => {
      try {
        setGame(runComputerTurn(game));
        setError('');
      } catch (issue) {
        console.error('Error al completar el turno de la computadora:', issue, issue instanceof Error ? issue.stack : undefined);
        console.error('Estado de la partida al producirse el error:\n', JSON.stringify(game, null, 2));
        setError('La computadora no pudo completar su turno por un problema técnico. Esto puede deberse a datos corruptos de la partida o a que retomaste una partida de una versión anterior del juego. Lo sentimos. Presioná «Salir» y comenzá una partida nueva para seguir jugando.');
      }
    }, 650);
    return () => window.clearTimeout(timer);
  }, [game]);

  const begin = () => {
    setGame(createGame(target));
    setHandSortMode('original');
    setSelection([]);
    setError('');
  };

  const perform = (action: (current: GameState) => GameState) => {
    if (!game) return;
    try {
      setGame(action(game));
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
    if (!game || fromId === toId) return;
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

  const moveSelected = (direction: -1 | 1) => {
    if (!game || selection.length !== 1) return;
    const hand = [...sortHandForDisplay(game.players[0].hand, handSortMode)];
    const from = hand.findIndex((tile) => tile.id === selection[0]);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= hand.length) return;
    [hand[from], hand[to]] = [hand[to], hand[from]];
    const players = [...game.players];
    players[0] = { ...human, hand };
    setGame({ ...game, players });
    setHandSortMode('original');
  };

  if (!game) {
    return (
      <main className="welcome">
        <header className="topbar">
          <span className="brand-mark" aria-hidden="true">B</span>
          <span className="brand-name">Burako de mesa</span>
          <span className="local-label"><span /> Partida local</span>
        </header>
        <section className="welcome-copy">
          <p className="eyebrow">Una mesa, cuatro colores</p>
          <h1>Tu próxima<br /><em>canasta</em> empieza acá.</h1>
          <p className="intro">Una partida tranquila contra la computadora, con las reglas de esta mesa.</p>
          <div className="target-picker" role="group" aria-label="Objetivo de la partida">
            {([['2000', 2000], ['3000', 3000], ['5000', 5000], ['Corte', 'cut']] as const).map(([label, value]) => (
              <button key={label} type="button" className={target === value ? 'target-option active' : 'target-option'} onClick={() => setTarget(value)}>{label}</button>
            ))}
          </div>
          <button className="start-button" type="button" onClick={begin}>Preparar la mesa <span aria-hidden="true">→</span></button>
          <p className="offline-note">Sin cuenta · La partida se juega en este dispositivo</p>
        </section>
        <aside className="tile-composition" aria-label="Fichas de ejemplo">
          <div className="tile tile-one"><small>●</small><strong>7</strong></div>
          <div className="tile tile-two"><small>●</small><strong>8</strong></div>
          <div className="tile tile-three"><small>●</small><strong>9</strong></div>
          <div className="tile tile-wild"><small>COMODÍN</small><strong>2</strong></div>
          <span className="composition-caption">La mesa está lista</span>
        </aside>
      </main>
    );
  }

  const human = game.players[0];
  const computer = game.players[1];
  const displayedHand = sortHandForDisplay(human.hand, handSortMode);
  const handSortLabel = handSortMode === 'original' ? 'Ordenar por color' : handSortMode === 'color' ? 'Ordenar por número' : 'Orden original';
  const discardSortLabel = discardSortMode === 'original' ? 'Ordenar por color' : discardSortMode === 'color' ? 'Ordenar por número' : 'Orden original';
  const humanTurn = game.currentPlayer === 0 && (game.phase === 'draw' || game.phase === 'opening-choice' || game.phase === 'play');
  const selectedTileIds = selection;
  const canDiscard = game.phase === 'play' && game.currentPlayer === 0 && selection.length === 1;
  const visibleDiscard = game.discard.slice(-3);
  const cycleHandSort = () => setHandSortMode((mode) => mode === 'original' ? 'color' : mode === 'color' ? 'number' : 'original');
  const cycleDiscardSort = () => setDiscardSortMode((mode) => mode === 'original' ? 'color' : mode === 'color' ? 'number' : 'original');

  return (
    <main className="game-page">
      <header className="game-header">
        <a className="game-brand" href="#" onClick={(event) => { event.preventDefault(); setGame(null); }}>
          <span className="brand-mark" aria-hidden="true">B</span><span>Burako de mesa</span>
        </a>
        <div className="match-meta"><span>Mano {game.round}</span><span className="meta-divider" />{game.target === 'cut' ? 'Por corte' : `A ${game.target.toLocaleString('es-AR')}`}</div>
        <button className="quiet-button" type="button" onClick={() => setGame(null)}>Salir</button>
      </header>

      <section className="score-strip" aria-label="Puntaje de la partida">
        <div className={game.currentPlayer === 0 ? 'score-team active' : 'score-team'}>
          <span className="team-dot human-dot" />
          <div><small>VOS</small><strong>{game.scores[0].toLocaleString('es-AR')}</strong></div>
        </div>
        <span className="score-divider">{game.target === 'cut' ? '·' : 'a'} </span>
        <div className={game.currentPlayer === 1 ? 'score-team active' : 'score-team'}>
          <span className="team-dot computer-dot" />
          <div><small>COMPUTADORA</small><strong>{game.scores[1].toLocaleString('es-AR')}</strong></div>
        </div>
        <span className="round-indicator">{game.phase === 'play' && game.currentPlayer === 0 ? 'Tu turno' : game.currentPlayer === 1 ? 'Juega la computadora' : game.phase === 'draw' ? 'Robá para empezar' : 'Mano en curso'}</span>
      </section>

      <section className="opponent-bar" aria-label="Atril de la computadora">
        <div className="opponent-avatar" aria-hidden="true">IA</div>
        <div className="opponent-name"><strong>La computadora</strong><span>{game.phase === 'round-over' || game.phase === 'match-over' ? `${computer.hand.length} fichas en el atril` : game.currentPlayer === 1 ? error || 'Está pensando…' : `${computer.hand.length} fichas en el atril`}</span></div>
        <div className="hidden-tiles" aria-hidden="true">{Array.from({ length: Math.min(computer.hand.length, 8) }, (_, index) => <span key={index} />)}</div>
      </section>

      <section className="felt-table" aria-label="Mesa de juego">
        <div className="table-status">
          <span>{game.melds.length ? `${game.melds.length} ${game.melds.length === 1 ? 'juego bajado' : 'juegos bajados'}` : 'La mesa todavía está limpia'}</span>
          {game.players.some((player) => player.deadTaken) && <span className="dead-status">Muerto levantado</span>}
        </div>
        <div className="piles-row">
          <div className="stock-pile" aria-label={`${game.stock.length} fichas en el montón`}>
            <span className="stack-back"><i /><i /><i /></span>
            <div className="stock-pile-label"><small>MONTÓN</small><span className="pile-count">{game.stock.length}</span></div>
          </div>
          <div className="discard-pile">
            {visibleDiscard.length > 0 ? (
              <div className="discard-stack" aria-hidden="true" style={{ width: `${48 + (visibleDiscard.length - 1) * 16}px` }}>
                {visibleDiscard.map((tile, index) => (
                  <span className="discard-stack-card" key={tile.id} style={{ '--discard-depth': index } as React.CSSProperties}>
                    <TileFace tile={tile} />
                  </span>
                ))}
              </div>
            ) : <span className="empty-discard">Pozo vacío</span>}
            <button className="pile-view-button" type="button" disabled={!game.discard.length} onClick={() => { setDiscardSortMode('original'); discardDialogRef.current?.showModal(); }}>VER POZO <span className="pile-count">{game.discard.length}</span></button>
          </div>
        </div>
        <div className="meld-area">
          {game.melds.length === 0 ? (
            <p className="empty-table">Los juegos que bajes van a aparecer acá</p>
          ) : game.melds.map((meld) => (
            <div className="meld-group" key={meld.id}>
              <div className="meld-heading"><span>{meld.kind === 'run' ? 'Escalera' : 'Pierna'} · {meld.team === 0 ? 'Vos' : 'Computadora'}</span>{isCanasta(meld) && <strong className="canasta-badge">{isCleanMeld(meld) ? 'Canasta limpia' : 'Canasta sucia'}</strong>}</div>
              <div className="meld-tiles">{meld.tiles.map((tile) => <TileFace tile={tile} key={tile.id} />)}</div>
              {selection.length > 0 && game.phase === 'play' && game.currentPlayer === 0 && meld.team === 0 && (
                <button className="meld-add" type="button" onClick={() => perform((current) => addToMeld(current, 0, meld.id, selectedTileIds))}>Agregar selección a este juego</button>
              )}
            </div>
          ))}
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
                <TileFace tile={tile} />
              </li>
            ))}
          </ol>
          <footer className="discard-dialog-footer">
            <button className="sort-button" type="button" onClick={cycleDiscardSort}>{discardSortLabel}</button>
            <button className="primary-action" type="button" onClick={() => discardDialogRef.current?.close()}>Cerrar</button>
          </footer>
        </div>
      </dialog>

      {game.result && <section className={`result-banner ${game.phase === 'match-over' ? 'is-final' : ''}`} role="status">
        <strong>{game.result}</strong>
        <span>{game.phase === 'round-over' ? `Puntaje: vos ${game.scores[0].toLocaleString('es-AR')} · computadora ${game.scores[1].toLocaleString('es-AR')}` : ''}</span>
        {game.phase === 'round-over' && <button type="button" onClick={() => perform(nextRound)}>Repartir la próxima mano <span aria-hidden="true">→</span></button>}
        {game.phase === 'match-over' && <button type="button" onClick={() => setGame(null)}>Volver al inicio</button>}
      </section>}

      <section className="player-area" aria-label="Tu atril">
        <div className="player-heading">
          <div><span className="player-dot" /><strong>Tu atril</strong><span className="hand-count">{human.hand.length} fichas</span></div>
          <div className="hand-tools">
            <button className="move-button" type="button" disabled={!humanTurn || selection.length !== 1} aria-label="Mover ficha a la izquierda" title="Mover a la izquierda" onClick={() => moveSelected(-1)}>←</button>
            <button className="move-button" type="button" disabled={!humanTurn || selection.length !== 1} aria-label="Mover ficha a la derecha" title="Mover a la derecha" onClick={() => moveSelected(1)}>→</button>
            <button className="sort-button" type="button" disabled={!humanTurn} onClick={cycleHandSort}>{handSortLabel}</button>
          </div>
        </div>
        <div className="hand-tiles" onDragOver={(event) => event.preventDefault()}>
          {displayedHand.map((tile, index) => (
            <button
              className={`hand-tile ${selection.includes(tile.id) ? 'selected' : ''}`}
              type="button"
              key={tile.id}
              draggable={humanTurn}
              disabled={!humanTurn}
              aria-pressed={selection.includes(tile.id)}
              aria-label={`${tile.kind === 'joker' ? 'Comodín' : `${tile.value} ${COLOR_NAMES[tile.color ?? '']}`}${selection.includes(tile.id) ? ', seleccionada' : ''}`}
              onClick={() => toggleTile(tile.id)}
              onDragStart={() => setDraggedId(tile.id)}
              onDragEnd={() => setDraggedId(null)}
              onDrop={(event) => { event.preventDefault(); if (draggedId) reorderHand(draggedId, tile.id); setDraggedId(null); }}
              style={{ '--tile-index': index } as React.CSSProperties}
            ><TileFace tile={tile} selected={selection.includes(tile.id)} /></button>
          ))}
        </div>
      </section>

      {error && <p className="error-message" role="alert">{error}</p>}
      <footer className="action-bar">
        {game.phase === 'opening-choice' && game.currentPlayer === 0 ? <>
          <span className="action-hint">La primera ficha puede cambiarse por otra del montón</span>
          <button className="primary-action" type="button" onClick={() => perform((current) => keepOpeningDraw(current, 0))}>Jugar con esta ficha</button>
          <button className="secondary-action" type="button" disabled={game.stock.length === 0} onClick={() => perform((current) => discardOpeningDrawAndRedraw(current, 0))}>Descartar y robar otra</button>
        </> : game.phase === 'draw' && game.currentPlayer === 0 ? <>
          <span className="action-hint">Elegí cómo robar para empezar tu turno</span>
          <button className="primary-action" type="button" disabled={game.stock.length === 0} onClick={() => perform((current) => drawFromStock(current, 0))}>Robar del montón <span>{game.stock.length}</span></button>
          <button className="secondary-action" type="button" disabled={!game.discard.length || human.hand.length + game.discard.length < 5} onClick={() => perform((current) => takeDiscardPile(current, 0))}>Levantar el pozo <span>{game.discard.length}</span></button>
          {game.stock.length === 0 && <button className="text-action" type="button" onClick={() => perform((current) => finishEmptyStock(current, 0))}>Terminar la mano</button>}
        </> : game.phase === 'play' && game.currentPlayer === 0 ? <>
          <span className="action-hint">{selection.length ? `${selection.length} seleccionada${selection.length === 1 ? '' : 's'}` : 'Seleccioná fichas del atril'}</span>
          <button className="primary-action" type="button" disabled={selection.length < 3} onClick={() => perform((current) => layMeld(current, 0, selectedTileIds))}>Bajar juego</button>
          <button className="secondary-action" type="button" disabled={!canDiscard} onClick={() => perform((current) => discardTile(current, 0, selectedTileIds[0]))}>Descartar</button>
        </> : <span className="action-hint ai-hint">{game.phase === 'match-over' || game.phase === 'round-over' ? 'La mano está cerrada' : 'La computadora está jugando'}</span>}
      </footer>
    </main>
  );
}