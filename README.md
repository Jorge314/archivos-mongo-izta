## 📋 Descripción General del Proyecto

Este documento y su respectivo script de comandos (`scripts_proyecto.js`) detallan el orden exacto de ejecución para desplegar y verificar la solución integral de monitoreo en alta montaña sobre el Iztaccíhuatl y Popocatépetl. La arquitectura implementa bases de datos documentales desacopladas en MongoDB, optimización mediante índices geoespaciales y temporales, validación estricta de esquemas, consultas analíticas avanzadas y un esquema de seguridad basado en roles (RBAC).

## 🛠️ Requisitos Previos

- **MongoDB Community** (Academy Learner Lab) con herramientas de línea de comandos `mongosh` y `mongoimport` disponibles.
- **Repositorio clonado** en el entorno local o de laboratorio mediante la terminal:

Ejecutar los siguientes comandos:

```bash
git clone https://github.com/Jorge314/archivos-mongo-izta-2.git
cd archivos-mongo-izta-2

## 🚀 Orden de Ejecución y Explicación de Comandos

### Paso 1: Carga de Datos Base (Ingesta)

Antes de ejecutar los comandos analíticos dentro de la shell de MongoDB, es necesario importar los documentos semilla (expediciones, telemetría, bitácora de condiciones y contactos de emergencia) desde la terminal del sistema:

```bash
mongoimport --db proyecto_montana --collection expediciones --file Documento_expedicion.json
mongoimport --db proyecto_montana --collection telemetria --file telemetria_8mil_puntos.json --jsonArray
mongoimport --db proyecto_montana --collection bitacora_condiciones --file bitacora_documentos.json --jsonArray
mongoimport --db proyecto_montana --collection contactos_emergencia --file contactos_emergencias_documentos.json --jsonArray
```[cite: 8, 13]

*(Nota: Si te encuentras en un entorno con puerto personalizado o réplica específica, asegúrate de ajustar los parámetros de conexión, por ejemplo `--port 27118`[cite: 13]).*

---

### Paso 2: Selección de Base de Datos y Diagnóstico Inicial (Sin Índices)
Una vez dentro de `mongosh`, seleccionamos el contexto de trabajo y ejecutamos consultas base evaluando su rendimiento mediante `.explain("executionStats")` para medir el comportamiento inicial y los cuellos de botella (`COLLSCAN`, ordenamientos en memoria)[cite: 7, 10]:

```javascript
// Seleccionar la base de datos oficial del proyecto
use proyecto_montana

// A. Diagnóstico de proximidad espacial en bitácora (escaneo completo inicial)
db.bitacora_condiciones.find({
  ubicacion: {
    $geoWithin: { 
      $centerSphere: [ [ -98.6368944, 19.1575028 ], 500 / 6378100 ] 
    }
  }
}).explain("executionStats")

// B. Diagnóstico de telemetría temporal (evidencia la etapa SORT en memoria)
db.telemetria.find({ 
  "meta.expedicionId": "EXP-IZTA-01", 
  "timestamp": { 
    $gte: ISODate("2026-08-22T05:00:00Z"), 
    $lt: ISODate("2026-08-22T08:00:00Z")
  } 
}).sort({ "timestamp": 1 }).explain("executionStats")

// C. Búsqueda de texto mediante expresiones regulares secuenciales
db.bitacora_condiciones.find({
  "expedicionId": "EXP-IZTA-01",
  "texto_nota": { $regex: /rocas/i }
}).explain("executionStats")
```[cite: 7, 10]

---

### Paso 3: Creación y Reestructuración de Índices
Implementamos la estrategia de indexación definitiva para acelerar las búsquedas geográficas, temporales y de texto, eliminando los escaneos de colección completos[cite: 6, 7]:

```javascript
// 1. Índice geoespacial para la bitácora de condiciones
db.bitacora_condiciones.createIndex({ "ubicacion": "2dsphere" }, { name: "idx_bitacora_geo" })

// 2. Reestructuración del índice de telemetría (Aplicando regla ESR: Ubicación Geoespacial, Expedición y Tiempo)
db.telemetria.dropIndex("idx_telemetria_exp_tiempo")
db.telemetria.createIndex({ "ubicacion": "2dsphere", "meta.expedicionId": 1, "timestamp": 1 }, { name: "idx_telemetria_exp_geo_tiempo" })

