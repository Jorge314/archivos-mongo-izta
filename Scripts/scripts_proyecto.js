// Se selecciona la BD
use proyecto_montana

//Diagnóstico y Mediciones Iniciales (Sin indices)
//proximidad espacial antes del indice
db.bitacora_condiciones.find({
  ubicacion: {
    $geoWithin: { 
      $centerSphere: [ [ -98.6368944, 19.1575028 ], 500 / 6378100 ] 
    }
  }
}).explain("executionStats")

//telemetría temporal antes del indice
db.telemetria.find({ 
  "meta.expedicionId": "EXP-IZTA-01", 
  "timestamp": { 
    $gte: ISODate("2026-08-22T05:00:00Z"), 
    $lt: ISODate("2026-08-22T08:00:00Z")
  } 
}).sort({ "timestamp": 1 }).explain("executionStats")

//búsqueda de texto mediante expresión regular antes del indice
db.bitacora_condiciones.find({
  "expedicionId": "EXP-IZTA-01",
  "texto_nota": { $regex: /rocas/i }
}).explain("executionStats")

//Creación de Indices
//indice compuesto para telemetría
db.bitacora_condiciones.createIndex({ "ubicacion": "2dsphere" }, { name: "idx_bitacora_geo" })
//Reestructuración del índice de telemetría
db.telemetria.dropIndex("idx_telemetria_exp_tiempo")
db.telemetria.createIndex({ "ubicacion": "2dsphere", "meta.expedicionId": 1, "timestamp": 1 }, { name: "idx_telemetria_exp_geo_tiempo" })

//indice geoespacial para la bitácora
db.bitacora_condiciones.createIndex({ "ubicacion": "2dsphere" }, { name: "idx_bitacora_geo" })

//indice para busqueda textual
db.bitacora_condiciones.createIndex({ "expedicionId": 1, "texto_nota": "text" },{ name: "idx_bitacora_texto" })


//Configuración de Reglas $jsonSchema
//Validador estricto para la colección de telemetría
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


// Pruebas del validador de telemetria

// 1. Caso Válido: Datos correctos dentro de rangos
db.telemetria.insertOne({
  timestamp: ISODate("2026-08-22T06:00:00Z"),
  ubicacion: { type: "Point", coordinates: [-98.63, 19.15] },
  elevacion: 3500,
  meta: { expedicionId: "EXP-IZTA-01" }
})

// 2. Caso Válido: Incluyendo campo opcional (bateriaDispositivo)
db.telemetria.insertOne({
  timestamp: ISODate("2026-08-22T06:05:00Z"),
  ubicacion: { type: "Point", coordinates: [-98.64, 19.16] },
  elevacion: 3550,
  meta: { expedicionId: "EXP-IZTA-01", bateriaDispositivo: 85 }
})

// 3. Caso Inválido: Falta el campo obligatorio 'elevacion' (Debe arrojar WriteError)
db.telemetria.insertOne({
  timestamp: ISODate("2026-08-22T06:10:00Z"),
  ubicacion: { type: "Point", coordinates: [-98.65, 19.17] },
  meta: { expedicionId: "EXP-IZTA-01" }
})

// 4. Caso Inválido: Formato incorrecto en expedicionId (minúsculas, no cumple patrón)
db.telemetria.insertOne({
  timestamp: ISODate("2026-08-22T06:15:00Z"),
  ubicacion: { type: "Point", coordinates: [-98.66, 19.18] },
  elevacion: 3500,
  meta: { expedicionId: "expedicion-mala" }
})

// 5. Caso Inválido: Longitud fuera de rango permitido [-180, 180]
db.telemetria.insertOne({
  timestamp: ISODate("2026-08-22T06:20:00Z"),
  ubicacion: { type: "Point", coordinates: [200.0, 19.19] },
  elevacion: 3500,
  meta: { expedicionId: "EXP-IZTA-01" }
})

// 6. Caso Inválido: Elevación superior al límite terrestre físico (8848 m)
db.telemetria.insertOne({
  timestamp: ISODate("2026-08-22T06:25:00Z"),
  ubicacion: { type: "Point", coordinates: [-98.68, 19.20] },
  elevacion: 9500,
  meta: { expedicionId: "EXP-IZTA-01" }
})

