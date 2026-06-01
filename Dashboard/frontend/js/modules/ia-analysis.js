// ── Análisis de sesión: llama al backend y renderiza resultados ─────────────
window._iaSampleCount  = 0;
window._activoCampo    = -1;   // sincronizado con la selección del usuario

// ── Listar archivos del campo seleccionado ────────────────────────────────
window.loadCampoSessions = function(campo) {
  var campoVal = (campo != null) ? campo : window._activoCampo;
  var panel    = document.getElementById('ia-sessions-panel');
  var listEl   = document.getElementById('ia-sessions-list');
  var titleEl  = document.getElementById('ia-sessions-title');

  if (!panel || !listEl) return;

  if (campoVal == null || campoVal < 0) {
    panel.classList.add('ia-hidden');
    return;
  }

  if (titleEl) titleEl.textContent = 'Archivos — Campo ' + campoVal;
  panel.classList.remove('ia-hidden');
  listEl.innerHTML = '<span class="ia-sessions-empty ia-sessions-loading">Cargando…</span>';

  fetch('/api/analyze/sessions?campo=' + encodeURIComponent(campoVal))
    .then(function(r) { return r.json(); })
    .then(function(d) {
      var files = d.files || [];
      if (files.length === 0) {
        listEl.innerHTML = '<span class="ia-sessions-empty">No hay archivos grabados en este campo.</span>';
        return;
      }
      listEl.innerHTML = '';
      files.forEach(function(f) {
        var kb     = (f.size / 1024).toFixed(1);
        var lines  = Math.round(f.size / 120);  // estimación ~120 bytes/línea
        var dt     = new Date(f.mtime);
        var dateStr = dt.toLocaleDateString('es', {day:'2-digit', month:'2-digit'}) +
                      ' ' + dt.toLocaleTimeString('es', {hour:'2-digit', minute:'2-digit'});

        var row = document.createElement('div');
        row.className = 'ia-session-row';
        row.innerHTML =
          '<span class="ia-session-name" title="' + f.relPath + '">' + f.name + '</span>' +
          '<span class="ia-session-meta">' + dateStr + ' · ~' + lines + ' muestras · ' + kb + ' KB</span>' +
          '<div class="ia-session-actions">' +
            '<button class="ia-session-btn ia-session-analyze" title="Analizar este archivo"' +
              ' onclick="window.runAnalysis(\'' + encodeURIComponent(f.relPath) + '\')">▶ Analizar</button>' +
            '<button class="ia-session-btn ia-session-delete" title="Eliminar"' +
              ' onclick="window.deleteSession(\'' + encodeURIComponent(f.dir) + '\',\'' + encodeURIComponent(f.name) + '\', this)">✕</button>' +
          '</div>';
        listEl.appendChild(row);
      });
    })
    .catch(function(err) {
      listEl.innerHTML = '<span class="ia-sessions-empty">Error al cargar archivos.</span>';
      console.error('loadCampoSessions:', err);
    });
};

// ── Eliminar sesión ────────────────────────────────────────────────────────
window.deleteSession = function(dirEnc, fileEnc, btnEl) {
  var dir  = decodeURIComponent(dirEnc);
  var file = decodeURIComponent(fileEnc);
  if (!confirm('¿Eliminar "' + file + '"? No se puede deshacer.')) return;

  if (btnEl) btnEl.disabled = true;

  fetch('/api/session/file', {
    method:  'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ dir: dir, file: file })
  })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.error) { alert('Error: ' + d.error); if (btnEl) btnEl.disabled = false; return; }
      // Recargar la lista del campo activo
      window.loadCampoSessions();
    })
    .catch(function(err) {
      alert('Error de red: ' + err.message);
      if (btnEl) btnEl.disabled = false;
    });
};

window.runAnalysis = function(relPathEnc) {
  var btn = document.getElementById('ia-analyze-btn');
  var panel = document.getElementById('ia-analysis-panel');
  if (btn)   { btn.disabled = true; btn.textContent = 'Analizando…'; }
  if (panel) { panel.classList.add('ia-hidden'); }

  var url = '/api/analyze';
  if (relPathEnc) {
    url += '?file=' + relPathEnc;
  }

  fetch(url)
    .then(function(r) {
      if (!r.ok) return r.json().then(function(e) { throw new Error(e.error || r.status); });
      return r.json();
    })
    .then(function(d) {
      if (d.error) throw new Error(d.error);
      renderAnalysis(d);
      if (panel) panel.classList.remove('ia-hidden');
    })
    .catch(function(err) {
      alert('No se pudo analizar: ' + err.message);
    })
    .finally(function() {
      if (btn) {
        btn.disabled    = false;
        btn.textContent = 'Analizar sesión';
      }
    });
};

