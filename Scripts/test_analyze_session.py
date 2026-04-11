"""
test_analyze_session.py — Tests para analyze_session.py
Ejecutar: python Scripts/test_analyze_session.py
"""
import sys
import os
import json
import tempfile
import unittest

# Añadir Scripts/ al path para importar analyze_session
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import analyze_session

# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_sample(motor_load=75.0, speed=8.0, rpm=1800, accelerator=80.0,
                 fuel=12.0, slip=2.0, axle_ratio=0.55, campo=13,
                 work_type='HARVESTER', tractor='MF 8570'):
    """Genera una muestra JSONL mínima válida."""
    return {
        'tractorId':      tractor,
        'workType':       work_type,
        'campo':          campo,
        'motorLoad':      motor_load,
        'speed':          speed,
        'rpm':            rpm,
        'accelerator':    accelerator,
        'fuelUsage':      fuel,
        'wheelSlipRL':    slip,
        'frontAxleRatio': axle_ratio,
        'pitch':          0.0,
        'roll':           0.0,
        'torque':         350.0,
        'ts':             1744300000,
    }

def _write_jsonl(samples):
    """Escribe muestras en un archivo temporal y devuelve la ruta."""
    f = tempfile.NamedTemporaryFile(mode='w', suffix='.jsonl',
                                   delete=False, encoding='utf-8')
    for s in samples:
        f.write(json.dumps(s) + '\n')
    f.close()
    return f.name

def _analyze(samples):
    """Ejecuta analyze() capturando stdout."""
    import io
    from contextlib import redirect_stdout
    path = _write_jsonl(samples)
    buf = io.StringIO()
    try:
        with redirect_stdout(buf):
            analyze_session.analyze(path)
    finally:
        os.unlink(path)
    return json.loads(buf.getvalue())


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestAnalyzeBasic(unittest.TestCase):

    def test_muestra_count(self):
        """samples debe ser igual al número de líneas."""
        data = [_make_sample() for _ in range(50)]
        result = _analyze(data)
        self.assertEqual(result['samples'], 50)

    def test_parse_errors_cero(self):
        """No debe haber errores de parseo con muestras válidas."""
        data = [_make_sample() for _ in range(30)]
        result = _analyze(data)
        self.assertEqual(result['parse_errors'], 0)

    def test_archivo_vacio(self):
        """Un archivo sin muestras debe devolver error, no excepción."""
        result = _analyze([])
        self.assertIn('error', result)

    def test_work_type_y_vehicle(self):
        """work_type y vehicle se extraen de la última muestra."""
        data = [_make_sample(work_type='SOWER', tractor='Fendt 900')]
        result = _analyze(data)
        self.assertEqual(result['work_type'], 'SOWER')
        self.assertEqual(result['vehicle'], 'Fendt 900')

    def test_campo_principal(self):
        """campo_principal es el último campo activo."""
        data = [_make_sample(campo=5)] * 10 + [_make_sample(campo=13)] * 10
        result = _analyze(data)
        self.assertEqual(result['campo'], 13)


class TestAnalyzePromedios(unittest.TestCase):

    def test_avg_motor_load(self):
        """Promedio de motor_load con valores conocidos."""
        loads = [60.0, 70.0, 80.0, 90.0]  # promedio = 75.0
        data = [_make_sample(motor_load=l) for l in loads]
        result = _analyze(data)
        self.assertAlmostEqual(result['avg_motor_load'], 75.0, places=1)

    def test_avg_speed(self):
        """Promedio de velocidad."""
        data = [_make_sample(speed=6.0)] * 5 + [_make_sample(speed=10.0)] * 5
        result = _analyze(data)
        self.assertAlmostEqual(result['avg_speed_kmh'], 8.0, places=1)

    def test_avg_rpm(self):
        """avg_rpm debe ser entero."""
        data = [_make_sample(rpm=1900) for _ in range(20)]
        result = _analyze(data)
        self.assertEqual(result['avg_rpm'], 1900)
        self.assertIsInstance(result['avg_rpm'], int)

    def test_peak_load(self):
        """peak_load_pct debe ser el máximo."""
        data = [_make_sample(motor_load=l) for l in [50, 70, 95, 60]]
        result = _analyze(data)
        self.assertAlmostEqual(result['peak_load_pct'], 95.0, places=1)

    def test_total_fuel(self):
        """total_fuel_l = avg_fuel * n / 3600."""
        n = 3600  # exactamente 1 hora
        data = [_make_sample(fuel=15.0) for _ in range(n)]
        result = _analyze(data)
        self.assertAlmostEqual(result['total_fuel_l'], 15.0, delta=0.1)


