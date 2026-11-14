# 0003: Persistencia local de la partida

- Estado: Aceptada
- Fecha: 2026-10-30

## Contexto

La aplicación está planteada como una partida local en navegador y no cuenta con backend ni autenticación.

## Decisión

Guardar y recuperar el estado de la partida en `localStorage` del navegador. No sincronizar datos entre dispositivos ni incorporar servicios remotos mientras el alcance siga siendo local.

## Consecuencias

- El guardado depende del navegador y del dispositivo en uso.
- Los cambios en el formato persistido deben considerar compatibilidad y versionado.
- La identidad de la IA se guarda como un identificador de perfil estable y se conserva entre manos; partidas existentes sin ese dato reciben un perfil al cargarse.
- Si el plan incorpora cuentas o sincronización, se debe revisar esta decisión antes de añadir infraestructura.