// 3. Índice para búsqueda textual en la bitácora
db.bitacora_condiciones.createIndex({ "expedicionId": 1, "texto_nota": "text" }, { name: "idx_bitacora_texto" })
```[cite: 6, 7, 10]

---

### Paso 4: Configuración de Reglas de Calidad (`$jsonSchema`)
Aplicamos validadores estrictos mediante `collMod` para controlar tipos BSON, campos obligatorios, rangos físicos terrestres y estructuras GeoJSON válidas[cite: 6, 7]:

```javascript
// Validador estricto para la colección de telemetria
db.runCommand({
  collMod: "telemetria",
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["timestamp", "ubicacion", "elevacion", "meta"],
      properties: {
        timestamp: { bsonType: "date" },
        ubicacion: {
          bsonType: "object",
          required: ["type", "coordinates"],
          properties: {
            type: { enum: ["Point"] },
            coordinates: {
              bsonType: "array",
              minItems: 2,
              maxItems: 2,
              items: [
                { bsonType: ["double", "int"], minimum: -180, maximum: 180 },
                { bsonType: ["double", "int"], minimum: -90, maximum: 90 }
              ]
            }
          }
        },
        elevacion: { bsonType: ["double", "int"], minimum: 0, maximum: 8848 },
        meta: {
          bsonType: "object",
          required: ["expedicionId"],
          properties: {
            expedicionId: { bsonType: "string", pattern: "^EXP-[A-Z]+-\\d+$" },
            bateriaDispositivo: { bsonType: ["int","double"], minimum: 0, maximum: 100 }
          }
        }
      }
    }
  },
  validationAction: "error"
})

// Validador ampliado para admitir tanto Point como Polygon en la bitácora de condiciones
db.runCommand({
  collMod: "bitacora_condiciones",
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["ubicacion", "texto_nota"],
      properties: {
        texto_nota: { bsonType: "string" },
        ubicacion: {
          bsonType: "object",
          required: ["type", "coordinates"],
          oneOf: [
            {
              properties: {
                type: { enum: ["Point"] },
                coordinates: {
                  bsonType: "array",
                  minItems: 2,
                  maxItems: 2,
                  items: [
                    { bsonType: ["double", "int"], minimum: -180, maximum: 180 },
                    { bsonType: ["double", "int"], minimum: -90, maximum: 90 }
                  ]
                }
              }
            },
            {
              properties: {
                type: { enum: ["Polygon"] },
                coordinates: {
                  bsonType: "array",
                  items: {
                    bsonType: "array",
                    minItems: 4,
                    items: {
                      bsonType: "array",
                      minItems: 2,
                      maxItems: 2,
                      items: [
                        { bsonType: ["double", "int"], minimum: -180, maximum: 180 },
                        { bsonType: ["double", "int"], minimum: -90, maximum: 90 }
                      ]
                    }
                  }
                }
              }
            }
          ]
        }
      }
    }
  },
  validationAction: "error"
})
```[cite: 6, 7, 10]

---

### Paso 5: Consultas Especializadas y Análisis Espacial / Temporal
Ejecutamos las operaciones operativas clave para la toma de decisiones, evaluación de rutas, geofencing y monitoreo[cite: 6, 7]:

```javascript
// A. Proximidad a refugios con filtros temáticos
db.bitacora_condiciones.find({  
  "ubicacion": {    
    $near: {      
      $geometry: {        
        type: "Point",        
        coordinates: [-98.64320, 19.12560]      
      },      
      $maxDistance: 4000    
    }  
  },  
  "etiquetas": "refugio"
})

// B. Consulta de geofencing (pertenencia a zona de riesgo)
db.bitacora_condiciones.find({  
  "etiquetas": "area",  
  "ubicacion": {    
    $geoIntersects: {      
      $geometry: {        
        type: "Point",        
        coordinates: [-98.64320, 19.12560]      
      }    
    }  
  }
})

// C. Consulta de desviación de ruta mediante agregación espacial
db.telemetria.aggregate([
  {
    $geoNear: {
      near: { type: "Point", coordinates: [-98.64320, 19.12560] },
      distanceField: "distancia_a_ruta",
      maxDistance: 5000,
      spherical: true
    }
  },
  {
    $match: {
      "meta.expedicionId": "EXP-IZTA-01",
      "distancia_a_ruta": { $gt: 50 }
    }
  }
])

