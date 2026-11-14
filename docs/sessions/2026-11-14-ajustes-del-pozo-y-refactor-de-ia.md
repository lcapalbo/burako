# Ajustes del pozo y refactor de IA

## Resumen

Se ajustaron interacciones y presentación de la mesa, y se reorganizaron la estrategia de la computadora y sus pruebas.

## Cambios

- El pozo adapta su densidad cuando se completa la segunda fila, en lugar de compactarse apenas aparecen fichas en ella.
- El resaltado de las fichas del preview se sincroniza con la selección actual.
- Durante la decisión sobre la ficha inicial, el atril impide seleccionar otras fichas.
- La estrategia de la computadora quedó agrupada en `src/computer.ts`; las pruebas correspondientes se separaron en `tests/computer.test.mjs`, dejando las pruebas del motor en `tests/game.test.mjs`.

## Decisiones técnicas

No se modificaron las decisiones vigentes: la estrategia de la computadora sigue separada del motor y probada con `node:test`, de acuerdo con [0002](../decisions/0002-logica-y-pruebas.md). Tampoco cambiaron las reglas funcionales.
