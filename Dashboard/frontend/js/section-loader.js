(function () {
  var fragments = [
    { targetId: 'app-topnav',       path: './sections/topnav.html' },
    { targetId: 'app-trabajo',      path: './sections/trabajo-tab.html' },
    { targetId: 'app-col-left',     path: './sections/col-left.html' },
    { targetId: 'app-col-center',   path: './sections/col-center.html' },
    { targetId: 'app-col-right',    path: './sections/col-right.html' },
    { targetId: 'app-ia',           path: './sections/ia-tab.html' },
    { targetId: 'app-bottom-strip', path: './sections/bottom-strip.html' }
  ];

  var scripts = [
    './js/gauge.js',
    './js/uplot.min.js',
    './js/modules/work-types.js',
    './js/modules/telemetry-ui.js',
    './js/telemetry-client.js',
    './js/modules/dashboard-clock.js',
    './js/modules/dashboard-terrain.js',
    './js/modules/dyno-chart.js',
    './js/modules/ia-analysis.js',
    './js/ui-updater.js',
    './js/dashboard.js'
  ];

  function loadText(path) {
    return fetch(path, { cache: 'no-store' }).then(function (response) {
      if (!response.ok) {
        throw new Error('Failed to load ' + path + ': ' + response.status);
      }
      return response.text();
    });
  }

  /** Carga cualquier elemento con data-fragment dentro de un contenedor raíz */
  function loadNestedFragments(root) {
    var nested = Array.from(root.querySelectorAll('[data-fragment]'));
    if (!nested.length) return Promise.resolve();
    return Promise.all(nested.map(function (el) {
      var path = el.getAttribute('data-fragment');
      return loadText(path).then(function (html) {
        el.innerHTML = html;
        el.removeAttribute('data-fragment');
      });
    }));
  }

  function loadScript(path) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = path;
      script.async = false;
      script.onload = function () { resolve(); };
      script.onerror = function () { reject(new Error('Failed to load script ' + path)); };
      document.body.appendChild(script);
    });
  }

  async function bootstrap() {
    try {
      var fragmentTasks = fragments.map(function (fragment) {
        return loadText(fragment.path).then(function (html) {
          var target = document.getElementById(fragment.targetId);
          if (target) {
            target.innerHTML = html;
          }
          return target;
        }).then(function (target) {
          // Segundo pase: cargar sub-fragmentos (cards individuales)
          if (target) return loadNestedFragments(target);
        });
      });

      await Promise.all(fragmentTasks);

      for (var index = 0; index < scripts.length; index += 1) {
        await loadScript(scripts[index]);
      }

      window.dashboardSectionsReady = true;

      // Poblar selects de campo (Trabajo + Campo·IA) y sincronizar ambos
      function populateCampoSelect(selectEl) {
        if (!selectEl) return;
        for (var i = 1; i <= 38; i++) {
          var opt = document.createElement('option');
          opt.value = i;
          opt.textContent = 'Campo ' + i;
          selectEl.appendChild(opt);
        }
      }

      function syncCampoSelects(sourceId) {
        var trabajo = document.getElementById('trabajo-campo-id');
        var ia = document.getElementById('ia-campo-id');
        var source = document.getElementById(sourceId);
        if (!source) return;
        var val = source.value;
        if (trabajo && sourceId !== 'trabajo-campo-id') trabajo.value = val;
        if (ia && sourceId !== 'ia-campo-id') ia.value = val;
      }

      function onCampoChange(selectEl) {
        var val = parseInt(selectEl.value, 10);
        window._activoCampo = isNaN(val) ? -1 : val;
        syncCampoSelects(selectEl.id);
        fetch('/api/session/campo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ campo: isNaN(val) ? -1 : val })
        }).catch(function(err) {
          console.warn('No se pudo actualizar campo:', err);
        });
        window._iaSampleCount = 0;
        if (typeof window._renderProfileStrip === 'function') {
          window._renderProfileStrip(null);
        } else {
          var s = document.getElementById('ia-profile-strip');
          if (s) s.classList.add('ia-hidden');
        }
        if (typeof window.loadCampoSessions === 'function') {
          window.loadCampoSessions(isNaN(val) ? -1 : val);
        }
      }

      var campoSelects = [
        document.getElementById('trabajo-campo-id'),
        document.getElementById('ia-campo-id')
      ];
      campoSelects.forEach(function(sel) {
        populateCampoSelect(sel);
        if (sel) {
          sel.addEventListener('change', function() { onCampoChange(this); });
        }
      });

      if (typeof window.initDashboard === 'function') {
        window.initDashboard();
      }

      // Tab switching: trabajo (default) | dashboard | campo
      window.switchTab = function(tab) {
        var trabajo = document.getElementById('app-trabajo');
        var main    = document.getElementById('app-main');
        var ia      = document.getElementById('app-ia');
        var btnT    = document.getElementById('tab-btn-trabajo');
        var btnD    = document.getElementById('tab-btn-dashboard');
        var btnC    = document.getElementById('tab-btn-campo');

        function setActive(btn) {
          [btnT, btnD, btnC].forEach(function(b) {
            if (b) b.classList.remove('tab-active');
          });
          if (btn) btn.classList.add('tab-active');
        }

        if (tab === 'campo') {
          if (trabajo) trabajo.style.display = 'none';
          if (main)    main.style.display    = 'none';
          if (ia)      ia.style.display      = 'block';
          setActive(btnC);
        } else if (tab === 'dashboard') {
          if (trabajo) trabajo.style.display = 'none';
          if (main)    main.style.display    = '';
          if (ia)      ia.style.display      = 'none';
          setActive(btnD);
        } else {
          if (trabajo) trabajo.style.display = '';
          if (main)    main.style.display    = 'none';
          if (ia)      ia.style.display      = 'none';
          setActive(btnT);
          tab = 'trabajo';
        }
        window._activeTab = tab;
      };

      window._activeTab = 'trabajo';
      window.switchTab('trabajo');
    } catch (error) {
      console.error('Dashboard bootstrap failed:', error);
    }
  }

  document.addEventListener('DOMContentLoaded', bootstrap);
})();