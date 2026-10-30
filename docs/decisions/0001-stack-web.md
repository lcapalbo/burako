# 0001: Aplicación web con React, TypeScript y Vite

- Estado: Aceptada
- Fecha: 2026-10-30

## Contexto

El proyecto ofrece una experiencia de Burako en navegador y necesita una interfaz interactiva que pueda desarrollarse y compilarse con un flujo liviano.

## Decisión

Usar React 18 y TypeScript para la aplicación, y Vite para el servidor de desarrollo y el build. Mantener el proyecto como frontend web; no introducir un servidor o framework adicional sin una necesidad concreta del plan.

## Consecuencias

- La entrada de la aplicación y sus componentes permanecen en `src/`.
- Los cambios se verifican con `npm run build`.
- TypeScript estricto ayuda a mantener explícitos los contratos de la lógica y la interfaz.