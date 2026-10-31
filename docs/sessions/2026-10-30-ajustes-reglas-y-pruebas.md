# 2026-10-30: Ajustes de reglas y pruebas

## Resumen

Se completaron ajustes del motor y de la cobertura de pruebas para reflejar reglas acordadas sobre el robo inicial, el pozo y el cierre con muerto.

## Resultado

- El jugador que inicia la mano puede conservar su primer robo del montón o descartarlo y robar una segunda ficha. La computadora conserva automáticamente la primera.
- Se probaron los límites para levantar el pozo: se acepta con exactamente cinco fichas entre atril y pozo, y se rechaza con menos.
- Si el pozo levantado contenía una sola ficha, no se puede descartar esa misma ficha durante el turno. La restricción no se aplica a pozos con varias fichas.
- Si el equipo tomó el muerto y aún no tiene canasta, no puede bajar ni ampliar un juego no canasta dejando el atril vacío o con una ficha. Sí puede hacerlo al completar una canasta, o cuando el equipo ya tiene una.
- Se ampliaron los tests para cubrir los casos bloqueados y permitidos, incluyendo bajar o ampliar juegos antes de tomar el muerto.

## Verificación

- `npm test` → 26 pruebas pasadas, 0 fallas.
- `npm run build` → build de producción exitoso.

## Referencias

- [Reglas del juego](../../reglas-burako.md)
- [Motor](../../src/game.ts)
- [Pruebas](../../tests/game.test.mjs)
