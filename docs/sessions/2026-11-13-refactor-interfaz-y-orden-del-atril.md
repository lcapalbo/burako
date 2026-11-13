# Sesión 2026-11-13: refactor de interfaz y orden del atril

## Resumen

Desde el registro anterior se incorporaron cambios de interfaz y lógica:

- Se agregaron avatares SVG para el jugador y la computadora, con varios diseños disponibles.
- Se extrajeron componentes visuales de `App.tsx`: diálogos de puntos y reglas, resumen de parejas, fichas, pantalla de bienvenida, mesa y área del jugador.
- Se reutilizaron desde `game.ts` las funciones que identifican fichas comodín y validan si una combinación puede formarse, evitando duplicación en la lógica de la computadora.
- Se añadieron pruebas para verificar que la computadora levante el pozo cuando un comodín permite completar una combinación compatible y que no lo haga cuando las fichas no pueden combinarse.
- Se habilitó ordenar el atril en cualquier momento de la ronda, incluso durante el turno de la computadora, conservando el orden elegido cuando se actualiza el estado de la mano.
