# 2026-10-30: Implementación web del Burako local

## Resumen

Se inició la implementación de una versión web del Burako orientada a un flujo local de una persona contra la computadora, con un motor de reglas separado de la interfaz y una experiencia usable en notebook y móvil.

La primera entrega cubre la lógica de fichas, combinaciones, pozo, muertos, cierre, puntaje, objetivo por puntos o por corte, atril reordenable y una IA simple que toma turnos automáticamente. También se dejó una base para continuar con partidas online y con modo por parejas.

## Resultado

- Se creó la app base con React 18 + TypeScript + Vite, lista para servir como sitio estático.
- Se implementó el motor de juego en [`src/game.ts`](../../src/game.ts), con reglas de:
  - preparación y mazo,
  - combinaciones válidas y canastas,
  - manejo del pozo y del muerto,
  - cierre legal y puntaje por pareja,
  - objetivo por corte o por puntaje,
  - turnos horarios y rotación de inicio de mano.
- Se construyó una interfaz jugable en [`src/App.tsx`](../../src/App.tsx) y estilos responsive en [`src/styles.css`](../../src/styles.css).
- Se agregó persistencia local en `localStorage` para reanudar partidas en el mismo dispositivo.
- Se incorporó una IA básica que toma decisiones de robo, baja y descarte, sin depender de un backend.
- Se añadieron pruebas del motor con `node:test` en [`tests/game.test.mjs`](../../tests/game.test.mjs).

## Verificación

Se ejecutaron las comprobaciones relevantes para esta sesión:

- `npm test` → 12 pruebas pasadas, 0 fallas.
- `npm run build` → build de producción exitoso.
- `npm audit --registry=https://registry.npmjs.org` → 0 vulnerabilidades.
- `curl -fsS -o /dev/null -w 'HTTP %{http_code}\n' http://localhost:5173/` → respuesta `HTTP 200`.

## Consideraciones

- La primera versión es local y sin servidor; la lógica y la IA corren del lado del navegador.
- El trabajo de partidas online y de 4 personas queda como etapa siguiente, con WebRTC/DataChannels o un servicio de señalización si se busca compatibilidad mobile/desktop fuera de la misma red.
- El proyecto sigue priorizando la reproducción fiel de las reglas de [`reglas-burako.md`](../../reglas-burako.md), sin inventar reglas no documentadas.

## Referencias vigentes

- [Reglas del juego](../../reglas-burako.md)
- [Decisiones técnicas](../decisions/README.md)
- [Instrucciones del proyecto](../../.github/copilot-instructions.md)
