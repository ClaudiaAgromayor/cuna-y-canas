"""Vuelve a calcular la demanda de todos los municipios ya procesados (después de recalibrar etl/modelo_poblacion.py).

Uso: python etl/lote_demanda.py
"""
import sys
import time

from comun import PROCESSED, resolver_municipio
from demanda import procesar

fallos = []
carpetas = sorted(d for d in PROCESSED.iterdir() if d.is_dir() and d.name[:3].isdigit())
for i, d in enumerate(carpetas, 1):
    t = time.time()
    try:
        procesar(resolver_municipio(d.name[:3]))
        print(f"{i:3d}/{len(carpetas)} {d.name} ok ({time.time() - t:.0f} s)", flush=True)
    except Exception as e:  # un municipio que falla no debe parar a los demás
        fallos.append((d.name, repr(e)))
        print(f"{i:3d}/{len(carpetas)} {d.name} FALLO {e!r}", flush=True)
print("fallos:", fallos)
sys.exit(1 if fallos else 0)
