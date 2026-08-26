import xml.etree.ElementTree as ET
import json
import os


def generar_documento_expedicion(archivo_gpx, expedicion_id, montanista_id, nombre_expedicion, fecha_planeada,
                                 archivo_salida):
    try:
        arbol = ET.parse(archivo_gpx)
        raiz = arbol.getroot()
    except FileNotFoundError:
        print(f"Error: No se encontró el archivo '{archivo_gpx}'.")
        return


    ns = {'gpx': 'http://www.topografix.com/GPX/1/1'}

    coordenadas_planeadas = []


    puntos = raiz.findall('.//gpx:trkpt', ns)
    print(f"Procesando {len(puntos)} puntos para la ruta planeada...")

    for trkpt in puntos:
        lat = float(trkpt.attrib['lat'])
        lon = float(trkpt.attrib['lon'])
        coordenadas_planeadas.append([lon, lat])


    documento_expedicion = {
        "_id": expedicion_id,
        "montanistaId": montanista_id,
        "nombreExpedicion": nombre_expedicion,
        "fechaPlaneada": {
            "$date": fecha_planeada
        },
        "rutaPlaneada": {
            "type": "LineString",
            "coordinates": coordenadas_planeadas
        }
    }


    with open(archivo_salida, 'w', encoding='utf-8') as f:
        json.dump(documento_expedicion, f, indent=2, ensure_ascii=False)

    print(f"Documento de expedición guardado en: {os.path.abspath(archivo_salida)}")


generar_documento_expedicion(
     archivo_gpx="la-joya-refugio-de-los-100-ex-refugio-luis-mendez.gpx",
     expedicion_id="EXP-IZTA-01",
     montanista_id="USER-JORGE",
     nombre_expedicion="Cumbre - Rodilla",
     fecha_planeada="2026-08-22T02:00:00Z",
     archivo_salida="Documento_expedicion.json"
 )