# Propuesta de producto para SaluBack

**Estado:** documento de análisis  
**Versión:** 0.1  
**Fecha:** 12 de noviembre de 2026

Este documento reúne ideas para enriquecer SaluBack sin convertirlas todavía en
código, tablas definitivas o contratos técnicos.

## 1. Visión

SaluBack puede comenzar como un diario personal de salud y evolucionar después
hacia una red privada de cuidado familiar:

> Primero registro y entiendo mi propio historial. Después decido con quién lo
> comparto y qué puede hacer esa persona.

Así se puede construir una primera versión pequeña sin cerrar la puerta a
menores, adultos dependientes, cuidadores o familiares con acceso limitado.

## 2. Principios del producto

### La persona está en el centro

Las mediciones pertenecen a un perfil, no a una cuenta ni a una familia. La
cuenta permite entrar al sistema; el perfil representa a la persona cuyos datos
se registran.

### Lo simple primero

La primera versión debe resolver muy bien cuatro acciones:

1. registrar una medición;
2. consultar el historial;
3. corregir o eliminar un registro;
4. observar la evolución en una gráfica.

### Compartir es una decisión posterior

En el MVP, cada usuario sólo trabaja con su perfil. Más adelante podrá compartir
el acceso sin transferir la propiedad del perfil.

### Registrar no significa diagnosticar

SaluBack conserva y presenta información. No debe afirmar que una lectura es
normal, peligrosa o indicativa de una enfermedad.

### La fecha de medición es esencial

El momento en que se tomó una lectura es más importante para el historial que el
momento en que se capturó en la aplicación. Ambos conceptos deben conservarse.

## 3. Usuario inicial

El usuario inicial es una persona adulta que desea conservar sus propias
mediciones de presión y glucosa. Por ejemplo:

- registra cada mañana su presión;
- captura por la noche una lectura tomada varias horas antes;
- consulta sus valores de las últimas semanas;
- corrige un número que escribió mal;
- muestra una gráfica desde su teléfono.

No es necesario modelar todavía al médico, al cuidador o al menor. Basta con no
diseñar el producto de forma que esos actores sean imposibles en el futuro.

## 4. Recorridos principales

### Registrar presión

La persona ingresa presión sistólica y diastólica, opcionalmente el pulso, indica
cuándo tomó la medición, añade una nota si lo desea y guarda la lectura.

### Registrar glucosa

La persona ingresa el valor, indica cuándo tomó la medición, selecciona el
contexto —por ejemplo, ayuno o después de comer—, añade una nota opcional y
guarda la lectura.

### Consultar el historial

La persona puede:

- ver primero las mediciones más recientes;
- cambiar entre presión y glucosa;
- consultar un periodo determinado;
- ver los datos como lista o gráfica;
- abrir una lectura para revisar sus detalles;
- corregir o eliminar una lectura propia.

## 5. Información que conviene registrar

### Presión arterial

Esencial para el MVP:

- presión sistólica;
- presión diastólica;
- fecha y hora de medición.

Útil sin complicar demasiado:

- pulso;
- nota libre.

Candidato para después:

- brazo izquierdo o derecho;
- postura: sentado, de pie o acostado;
- dispositivo utilizado;
- varias lecturas consecutivas;
- contexto como ejercicio reciente o malestar.

**Recomendación:** comenzar con los campos esenciales, pulso y nota. Brazo,
postura y dispositivo pueden agregarse cuando exista una necesidad real.

### Glucosa

Esencial para el MVP:

- valor;
- unidad;
- fecha y hora de medición;
- contexto de la medición.

Contextos sugeridos:

- en ayunas;
- antes de comer;
- después de comer;
- antes de dormir;
- aleatoria;
- otro.

Candidato para después:

- minutos antes o después de comer;
- dispositivo utilizado;
- relación con ejercicio;
- observación sobre alimentos;
- relación con medicación, si se crea ese módulo.

**Recomendación:** incluir el contexto desde el MVP, porque vuelve mucho más útil
el historial sin complicar demasiado la captura.

### Perfil personal

Útil para el MVP:

- nombre visible;
- fecha de nacimiento opcional;
- zona horaria;
- unidad preferida para glucosa.

Conviene evitar hasta que exista un uso concreto:

- dirección completa;
- documentos de identidad;
- historial clínico general;
- diagnósticos;
- seguros y contactos de emergencia.

Guardar menos información mantiene claro el prototipo y reduce la exposición de
datos personales.

## 6. Ideas para las gráficas

### Presión arterial

- dos líneas: sistólica y diastólica;
- pulso como vista opcional;
- periodos de 7 días, 30 días, 3 meses y personalizado;
- detalle de una lectura al seleccionar un punto;
- espacios visibles entre días sin mediciones.

### Glucosa

- línea cronológica del valor;
- colores o símbolos por contexto;
- filtro por ayuno, antes de comer o después de comer;
- periodos predefinidos y personalizados;
- detalle con fecha, hora, contexto y nota.

Reglas de presentación recomendadas:

- no inventar valores entre dos mediciones;
- no reemplazar datos faltantes por cero;
- mostrar siempre la unidad;
- respetar la zona horaria del perfil;
- usar la fecha real de medición;
- no etiquetar resultados como saludables o peligrosos en el MVP.

## 7. Modelo conceptual recomendado

- **Usuario:** cuenta que en el futuro se autenticará con Firebase. Inicialmente
  todos tendrán el rol `member`.
- **Perfil:** persona cuyos datos se guardan. En el MVP sólo existe el perfil
  `personal`.
