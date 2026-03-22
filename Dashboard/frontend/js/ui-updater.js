/**
 * UI Updater Module
 * Advanced UI rendering and interactive elements
 */

class UIUpdater {
  constructor() {
    this.animationFrameId = null;
    
    this.init();
  }

  /**
   * Initialize UI updater
   */
  init() {
    this.setupInteractiveElements();
    this.startUpdateLoop();
  }

  /**
   * Setup interactive UI elements
   */
  setupInteractiveElements() {
    // Add hover effects to cards
    document.querySelectorAll('.card').forEach(card => {
      card.addEventListener('mouseenter', () => {
        card.style.borderColor = 'rgba(168,255,62,0.3)';
        card.style.boxShadow = '0 0 16px rgba(168,255,62,0.1)';
      });

      card.addEventListener('mouseleave', () => {
        card.style.borderColor = 'rgba(255,255,255,0.07)';
        card.style.boxShadow = 'none';
      });
    });

    // Add click handlers for potential future interactions
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        this.handleNavClick(item);
      });
    });
  }

  /**
   * Handle navigation clicks
   * @param {HTMLElement} element - Clicked element
   */
  handleNavClick(element) {
    console.log('Nav item clicked:', element.textContent);
  }

  /**
   * Start main update loop
   */
  startUpdateLoop() {
    const update = () => {
      this.updateAnimations();
      this.animationFrameId = requestAnimationFrame(update);
    };

    update();
  }

  /**
   * Update animations and visual effects
   * @param {number} deltaTime - Time delta in seconds
   */
  updateAnimations() {
    // Update gauge animations (handled by GaugeAnimator)
    // Update card glow effects based on intensity
    this.updateCardGlows();

    // Update status indicators
    this.updateStatusIndicators();
  }

  /**
   * Update glow intensity on cards based on metrics
   */
  updateCardGlows() {
    const metrics = window.dashboard?.telemetryData;
    if (!metrics) return;

    // Glow on engine data if under load
    const engineCard = document.querySelector('.card');
    if (engineCard && metrics.motorLoad) {
      const glowIntensity = Math.min(100, metrics.motorLoad * 2) / 100;
      const glowColor = glowIntensity > 0.7 ? 
        `rgba(255,68,102,${glowIntensity * 0.2})` : 
        `rgba(168,255,62,${glowIntensity * 0.1})`;
      
      engineCard.style.boxShadow = `inset 0 0 12px ${glowColor}`;
    }

    // Glow on fuel card
    const fuelCards = document.querySelectorAll('.fuel-card');
    fuelCards.forEach(card => {
      if (metrics.fuelPercentage < 20) {
        card.style.borderColor = 'rgba(255,68,102,0.5)';
        card.style.boxShadow = '0 0 12px rgba(255,68,102,0.15)';
      } else if (metrics.fuelPercentage < 50) {
        card.style.borderColor = 'rgba(255,170,0,0.3)';
        card.style.boxShadow = '0 0 12px rgba(255,170,0,0.1)';
      } else {
        card.style.borderColor = 'rgba(255,255,255,0.07)';
        card.style.boxShadow = 'none';
      }
    });

    // Glow on health card
    const healthCards = document.querySelectorAll('.health-card');
    healthCards.forEach(card => {
      const health = Math.max(0, 100 - (metrics.tractorDamage || 0));
      
      if (health < 30) {
        card.style.borderColor = 'rgba(255,68,102,0.5)';
        card.style.boxShadow = '0 0 12px rgba(255,68,102,0.15)';
      } else if (health < 60) {
        card.style.borderColor = 'rgba(255,170,0,0.3)';
        card.style.boxShadow = '0 0 12px rgba(255,170,0,0.1)';
      } else {
        card.style.borderColor = 'rgba(255,255,255,0.07)';
        card.style.boxShadow = 'none';
      }
    });
  }

  /**
   * Update status indicators with animation
   */
  updateStatusIndicators() {
    const metrics = window.dashboard?.telemetryData;
    if (!metrics) return;

    // Pulse status headers based on engine load
    const cardTitles = document.querySelectorAll('.card-title');
    cardTitles.forEach(title => {
      if (metrics.motorLoad > 80) {
        title.style.animation = 'blink 0.5s ease-in-out infinite';
      } else {
        title.style.animation = 'none';
      }
    });
  }

  /**
   * Show notification/alert
   * @param {string} message - Message to show
   * @param {string} type - 'info', 'warning', 'error'
   * @param {number} duration - Duration in ms (0 = permanent)
   */
  showNotification(message, type = 'info', duration = 3000) {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    notification.style.cssText = `
      position: fixed;
      top: 60px;
      right: 20px;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 12px;
      z-index: 1000;
      animation: slideIn 0.3s ease-out;
      background: ${type === 'error' ? 'rgba(255,68,102,0.2)' : 
                   type === 'warning' ? 'rgba(255,170,0,0.2)' : 
                   'rgba(168,255,62,0.2)'};
      border: 1px solid ${type === 'error' ? 'rgba(255,68,102,0.5)' : 
                         type === 'warning' ? 'rgba(255,170,0,0.5)' : 
                         'rgba(168,255,62,0.5)'};
      color: ${type === 'error' ? 'var(--red)' : 
             type === 'warning' ? 'var(--amber)' : 
             'var(--lime)'};
    `;

    document.body.appendChild(notification);

    if (duration > 0) {
      setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
      }, duration);
    }

    return notification;
  }

  /**
   * Update theme
   * @param {string} theme - 'dark' or 'light'
   */
  setTheme(theme) {
    const root = document.documentElement;
    
    if (theme === 'light') {
      root.style.setProperty('--bg-base', '#f5f5f5');
      root.style.setProperty('--text-pri', '#1a1a1a');
      root.style.setProperty('--text-sec', '#666666');
    } else {
      root.style.setProperty('--bg-base', '#0d0f11');
      root.style.setProperty('--text-pri', '#e8edf5');
      root.style.setProperty('--text-sec', '#7a8899');
    }

    localStorage.setItem('dashboard-theme', theme);
  }

  /**
   * Toggle fullscreen
   */
  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error('Fullscreen error:', err);
      });
    } else {
      document.exitFullscreen();
    }
  }

  /**
   * Stop update loop
   */
  stop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }
}

// Create global UI updater instance
window.uiUpdater = new UIUpdater();

// Handle window resize
window.addEventListener('resize', () => {
  const main = document.querySelector('.main');
  if (main) {
    main.style.height = `calc(100vh - 52px - 60px)`;
  }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.key === 'F11') {
    e.preventDefault();
    window.uiUpdater.toggleFullscreen();
  }
  
  if (e.key === 't' && e.altKey) {
    e.preventDefault();
    const currentTheme = localStorage.getItem('dashboard-theme') || 'dark';
    window.uiUpdater.setTheme(currentTheme === 'dark' ? 'light' : 'dark');
  }
});

// Initialize theme from localStorage
const savedTheme = localStorage.getItem('dashboard-theme') || 'dark';
window.uiUpdater.setTheme(savedTheme);
