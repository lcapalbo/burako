import type { RefObject } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rulesMarkdown from '../../reglas-burako.md?raw';

type RulesDialogProps = {
  dialogRef: RefObject<HTMLDialogElement>;
};

export function RulesDialog({ dialogRef }: RulesDialogProps) {
  return (
    <dialog
      ref={dialogRef}
      className="rules-dialog"
      aria-labelledby="rules-dialog-title"
      onClick={(event) => { if (event.target === event.currentTarget) dialogRef.current?.close(); }}
    >
      <div className="rules-dialog-content">
        <header className="rules-dialog-header">
          <div>
            <p className="discard-dialog-eyebrow">Guía rápida</p>
            <h2 id="rules-dialog-title">Reglas del Burako</h2>
          </div>
          <button className="discard-dialog-close" type="button" aria-label="Cerrar reglas" autoFocus onClick={() => dialogRef.current?.close()}>×</button>
        </header>
        <div className="rules-dialog-scroll">
          <article className="rules-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{rulesMarkdown}</ReactMarkdown>
          </article>
        </div>
      </div>
    </dialog>
  );
}
