(function () {
  var fragments = [
    { targetId: 'app-topnav', path: './sections/topnav.html' },
    { targetId: 'app-col-left', path: './sections/col-left.html' },
    { targetId: 'app-col-center', path: './sections/col-center.html' },
    { targetId: 'app-col-right', path: './sections/col-right.html' },
    { targetId: 'app-bottom-strip', path: './sections/bottom-strip.html' }
  ];

  var scripts = [
    './js/gauge.js',
    './js/telemetry-client.js',
    './js/modules/dashboard-clock.js',
    './js/modules/dashboard-terrain.js',
    './js/modules/dashboard-history.js',
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

      if (typeof window.initDashboard === 'function') {
        window.initDashboard();
      }
    } catch (error) {
      console.error('Dashboard bootstrap failed:', error);
    }
  }

  document.addEventListener('DOMContentLoaded', bootstrap);
})();