- **Relación usuario-perfil:** expresa el vínculo de una cuenta con un perfil.
  En el MVP sólo existe `owner`.
- **Medición:** registro perteneciente a un perfil y ocurrido en una fecha. La
  presión y la glucosa conservan sus propios atributos.

Aunque inicialmente cada usuario tenga exactamente un perfil, mantener la
relación separada permitirá expresar después:

- una persona propietaria de su perfil;
- un familiar que sólo puede consultar;
- un familiar que puede agregar mediciones;
- un responsable de un perfil dependiente.

No es necesario resolver hoy cómo funcionarán todos esos casos.

## 8. Evolución hacia una familia

### Compartir un perfil existente

El propietario podría invitar a otro usuario y concederle una capacidad:

- **ver:** consultar perfil, historial y gráficas;
- **registrar:** consultar y agregar mediciones;
- **administrar:** consultar, agregar, corregir y eliminar mediciones.

La propiedad debe permanecer separada de estas capacidades. Poder registrar
datos no convierte a una persona en dueña del perfil.

### Formar un grupo familiar

Un grupo puede facilitar navegación e invitaciones, pero no debería hacer
visibles automáticamente todos los perfiles. Cada perfil decide qué comparte.

### Incorporar perfiles dependientes

Más adelante podrán existir perfiles sin cuenta propia:

- `minor` para menores;
- `dependent_adult` para adultos dependientes.

Esos perfiles necesitarán reglas sobre responsables y cambios de
responsabilidad. Conviene resolverlo sólo cuando el producto llegue a esa fase.

## 9. Decisiones recomendadas para el MVP

| Tema | Recomendación | Motivo |
|---|---|---|
| Público | Sólo adultos | Reduce casos especiales |
| Perfil | Uno personal por usuario | Mantiene simple el flujo |
| Rol | Todos `member` | No hay administración compleja |
| Mediciones | Presión y glucosa | Alcance actual del producto |
| Presión | mmHg | Unidad habitual |
| Glucosa | mg/dL | Adecuada para el uso inicial en México |
| Fecha editable | Sí | Permite capturar lecturas anteriores |
| Notas | Opcionales | Dan contexto sin bloquear la captura |
| Contexto de glucosa | Obligatorio | Aporta valor al historial |
| Gráficas | Las construye el frontend | El backend entrega el historial |
| Diagnóstico | No | No es objetivo del prototipo |
| Autenticación | Firebase después | Evita credenciales provisionales |
| Acceso familiar | Después del MVP | Primero se valida el diario personal |

## 10. Decisiones aún abiertas

### Eliminación de mediciones

Puede ser definitiva, puede ocultar el registro conservándolo internamente o
puede permitirse sólo corregir. Para el prototipo, la eliminación definitiva es
la opción más simple; deberá revisarse antes de compartir perfiles.

### Fecha de nacimiento

Ayuda a distinguir perfiles, pero no es necesaria para registrar mediciones. Se
propone como opcional.

### Unidad de glucosa

Permitir sólo `mg/dL` simplifica el MVP. La posibilidad de usar `mmol/L` puede
quedar documentada para una fase posterior.

### Valores duplicados

Dos lecturas iguales tomadas a la misma hora pueden ser legítimas. No deberían
eliminarse automáticamente; como máximo, la interfaz puede advertirlo.

### Mediciones futuras

Una fecha futura probablemente sea un error. Se recomienda rechazarla dejando
un pequeño margen por diferencias entre relojes.

## 11. Riesgos del producto

- **Formulario demasiado grande:** se mitiga separando campos esenciales y
  opcionales.
- **Confundir captura con diagnóstico:** se mitiga usando lenguaje descriptivo.
- **Diseñar toda la familia demasiado pronto:** se mitiga validando primero el
  diario personal.
- **Perder el contexto temporal:** se mitiga diferenciando fecha de medición y
  fecha de captura.
- **Exponer el prototipo sin autenticación:** debe mantenerse local hasta
  incorporar Firebase.
- **Guardar datos innecesarios:** se mitiga limitando el perfil a lo que utiliza
  el producto.

## 12. Señales de que el MVP funciona

Antes de agregar funciones familiares debería comprobarse que:

- registrar una medición resulta rápido y claro;
- se pueden capturar datos de días anteriores;
- el historial es fácil de consultar;
- las gráficas respetan fechas, unidades y datos faltantes;
- corregir un error no genera confusión;
- presión y glucosa cubren las necesidades de la familia piloto;
- los campos opcionales aportan valor real.

## 13. Backlog posible para el futuro

- compartir temporalmente un perfil;
- exportar un periodo;
- generar un resumen imprimible;
- configurar recordatorios;
- capturar desde dispositivos compatibles;
- comparar periodos;
- registrar cambios de rutina;
- agregar peso, temperatura u oxigenación;
- crear perfiles dependientes;
- conceder acceso de sólo lectura;
- identificar quién capturó una medición compartida.

Estas ideas deben evaluarse por utilidad real, no sólo porque sean técnicamente
posibles.

## 14. Próximo paso de análisis

Antes de definir un modelo lógico conviene validar cinco decisiones:

1. si la fecha de nacimiento estará en el perfil inicial;
2. si el contexto de glucosa será obligatorio;
3. si una medición podrá eliminarse definitivamente;
4. si `mg/dL` será la única unidad inicial;
5. qué campos opcionales de presión aportan valor desde el primer día.

Después se podrá elaborar el modelo lógico como un nuevo documento, todavía sin
crear la base de datos ni escribir código.