class TestRecomendacionAcelerador(unittest.TestCase):

    def test_zona_optima_con_suficientes_datos(self):
        """Si hay >=10 muestras en zona 70-85%, recommended_accelerator = media de esas muestras."""
        # 20 muestras en zona óptima (load=77) con acelerador=85
        optimas  = [_make_sample(motor_load=77.0, accelerator=85.0) for _ in range(20)]
        # 5 muestras fuera de zona con acelerador diferente
        fuera    = [_make_sample(motor_load=40.0, accelerator=50.0) for _ in range(5)]
        result   = _analyze(optimas + fuera)
        self.assertAlmostEqual(result['recommended_accelerator'], 85.0, places=1)

    def test_zona_optima_sin_suficientes_datos(self):
        """Con <10 muestras en zona óptima, devuelve percentil 85 del acelerador."""
        # Solo 5 muestras en zona óptima
        data = [_make_sample(motor_load=77.0, accelerator=90.0) for _ in range(5)] + \
               [_make_sample(motor_load=40.0, accelerator=60.0) for _ in range(40)]
        result = _analyze(data)
        # No None — siempre devuelve algún valor (p85)
        self.assertIsNotNone(result['recommended_accelerator'])

    def test_acelerador_negativo_tratado_como_cero(self):
        """Valores None o 0 en accelerator no deben romper el análisis."""
        data = [_make_sample(accelerator=0.0) for _ in range(20)]
        result = _analyze(data)
        self.assertIsNotNone(result)
        self.assertGreaterEqual(result['avg_accelerator'], 0)


class TestDistribuciones(unittest.TestCase):

    def test_load_dist_suma_100(self):
        """Los buckets de carga deben sumar aproximadamente 100%."""
        data = [_make_sample(motor_load=l) for l in
                [10, 20, 45, 55, 65, 75, 85, 95]]
        result = _analyze(data)
        total = sum(result['load_dist'].values())
        self.assertAlmostEqual(total, 100, delta=2)

    def test_speed_dist_parado(self):
        """Todas las muestras paradas → parado_pct = 100."""
        data = [_make_sample(speed=0.0) for _ in range(20)]
        result = _analyze(data)
        self.assertEqual(result['speed_dist']['parado_pct'], 100)

    def test_accel_dist_full_throttle(self):
        """Acelerador siempre >= 85 → full_pct = 100."""
        data = [_make_sample(accelerator=100.0) for _ in range(20)]
        result = _analyze(data)
        self.assertEqual(result['accel_dist']['full_pct'], 100)


