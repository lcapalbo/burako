# 2026-10-31: IA, pozo y ordenamientos

## Objetivo

Resolver bloqueos observados durante los turnos de la computadora, mejorar la inspección y orden visual del pozo y del atril, y reducir evaluaciones innecesarias al buscar combinaciones.

## Cambios

- Se extrajo la estrategia de turnos automáticos a `src/computer.ts`; los rechazos normales de reglas permiten probar otra jugada y los errores inesperados se muestran en la interfaz.
- Se corrigió la elección del pozo cuando la mano más la pila no llegan a cinco fichas, se excluyó la ficha restringida del descarte automático y se cubrieron jugadas que no pueden dejar una o cero fichas sin canasta tras tomar el muerto.
- Los cierres por corte muestran mensajes gramaticalmente correctos para cada participante; se separaron esos casos de las pruebas por agotamiento del montón.
- La interfaz evita mostrar a la computadora como pensando cuando la mano terminó.
- Se agregó un diálogo para inspeccionar todas las fichas del pozo, con pila visible de hasta tres fichas, contador, ordenamiento visual por color/número y cierre accesible. La ficha superior y el estado real del pozo no cambian al ordenar la vista.
- El atril recorre los modos «Ordenar por color», «Ordenar por número» y «Orden original». Los ordenamientos son de presentación; al mover una ficha se conserva esa disposición como nuevo orden original.
- `findBestMeld` descarta subconjuntos que no pueden formar pierna ni escalera. Al extender juegos, la IA prefiltra por número para piernas y por color para escaleras; comodines y #2 siguen permitidos y el motor valida la jugada final.
- Se añadieron pruebas para cierres por corte, turnos de la computadora, ordenamientos y equivalencia de la búsqueda podada frente a la búsqueda exhaustiva en manos pequeñas.

## Decisiones y pendientes

- La lógica de dominio continúa en `src/game.ts`; la IA compone transiciones desde `src/computer.ts`, conforme a la decisión vigente 0002.
- No hizo falta actualizar `.github/copilot-instructions.md`.
- La medición específica de rendimiento de `findBestMeld` queda pendiente para una sesión posterior.

## Verificación

- `npm test`: 51 tests aprobados.
- `npm run build`: compilación de producción aprobada.
- Vite se inició para previsualizar la interfaz y se detuvo al finalizar.