// D. Alertas y contactos autorizados (Minimización de datos con $lookup y $map)
db.bitacora_condiciones.aggregate([
  {
    $match: {
      "etiquetas": "area",
      "ubicacion": {
        $geoIntersects: {
          $geometry: {
            type: "Point",
            coordinates: [-98.64400, 19.12900]
          }
        }
      }
    }
  },
  {
    $lookup: {
      from: "contactos_emergencia",
      localField: "expedicionId",
      foreignField: "expedicionId",
      as: "contactos_autorizados"
    }
  },
  {
    $project: {
      _id: 0,
      expedicionId: 1,
      zona_riesgo: "$texto_nota",
      alerta_activa: { $literal: true },
      fecha_alerta: "$$NOW",
      contactos: {
        $map: {
          input: "$contactos_autorizados",
          as: "contacto",
          in: {
            nombre: "$$contacto.nombre",
            telefono: {
               $concat: [
                   "****",
                   {
                     $substrCP: [
                         "$$contacto.telefono",
                         { $subtract: [ { $strLenCP: "$$contacto.telefono" }, 4 ] },
                         4
                     ]
                   }
               ]
            },
            nivel: "$$contacto.nivel_autorizacion"
          }
        }
      }
    }
  }
])

// E. Análisis Temporal (Evolución y cálculo de desnivel ganado por hora)
db.telemetria.aggregate([
  { $match: { "meta.expedicionId": "EXP-IZTA-01",
      "timestamp": { $gte: ISODate("2026-08-22T05:00:00Z"), $lt: ISODate("2026-08-22T08:00:00Z") } } },
  { $sort: { timestamp: 1 } },
  { $group: { _id: { $hour: "$timestamp" },
      puntos_obtenidos: { $sum: 1 },
      elevacion_inicial: { $first: "$elevacion" },
      elevacion_final: { $last: "$elevacion" } } },
  { $project: { _id: 0, hora_utc: "$_id", desnivel_ganado_m: { $subtract: ["$elevacion_final", "$elevacion_inicial"] } } },
  { $sort: { hora_utc: 1 } }
])

// F. Búsqueda Textual formal de riesgos usando el índice de texto
db.bitacora_condiciones.find({
  "expedicionId": "EXP-IZTA-01",
  $text: { $search: "rocas hielo -despejado" }
})
```[cite: 6, 7, 9, 10]

---

### Paso 6: Seguridad y Control de Acceso (RBAC)
Configuramos los roles institucionales y verificamos los permisos mínimos requeridos[cite: 9, 10]:

```javascript
// 1. Rol para ingesta de dispositivos IoT / GPS (Solo Inserción de Telemetría)
db.createRole({
   role: "ingresoTelemetriaRole",
   privileges: [
     { resource: { db: "proyecto_montana", collection: "telemetria" }, actions: ["insert"] }
   ],
   roles: []
})

// 2. Rol para Montañista / App Móvil (Consulta de datos generales y bitácora)
db.createRole({
   role: "usuarioMontanistaRole",
   privileges: [
     { resource: { db: "proyecto_montana", collection: "expediciones" }, actions: ["find"] },
     { resource: { db: "proyecto_montana", collection: "bitacora_condiciones" }, actions: ["find"] },
     { resource: { db: "proyecto_montana", collection: "telemetria" }, actions: ["find"] }
   ],
   roles: []
})

// 3. Rol para Centro de Mando / Rescate (Acceso a expediciones, bitácora y telemetría)
db.createRole({
   role: "operadorRescateRole",
   privileges: [
     { resource: { db: "proyecto_montana", collection: "expediciones" }, actions: ["find"] },
     { resource: { db: "proyecto_montana", collection: "bitacora_condiciones" }, actions: ["find"] },
     { resource: { db: "proyecto_montana", collection: "telemetria" }, actions: ["find"] }
   ],
   roles: []
})

// Verificación teórica de privilegios asignados
db.getRoles({ showPrivileges: true })
```[cite: 9, 10]

---

## 📌 Notas Técnicas Finales[cite: 8, 9]

* **Privacidad de Datos:** Ningún script ni dato del repositorio contiene información personal real, contraseñas en texto plano o cadenas de conexión con credenciales reales[cite: 8, 9].
* **Entorno de Pruebas:** El entorno Academy Learner Lab no tiene autenticación de usuarios activada por defecto; los roles de seguridad se encuentran diseñados, implementados y verificados teóricamente mediante `getRoles()`[cite: 8, 9].
* **Reinicio del Entorno:** Para limpiar la base de datos desde un estado conocido y repetir la ingesta, ejecute `db.dropDatabase()` previo al paso 1.
  



