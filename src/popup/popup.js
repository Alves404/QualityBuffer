/**
 * My Quality 4k v2.1 - Popup Controller & Zero-Overhead Multi-Language Engine
 *
 * Uses a static frozen in-memory dictionary (PT / EN / ES) with O(1) lookups
 * and single-pass DOM binding so multi-language support adds zero runtime
 * latency or memory overhead to video playback.
 *
 * Assisted engineering by Argon (Google Antigravity) & Claude Streaming Architect.
 * License: GPL-3.0
 */

(function () {
  'use strict';

  /**
   * Automatically detects the user's browser language ('en', 'pt', or 'es') in O(1),
   * using English ('en') as the default fallback language.
   * @returns {string}
   */
  function detectBrowserLanguage() {
    try {
      const candidates = [];
      if (typeof chrome !== 'undefined' && chrome.i18n && typeof chrome.i18n.getUILanguage === 'function') {
        const uiLang = chrome.i18n.getUILanguage();
        if (uiLang) {
          candidates.push(uiLang);
        }
      }
      if (typeof navigator !== 'undefined') {
        if (navigator.language) {
          candidates.push(navigator.language);
        }
        if (Array.isArray(navigator.languages)) {
          for (let i = 0; i < navigator.languages.length; i += 1) {
            if (navigator.languages[i]) {
              candidates.push(navigator.languages[i]);
            }
          }
        }
      }

      for (let i = 0; i < candidates.length; i += 1) {
        const code = String(candidates[i]).toLowerCase().trim();
        if (code.startsWith('pt')) {
          return 'pt';
        }
        if (code.startsWith('es')) {
          return 'es';
        }
        if (code.startsWith('en')) {
          return 'en';
        }
      }
    } catch (e) {
      // Fallback to English ('en')
    }
    return 'en';
  }

  /**
   * Static frozen dictionary for zero-allocation O(1) localization
   */
  const I18N_DICT = Object.freeze({
    pt: Object.freeze({
      tabControls: 'Controles',
      tabAbout: 'Sobre & Creditos',
      metricResLabel: 'Resolucao / Stream',
      metricWaiting: 'Aguardando...',
      metricBufLabel: 'Buffer Real / Meta',
      metricNetLabel: 'Taxa de Rede (CDN)',
      metricLatencyPrefix: 'Latencia:',
      metricGpuLabel: 'Estabilidade GPU/CPU',
      metricDropsSuffix: 'perdas',
      metricGapsPrefix: 'Gaps corrigidos:',
      labelTargetQuality: 'Qualidade Alvo do Player',
      btnApplyNow: 'Aplicar Agora',
      optQ2160: '2160p (4K Ultra HD) - Recomendado',
      optQ1440: '1440p (2K Quad HD)',
      optQ1080: '1080p (Full HD)',
      optQAuto: 'Automatico (Apenas Otimizar Buffer/Codec)',
      labelBufferHorizon: 'Horizonte de Pre-Carregamento (Minutos Seguintes)',
      optBuf60: '60 segundos (1 Minuto a frente - Leve)',
      optBuf120: '120 segundos (2 Minutos a frente - Recomendado)',
      optBuf180: '180 segundos (3 Minutos a frente - Maximo)',
      dropdownTitle: 'Funcionalidades',
      activeCountSuffix: 'ativos',
      featDeepTitle: 'Deep Pre-Buffer (Carregar Minutos Seguintes)',
      featDeepDesc: 'Desbloqueia o limite de 15s do YouTube para baixar os proximos minutos continuamente na velocidade da internet.',
      featPrefetchTitle: 'Pre-Fetch Paralelo em RAM (Cache sidx 64MB)',
      featPrefetchDesc: 'Antecipa o download dos proximos byte-ranges em memoria RAM antes do player requisitar.',
      featHeadstartTitle: 'Pre-Carga Inicial (Trilho Antes do Trem)',
      featHeadstartDesc: 'Acumula um colchao inicial solido em 4K no segundo zero antes de liberar a reproducao.',
      featAv1Title: 'Bloquear Codec AV1 (Forcar VP9 Hardware)',
      featAv1Desc: 'Impede decodificacao AV1 via software na CPU em placas de video sem suporte nativo.',
      featHdrTitle: 'Bloquear VP9 HDR 10-bit (Forcar 4K SDR)',
      featHdrDesc: 'Evita sobrecarga de tonemapping em GPUs de 4 GB VRAM mantendo resolucao 2160p fluida.',
      featFpsTitle: 'Limitar Streams a 30fps (Bloquear 60fps)',
      featFpsDesc: 'Reduz pela metade os quadros decodificados por segundo em videos de gameplay para aliviar GPUs modestas.',
      featMseTitle: 'Estabilizador de Buffer MSE & Micro-Gaps',
      featMseDesc: 'Corrige lacunas de tempo entre segmentos no SourceBuffer para evitar travamentos.',
      featAmbientTitle: 'Desativar Modo Ambiente (Economia de GPU)',
      featAmbientDesc: 'Remove o canvas de iluminacao desfocada do YouTube para liberar VRAM e GPU.',
      featDropTitle: 'Protecao contra Queda Severa de Quadros',
      featDropDesc: 'Reduz automaticamente de 4K para 2K caso a perda de quadros ultrapasse 18%.',
      featTelemetryTitle: 'Sincronizar Telemetria Local (Node.js / Ruby)',
      featTelemetryDesc: 'Opcional para desenvolvedores: envia logs para localhost:3456 sem impacto ao usuario final.',
      aboutArchTitle: 'Arquitetura Open Source v2.1.0',
      aboutArchBody: 'My Quality 4k desbloqueia o limite interno de 35 MB (16s) do protocolo SABR do YouTube para 512 MB, permitindo pre-carregar 1, 2 ou 3 minutos completos de video em 4K (2160p) enquanto prioriza decodificacao de hardware VP9 SDR e aplicacao instantanea sem recarregar a pagina.',
      aboutAiTitle: 'Nota de Engenharia Assistida por IA',
      aboutAiBody: 'Antes dos creditos principais, registra-se de forma transparente que o motor de desbloqueio SABR 512 MB, a interceptacao de codecs de hardware, a estabilizacao de buffers MSE, o suporte multi-idiomas de latencia zero e a estruturacao deste projeto foram desenvolvidos com a assistencia direta do Argon (Google Antigravity).',
      aboutCreditsTitle: 'Creditos, Autoria e Licenca',
      creditAuthor: 'Autor Idealizador e Mantenedor: Joao Vitor Magalhaes Alves (@Alves)',
      creditAi: 'Engenharia Assistida e Co-Arquitetura: Argon (Google Antigravity) & Claude Streaming Architect',
      creditI18n: 'Idiomas Suportados (Zero-Overhead): Portugues (PT), English (EN), Espanol (ES)',
      creditLicense: 'Licenca: GNU GPLv3 (GPL-3.0 Copyleft Open Source)',
      creditVersion: 'Versao: 2.1.0 (Manifest V3 - SABR Deep Pre-Buffer Engine)',
      statusActive: 'Status: Deep Pre-Buffer 4K Ativo',
      statusPaused: 'Status: Otimizacao Pausada',
      statusPending: 'Status: Alteracoes Pendentes (Clique em Aplicar Agora)',
      tooltipApplied: 'Verde: Alteracoes aplicadas',
      tooltipPending: 'Vermelho: Alteracoes nao aplicadas (clique em Aplicar Agora)',
      codecDefault: 'VP9 SDR (Padrao)'
    }),
    en: Object.freeze({
      tabControls: 'Controls',
      tabAbout: 'About & Credits',
      metricResLabel: 'Resolution / Stream',
      metricWaiting: 'Waiting...',
      metricBufLabel: 'Real Buffer / Target',
      metricNetLabel: 'Network Rate (CDN)',
      metricLatencyPrefix: 'Latency:',
      metricGpuLabel: 'GPU/CPU Stability',
      metricDropsSuffix: 'drops',
      metricGapsPrefix: 'Gaps fixed:',
      labelTargetQuality: 'Target Player Quality',
      btnApplyNow: 'Apply Now',
      optQ2160: '2160p (4K Ultra HD) - Recommended',
      optQ1440: '1440p (2K Quad HD)',
      optQ1080: '1080p (Full HD)',
      optQAuto: 'Auto (Optimize Buffer/Codec Only)',
      labelBufferHorizon: 'Pre-Buffer Horizon (Upcoming Minutes)',
      optBuf60: '60 seconds (1 Minute ahead - Light)',
      optBuf120: '120 seconds (2 Minutes ahead - Recommended)',
      optBuf180: '180 seconds (3 Minutes ahead - Maximum)',
      dropdownTitle: 'Features',
      activeCountSuffix: 'active',
      featDeepTitle: 'Deep Pre-Buffer (Load Upcoming Minutes)',
      featDeepDesc: 'Unlocks YouTube 15s limit to continuously download the next minutes at full connection speed.',
      featPrefetchTitle: 'Parallel RAM Pre-Fetch (64MB sidx Cache)',
      featPrefetchDesc: 'Pre-fetches upcoming segment byte-ranges in RAM before the player requests them.',
      featHeadstartTitle: 'Initial Headstart Cushion (Track Before Train)',
      featHeadstartDesc: 'Builds a solid initial 4K buffer cushion at second zero before releasing playback.',
      featAv1Title: 'Block AV1 Codec (Force Hardware VP9)',
      featAv1Desc: 'Prevents CPU software AV1 decoding on graphics cards without native hardware support.',
      featHdrTitle: 'Block VP9 10-bit HDR (Force 4K SDR)',
      featHdrDesc: 'Prevents shader tonemapping overload on 4 GB VRAM GPUs while keeping smooth 2160p.',
      featFpsTitle: 'Limit Streams to 30fps (Block 60fps)',
      featFpsDesc: 'Halves decoded frames per second on high-FPS videos to relieve entry-level GPUs.',
      featMseTitle: 'MSE Buffer & Micro-Gap Stabilizer',
      featMseDesc: 'Bridges millisecond timestamp gaps between SourceBuffer segments to prevent stalls.',
      featAmbientTitle: 'Disable Ambient Mode (GPU Saver)',
      featAmbientDesc: 'Removes YouTube blurred lighting canvas to free VRAM and GPU fill-rate.',
      featDropTitle: 'Severe Frame Drop Protection',
      featDropDesc: 'Automatically steps down from 4K to 2K if frame drop rate exceeds 18%.',
      featTelemetryTitle: 'Sync Local Telemetry (Node.js / Ruby)',
      featTelemetryDesc: 'Optional for developers: sends logs to localhost:3456 with zero end-user impact.',
      aboutArchTitle: 'Open Source Architecture v2.1.0',
      aboutArchBody: 'My Quality 4k unlocks YouTube SABR 35 MB (16s) internal buffer cap to 512 MB, pre-buffering 1, 2, or 3 full minutes of 4K (2160p) video while enforcing hardware VP9 SDR decoding and zero-reload live updates.',
      aboutAiTitle: 'AI-Assisted Engineering Notice',
      aboutAiBody: 'Prior to the main credits, it is transparently recorded that the SABR 512 MB unlocker, hardware codec hooks, MSE buffer stabilization, zero-overhead multi-language engine, and project structure were engineered with the direct assistance of Argon (Google Antigravity).',
      aboutCreditsTitle: 'Credits, Authorship & License',
      creditAuthor: 'Creator, Lead Author & Maintainer: Joao Vitor Magalhaes Alves (@Alves)',
      creditAi: 'AI-Assisted Engineering & Co-Architecture: Argon (Google Antigravity) & Claude Streaming Architect',
      creditI18n: 'Supported Languages (Zero-Overhead): Portugues (PT), English (EN), Espanol (ES)',
      creditLicense: 'License: GNU GPLv3 (GPL-3.0 Copyleft Open Source)',
      creditVersion: 'Version: 2.1.0 (Manifest V3 - SABR Deep Pre-Buffer Engine)',
      statusActive: 'Status: 4K Deep Pre-Buffer Active',
      statusPaused: 'Status: Optimization Paused',
      statusPending: 'Status: Pending Changes (Click Apply Now)',
      tooltipApplied: 'Green: Changes applied',
      tooltipPending: 'Red: Unapplied changes (click Apply Now)',
      codecDefault: 'VP9 SDR (Default)'
    }),
    es: Object.freeze({
      tabControls: 'Controles',
      tabAbout: 'Acerca y Creditos',
      metricResLabel: 'Resolucion / Stream',
      metricWaiting: 'Esperando...',
      metricBufLabel: 'Buffer Real / Meta',
      metricNetLabel: 'Tasa de Red (CDN)',
      metricLatencyPrefix: 'Latencia:',
      metricGpuLabel: 'Estabilidad GPU/CPU',
      metricDropsSuffix: 'perdidas',
      metricGapsPrefix: 'Gaps corregidos:',
      labelTargetQuality: 'Calidad Objetivo del Reproductor',
      btnApplyNow: 'Aplicar Ahora',
      optQ2160: '2160p (4K Ultra HD) - Recomendado',
      optQ1440: '1440p (2K Quad HD)',
      optQ1080: '1080p (Full HD)',
      optQAuto: 'Automatico (Solo Optimizar Buffer/Codec)',
      labelBufferHorizon: 'Horizonte de Pre-Carga (Minutos Siguientes)',
      optBuf60: '60 segundos (1 Minuto adelante - Ligero)',
      optBuf120: '120 segundos (2 Minutos adelante - Recomendado)',
      optBuf180: '180 segundos (3 Minutos adelante - Maximo)',
      dropdownTitle: 'Funcionalidades',
      activeCountSuffix: 'activos',
      featDeepTitle: 'Deep Pre-Buffer (Cargar Minutos Siguientes)',
      featDeepDesc: 'Desbloquea el limite de 15s de YouTube para descargar los proximos minutos continuamente.',
      featPrefetchTitle: 'Pre-Fetch Paralelo en RAM (Cache sidx 64MB)',
      featPrefetchDesc: 'Anticipa la descarga de los proximos rangos de bytes en memoria RAM.',
      featHeadstartTitle: 'Pre-Carga Inicial (Riel Antes del Tren)',
      featHeadstartDesc: 'Acumula un colchon inicial solido en 4K en el segundo cero antes de reproducir.',
      featAv1Title: 'Bloquear Codec AV1 (Forzar VP9 Hardware)',
      featAv1Desc: 'Impide la decodificacion AV1 por software en la CPU en tarjetas sin soporte nativo.',
      featHdrTitle: 'Bloquear VP9 HDR 10-bit (Forzar 4K SDR)',
      featHdrDesc: 'Evita la sobrecarga de tonemapping en GPUs de 4 GB VRAM manteniendo 2160p fluido.',
      featFpsTitle: 'Limitar Streams a 30fps (Bloquear 60fps)',
      featFpsDesc: 'Reduce a la mitad los cuadros decodificados por segundo para aliviar GPUs modestas.',
      featMseTitle: 'Estabilizador de Buffer MSE y Micro-Gaps',
      featMseDesc: 'Corrige brechas de tiempo entre segmentos en el SourceBuffer para evitar pausas.',
      featAmbientTitle: 'Desactivar Modo Ambiente (Ahorro de GPU)',
      featAmbientDesc: 'Elimina el canvas de iluminacion difuminada de YouTube para liberar VRAM y GPU.',
      featDropTitle: 'Proteccion contra Caida Severa de Cuadros',
      featDropDesc: 'Reduce automaticamente de 4K a 2K si la perdida de cuadros supera el 18%.',
      featTelemetryTitle: 'Sincronizar Telemetria Local (Node.js / Ruby)',
      featTelemetryDesc: 'Opcional para desarrolladores: envia logs a localhost:3456 sin impacto al usuario.',
      aboutArchTitle: 'Arquitectura Open Source v2.1.0',
      aboutArchBody: 'My Quality 4k desbloquea el limite interno de 35 MB (16s) de YouTube SABR a 512 MB, permitiendo pre-cargar 1, 2 o 3 minutos completos en 4K (2160p) con decodificacion de hardware VP9 SDR y aplicacion instantanea sin recargar la pagina.',
      aboutAiTitle: 'Nota de Ingenieria Asistida por IA',
      aboutAiBody: 'Antes de los creditos principales, se registra de forma transparente que el desbloqueador SABR 512 MB, la intercepcion de codecs, la estabilizacion MSE, el soporte multi-idioma sin latencia y la estructura del proyecto fueron desarrollados con la asistencia directa de Argon (Google Antigravity).',
      aboutCreditsTitle: 'Creditos, Autoria y Licencia',
      creditAuthor: 'Autor Creador y Mantenedor: Joao Vitor Magalhaes Alves (@Alves)',
      creditAi: 'Ingenieria Asistida y Co-Arquitectura: Argon (Google Antigravity) & Claude Streaming Architect',
      creditI18n: 'Idiomas Soportados (Zero-Overhead): Portugues (PT), English (EN), Espanol (ES)',
      creditLicense: 'Licencia: GNU GPLv3 (GPL-3.0 Copyleft Open Source)',
      creditVersion: 'Version: 2.1.0 (Manifest V3 - SABR Deep Pre-Buffer Engine)',
      statusActive: 'Estado: Deep Pre-Buffer 4K Activo',
      statusPaused: 'Estado: Optimizacion Pausada',
      statusPending: 'Estado: Cambios Pendientes (Clic en Aplicar Ahora)',
      tooltipApplied: 'Verde: Cambios aplicados',
      tooltipPending: 'Rojo: Cambios no aplicados (clic en Aplicar Ahora)',
      codecDefault: 'VP9 SDR (Predeterminado)'
    })
  });

  const DEFAULT_CONFIG = {
    enabled: true,
    lang: detectBrowserLanguage(),
    userSelectedLang: null,
    targetQuality: 'hd2160',
    targetBufferSec: 120,
    deepPreBuffer: true,
    parallelPrefetch: true,
    headstartBoost: false,
    blockAV1: true,
    blockHDR60: true,
    block60fps: false,
    stabilizeBuffer: true,
    disableAmbientMode: true,
    smartDropGuard: true,
    telemetrySync: false,
    telemetryEndpoint: 'http://localhost:3456/api/telemetry'
  };

  const QUALITY_LABELS = {
    highres: '4320p (8K)',
    hd2880: '2880p (5K)',
    hd2160: '2160p (4K)',
    hd1440: '1440p (2K)',
    hd1080: '1080p (FHD)',
    hd720: '720p (HD)',
    large: '480p',
    medium: '360p',
    small: '240p',
    tiny: '144p',
    auto: 'Auto'
  };

  let currentLang = DEFAULT_CONFIG.lang;
  let appliedConfig = Object.assign({}, DEFAULT_CONFIG);
  let currentConfig = Object.assign({}, DEFAULT_CONFIG);
  let lastDashboardData = null;

  // DOM Elements
  const elSelectLang = document.getElementById('select-lang');
  const elToggleEnabled = document.getElementById('toggle-enabled');
  const elSelectQuality = document.getElementById('select-quality');
  const elSelectBufferTarget = document.getElementById('select-buffer-target');
  const elBtnForceNow = document.getElementById('btn-force-now');
  const elApplyStatusSwitch = document.getElementById('apply-status-switch');

  const elFeaturesDropdown = document.getElementById('features-dropdown');
  const elBtnFeaturesDropdown = document.getElementById('btn-features-dropdown');
  const elDropdownActiveCount = document.getElementById('dropdown-active-count');

  const elToggleDeepPrebuffer = document.getElementById('toggle-deep-prebuffer');
  const elToggleParallelPrefetch = document.getElementById('toggle-parallel-prefetch');
  const elToggleHeadstartBoost = document.getElementById('toggle-headstart-boost');
  const elToggleBlockAv1 = document.getElementById('toggle-block-av1');
  const elToggleBlockHdr = document.getElementById('toggle-block-hdr');
  const elToggleBlock60fps = document.getElementById('toggle-block-60fps');
  const elToggleStabilizeBuffer = document.getElementById('toggle-stabilize-buffer');
  const elToggleDisableAmbient = document.getElementById('toggle-disable-ambient');
  const elToggleDropGuard = document.getElementById('toggle-drop-guard');
  const elToggleTelemetrySync = document.getElementById('toggle-telemetry-sync');

  const elMetricResolution = document.getElementById('metric-resolution');
  const elMetricCodec = document.getElementById('metric-codec');
  const elMetricBuffer = document.getElementById('metric-buffer');
  const elBufferBarFill = document.getElementById('buffer-bar-fill');
  const elMetricThroughput = document.getElementById('metric-throughput');
  const elMetricLatency = document.getElementById('metric-latency');
  const elMetricDrops = document.getElementById('metric-drops');
  const elMetricGaps = document.getElementById('metric-gaps');

  const elStatusIndicator = document.getElementById('status-indicator');
  const i18nElements = document.querySelectorAll('[data-i18n]');

  const featureToggleElements = [
    elToggleDeepPrebuffer,
    elToggleParallelPrefetch,
    elToggleHeadstartBoost,
    elToggleBlockAv1,
    elToggleBlockHdr,
    elToggleBlock60fps,
    elToggleStabilizeBuffer,
    elToggleDisableAmbient,
    elToggleDropGuard,
    elToggleTelemetrySync
  ];

  /**
   * O(1) string lookup from frozen language table (English default fallback)
   * @param {string} key
   * @returns {string}
   */
  function t(key) {
    const table = I18N_DICT[currentLang] || I18N_DICT.en;
    return table[key] || I18N_DICT.en[key] || key;
  }

  /**
   * Single-pass DOM localization update (only runs on startup or language switch)
   * @param {string} langCode
   */
  function applyLanguage(langCode) {
    currentLang = I18N_DICT[langCode] ? langCode : 'en';
    if (document.documentElement) {
      document.documentElement.lang = currentLang;
    }
    if (elSelectLang && elSelectLang.value !== currentLang) {
      elSelectLang.value = currentLang;
    }

    for (let i = 0; i < i18nElements.length; i += 1) {
      const el = i18nElements[i];
      const key = el.getAttribute('data-i18n');
      if (key) {
        el.textContent = t(key);
      }
    }

    updateApplyStatusIndicator();
    if (lastDashboardData) {
      renderDashboardState(lastDashboardData);
    } else if (elMetricResolution) {
      elMetricResolution.textContent = t('metricWaiting');
    }
  }

  /**
   * Initializes tab switching behavior
   */
  function setupTabs() {
    const buttons = document.querySelectorAll('.tab-btn');
    const panels = document.querySelectorAll('.tab-panel');

    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        const targetId = btn.getAttribute('data-tab');
        buttons.forEach(function (b) {
          b.classList.remove('active');
        });
        panels.forEach(function (p) {
          p.classList.remove('active');
        });
        btn.classList.add('active');
        const targetPanel = document.getElementById(targetId);
        if (targetPanel) {
          targetPanel.classList.add('active');
        }
      });
    });
  }

  /**
   * Initializes collapsible dropdown menu for the 10 buffer & codec features
   */
  function setupFeaturesDropdown() {
    if (!elBtnFeaturesDropdown || !elFeaturesDropdown) {
      return;
    }

    elBtnFeaturesDropdown.addEventListener('click', function () {
      const isOpen = elFeaturesDropdown.classList.toggle('open');
      elBtnFeaturesDropdown.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
  }

  /**
   * Updates the X/10 active features badge on the dropdown header
   */
  function updateDropdownActiveCountBadge() {
    if (!elDropdownActiveCount) {
      return;
    }
    let activeCount = 0;
    featureToggleElements.forEach(function (el) {
      if (el && el.checked) {
        activeCount += 1;
      }
    });
    elDropdownActiveCount.textContent = `${activeCount}/${featureToggleElements.length} ${t('activeCountSuffix')}`;
  }

  /**
   * Reads current UI control values into a configuration object
   * @returns {object}
   */
  function readConfigFromUI() {
    return {
      enabled: elToggleEnabled ? elToggleEnabled.checked : true,
      lang: currentLang,
      userSelectedLang: appliedConfig.userSelectedLang || null,
      targetQuality: elSelectQuality ? elSelectQuality.value : 'hd2160',
      targetBufferSec: elSelectBufferTarget ? Number(elSelectBufferTarget.value) || 120 : 120,
      deepPreBuffer: elToggleDeepPrebuffer ? elToggleDeepPrebuffer.checked : true,
      parallelPrefetch: elToggleParallelPrefetch ? elToggleParallelPrefetch.checked : true,
      headstartBoost: elToggleHeadstartBoost ? elToggleHeadstartBoost.checked : false,
      blockAV1: elToggleBlockAv1 ? elToggleBlockAv1.checked : true,
      blockHDR60: elToggleBlockHdr ? elToggleBlockHdr.checked : true,
      block60fps: elToggleBlock60fps ? elToggleBlock60fps.checked : false,
      stabilizeBuffer: elToggleStabilizeBuffer ? elToggleStabilizeBuffer.checked : true,
      disableAmbientMode: elToggleDisableAmbient ? elToggleDisableAmbient.checked : true,
      smartDropGuard: elToggleDropGuard ? elToggleDropGuard.checked : true,
      telemetrySync: elToggleTelemetrySync ? elToggleTelemetrySync.checked : false,
      telemetryEndpoint: DEFAULT_CONFIG.telemetryEndpoint
    };
  }

  /**
   * Compares two config objects to determine if there are unapplied changes
   * @param {object} a
   * @param {object} b
   * @returns {boolean}
   */
  function isConfigEqual(a, b) {
    if (!a || !b) {
      return false;
    }
    const keys = [
      'enabled',
      'targetQuality',
      'targetBufferSec',
      'deepPreBuffer',
      'parallelPrefetch',
      'headstartBoost',
      'blockAV1',
      'blockHDR60',
      'block60fps',
      'stabilizeBuffer',
      'disableAmbientMode',
      'smartDropGuard',
      'telemetrySync'
    ];
    for (let i = 0; i < keys.length; i += 1) {
      const k = keys[i];
      if (a[k] !== b[k]) {
        return false;
      }
    }
    return true;
  }

  /**
   * Updates the Green/Red switch-style indicator next to "Aplicar Agora"
   */
  function updateApplyStatusIndicator() {
    const uiCfg = readConfigFromUI();
    currentConfig = uiCfg;
    updateDropdownActiveCountBadge();

    const isApplied = isConfigEqual(uiCfg, appliedConfig);

    if (elApplyStatusSwitch) {
      if (isApplied) {
        elApplyStatusSwitch.classList.remove('is-pending');
        elApplyStatusSwitch.classList.add('is-applied');
        elApplyStatusSwitch.title = t('tooltipApplied');
      } else {
        elApplyStatusSwitch.classList.remove('is-applied');
        elApplyStatusSwitch.classList.add('is-pending');
        elApplyStatusSwitch.title = t('tooltipPending');
      }
    }

    if (elStatusIndicator) {
      if (!isApplied) {
        elStatusIndicator.textContent = t('statusPending');
      } else {
        elStatusIndicator.textContent = appliedConfig.enabled ? t('statusActive') : t('statusPaused');
      }
    }
  }

  /**
   * Applies config object to UI inputs
   */
  function renderConfigControls(cfg) {
    const resolvedLang =
      cfg.userSelectedLang && I18N_DICT[cfg.userSelectedLang]
        ? cfg.userSelectedLang
        : detectBrowserLanguage();
    currentLang = resolvedLang;
    if (elSelectLang) {
      elSelectLang.value = currentLang;
    }
    elToggleEnabled.checked = Boolean(cfg.enabled);
    elSelectQuality.value = cfg.targetQuality || 'hd2160';
    if (elSelectBufferTarget) {
      elSelectBufferTarget.value = String(cfg.targetBufferSec || 120);
    }
    if (elToggleDeepPrebuffer) {
      elToggleDeepPrebuffer.checked = cfg.deepPreBuffer !== false;
    }
    if (elToggleParallelPrefetch) {
      elToggleParallelPrefetch.checked = cfg.parallelPrefetch !== false;
    }
    if (elToggleHeadstartBoost) {
      elToggleHeadstartBoost.checked = Boolean(cfg.headstartBoost);
    }
    elToggleBlockAv1.checked = Boolean(cfg.blockAV1);
    elToggleBlockHdr.checked = Boolean(cfg.blockHDR60);
    if (elToggleBlock60fps) {
      elToggleBlock60fps.checked = Boolean(cfg.block60fps);
    }
    elToggleStabilizeBuffer.checked = Boolean(cfg.stabilizeBuffer);
    elToggleDisableAmbient.checked = Boolean(cfg.disableAmbientMode);
    elToggleDropGuard.checked = Boolean(cfg.smartDropGuard);
    elToggleTelemetrySync.checked = Boolean(cfg.telemetrySync);

    applyLanguage(currentLang);
  }

  /**
   * Formats MIME codec string into concise readable form
   */
  function formatCodecLabel(mimeString) {
    if (!mimeString || mimeString === 'unknown') {
      return t('codecDefault');
    }
    const lower = mimeString.toLowerCase();
    if (lower.includes('vp09.00') || lower.includes('vp9')) {
      return 'VP9 Profile 0 (Hardware)';
    }
    if (lower.includes('avc1')) {
      return 'H.264 / AVC1 (Hardware)';
    }
    if (lower.includes('av01')) {
      return 'AV1 (Software/GPU)';
    }
    return mimeString;
  }

  /**
   * Updates dashboard cards
   */
  function renderDashboardState(data) {
    if (!data) {
      return;
    }
    lastDashboardData = data;

    const player = data.playerTelemetry;
    const netSummary = data.networkSummary || {};

    if (player) {
      const qLabel = QUALITY_LABELS[player.currentQuality] || player.currentQuality || 'Auto';
      elMetricResolution.textContent =
        player.resolution && player.resolution !== 'N/A'
          ? `${qLabel} (${player.resolution})`
          : qLabel;

      elMetricCodec.textContent = `Codec: ${formatCodecLabel(player.videoMimeType)}`;

      const bufSec = Number(player.bufferAheadSec || 0);
      const targetSec = Number(player.targetBufferSec || appliedConfig.targetBufferSec || 120);
      elMetricBuffer.textContent = `${bufSec.toFixed(1)}s / ${targetSec}s`;

      const pct = Math.min(100, Math.max(4, Math.round((bufSec / targetSec) * 100)));
      elBufferBarFill.style.width = `${pct}%`;
      elBufferBarFill.classList.toggle('buffer-low', bufSec < 12);

      elMetricDrops.textContent = `${Number(player.dropRatePercent || 0).toFixed(1)}% ${t('metricDropsSuffix')}`;
      const gaps = player.microGapsRecovered || 0;
      elMetricGaps.textContent = `${t('metricGapsPrefix')} ${gaps}`;
    }

    elMetricThroughput.textContent = `${Number(netSummary.avgThroughputMbps || 0).toFixed(1)} Mbps`;
    elMetricLatency.textContent = `${t('metricLatencyPrefix')} ${netSummary.avgLatencyMs || 0} ms`;
  }

  /**
   * Requests fresh state from the Background Service Worker and active YouTube tab
   */
  function refreshTelemetry() {
    if (!chrome || !chrome.runtime) {
      return;
    }

    chrome.runtime.sendMessage({ type: 'MQ4K_GET_DASHBOARD_STATE' }, function (response) {
      if (chrome.runtime.lastError || !response || !response.ok) {
        return;
      }
      renderDashboardState(response);
    });
  }

  /**
   * Applies all pending UI settings immediately to chrome.storage.local AND hot-applies
   * them to the active YouTube tab without requiring a page reload (F5).
   */
  function applyConfigurationNow() {
    const newConfig = readConfigFromUI();
    appliedConfig = Object.assign({}, newConfig);
    currentConfig = Object.assign({}, newConfig);

    if (chrome && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ mq4k_config: appliedConfig });
    }

    updateApplyStatusIndicator();

    if (!chrome || !chrome.tabs) {
      return;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (!tabs || !tabs[0] || !tabs[0].id) {
        return;
      }
      const tabId = tabs[0].id;
      const tabUrl = tabs[0].url || '';

      chrome.tabs.sendMessage(
        tabId,
        { type: 'MQ4K_FORCE_QUALITY', config: appliedConfig },
        function (res) {
          const sendFailed = Boolean(chrome.runtime.lastError) || !res;
          if (
            sendFailed &&
            tabUrl.includes('youtube.com') &&
            chrome.scripting &&
            typeof chrome.scripting.executeScript === 'function'
          ) {
            chrome.scripting.executeScript(
              {
                target: { tabId: tabId },
                files: ['src/content/page-hook.js'],
                world: 'MAIN'
              },
              function () {
                void chrome.runtime.lastError;
                chrome.scripting.executeScript(
                  {
                    target: { tabId: tabId },
                    files: ['src/content/content-controller.js'],
                    world: 'ISOLATED'
                  },
                  function () {
                    void chrome.runtime.lastError;
                    chrome.tabs.sendMessage(
                      tabId,
                      { type: 'MQ4K_FORCE_QUALITY', config: appliedConfig },
                      function () {
                        void chrome.runtime.lastError;
                        setTimeout(refreshTelemetry, 250);
                      }
                    );
                  }
                );
              }
            );
          } else {
            setTimeout(refreshTelemetry, 250);
          }
        }
      );
    });
  }

  // Bind Language Selector (instant switch, persists manual language preference immediately)
  if (elSelectLang) {
    elSelectLang.addEventListener('change', function () {
      applyLanguage(elSelectLang.value);
      appliedConfig.lang = currentLang;
      appliedConfig.userSelectedLang = currentLang;
      currentConfig.lang = currentLang;
      currentConfig.userSelectedLang = currentLang;
      if (chrome && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ mq4k_config: appliedConfig });
      }
    });
  }

  // Bind Control Listeners
  [
    elToggleEnabled,
    elSelectQuality,
    elSelectBufferTarget,
    elToggleDeepPrebuffer,
    elToggleParallelPrefetch,
    elToggleHeadstartBoost,
    elToggleBlockAv1,
    elToggleBlockHdr,
    elToggleBlock60fps,
    elToggleStabilizeBuffer,
    elToggleDisableAmbient,
    elToggleDropGuard,
    elToggleTelemetrySync
  ].forEach(function (inputEl) {
    if (inputEl) {
      inputEl.addEventListener('change', updateApplyStatusIndicator);
    }
  });

  if (elBtnForceNow) {
    elBtnForceNow.addEventListener('click', applyConfigurationNow);
  }
  if (elApplyStatusSwitch) {
    elApplyStatusSwitch.addEventListener('click', applyConfigurationNow);
  }

  // Initialization
  setupTabs();
  setupFeaturesDropdown();

  if (chrome && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['mq4k_config'], function (result) {
      if (result && result.mq4k_config) {
        appliedConfig = Object.assign({}, DEFAULT_CONFIG, result.mq4k_config);
        currentConfig = Object.assign({}, appliedConfig);
      }
      renderConfigControls(appliedConfig);
      refreshTelemetry();
    });
  } else {
    renderConfigControls(appliedConfig);
  }

  setInterval(refreshTelemetry, 1000);
})();
