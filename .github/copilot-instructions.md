# GitHub Copilot Instructions

## Reglas Críticas del Agente (Importadas de AGENTS.md)

Estas reglas son de obligado cumplimiento en cada interacción y tienen prioridad sobre cualquier otra instrucción.

1.  **PROHIBIDO EDITAR CÓDIGO CON LA TERMINAL**:
    - NUNCA uses comandos como `sed`, `grep -v`, `printf >`, `echo >`, `cat >` o similares para modificar o crear archivos de código fuente o tests.
    - Usa EXCLUSIVAMENTE las herramientas de edición proporcionadas (`replace_string_in_file`, `create_file`, `edit_notebook_file`).
    - La terminal se reserva únicamente para lectura (`cat`, `ls`), ejecución de tests (`npx vitest`), gestión de dependencias y tareas del sistema que no impliquen escribir código.

2.  **PRESERVACIÓN DE CONTEXTO**:
    - Antes de editar, lee el archivo para asegurar que los bloques de contexto para `replace_string_in_file` coincidan exactamente.
    - Mantén el estilo y las convenciones del proyecto.

3.  **VALIDACIÓN**:
    - Tras cada edición, verifica linting y ejecución de tests si es posible.

4.  **ESTILO Y ESTRUCTURA DE CÓDIGO**:
    - **CERO COMENTARIOS**: No añadir comentarios explicativos en el código. El código debe ser autodocumentado. Eliminar comentarios si se encuentran durante las ediciones.
    - **CERO BLOQUES VACÍOS**: Prohibidos `catch` vacíos, `else` vacíos o funciones sin cuerpo. Si un error debe ignorarse, debe haber una razón técnica mínima o un log.
    - **ARCHIVOS CORTOS**: Límite estricto de **300 líneas** por archivo. Si un archivo supera este límite, DEBE ser refactorizado en módulos más pequeños inmediatamente.
    - **EXCEPCIÓN APROBADA**: `src/main_process/network/file-transfer/transfer-manager.ts` puede superar temporalmente el límite de 300 líneas y no debe seleccionarse como objetivo automático de refactor solo por tamaño. Tratarlo como módulo sensible y tocarlo únicamente si hay un requerimiento funcional explícito o una necesidad técnica justificada.
    - **CERO ARCHIVOS DE EXPORTACIÓN**: No crear archivos cuyo único propósito sea exportar funciones o variables de otros módulos bajo ningun concepto, ya que se considera una mala práctica y puede complicar la mantenibilidad del código. Si existen, obligatoriamente se han de refactorizar.
