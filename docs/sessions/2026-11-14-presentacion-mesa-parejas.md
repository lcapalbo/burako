# Presentación de la mesa en parejas

## Resumen

Se incorporaron múltiples perfiles de IA con nombres y avatares propios, y se adaptó el juego para incluir el modo por parejas. También se refinó la distribución visual de esa modalidad para dar más espacio al paño, mantener visibles las fichas y distinguir visualmente a los compañeros.

## Cambios

- Se agregaron perfiles de IA con nombres, avatares y preferencias individuales; en parejas, cada partida usa perfiles distintos.
- Se adaptaron la lógica y la interfaz para jugar en parejas, con dos equipos de dos jugadores.
- Los atriles laterales quedan fuera del paño y sus fichas se muestran horizontales, orientadas hacia la mesa.
- Las columnas laterales se redujeron a 28 px; las fichas visibles miden 24 × 34 px y los dorsos 16 × 22 px, con mayor superposición.
- Se ajustaron las posiciones de los atriles derechos y de los avatares flotantes para que no cubran las fichas.
- Los avatares laterales usan el mismo tamaño que los de arriba y abajo. En parejas, el avatar superior toma el tono naranja del jugador humano; en partidas individuales conserva su color original.

## Decisiones técnicas

No se modificaron las decisiones vigentes ni las reglas funcionales. El ajuste es de presentación y mantiene el modelo de parejas descrito en [0002](../decisions/0002-logica-y-pruebas.md).

## Verificación

- `npm run build`
- `git diff --check`
- Inspección en escritorio y móvil: sin scroll horizontal y sin superposición entre avatares y fichas laterales.
