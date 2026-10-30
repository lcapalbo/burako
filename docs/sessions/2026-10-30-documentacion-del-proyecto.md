# 2026-10-30: Documentación del proyecto

## Resumen

Se creó la estructura para registrar las decisiones técnicas vigentes y los resúmenes históricos de desarrollo. También se añadieron instrucciones compartidas para Copilot, basadas en el objetivo y la implementación actuales del proyecto.

## Resultado

- `docs/decisions/README.md` funciona como índice de las decisiones técnicas.
- Se documentaron como decisiones iniciales el stack React/TypeScript/Vite, la lógica de juego independiente con pruebas `node:test` y la persistencia local en `localStorage`.
- `docs/sessions/README.md` establece que los resúmenes son históricos y sugiere nombres con fecha.
- `.github/copilot-instructions.md` describe el objetivo, las tecnologías, las verificaciones y las fuentes de verdad. Indica consultar sesiones solo cuando se solicite información concreta y mantener actualizado el registro de decisiones.
- `README.md` documenta los requisitos, la instalación con `npm ci`, el servidor de desarrollo (`npm run dev`), las pruebas (`npm test`) y el build (`npm run build`).
- `.npmrc` configura `https://registry.npmjs.org/` como registro predeterminado de npm.

## Verificación

Se comprobaron los enlaces Markdown relativos de los documentos y el registro efectivo de npm mediante `npm config get registry`. La suite `npm test` terminó correctamente.

## Referencias vigentes

- [Instrucciones del proyecto](../../.github/copilot-instructions.md)
- [README del proyecto](../../README.md)
- [Configuración de npm](../../.npmrc)
- [Decisiones técnicas](../decisions/README.md)
- [Reglas de Burako](../../reglas-burako.md)