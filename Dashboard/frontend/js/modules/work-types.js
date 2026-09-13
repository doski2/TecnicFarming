/**
 * Etiquetas de workType — única fuente para dashboard e IA.
 */
(function (global) {
  var WORK_TYPES = {
    HARVESTING: { label: 'Cosechadora', short: 'Cosecha', profile: 'COSECHA' },
    HARVESTER:  { label: 'Cosechadora', short: 'Cosecha', profile: 'COSECHA' },
    SOWER:      { label: 'Sembradora', short: 'Siembra', profile: 'SIEMBRA' },
    SPRAYER:    { label: 'Pulverizadora', short: 'Pulverización', profile: 'PULV.' },
    FERTILIZER: { label: 'Abonadora', short: 'Abonado', profile: 'ABONO' },
    PLOW:       { label: 'Arado', short: 'Arado', profile: 'ARADO' },
    CULTIVATOR: { label: 'Cultivador', short: 'Cultivo', profile: 'CULTIVO' },
    MOWER:      { label: 'Segadora', short: 'Siega', profile: 'SIEGA' },
    BALER:      { label: 'Empacadora', short: 'Empacado', profile: 'EMPACADO' },
    TRANSPORT:  { label: 'Transporte', short: 'Transporte', profile: 'TRANSPORTE' },
    FIELDWORK:  { label: 'Trabajo de campo', short: 'Campo', profile: 'TRABAJO' },
    UNKNOWN:    { label: 'Desconocido', short: '—', profile: '—' }
  };

  function getWorkTypeLabel(code, style) {
    var key = (code || 'UNKNOWN').toUpperCase();
    var entry = WORK_TYPES[key];
    if (!entry) return code || '—';
    if (style === 'short') return entry.short;
    if (style === 'profile') return entry.profile;
    return entry.label;
  }

  global.WorkTypes = {
    getLabel: getWorkTypeLabel,
    map: WORK_TYPES
  };
})(window);
