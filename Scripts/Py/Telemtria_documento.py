import xml.etree.ElementTree as ET
import json
import os


def procesar_telemetria_gpx(archivo_gpx, expedicion_id, archivo_salida, objetivo_puntos=8000):
    try:
        arbol = ET.parse(archivo_gpx)
        raiz = arbol.getroot()
    except FileNotFoundError:
        print(f"Error: No se encontró el archivo '{archivo_gpx}'.")
        return

    ns = {'gpx': 'http://www.topografix.com/GPX/1/1'}

    puntos = raiz.findall('.//gpx:trkpt', ns)
    total_original = len(puntos)
    print(f"Total de puntos originales en el GPX: {total_original}")

    if total_original > objetivo_puntos:
        paso = max(1, total_original // objetivo_puntos)
    else:
        paso = 1

    puntos_filtrados = puntos[::paso]
    print(f"Aplicando muestreo (tomando 1 de cada {paso} puntos)...")
    print(f"Total de documentos que se generarán: {len(puntos_filtrados)}")

    documentos_telemetria = []

    for trkpt in puntos_filtrados:
        lat = float(trkpt.attrib['lat'])
        lon = float(trkpt.attrib['lon'])

        ele_node = trkpt.find('gpx:ele', ns)
        time_node = trkpt.find('gpx:time', ns)

        elevacion = float(ele_node.text) if ele_node is not None else 0.0
        tiempo = time_node.text if time_node is not None else "1970-01-01T00:00:00Z"

        doc_ping = {
            "timestamp": {
                "$date": tiempo
            },
            "meta": {
                "expedicionId": expedicion_id
            },
            "ubicacion": {
                "type": "Point",
                "coordinates": [lon, lat]  # Estricto orden GeoJSON: [longitud, latitud]
            },
            "elevacion": elevacion
        }
        documentos_telemetria.append(doc_ping)

    # Guardar todos los documentos en un archivo JSON masivo
    with open(archivo_salida, 'w', encoding='utf-8') as f:
        json.dump(documentos_telemetria, f, indent=2, ensure_ascii=False)

    print(f"Archivo de telemetría guardado en: {os.path.abspath(archivo_salida)}")

# --- Instrucciones de uso ---
procesar_telemetria_gpx(
     archivo_gpx="Primera_rodilla_de_Iztaccíhuatl.gpx",
     expedicion_id="EXP-IZTA-01",
     archivo_salida="telemetria_8mil_puntos.json",
     objetivo_puntos=8000
 )