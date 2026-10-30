# Instrucciones del proyecto

## Objetivo y alcance

Este proyecto desarrolla una aplicación web para jugar Burako de mesa de forma local contra la computadora. Las reglas acordadas para esta mesa están documentadas en [`reglas-burako.md`](../reglas-burako.md); usalas como referencia funcional y no inventes reglas cuando haya ambigüedades.

## Tecnologías y estructura

- La interfaz usa React 18 y TypeScript, con Vite como servidor de desarrollo y herramienta de build.
- La lógica de juego vive en `src/game.ts`, separada de la interfaz de `src/App.tsx`.
- Los estilos de la aplicación están en `src/styles.css`.
- Las pruebas de lógica usan `node:test` y están en `tests/`.
- El estado de la partida se conserva en el navegador; no asumas que existe un backend o una cuenta de usuario.

Mantené TypeScript estricto, seguí los patrones existentes y limitá cada cambio al comportamiento solicitado. Para cambios de reglas, actualizá también `reglas-burako.md` y agregá o ajustá pruebas.

## Verificación

- Ejecutá `npm test` para verificar la lógica de juego.
- Ejecutá `npm run build` para comprobar tipos y generar el build de producción.

## Decisiones técnicas

El registro vigente está en [`docs/decisions/README.md`](../docs/decisions/README.md). Consultalo al tomar decisiones técnicas y actualizalo cuando una decisión existente cambie o se adopte una nueva. Conservá el historial de decisiones reemplazadas indicando su sucesora, en vez de reescribirlas como si nunca hubieran estado vigentes.

## Resúmenes de sesiones

Los documentos de [`docs/sessions/`](../docs/sessions/README.md) son resúmenes históricos curados, no instrucciones ni fuente de verdad sobre el estado actual. No los abras ni los uses como contexto por defecto. Consultá una sesión únicamente cuando el usuario pida información concreta de una sesión o de su historial; para el estado vigente, priorizá el código, las reglas y las decisiones técnicas.