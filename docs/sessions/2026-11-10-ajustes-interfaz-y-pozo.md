# Ajustes de interfaz y presentación del pozo

**Fecha:** 10 de noviembre de 2026

## Pantalla inicial y vista móvil

- Se redujo el espacio superior del texto de bienvenida y se ubicó el aviso sobre privacidad y publicidad como un pie alineado al borde inferior de la página.
- En pantallas móviles, las fichas de ejemplo pasaron al flujo normal del contenido para evitar que el comodín quedara recortado. La composición también se alineó hacia la derecha, conservando su tamaño y visibilidad.

## Pozo y previews

- El modo compacto o mínimo del pozo vuelve al modo normal al levantarlo o al comenzar una nueva mano, en lugar de conservarse cuando queda una sola ficha.
- El preview del pozo respeta el modo de presentación de destino al cambiar la selección y actualiza sus medidas antes del siguiente render visible.
- En `prefers-reduced-motion`, los badges guía de los previews se distinguen de los badges de canasta con fondo coral y texto blanco.
- Se elevó el contador de fichas del pozo para mantenerlo visible por encima de las capas de las fichas durante las animaciones de descarte.

## Verificación registrada

En las sesiones se informó que `npm test` y `npm run build` pasaron para los ajustes de la pantalla inicial, junto con comprobaciones visuales en móvil y escritorio. Para los ajustes del pozo y sus previews se informó que el build de producción pasó. Estos resultados corresponden a las sesiones originales; no se ejecutaron nuevamente al preparar este registro.
