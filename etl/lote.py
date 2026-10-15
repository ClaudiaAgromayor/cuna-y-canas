"""Ejecuta el pipeline completo para muchos municipios seguidos y deja un registro.

Uso: python etl/lote.py               (todos los municipios de la Comunidad salvo Madrid capital)
     python etl/lote.py 065 096 015   (solo esos)
     python etl/lote.py --forzar      (repite también los ya procesados)

Madrid capital (079) se excluye: el planeamiento refundido de la IDEM no la incluye.
Un municipio ya procesado (tiene demanda.json) se salta salvo con --forzar.
El registro queda en data/raw/lote.log; al final se regenera data/processed/municipios.json.
"""
import sys
import time

import pipeline
from comun import PROCESSED, RAW, descargar_ckan, leer_csv, resolver_municipio

EXCLUIR = {"079"}


def todos_los_codigos() -> list[str]:
    pob = leer_csv(descargar_ckan("poblacion_censada_por_edad_nacionalidad_y_sexo", RAW / "ckan" / "poblacion_censada_edad.csv"))
    return sorted(set(pob.loc[pob["Tipo territorio"] == "Municipios", "Codigo territorio"].str[:3]) - EXCLUIR)


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    forzar = "--forzar" in sys.argv
    codigos = args or todos_los_codigos()
    log = (RAW / "lote.log").open("a", encoding="utf-8")
    t0 = time.time()
    for k, cod in enumerate(codigos, 1):
        m = resolver_municipio(cod)
        if not forzar and (PROCESSED / f"{m['cod']}-{m['slug']}" / "demanda.json").exists():
            continue
        t = time.time()
        try:
            ok = pipeline.ejecutar(m)
        except Exception as e:  # noqa: BLE001 - un municipio que falla no detiene el lote
            ok = False
            print(f"  ERROR {type(e).__name__}: {e}")
        linea = f"{time.strftime('%H:%M:%S')} [{k}/{len(codigos)}] {m['cod']} {m['nombre']}: {'ok' if ok else 'con fallos'} ({time.time() - t:.0f} s)"
        print(linea, flush=True)
        log.write(linea + "\n"); log.flush()
    pipeline.indice()
    print(f"Lote terminado en {(time.time() - t0) / 60:.0f} min")
