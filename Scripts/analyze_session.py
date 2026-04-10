"""
analyze_session.py — Análisis de sesión de telemetría FS25
Uso: python analyze_session.py <ruta_al_archivo.jsonl>
Salida: JSON con estadísticas de la sesión al stdout
"""
import sys
import json
import os
import datetime

def _save_profile(result, profiles_path):
    """Guarda/actualiza el perfil acumulado de campo+workType (promedio ponderado)."""
    campo     = result.get('campo')
    work_type = result.get('work_type', 'UNKNOWN')
    n         = result.get('samples', 0)

    # Ignorar sesiones sin campo asignado o demasiado cortas (<30 muestras)
    if campo is None or n < 30:
        return None

    key = '{}_{}'.format(campo, work_type)

    # Leer perfiles existentes
    profiles = {}
    if os.path.isfile(profiles_path):
        try:
            with open(profiles_path, 'r', encoding='utf-8') as f:
                profiles = json.load(f)
        except (json.JSONDecodeError, IOError):
            profiles = {}

    old   = profiles.get(key, {})
    old_n = old.get('total_samples', 0)
    total_n = old_n + n

    # Promedio ponderado para métricas continuas
    def wmean(old_val, new_val):
        if old_val is None and new_val is None:
            return None
        ov = old_val if old_val is not None else 0
        nv = new_val if new_val is not None else 0
        return round((ov * old_n + nv * n) / total_n, 1) if total_n > 0 else nv

    merged = {
        'campo':                   campo,
        'workType':                work_type,
        'sessions':                old.get('sessions', 0) + 1,
        'total_samples':           total_n,
        'recommended_accelerator': wmean(old.get('recommended_accelerator'), result.get('recommended_accelerator')),
        'avg_motor_load':          wmean(old.get('avg_motor_load'),          result.get('avg_motor_load')),
        'avg_speed_kmh':           wmean(old.get('avg_speed_kmh'),           result.get('avg_speed_kmh')),
        'avg_fuel_lh':             wmean(old.get('avg_fuel_lh'),             result.get('avg_fuel_lh')),
        'avg_rpm':                 int(wmean(old.get('avg_rpm'),             result.get('avg_rpm')) or 0),
        'last_updated':            datetime.date.today().isoformat(),
        'last_vehicle':            result.get('vehicle', '—'),
    }

    profiles[key] = merged

    # Crear directorio si no existe
    os.makedirs(os.path.dirname(os.path.abspath(profiles_path)), exist_ok=True)
    with open(profiles_path, 'w', encoding='utf-8') as f:
        json.dump(profiles, f, ensure_ascii=False, indent=2)

    return merged


