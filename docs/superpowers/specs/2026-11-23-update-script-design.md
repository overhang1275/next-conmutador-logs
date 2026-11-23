# Actualizador seguro de Línea Clara

## Intención

Actualizar una instalación existente de Línea Clara en Debian o Ubuntu sin volver a ejecutar el instalador ni sobrescribir la configuración SMDR, la base SQLite o las credenciales del dashboard.

## Alcance

- Crear `update.sh` para ejecutarse como root en un servidor ya instalado.
- Leer el repositorio y la rama desde `/opt/linea-clara`, salvo que la persona indique otra rama.
- Descargar el código a una carpeta temporal y compilar Rust y Next.js antes de detener servicios.
- Respaldar `/var/lib/linea-clara` y `/etc/linea-clara` en una carpeta con acceso restringido.
- Activar la versión compilada durante una ventana breve; comprobar que los dos servicios están activos y que el dashboard responde.
- Si la activación falla, regresar automáticamente a la versión anterior e iniciar sus servicios.
- Conservar una copia de la versión anterior y los respaldos para recuperación manual.

## Fuera de alcance

No instalar paquetes del sistema, modificar firewall, cambiar el Panasonic, editar contraseñas, migrar o limpiar registros, ni publicar el script en GitHub desde esta sesión. Para instalaciones antiguas, se permite un drop-in temporal y reversible de systemd que arranca Next.js directamente con Node; pnpm 11 intenta escribir temporales en el directorio de la aplicación, que systemd mantiene de solo lectura.

## Enfoques considerados

1. **Compilación por etapas con respaldo y rollback automático — elegido.** Compila en una copia aparte y cambia la versión solo tras completar la compilación. Requiere más espacio temporal y conserva una copia de recuperación.
2. **Actualización directa con `git pull` y rebuild.** Usa menos espacio y menos pasos, pero puede dejar el código o artefactos de producción a medio actualizar si falla la compilación.

## Criterio de éxito

El script conserva los datos y secretos originales, no activa código que no terminó de compilar, verifica que SMDR y el dashboard arrancaron, y vuelve a la versión anterior si falla la comprobación.