//validador para admitir Point y Polygon en la bitácora
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


// Pruebas del validador de bitácora
// 1. Válido: Inserción de un Polígono correcto (Área de riesgo del Arenal)
db.bitacora_condiciones.insertOne({
  expedicionId: "EXP-IZTA-01",
  timestamp: ISODate("2026-08-22T08:00:00Z"),
  ubicacion: {
    type: "Polygon",
    coordinates: [
      [
        [-98.64500, 19.12800],
        [-98.64300, 19.12800],
        [-98.64300, 19.13000],
        [-98.64500, 19.13000],
        [-98.64500, 19.12800]
      ]
    ]
  },
  texto_nota: "Área completa de riesgo por caída de rocas",
  etiquetas: ["riesgo", "rocas", "area"]
})

// 2. Inválido: Valor de 'type' incorrecto ("Punto" en lugar de "Point")
db.bitacora_condiciones.insertOne({
  ubicacion: {
    type: "Punto",
    coordinates: [-98.645, 19.128]
  },
  texto_nota: "Error por tipo de geometría"
})

// 3. Inválido: Coordenadas enviadas como tipo string en lugar de numérico
db.bitacora_condiciones.insertOne({
  ubicacion: {
    type: "Point",
    coordinates: ["-98.645", "19.128"]
  },
  texto_nota: "Error por coordenadas en texto"
})

// 4. Inválido: Latitud fuera del intervalo físico permitido [-90, 90] (Latitud 95.125)
db.bitacora_condiciones.insertOne({
  ubicacion: {
    type: "Point",
    coordinates: [-98.643, 95.125]
  },
  texto_nota: "Error por latitud fuera de rango"
})

// 5. Inválido:  El anillo no cumple con la estructura requerida para un polígono GeoJSON cerrado.
db.bitacora_condiciones.insertOne({
  "ubicacion": {
    "type": "Polygon",
    "coordinates": [ [ [-98.64, 19.12], [-98.63, 19.12], [-98.63, 19.13] ] ]
  },
  "texto_nota": "Error"
})


//Consultas Especializadas y Análisis Espacial
//proximidad a refugios con filtros temáticos
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

//Consulta de geofencing (pertenencia a zona de riesgo)
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

//Consulta de desviación de ruta
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

//Pipeline de activación de alertas y contactos de emergencia autorizados
db.bitacora_condiciones.aggregate([
  {
    $match: {
      "etiquetas": "area",
      "ubicacion": {
        $geoIntersects: {
          $geometry: {
            type: "Point",
            coordinates: [-98.64320, 19.12560]
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

// Análisis Temporal (Evolución y desnivel ganado por hora)
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

// Búsqueda Textual formal de riesgos
db.bitacora_condiciones.find({
  "expedicionId": "EXP-IZTA-01",
  $text: { $search: "rocas hielo -despejado" }
})

// Creación de roles de seguridad
db.createRole({
   role: "ingresoTelemetriaRole",
   privileges: [
     { resource: { db: "proyecto_montana", collection: "telemetria" }, actions: ["insert"] }
   ],
   roles: []
})

db.createRole({
   role: "usuarioMontanistaRole",
   privileges: [
     { resource: { db: "proyecto_montana", collection: "expediciones" }, actions: ["find"] },
     { resource: { db: "proyecto_montana", collection: "bitacora_condiciones" }, actions: ["find"] },
     { resource: { db: "proyecto_montana", collection: "telemetria" }, actions: ["find"] }
   ],
   roles: []
})

db.createRole({
   role: "operadorRescateRole",
   privileges: [
     { resource: { db: "proyecto_montana", collection: "expediciones" }, actions: ["find"] },
     { resource: { db: "proyecto_montana", collection: "bitacora_condiciones" }, actions: ["find"] },
     { resource: { db: "proyecto_montana", collection: "telemetria" }, actions: ["find"] }
   ],
   roles: []
})


db.getRoles({ showPrivileges: true })