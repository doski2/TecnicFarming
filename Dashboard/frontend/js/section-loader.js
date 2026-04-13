(function () {
  var fragments = [
    { targetId: 'app-topnav',       path: './sections/topnav.html' },
    { targetId: 'app-col-left',     path: './sections/col-left.html' },
    { targetId: 'app-col-center',   path: './sections/col-center.html' },
    { targetId: 'app-col-right',    path: './sections/col-right.html' },
    { targetId: 'app-ia',           path: './sections/ia-tab.html' },
    { targetId: 'app-bottom-strip', path: './sections/bottom-strip.html' }
  ];

  var scripts = [
    './js/gauge.js',
    './js/uplot.min.js',
    './js/telemetry-client.js',
    './js/modules/dashboard-clock.js',
    './js/modules/dashboard-terrain.js',
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

      // Poblar select de campos (1–99) y notificar al backend al cambiar
      var campoSelect = document.getElementById('ia-campo-id');
      if (campoSelect) {
        for (var i = 1; i <= 99; i++) {
          var opt = document.createElement('option');
          opt.value = i;
          opt.textContent = 'Campo ' + i;
          campoSelect.appendChild(opt);
        }
        campoSelect.addEventListener('change', function() {
          var val = parseInt(this.value, 10);
          window._activoCampo = isNaN(val) ? -1 : val;
          fetch('/api/session/campo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ campo: isNaN(val) ? -1 : val })
          }).catch(function(err) {
            console.warn('No se pudo actualizar campo:', err);
          });
          // Resetear contador de muestras al cambiar de campo
          window._iaSampleCount = 0;
          // Limpiar banda de perfil histórico (es del campo anterior)
          if (typeof window._renderProfileStrip === 'function') {
            window._renderProfileStrip(null);
          } else {
            var s = document.getElementById('ia-profile-strip');
            if (s) s.classList.add('ia-hidden');
          }
          // Cargar archivos grabados del nuevo campo
          if (typeof window.loadCampoSessions === 'function') {
            window.loadCampoSessions(isNaN(val) ? -1 : val);
          }
        });
      }

      if (typeof window.initDashboard === 'function') {
        window.initDashboard();
      }

      // Tab switching (accesible globalmente)
      window.switchTab = function(tab) {
        var main  = document.getElementById('app-main');
        var ia    = document.getElementById('app-ia');
        var btnD  = document.getElementById('tab-btn-dashboard');
        var btnC  = document.getElementById('tab-btn-campo');
        if (tab === 'campo') {
          if (main) main.style.display = 'none';
          if (ia)   ia.style.display   = 'block';
          if (btnD) btnD.classList.remove('tab-active');
          if (btnC) btnC.classList.add('tab-active');
        } else {
          if (main) main.style.display = '';
          if (ia)   ia.style.display   = 'none';
          if (btnD) btnD.classList.add('tab-active');
          if (btnC) btnC.classList.remove('tab-active');
        }
        window._activeTab = tab;
      };
    } catch (error) {
      console.error('Dashboard bootstrap failed:', error);
    }
  }

  document.addEventListener('DOMContentLoaded', bootstrap);
})();