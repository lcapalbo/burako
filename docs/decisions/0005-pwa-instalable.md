# 0005: Aplicación web instalable y uso sin conexión

- Estado: Aceptada
- Fecha: 2026-11-10

## Contexto

La aplicación se publica como sitio estático bajo `/burako/`, no requiere backend y guarda la partida en el navegador. Se desea permitir su instalación y el juego sin conexión después de la primera visita.

## Decisión

Convertir la aplicación en una PWA con un manifiesto, iconos y un service worker generado por Vite. El service worker precachea el shell y los recursos de producción para habilitar el uso sin conexión. Las actualizaciones se descargan automáticamente y esperan a que se cierre la versión activa para no interrumpir una partida.

## Consecuencias

- La instalación requiere un navegador compatible y normalmente una publicación HTTPS.
- La primera visita necesita conexión; luego, el shell y los recursos precacheados permiten iniciar y continuar partidas sin conexión.
- Las actualizaciones se publican junto al build estático y se activan al cerrar la versión anterior; no requieren reinstalación ni un paso de publicación separado.
- Los datos de partida continúan almacenándose localmente y no se sincronizan entre dispositivos.
