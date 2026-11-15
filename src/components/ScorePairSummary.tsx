type ScorePairSummaryProps = {
  label: string;
  scores: [number, number];
  playerLabel: string;
};

export function ScorePairSummary({ label, scores, playerLabel }: ScorePairSummaryProps) {
  return (
    <span className="result-score-pair">
      {label}: <span className={scores[0] >= scores[1] ? 'is-leading-score' : ''}>{scores[0].toLocaleString('es-AR')}</span> ({playerLabel})
      {' a '} <span className={scores[1] >= scores[0] ? 'is-leading-score' : ''}>{scores[1].toLocaleString('es-AR')}</span>
    </span>
  );
}
