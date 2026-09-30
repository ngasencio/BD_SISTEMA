#!/usr/bin/env python3
"""Valida graph.json y genera mapa-sistema.html a partir de la plantilla.

Uso:
    python build_graph.py

Flujo para agregar un componente nuevo al mapa: editar graph.json (ver
00-resumen.md, seccion "Como regenerar este mapa"), crear su nodos/<id>.md,
y volver a correr este script. No se edita mapa-sistema.html a mano nunca:
se sobrescribe por completo en cada corrida.
"""
import json
import re
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
GRAPH_PATH = BASE_DIR / "graph.json"
TEMPLATE_PATH = BASE_DIR / "mapa-sistema.template.html"
OUTPUT_PATH = BASE_DIR / "mapa-sistema.html"

HEX_COLOR_RE = re.compile(r'^#[0-9a-fA-F]{6}$')
MAX_LABEL_LEN = 22

# Patrones de secretos. El patron de "token" del prompt original se adapto
# para exigir una asignacion con un valor largo (token[:=]"XXXXXXXXXXXXXXX"),
# en vez de la palabra suelta "token": este mapa describe deliberadamente el
# uso de JWT en varios nodos (ej. backend-auth) y un match por substring
# bloquearia el build por documentacion legitima, no por un secreto real.
SECRET_PATTERNS = [
    ("password= literal", re.compile(r'password\s*=\s*[\'"]?\S')),
    ("api key", re.compile(r'api[_-]?key\s*[:=]\s*[\'"]?\S', re.IGNORECASE)),
    ("Bearer token", re.compile(r'Bearer\s+[A-Za-z0-9._-]{10,}')),
    ("token con valor largo", re.compile(r'token[\'"]?\s*[:=]\s*[\'"][A-Za-z0-9._-]{15,}', re.IGNORECASE)),
    ("IP privada 10.x", re.compile(r'\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b')),
    ("IP privada 192.168.x", re.compile(r'\b192\.168\.\d{1,3}\.\d{1,3}\b')),
    ("IP privada 172.16-31.x", re.compile(r'\b172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}\b')),
    ("RUT chileno", re.compile(r'\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b')),
]


def fail(msg: str):
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def cargar_grafo() -> dict:
    if not GRAPH_PATH.exists():
        fail(f"No se encontro {GRAPH_PATH}")
    try:
        return json.loads(GRAPH_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        fail(f"graph.json no es JSON valido: {e}")


def validar(grafo: dict):
    errores = []
    clusters = grafo.get("clusters", {})
    nodes = grafo.get("nodes", [])
    edges = grafo.get("edges", [])

    ids = [n.get("id") for n in nodes]
    if len(ids) != len(set(ids)):
        dup = sorted({i for i in ids if ids.count(i) > 1})
        errores.append(f"IDs de nodo duplicados: {dup}")
    node_ids = set(ids)

    for cid, c in clusters.items():
        color = c.get("color", "")
        if not HEX_COLOR_RE.match(color):
            errores.append(f"Cluster '{cid}' tiene un color invalido: '{color}'")

    for n in nodes:
        if n.get("cluster") not in clusters:
            errores.append(f"Nodo '{n.get('id')}' referencia un cluster inexistente: '{n.get('cluster')}'")
        label = n.get("label", "")
        if len(label) > MAX_LABEL_LEN:
            errores.append(f"Nodo '{n.get('id')}' tiene un label de mas de {MAX_LABEL_LEN} caracteres: '{label}'")
        md_path = n.get("md")
        if md_path and not (BASE_DIR / md_path).exists():
            errores.append(f"Nodo '{n.get('id')}' referencia un archivo md inexistente: '{md_path}'")

    for e in edges:
        if e.get("a") not in node_ids:
            errores.append(f"Arista con origen inexistente: '{e.get('a')}' -> '{e.get('b')}'")
        if e.get("b") not in node_ids:
            errores.append(f"Arista con destino inexistente: '{e.get('a')}' -> '{e.get('b')}'")

    conectados = set()
    for e in edges:
        conectados.add(e.get("a"))
        conectados.add(e.get("b"))
    huerfanos = node_ids - conectados
    if huerfanos:
        print(f"AVISO: nodos sin ninguna conexion: {sorted(huerfanos)}")

    if errores:
        for err in errores:
            print(f"ERROR: {err}", file=sys.stderr)
        sys.exit(1)


def buscar_secretos(texto_json: str):
    hallados = []
    for nombre, patron in SECRET_PATTERNS:
        for m in patron.finditer(texto_json):
            hallados.append((nombre, m.group(0)))
    return hallados


def generar_html(grafo: dict):
    if not TEMPLATE_PATH.exists():
        fail(f"No se encontro la plantilla {TEMPLATE_PATH}")
    template = TEMPLATE_PATH.read_text(encoding="utf-8")
    marcador = '<script id="graph-data" type="application/json">'
    if marcador not in template:
        fail(f"La plantilla no tiene el marcador {marcador!r}")

    payload = json.dumps(grafo, ensure_ascii=False, indent=2)
    cierre = "</script>"
    inicio = template.index(marcador) + len(marcador)
    fin = template.index(cierre, inicio)
    html_final = template[:inicio] + "\n" + payload + "\n" + template[fin:]
    OUTPUT_PATH.write_text(html_final, encoding="utf-8")
    print(f"OK: {OUTPUT_PATH.name} generado ({len(html_final)} bytes)")


def main():
    grafo = cargar_grafo()
    validar(grafo)

    texto_json = json.dumps(grafo, ensure_ascii=False)
    hallados = buscar_secretos(texto_json)
    if hallados:
        print("ERROR: se detectaron posibles secretos en graph.json:", file=sys.stderr)
        for nombre, fragmento in hallados:
            print(f"  - {nombre}: {fragmento!r}", file=sys.stderr)
        sys.exit(1)

    print(
        f"OK: graph.json valido — {len(grafo['nodes'])} nodos, "
        f"{len(grafo['edges'])} aristas, {len(grafo['clusters'])} clusters"
    )
    generar_html(grafo)


if __name__ == "__main__":
    main()
