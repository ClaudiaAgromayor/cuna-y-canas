"""Publica la web (web/dist) en Object Storage de Oracle Cloud.

Uso (desde la raíz, con la herramienta de Oracle en su propio entorno):
    cd web && npm run build && cd ..
    .venv-oci\\Scripts\\python despliegue\\oracle.py

Cada archivo se sube comprimido (gzip) con su tipo y su caché, y solo si ha cambiado.
La configuración y la clave privada se leen de %USERPROFILE%\\.oci\\ (nunca del repositorio).
"""
import base64
import gzip
import hashlib
import sys
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import oci

RAIZ = Path(__file__).resolve().parents[1]
ORIGEN = RAIZ / "web" / "dist"
BUCKET = "cuna-y-canas"
TIPOS = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".geojson": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
}


def cache(nombre: str) -> str:
    # los paquetes de assets llevan huella en el nombre: se pueden guardar para siempre
    return "public, max-age=31536000, immutable" if nombre.startswith("assets/") else "public, max-age=300"


def main() -> None:
    if not (ORIGEN / "index.html").exists():
        sys.exit("Falta web/dist: ejecuta antes `npm run build` en web/")
    config = oci.config.from_file()
    cliente = oci.object_storage.ObjectStorageClient(config)
    ns = cliente.get_namespace().data

    existentes = {o.name: o.md5 for o in oci.pagination.list_call_get_all_results(
        cliente.list_objects, ns, BUCKET, fields="name,md5").data.objects}

    archivos = sorted(p for p in ORIGEN.rglob("*") if p.is_file())
    pendientes = []
    for p in archivos:
        nombre = p.relative_to(ORIGEN).as_posix()
        datos = gzip.compress(p.read_bytes(), compresslevel=9, mtime=0)
        md5 = base64.b64encode(hashlib.md5(datos).digest()).decode()
        if existentes.get(nombre) != md5:
            pendientes.append((nombre, datos, md5))

    print(f"{len(archivos)} archivos; {len(pendientes)} nuevos o cambiados")

    hilo = threading.local()  # un cliente por hilo

    def subir(nombre: str, datos: bytes, md5: str) -> None:
        if not hasattr(hilo, "c"):
            hilo.c = oci.object_storage.ObjectStorageClient(config)
        hilo.c.put_object(ns, BUCKET, nombre, datos, content_md5=md5,
                           content_type=TIPOS.get(Path(nombre).suffix, "application/octet-stream"),
                           content_encoding="gzip", cache_control=cache(nombre))

    with ThreadPoolExecutor(16) as ex:
        futuros = {ex.submit(subir, *x): x[0] for x in pendientes}
        for i, f in enumerate(as_completed(futuros), 1):
            f.result()
            if i % 250 == 0 or i == len(futuros):
                print(f"  subidos {i}/{len(futuros)}")

    region = config["region"]
    print(f"\nWeb: https://objectstorage.{region}.oraclecloud.com/n/{ns}/b/{BUCKET}/o/index.html")


if __name__ == "__main__":
    main()