def analyze(filepath):
    samples = []
    errors  = 0

    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                samples.append(json.loads(line))
            except json.JSONDecodeError:
                errors += 1

    n = len(samples)
    if n == 0:
        print(json.dumps({"error": "Sin datos en el archivo", "samples": 0}))
        return

    # ── Metadatos ─────────────────────────────────────────────────────────────
    work_type = samples[-1].get('workType', 'UNKNOWN')
    vehicle   = samples[-1].get('tractorId', '—')

    # Campos usados (puede haber varios si el usuario cambió durante la sesión)
    campos_raw = [s.get('campo') for s in samples if s.get('campo') is not None]
    campos_uniq = sorted(set(str(c) for c in campos_raw))
    campo_principal = campos_raw[-1] if campos_raw else None  # último campo activo

    # Duración estimada: 1 muestra/s
    duration_min = round(n / 60, 1)

    # ── Promedios ─────────────────────────────────────────────────────────────
    def avg(key):
        vals = [s[key] for s in samples if key in s and s[key] is not None]
        return round(sum(vals) / len(vals), 1) if vals else 0.0

    def peak(key):
        vals = [s[key] for s in samples if key in s and s[key] is not None]
        return round(max(vals), 1) if vals else 0.0

    avg_speed    = avg('speed')
    avg_load     = avg('motorLoad')
    avg_rpm      = round(avg('rpm'))
    avg_fuel     = avg('fuelUsage')
    avg_slip     = avg('wheelSlipRL')          # trasera izquierda como referencia
    avg_axle     = avg('frontAxleRatio')
    peak_slip    = peak('wheelSlipRL')
    peak_load    = peak('motorLoad')
    avg_accel    = avg('accelerator')          # promedio global del acelerador

    # ── Acelerador recomendado: promedio cuando la carga estaba en zona óptima (70-85%) ──
    # Zona óptima → motor trabajando duro pero sin ahogarse: máxima eficiencia agronómica
    opt_samples = [s for s in samples
                   if 70 <= (s.get('motorLoad') or 0) <= 85
                   and (s.get('accelerator') is not None)]
    if len(opt_samples) >= 10:
        recommended_accel = round(
            sum(s['accelerator'] for s in opt_samples) / len(opt_samples), 1
        )
    else:
        # Pocos datos en zona óptima → usar percentil 85 del acelerador como referencia
        all_accel = sorted(s.get('accelerator', 0) or 0 for s in samples)
        idx = int(len(all_accel) * 0.85)
        recommended_accel = round(all_accel[min(idx, len(all_accel) - 1)], 1) if all_accel else None

    # Zona de trabajo real el acelerador: clasificar muestras según throttle
    accel_full   = sum(1 for s in samples if (s.get('accelerator') or 0) >= 85)
    accel_partial= sum(1 for s in samples if 40 <= (s.get('accelerator') or 0) < 85)
    accel_low    = sum(1 for s in samples if (s.get('accelerator') or 0) < 40)

    # ── Distribución de carga de motor ────────────────────────────────────────
    buckets = {'0-30': 0, '30-60': 0, '60-80': 0, '80-100': 0}
    for s in samples:
        v = s.get('motorLoad', 0) or 0
        if v < 30:
            buckets['0-30'] += 1
        elif v < 60:
            buckets['30-60'] += 1
        elif v < 80:
            buckets['60-80'] += 1
        else:
            buckets['80-100'] += 1

    # Normalizar a porcentaje
    load_dist = {k: round(v * 100 / n) for k, v in buckets.items()}

    # ── Distribución de velocidad (para detectar paradas/cabeceras) ───────────
    stopped   = sum(1 for s in samples if abs(s.get('speed', 0) or 0) < 0.5)
    slow      = sum(1 for s in samples if 0.5 <= abs(s.get('speed', 0) or 0) < 4)
    working   = sum(1 for s in samples if 4   <= abs(s.get('speed', 0) or 0) < 12)
    fast      = sum(1 for s in samples if abs(s.get('speed', 0) or 0) >= 12)

    speed_dist = {
        'parado_pct':   round(stopped * 100 / n),
        'lento_pct':    round(slow    * 100 / n),
        'trabajo_pct':  round(working * 100 / n),
        'transporte_pct': round(fast  * 100 / n),
    }

    # ── Eficiencia: % de muestras con carga > 60 % ───────────────────────────
    high_load_pct = round((buckets['60-80'] + buckets['80-100']) * 100 / n)

    # ── Consumo total estimado ────────────────────────────────────────────────
    # avg_fuel está en L/h, 1 muestra = 1 segundo → L total = avg_fuel * n / 3600
    total_fuel_l = round(avg_fuel * n / 3600, 2)

    result = {
        "samples":          n,
        "parse_errors":     errors,
        "duration_min":     duration_min,
        "work_type":        work_type,
        "vehicle":          vehicle,
        "campo":            campo_principal,
        "campos":           campos_uniq,
        "avg_speed_kmh":    avg_speed,
        "avg_motor_load":   avg_load,
        "avg_rpm":          avg_rpm,
        "avg_fuel_lh":      avg_fuel,
        "avg_slip_pct":     avg_slip,
        "avg_front_axle_ratio": avg_axle,
        "peak_slip_pct":    peak_slip,
        "peak_load_pct":    peak_load,
        "avg_accelerator":  avg_accel,
        "recommended_accelerator": recommended_accel,
        "accel_dist": {
            "full_pct":    round(accel_full    * 100 / n),
            "partial_pct": round(accel_partial * 100 / n),
            "low_pct":     round(accel_low     * 100 / n),
        },
        "load_dist":        load_dist,
        "speed_dist":       speed_dist,
        "high_load_pct":    high_load_pct,
        "total_fuel_l":     total_fuel_l,
    }

    # ── Guardar perfil acumulado campo+workType ───────────────────────────────
    profiles_path = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), '..', 'Data', 'campo_profiles.json'
    )
    result['profile'] = _save_profile(result, profiles_path)

    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Falta argumento: ruta del archivo .jsonl"}))
        sys.exit(1)
    try:
        analyze(sys.argv[1])
    except FileNotFoundError:
        print(json.dumps({"error": "Archivo no encontrado: " + sys.argv[1]}))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