class TestSaveProfile(unittest.TestCase):

    def test_guarda_perfil(self):
        """_save_profile crea la entrada correcta en el JSON."""
        result = {
            'campo': 7, 'work_type': 'HARVESTER', 'samples': 100,
            'avg_motor_load': 78.5, 'avg_speed_kmh': 7.2,
            'avg_fuel_lh': 14.3, 'avg_rpm': 1850,
            'recommended_accelerator': 83.0, 'vehicle': 'MF 8570',
        }
        with tempfile.NamedTemporaryFile(suffix='.json', delete=False) as f:
            path = f.name
        try:
            os.unlink(path)  # _save_profile debe crearlo
            profile = analyze_session._save_profile(result, path)
            self.assertIsNotNone(profile)
            assert profile is not None
            self.assertEqual(profile['campo'], 7)
            self.assertEqual(profile['sessions'], 1)
            self.assertEqual(profile['total_samples'], 100)
            self.assertAlmostEqual(profile['recommended_accelerator'], 83.0, places=1)
        finally:
            if os.path.exists(path):
                os.unlink(path)

    def test_promedio_ponderado_dos_sesiones(self):
        """Segunda sesión hace promedio ponderado correcto con la primera."""
        # Sesión 1: 100 muestras, avg_load=70
        r1 = {'campo': 3, 'work_type': 'SOWER', 'samples': 100,
              'avg_motor_load': 70.0, 'avg_speed_kmh': 6.0,
              'avg_fuel_lh': 10.0, 'avg_rpm': 1700,
              'recommended_accelerator': 70.0, 'vehicle': 'MF'}
        # Sesión 2: 100 muestras, avg_load=90
        r2 = {'campo': 3, 'work_type': 'SOWER', 'samples': 100,
              'avg_motor_load': 90.0, 'avg_speed_kmh': 6.0,
              'avg_fuel_lh': 14.0, 'avg_rpm': 1900,
              'recommended_accelerator': 90.0, 'vehicle': 'MF'}
        with tempfile.NamedTemporaryFile(suffix='.json', delete=False) as f:
            path = f.name
        try:
            os.unlink(path)
            analyze_session._save_profile(r1, path)
            profile2 = analyze_session._save_profile(r2, path)
            self.assertIsNotNone(profile2)
            assert profile2 is not None
            # Promedio ponderado = (70*100 + 90*100) / 200 = 80.0
            self.assertAlmostEqual(profile2['avg_motor_load'], 80.0, places=1)
            self.assertEqual(profile2['sessions'], 2)
            self.assertEqual(profile2['total_samples'], 200)
        finally:
            if os.path.exists(path):
                os.unlink(path)

    def test_sesion_corta_no_guarda(self):
        """Sesiones con <30 muestras no se guardan en el perfil."""
        result = {'campo': 1, 'work_type': 'HARVESTER', 'samples': 10,
                  'avg_motor_load': 75.0, 'avg_speed_kmh': 7.0,
                  'avg_fuel_lh': 12.0, 'avg_rpm': 1800,
                  'recommended_accelerator': 80.0, 'vehicle': 'X'}
        with tempfile.NamedTemporaryFile(suffix='.json', delete=False) as f:
            path = f.name
        try:
            profile = analyze_session._save_profile(result, path)
            self.assertIsNone(profile)
        finally:
            os.unlink(path)


class TestConDatosReales(unittest.TestCase):
    """Usa los JSONL de Data/sessions/ si están disponibles."""

    SESSIONS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                '..', 'Data', 'sessions')

    def _find_jsonl(self):
        files = []
        for root, _, fnames in os.walk(self.SESSIONS_DIR):
            for fn in fnames:
                if fn.endswith('.jsonl'):
                    files.append(os.path.join(root, fn))
        return files

    def test_datos_reales_si_existen(self):
        """Analiza todos los archivos JSONL reales y verifica invariantes."""
        files = self._find_jsonl()
        if not files:
            self.skipTest('No hay archivos .jsonl en Data/sessions/')

        for filepath in files:
            with self.subTest(file=os.path.basename(filepath)):
                import io
                from contextlib import redirect_stdout
                buf = io.StringIO()
                with redirect_stdout(buf):
                    analyze_session.analyze(filepath)
                result = json.loads(buf.getvalue())

                self.assertNotIn('error', result, f"Error en {filepath}: {result.get('error')}")
                self.assertGreater(result['samples'], 0)
                self.assertGreaterEqual(result['avg_motor_load'], 0)
                self.assertLessEqual(result['avg_motor_load'], 125)   # MR permite hasta 125%
                self.assertGreaterEqual(result['avg_speed_kmh'], 0)
                self.assertGreaterEqual(result['avg_rpm'], 0)
                self.assertGreaterEqual(result['total_fuel_l'], 0)
                # Los buckets de carga deben sumar ~100
                total_dist = sum(result['load_dist'].values())
                self.assertAlmostEqual(total_dist, 100, delta=2)


if __name__ == '__main__':
    unittest.main(verbosity=2)
