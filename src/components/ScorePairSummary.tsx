type ScorePairSummaryProps = {
  label: string;
  scores: [number, number];
};

export function ScorePairSummary({ label, scores }: ScorePairSummaryProps) {
  return (
    <span className="result-score-pair">
      {label}: <span className={scores[0] >= scores[1] ? 'is-leading-score' : ''}>{scores[0].toLocaleString('es-AR')}</span> (vos)
      {' a '} <span className={scores[1] >= scores[0] ? 'is-leading-score' : ''}>{scores[1].toLocaleString('es-AR')}</span>
    </span>
  );
}
