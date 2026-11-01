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
  const [error, setError] = useState('');
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [discardSortMode, setDiscardSortMode] = useState<HandSortMode>('original');
  const [handSortMode, setHandSortMode] = useState<HandSortMode>('original');
  const discardDialogRef = useRef<HTMLDialogElement>(null);
  const pointsDialogRef = useRef<HTMLDialogElement>(null);

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
          {([1, 0] as const).map((team) => {
            const teamMelds = meldsForTeam(team);
            const categories = [
              { key: 'run', label: 'Escaleras', melds: teamMelds.filter((meld) => meld.kind === 'run') },
              { key: 'leg', label: 'Piernas', melds: teamMelds.filter((meld) => meld.kind === 'leg') },
            ].filter((category) => category.melds.length > 0);
            const teamName = team === 1 ? 'Computadora' : 'Vos';
            return (
              <section className="meld-team" key={team} aria-label={`Juegos de ${teamName}`}>
                <h3 className="meld-team-heading">{teamName}</h3>
                {teamMelds.length === 0
                  ? <p className="empty-team-melds">Sin juegos bajados</p>
                  : <div className="meld-categories">{categories.map((category) => (
                    <section className="meld-category" key={category.key} aria-label={category.label}>
                      <h4 className="meld-category-heading">{category.label}</h4>
                      <div className="meld-category-games">{category.melds.map((meld) => (
                        <div className="meld-group" key={meld.id}>
                          {isCanasta(meld) && <div className="meld-heading"><strong className="canasta-badge">{isCleanMeld(meld) ? 'Canasta limpia' : 'Canasta sucia'}</strong></div>}
                          <div className="meld-tiles">{(meld.kind === 'leg' ? sortTiles(meld.tiles) : meld.tiles).map((tile) => <TileFace tile={tile} key={tile.id} />)}</div>
                          {selection.length > 0 && game.phase === 'play' && game.currentPlayer === 0 && meld.team === 0 && (
                            <button className="meld-add" type="button" onClick={() => perform((current) => addToMeld(current, 0, meld.id, selectedTileIds))}>Agregar selección a este juego</button>
                          )}
                        </div>
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
                  <tr className="points-section-row"><th colSpan={3}>Detalle de la mano {currentRoundScore.round}</th></tr>
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
                <tr className="points-match-total">
                  <th scope="row">Total final</th>
                  <td>{game.scores[0].toLocaleString('es-AR')}</td>
                  <td>{game.scores[1].toLocaleString('es-AR')}</td>
                </tr>
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
        {game.target !== 'cut' && game.phase === 'round-over' && <span className="result-score-summary">
          {currentHandScores
            ? <ScorePairSummary label="Puntaje de la mano" scores={currentHandScores} />
            : <>Puntaje de la mano no disponible para esta partida guardada.</>}
          {hasPreviousRounds && <>
            {' · '}
            <ScorePairSummary label="Acumulado de partida" scores={[game.scores[0], game.scores[1]]} />
          </>}
        </span>}
        <div className="result-actions">
          {game.target !== 'cut' && <button className="points-detail-button" type="button" onClick={() => pointsDialogRef.current?.showModal()}>Ver detalle de puntos</button>}
          {game.phase === 'round-over' && <button type="button" onClick={() => perform(nextRound)}>Repartir la próxima mano <span aria-hidden="true">→</span></button>}
          {game.phase === 'match-over' && <button type="button" onClick={() => setGame(null)}>Volver al inicio</button>}
        </div>
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