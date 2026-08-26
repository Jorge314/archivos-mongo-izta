## 📋 Descripción General del Proyecto

Este documento y su respectivo script de comandos (`scripts_proyecto.js`) detallan el orden exacto de ejecución para desplegar y verificar la solución integral de monitoreo en alta montaña sobre el Iztaccíhuatl y Popocatépetl. La arquitectura implementa bases de datos documentales desacopladas en MongoDB, optimización mediante índices geoespaciales y temporales, validación estricta de esquemas, consultas analíticas avanzadas y un esquema de seguridad basado en roles (RBAC).

---

### 📝 Nota Metodológica sobre la Fuente y Procesamiento de Datos GPX
* **Ruta planeada (`la-joya-refugio-de-los-100-ex-refugio-luis-mendez.gpx`):** Archivo público descargado de la plataforma Wikiloc (https://loc.wiki/t/276231431?wa=sc), correspondiente a la trayectoria de referencia de la ruta hacia el Iztaccíhuatl. El archivo fue procesado mediante Python y transformado a formato GeoJSON (LineString) para conformar el documento base de la colección expediciones.
* **Telemetría de ejecución (`Primera_rodilla_de_Iztaccíhuatl.gpx`):** Registros propios obtenidos mediante un dispositivo GPS durante una expedición en terreno. Debido a un fallo técnico en el registro original, el archivo exportado presentaba marcas de tiempo estáticas que no permitían representar correctamente la secuencia temporal. Por este motivo, se realizó mediante Python una normalización cronológica de los timestamps, distribuyendo los registros de forma continua entre las 00:30 y las 14:30 horas. La transformación se calibró utilizando hitos conocidos de la expedición, de manera que la llegada a la cumbre quedara representada aproximadamente entre las 08:30 y las 09:00 horas. El procedimiento modifica únicamente la referencia temporal de los registros y conserva las coordenadas y demás atributos obtenidos originalmente del dispositivo.

---

## 🛠️ Requisitos Previos

- **MongoDB Community** (Academy Learner Lab) con herramientas de línea de comandos `mongosh` y `mongoimport` disponibles.
- **Repositorio clonado** en el entorno local o de laboratorio mediante la terminal:

Ejecutar los siguientes comandos:

```bash
git clone https://github.com/Jorge314/archivos-mongo-izta-2.git
cd archivos-mongo-izta-2/Colecciones
```

## 🚀 Orden de Ejecución y Explicación de Comandos

### Paso 1: Carga de Datos Base (Ingesta)

Antes de ejecutar los comandos analíticos dentro de la shell de MongoDB, es necesario importar los documentos (expediciones, telemetría, bitácora de condiciones y contactos de emergencia) desde la terminal del sistema:

```bash
mongoimport --db proyecto_montana --collection expediciones --file Documento_expedicion.json
mongoimport --db proyecto_montana --collection telemetria --file telemetria_8mil_puntos.json --jsonArray
mongoimport --db proyecto_montana --collection bitacora_condiciones --file bitacora_documentos.json --jsonArray
mongoimport --db proyecto_montana --collection contactos_emergencia --file contactos_emergencias_documentos.json --jsonArray
```
---

### Paso 2: Selección de Base de Datos y Diagnóstico Inicial (Sin Índices)
Una vez dentro de `mongosh`, seleccionamos el contexto de trabajo y ejecutamos consultas base evaluando su rendimiento mediante `.explain("executionStats")` para medir el comportamiento inicial (`COLLSCAN`, ordenamientos en memoria):

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
Implementamos la estrategia de indexación para acelerar las búsquedas geográficas, temporales y de texto:

```javascript
// 1. Índice geoespacial para la bitácora de condiciones
db.bitacora_condiciones.createIndex({ "ubicacion": "2dsphere" }, { name: "idx_bitacora_geo" })

// 2. Reestructuración del índice de telemetría (Aplicando regla ESR: Ubicación Geoespacial, Expedición y Tiempo)
db.telemetria.dropIndex("idx_telemetria_exp_tiempo")
db.telemetria.createIndex({ "ubicacion": "2dsphere", "meta.expedicionId": 1, "timestamp": 1 }, { name: "idx_telemetria_exp_geo_tiempo" })

// 3. Índice para búsqueda textual en la bitácora
db.bitacora_condiciones.createIndex({ "expedicionId": 1, "texto_nota": "text" }, { name: "idx_bitacora_texto" })
```

---

### Paso 4: Configuración de Reglas de Calidad (`$jsonSchema`)
Aplicamos validadores estrictos mediante `collMod` para controlar tipos BSON, campos obligatorios, rangos físicos terrestres y estructuras GeoJSON válidas:

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
```

---

### Paso 5: Consultas Especializadas y Análisis Espacial / Temporal
Ejecutamos las consutlas clave para la toma de decisiones, evaluación de rutas, geofencing y monitoreo:

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
```

---

### Paso 6: Seguridad y Control de Acceso (RBAC)
Configuramos los roles institucionales y verificamos los permisos mínimos requeridos:

```javascript
// 1. Rol para ingesta de dispositivos GPS (Solo Inserción de Telemetría)
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

// Verificación de privilegios asignados
db.getRoles({ showPrivileges: true })
```

---

## 📌 Notas Técnicas Finales

* **Privacidad de Datos:** Ningún script ni dato del repositorio contiene información personal real, contraseñas en texto plano o cadenas de conexión con credenciales reales.
* **Entorno de Pruebas:** El entorno Academy Learner Lab no tiene autenticación de usuarios activada por defecto; los roles de seguridad se encuentran diseñados, implementados y verificados teóricamente mediante `getRoles()`.
  