function _renderProfileStrip(profile) {
  var strip = document.getElementById('ia-profile-strip');
  if (!strip) return;
  if (!profile) { strip.classList.add('ia-hidden'); return; }

  var wtMap = {
    'HARVESTING':'COSECHA','HARVESTER':'COSECHA','SOWER':'SIEMBRA','SPRAYER':'PULV.',
    'FERTILIZER':'ABONO','PLOW':'ARADO','CULTIVATOR':'CULTIVO',
    'MOWER':'SIEGA','BALER':'EMPACADO','TRANSPORT':'TRANSPORTE',
    'FIELDWORK':'TRABAJO','UNKNOWN':'—'
  };
  var wt  = wtMap[profile.workType] || profile.workType;
  var set = function(id, val) { var el = document.getElementById(id); if (el) el.textContent = val; };

  set('ia-profile-label',   'CAMPO ' + profile.campo + ' — ' + wt);
  set('ia-profile-sessions', profile.sessions + ' ses.');
  set('ia-profile-samples',  (profile.total_samples || 0).toLocaleString() + ' muestras');
  set('ia-profile-accel',    profile.recommended_accelerator != null
      ? +((+profile.recommended_accelerator).toFixed(1)) : '—');
  strip.classList.remove('ia-hidden');
}
// Exponer para section-loader.js
window._renderProfileStrip = _renderProfileStrip;

function renderAnalysis(d) {
  // Guardar para que gear-advice lo use en tiempo real
  window._lastAnalysis = d;

  // Actualizar perfil histórico acumulado
  _renderProfileStrip(d.profile || null);

  var workTypeMap = {
    'HARVESTER':'Cosechadora','SOWER':'Sembradora','SPRAYER':'Pulverizadora',
    'FERTILIZER':'Abonadora','PLOW':'Arado','CULTIVATOR':'Cultivador',
    'MOWER':'Segadora','BALER':'Empacadora','TRANSPORT':'Transporte',
    'FIELDWORK':'Trabajo de campo','UNKNOWN':'Desconocido'
  };
  var wt = workTypeMap[d.work_type] || d.work_type;
  var campoLabel = d.campo != null
    ? 'Campo ' + d.campo + (d.campos && d.campos.length > 1 ? ' (+' + (d.campos.length - 1) + ' más)' : '')
    : 'Sin campo';

  var set = function(id, val) { var el = document.getElementById(id); if (el) el.textContent = val; };

  set('ia-an-title',      wt + ' — ' + (d.vehicle || '—') + ' · ' + campoLabel);
  set('ia-an-sub',        d.samples + ' muestras · ' + d.duration_min + ' min · ' + d.sessionFile);
  set('ia-an-speed',      d.avg_speed_kmh);
  set('ia-an-load',       d.avg_motor_load);
  set('ia-an-rpm',        d.avg_rpm);
  set('ia-an-fuel',       d.avg_fuel_lh);
  set('ia-an-fuel-total', d.total_fuel_l);
  set('ia-an-slip',       d.avg_slip_pct);
  set('ia-an-slip-peak',  d.peak_slip_pct);
  set('ia-an-load-peak',  d.peak_load_pct);
  set('ia-an-file',       'Archivo: ' + d.sessionFile);

  // ── Recomendación de acelerador ──────────────────────────────────────────
  var recAccel = d.recommended_accelerator;
  var avgAccel = d.avg_accelerator;
  set('ia-an-rec-accel', recAccel != null ? +((+recAccel).toFixed(1)) : '—');
  set('ia-an-avg-accel', avgAccel != null ? +((+avgAccel).toFixed(1)) : '—');

  // Nota contextual según carga media
  var note = '';
  var avgLoad = d.avg_motor_load || 0;
  if (recAccel != null) {
    if (avgLoad > 88) {
      note = '⚠ Carga muy alta — reduce velocidad de avance';
    } else if (avgLoad > 75) {
      note = '✅ Zona óptima — mantén este acelerador';
    } else if (avgLoad < 55) {
      note = '↑ Carga baja — puedes aumentar velocidad';
    } else {
      note = 'Referencia calculada sobre zona de carga 70-85 %';
    }
  } else {
    note = 'Sin suficientes datos en zona óptima (70-85 % carga)';
  }
  set('ia-an-rec-note', note);

  // Barras de distribución de carga
  var ld = d.load_dist || {};
  [['0-30','ia-lb-0-30','ia-lbp-0-30'],
   ['30-60','ia-lb-30-60','ia-lbp-30-60'],
   ['60-80','ia-lb-60-80','ia-lbp-60-80'],
   ['80-100','ia-lb-80-100','ia-lbp-80-100']].forEach(function(row) {
    var pct = ld[row[0]] || 0;
    var fill = document.getElementById(row[1]);
    var label = document.getElementById(row[2]);
    if (fill)  fill.style.width = pct + '%';
    if (label) label.textContent = pct + '%';
  });

  // Distribución velocidad
  var sd = d.speed_dist || {};
  set('ia-sd-stopped', (sd.parado_pct    || 0) + '%');
  set('ia-sd-slow',    (sd.lento_pct     || 0) + '%');
  set('ia-sd-work',    (sd.trabajo_pct   || 0) + '%');
  set('ia-sd-fast',    (sd.transporte_pct|| 0) + '%');
}
