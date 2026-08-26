import xml.etree.ElementTree as ET
import json
import os


def procesar_bitacora_gpx(archivo_gpx, expedicion_id, archivo_salida):
    try:
        arbol = ET.parse(archivo_gpx)
        raiz = arbol.getroot()
    except FileNotFoundError:
        print(f"Error: No se encontró el archivo '{archivo_gpx}'.")
        return

    ns = {'gpx': 'http://www.topografix.com/GPX/1/1'}

    waypoints = raiz.findall('.//gpx:wpt', ns)
    print(f"Se encontraron {len(waypoints)} waypoints para la bitácora.")

    documentos_bitacora = []

    for wpt in waypoints:
        lat = float(wpt.attrib['lat'])
        lon = float(wpt.attrib['lon'])

        name_node = wpt.find('gpx:name', ns)
        desc_node = wpt.find('gpx:desc', ns)
        time_node = wpt.find('gpx:time', ns)

        titulo = name_node.text if name_node is not None else "Nota de campo"
        descripcion = desc_node.text if desc_node is not None else "Sin descripción"
        tiempo = time_node.text if time_node is not None else "2026-08-22T08:00:00Z"

        doc_nota = {
            "expedicionId": expedicion_id,
            "timestamp": {
                "$date": tiempo
            },
            "ubicacion": {
                "type": "Point",
                "coordinates": [lon, lat]
            },
            "texto_nota": f"{titulo}: {descripcion}",
            "etiquetas": ["campo", "referencia"]
        }
        documentos_bitacora.append(doc_nota)

    with open(archivo_salida, 'w', encoding='utf-8') as f:
        json.dump(documentos_bitacora, f, indent=2, ensure_ascii=False)

    print(f"Bitácora guardada en: {os.path.abspath(archivo_salida)}")

procesar_bitacora_gpx("la-joya-refugio-de-los-100-ex-refugio-luis-mendez.gpx", "EXP-IZTA-01", "bitacora_documentos.json")