# 0004: Renderizado de reglas en la interfaz

- Estado: Aceptada
- Fecha: 2026-11-01

## Contexto

La aplicación necesita presentar el reglamento completo desde la pantalla de bienvenida y durante la partida. El documento existente usa Markdown con listas, énfasis y tablas GFM, y debe seguir siendo la única fuente de las reglas.

## Decisión

Renderizar `reglas-burako.md` en React con `react-markdown` y `remark-gfm`, importando el archivo como texto mediante Vite. Mostrarlo en un diálogo compartido: modal centrado en escritorio y tablets, y a pantalla completa en móvil.

## Consecuencias

- No se mantiene una copia HTML del reglamento que pueda quedar desactualizada.
- Las tablas y listas GFM se renderizan con formato y estilos propios de la aplicación.
- `react-markdown` no interpreta HTML embebido por defecto; no hace falta habilitar renderizado de HTML arbitrario para este documento.
