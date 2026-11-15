# Mejoras de IA y escenarios de depuración

## Resumen

Se refinaron las estrategias de la computadora para descartes, evaluación del pozo y decisiones de juego individual o en parejas. También se agregó una forma de guardar y restaurar escenarios de depuración sin alterar el guardado automático de la partida.

## Cambios

- La IA reconoce que el #1 puede seguir al #13 al evaluar escaleras y conserva comodines con más cuidado al descartar.
- Se amplió a 20 fichas el máximo del pozo analizado. La IA reserva comodines cuando puede necesitarlos en otras jugadas y evalúa combinaciones del pozo para evitar ayudar a completar canastas rivales.
- Se agregaron preferencias de perfil para evitar extender juegos rivales, ajustar la probabilidad de bajar combinaciones en partidas individuales y en parejas, y retener juegos largos en partidas individuales para influir en los descartes rivales.
- Se ajustaron las decisiones según el estado de los oponentes: cuándo priorizar descartes de más puntos, evitar levantar el pozo y ayudar a una pareja a completar una canasta.
- Al jugar, la IA prioriza formar juegos nuevos o extender juegos pequeños antes que agrandar canastas, salvo que ayude a limpiarlas o acerque a su posición natural un #2 comodín en una escalera.
- `window.burakoDebug` permite guardar, listar y restaurar escenarios con nombre. Los escenarios no se sobrescriben al continuar la partida y se almacenan aparte del guardado automático.

## Decisiones técnicas y reglas

La estrategia sigue separada del motor y probada con `node:test`, de acuerdo con [0002](../decisions/0002-logica-y-pruebas.md). Se aclaró en [0003](../decisions/0003-persistencia-local.md) que los escenarios de depuración usan almacenamiento local independiente. No cambiaron las reglas funcionales.

## Verificación

- `npm test`: hasta 108 pruebas aprobadas en las sesiones que incorporaron estos cambios.
- `npm run build`: compilación aprobada.
- `git diff --check`: sin errores en las sesiones que lo ejecutaron.
