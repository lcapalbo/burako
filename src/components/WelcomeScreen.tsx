import type { RefObject } from 'react';
import type { Target } from '../game';
import { RulesDialog } from './RulesDialog';
import { TileFace } from './TileFace';

const TARGET_OPTIONS = [
  { label: 'A 2000 pts', value: 2000 },
  { label: 'A 3000 pts', value: 3000 },
  { label: 'A 5000 pts', value: 5000 },
  { label: 'Por Corte', value: 'cut' },
] as const;

type WelcomeScreenProps = {
  target: Target;
  onTargetChange: (target: Target) => void;
  onBegin: () => void;
  onOpenRules: () => void;
  rulesDialogRef: RefObject<HTMLDialogElement>;
};

export function WelcomeScreen({
  target,
  onTargetChange,
  onBegin,
  onOpenRules,
  rulesDialogRef,
}: WelcomeScreenProps) {
  return (
    <main className="welcome" onContextMenu={(event) => event.preventDefault()}>
      <header className="topbar">
        <span className="brand-mark tile-face tile-blue" aria-hidden="true">
          <span className="tile-mark" />
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
        <p className="intro rules-invitation">Si sos nuevo, <button className="rules-inline-link" type="button" onClick={onOpenRules}>estas son las reglas</button>.</p>
        <div className="target-picker" role="group" aria-label="Objetivo de la partida">
          {TARGET_OPTIONS.map(({ label, value }) => (
            <button key={label} type="button" className={target === value ? 'target-option active' : 'target-option'} onClick={() => onTargetChange(value)}>{label}</button>
          ))}
        </div>
        <button className="start-button" type="button" onClick={onBegin}>Comenzar partida <span aria-hidden="true">→</span></button>
      </section>
      <aside className="tile-composition" aria-label="Fichas de ejemplo">
        <TileFace tile={{ id: 'welcome-red-7', color: 'red', value: 7, kind: 'number' }} className="tile-one" />
        <TileFace tile={{ id: 'welcome-green-8', color: 'green', value: 8, kind: 'number' }} className="tile-two" />
        <TileFace tile={{ id: 'welcome-blue-9', color: 'blue', value: 9, kind: 'number' }} className="tile-three" />
        <TileFace tile={{ id: 'welcome-yellow-2', color: 'yellow', value: 2, kind: 'number' }} className="tile-wild" />
      </aside>
      <footer className="welcome-footer">Sin cuenta ni publicidad · La partida se juega en tu dispositivo</footer>
      <RulesDialog dialogRef={rulesDialogRef} />
    </main>
  );
}
