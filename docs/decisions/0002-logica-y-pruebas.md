# 0002: Lógica de juego independiente y pruebas con Node

- Estado: Aceptada
- Fecha: 2026-10-30

## Contexto

Las reglas de turnos, combinaciones y puntaje deben poder verificarse sin depender de la interfaz. El proyecto ya separa estas operaciones de los componentes React.

## Decisión

Mantener la lógica de dominio en `src/game.ts`, sin dependencia de React, y probarla con el módulo nativo `node:test`. Las reglas funcionales de referencia se mantienen en `reglas-burako.md`.

## Consecuencias

- Los cambios en reglas o transiciones de estado deben incluir pruebas enfocadas en `tests/`.
- Las pruebas se ejecutan con `npm test`.
- La interfaz debe invocar las operaciones del motor en vez de duplicar sus reglas.