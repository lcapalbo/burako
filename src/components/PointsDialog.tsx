import type { RefObject } from 'react';
import type { GameState, RoundScore } from '../game';

type PointsDialogProps = {
  dialogRef: RefObject<HTMLDialogElement>;
  game: GameState;
  pointsHistory: RoundScore[];
  currentRoundScore: RoundScore | null;
  previousRoundScores: RoundScore[];
  pointsRows: { label: string; scores: number[] }[];
};

function formatHandPoints(points: number): string {
  return points > 0
    ? `+${points.toLocaleString('es-AR')}`
    : points.toLocaleString('es-AR');
}

export function PointsDialog({
  dialogRef,
  game,
  pointsHistory,
  currentRoundScore,
  previousRoundScores,
  pointsRows,
}: PointsDialogProps) {
  return (
    <dialog
      ref={dialogRef}
      className="discard-dialog points-dialog"
      aria-labelledby="points-dialog-title"
      onClick={(event) => { if (event.target === event.currentTarget) dialogRef.current?.close(); }}
    >
      <div className="discard-dialog-content">
        <header className="discard-dialog-header">
          <div>
            <p className="discard-dialog-eyebrow">Resumen de la partida</p>
            <h2 id="points-dialog-title">Detalle de puntos</h2>
          </div>
          <button className="discard-dialog-close" type="button" aria-label="Cerrar detalle de puntos" autoFocus onClick={() => dialogRef.current?.close()}>×</button>
        </header>
        <div className="points-table-scroll">
          {pointsHistory.length > 0 && pointsHistory[0].round > 1 && <p className="points-history-note">El detalle de manos anteriores a esta versión no está disponible.</p>}
          {!currentRoundScore && <p className="points-history-note">El detalle de esta mano no está disponible para esta partida guardada.</p>}
          <table className="points-table">
            <thead>
              <tr><th scope="col">Detalle</th><th scope="col">Vos</th><th scope="col">{game.players[1].name}</th></tr>
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
          <button className="primary-action" type="button" onClick={() => dialogRef.current?.close()}>Cerrar</button>
        </footer>
      </div>
    </dialog>
  );
}
