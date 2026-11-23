# Configuración de áreas del menú telefónico

## Intención

Permitir que una instalación nueva registre desde el panel el DDI principal y la relación entre tecla, área y extensión. El dashboard usará esa configuración para mostrar y filtrar llamadas por área del menú.

## Alcance

- Agregar en **Configuración** un campo para el DDI principal y una tabla editable con tecla, área y extensión.
- Permitir agregar y quitar filas. Validar tecla entre 0 y 9, sin teclas duplicadas, y exigir área y extensión en cada fila guardada. Se permiten varias teclas para la misma extensión.
- Persistir la configuración en el servicio Rust y reflejarla en las estadísticas existentes de llamadas entrantes por área.
- Guardar esta sección sin reiniciar la conexión SMDR.
- No mostrar ni guardar nombres de personas.

## Fuera de alcance

No modifica el Panasonic, su enrutamiento, los DDI, la recepción de registros ni las estadísticas de extensiones que no correspondan al menú.

## Enfoques considerados

1. **Editor del menú en Configuración — elegido.** Reutiliza `menu_did` y `menu_areas` del servicio Rust; incorpora el formulario y una operación de guardado separada para no cortar la sesión SMDR.
2. **Catálogo general de extensiones.** Permitiría clasificar llamadas de cualquier extensión, pero ampliaría el alcance y cambiaría cómo se interpretan las estadísticas.
3. **Edición manual de TOML.** Requiere menos interfaz, pero deja la configuración oculta y difícil de mantener en instalaciones nuevas.

## Criterio de éxito

Después de guardar un DDI y al menos un área, el dashboard muestra las áreas configuradas con sus contadores; **Ver llamadas** conserva el filtro existente por DDI principal, extensión y llamadas entrantes.
