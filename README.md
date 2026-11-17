# Kickoff Arena

Juego de fútbol 2D de sala con controles inmediatos, simulación de física por pasos y salas multijugador autoritativas con Socket.IO. Los recursos del campo y la interfaz son originales.

## Requisitos

- Node.js 20 o posterior
- npm

## Ejecutar

```sh
npm install
npm start
```

En IntelliJ IDEA, selecciona la configuración **Kickoff Arena (Node.js)** y pulsa **Run**. Si no aparece, abre `server/index.js` y ejecútalo con Node.js, o usa la terminal integrada con `npm start`. No ejecutes la antigua configuración Java `App`: este proyecto se inicia con Node.js.

Abre http://localhost:3000. Para jugar con otras personas, comparte el código que aparece al crear una sala y expón el puerto 3000 de tu servidor. `npm run dev` reinicia el servidor cuando cambian sus archivos.

## Jugar

- **Jugar en local** inicia un partido contra un rival de práctica local.
- **Crear sala online** inicia una sala Socket.IO con código para compartir.
- **Entrar** conecta a una sala por código. La lista pública consulta las salas activas del servidor.
- **WASD / flechas** mueven; **Espacio** golpea. Elige equipo con los botones de la lista.
- El anfitrión puede pausar/reanudar o reiniciar el partido. El chat se comparte con todos los ocupantes de la sala.

## Estructura

- `public/app.js`: interfaz, entrada, renderizado e interpolación de snapshots.
- `public/physics.js`: simulación fija compartida por el cliente local y el servidor.
- `public/index.html`, `public/style.css`: interfaz de sala y campo Canvas.
- `server/index.js`: salas, permisos de anfitrión, chat, validación de entradas y difusión a 30 Hz.

La velocidad y los radios se expresan en unidades del campo. La física usa aceleración, fricción exponencial, topes de velocidad, colisiones circulares con restitución e impulso de balón. El servidor limita los vectores recibidos y realiza la simulación de las salas. El modo local usa el mismo motor a paso variable limitado por frame.

## Alcance de esta versión

Incluye partido local, rival de práctica, siete presets de campo, salas públicas/privadas con contraseña, equipos, lista de jugadores, chat, pausa, reinicio y sincronización online. La configuración de teclado es informativa; los controles son WASD y flechas fijas. Editor de estadios personalizados, avatares, reconexión, comandos de moderación y votación para expulsar quedan como siguientes fases.
