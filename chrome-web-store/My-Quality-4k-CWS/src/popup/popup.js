/**
 * My Quality 4k v2.2 - Popup Controller, V12 Downloader UI & Zero-Overhead Multi-Language Engine
 *
 * Uses a static frozen in-memory dictionary (PT / EN / ES) with O(1) lookups
 * and single-pass DOM binding so multi-language support adds zero runtime
 * latency or memory overhead to video playback.
 *
 * Assisted engineering by Gemini 4 Argon (Google Antigravity).
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
      tabDownloader: 'Downloader',
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
      featPrefetchTitle: 'Pre-Fetch Paralelo & Warm-up V12',
      featPrefetchDesc: 'Pre-aquece conexoes CDN em DNS/TLS/QUIC no segundo zero antes do player requisitar os segmentos.',
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
      dlActiveTabLabel: 'Aba Ativa',
      dlEmptyTitle: 'Nenhum video detectado',
      dlEmptyDesc: 'Inicie a reproducao de um video nesta aba para capturar streams HLS (M3U8 / AES-128) ou MP4/WebM automaticamente.',
      dlBtnDownload: 'Baixar Video',
      dlBtnDownloading: 'Acelerando MP4...',
      dlBtnSending: 'Enviando ao Chrome...',
      dlBtnSaved: 'Concluido com Sucesso!',
      dlBtnRetry: 'Tentar Novamente',
      dlBtnDownloadAgain: 'Baixar Novamente',
      dlErrRefresh: 'Atualize a pagina (F5) para ativar o assistente de download nesta aba.',
      dlHint: 'Motor V12: Download concorrente 12x HLS (M3U8 / AES-128) e MP4/WebM direto',
      aboutArchTitle: 'Arquitetura Open Source v2.2.0',
      aboutArchBody: 'My Quality 4k desbloqueia o limite interno de 35 MB (16s) do protocolo SABR do YouTube para 512 MB, permitindo pre-carregar 1, 2 ou 3 minutos em 4K (2160p) com decodificacao de hardware VP9 SDR e integra o motor V12 de 12 conexoes para download de videos HLS (M3U8 / AES-128) e MP4.',
      aboutAiTitle: 'Nota de Desenvolvimento Assistido por IA (Gemini 4 Argon)',
      aboutAiBody: 'Antes dos creditos principais, registra-se de forma transparente que o motor de desbloqueio SABR 512 MB, o pre-aquecimento assincrono V12 de CDN e chaves AES-128, a interceptacao de codecs de hardware e a arquitetura deste projeto contaram com o Desenvolvimento Assistido por IA Gemini 4 Argon (Google Antigravity).',
      aboutCreditsTitle: 'Creditos, Autoria e Licenca',
      creditAuthor: 'Autor Idealizador e Mantenedor: Joao Vitor Magalhaes Alves',
      creditRepo: 'Repositorio Oficial no GitHub:',
      creditAi: 'Desenvolvimento Assistido por IA: Gemini 4 Argon (Google Antigravity) — Co-arquitetura do motor SABR 512 MB, downloader V12 HLS e estabilizacao MSE.',
      creditI18n: 'Idiomas Suportados (Zero-Overhead): English (EN - Padrao), Portugues (PT) e Espanol (ES) com deteccao automatica do navegador.',
      creditLicense: 'Licenca Open Source: GNU General Public License v3.0 (GPL-3.0 Copyleft) — Codigo 100% aberto, livre e auditavel.',
      creditVersion: 'Versao: 2.2.0 (Manifest V3 — Motor SABR 512 MB, Hardware VP9 SDR & Downloader V12 HLS/MP4).',
      statusActive: 'Status: Deep Pre-Buffer 4K Ativo',
      statusPaused: 'Status: Otimizacao Pausada',
      statusPending: 'Status: Alteracoes Pendentes (Clique em Aplicar Agora)',
      tooltipApplied: 'Verde: Alteracoes aplicadas',
      tooltipPending: 'Vermelho: Alteracoes nao aplicadas (clique em Aplicar Agora)',
      codecDefault: 'VP9 SDR (Padrao)'
    }),
    en: Object.freeze({
      tabControls: 'Controls',
      tabDownloader: 'Downloader',
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
      featPrefetchTitle: 'Parallel Pre-Fetch & V12 CDN Warm-up',
      featPrefetchDesc: 'Pre-warms high-resolution CDN nodes over DNS/TLS/QUIC at millisecond zero before segments are requested.',
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
      dlActiveTabLabel: 'Active Tab',
      dlEmptyTitle: 'No video streams detected',
      dlEmptyDesc: 'Play a video on the active page to capture HLS (M3U8 / AES-128) or direct MP4/WebM streams automatically.',
      dlBtnDownload: 'Download Video',
      dlBtnDownloading: 'Accelerating MP4...',
      dlBtnSending: 'Sending to Chrome...',
      dlBtnSaved: 'Completed Successfully!',
      dlBtnRetry: 'Retry Download',
      dlBtnDownloadAgain: 'Download Again',
      dlErrRefresh: 'Refresh the page (F5) to activate the download assistant on this tab.',
      dlHint: 'V12 Engine: 12-worker concurrent HLS (M3U8 / AES-128) & direct MP4/WebM downloader',
      aboutArchTitle: 'Open Source Architecture v2.2.0',
      aboutArchBody: 'My Quality 4k unlocks YouTube SABR 35 MB (16s) internal buffer cap to 512 MB for 1, 2, or 3 full minutes of 4K (2160p) pre-buffering, enforces hardware VP9 SDR decoding, and integrates the V12 12-worker HLS (M3U8 / AES-128) & MP4 web video downloader.',
      aboutAiTitle: 'AI-Assisted Development Notice (Gemini 4 Argon)',
      aboutAiBody: 'Prior to the main credits, it is transparently recorded that the SABR 512 MB unlocker, V12 async CDN/key warm-up engine, hardware codec hooks, MSE buffer stabilization, and project architecture were developed with the direct AI-assisted engineering of Gemini 4 Argon (Google Antigravity).',
      aboutCreditsTitle: 'Credits, Authorship & License',
      creditAuthor: 'Creator, Lead Author & Maintainer: Joao Vitor Magalhaes Alves',
      creditRepo: 'Official Open Source Repository:',
      creditAi: 'AI-Assisted Development: Gemini 4 Argon (Google Antigravity) — Co-architecture of the 512 MB SABR engine, V12 HLS downloader, and MSE stabilization.',
      creditI18n: 'Supported Languages (Zero-Overhead): English (EN - Default), Portugues (PT), and Espanol (ES) with automatic browser detection.',
      creditLicense: 'Open Source License: GNU General Public License v3.0 (GPL-3.0 Copyleft) — 100% free, open, and auditable source code.',
      creditVersion: 'Version: 2.2.0 (Manifest V3 — 512 MB SABR Pre-Buffer, Hardware VP9 SDR & V12 HLS/MP4 Downloader).',
      statusActive: 'Status: 4K Deep Pre-Buffer Active',
      statusPaused: 'Status: Optimization Paused',
      statusPending: 'Status: Pending Changes (Click Apply Now)',
      tooltipApplied: 'Green: Changes applied',
      tooltipPending: 'Red: Unapplied changes (click Apply Now)',
      codecDefault: 'VP9 SDR (Default)'
    }),
    es: Object.freeze({
      tabControls: 'Controles',
      tabDownloader: 'Downloader',
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
      featPrefetchTitle: 'Pre-Fetch Paralelo y Warm-up V12',
      featPrefetchDesc: 'Pre-calienta conexiones CDN en DNS/TLS/QUIC en el segundo cero antes de solicitar segmentos.',
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
      dlActiveTabLabel: 'Pestana Activa',
      dlEmptyTitle: 'Ningun video detectado',
      dlEmptyDesc: 'Inicie la reproduccion de un video en esta pestana para capturar streams HLS (M3U8 / AES-128) o MP4/WebM automaticamente.',
      dlBtnDownload: 'Descargar Video',
      dlBtnDownloading: 'Acelerando MP4...',
      dlBtnSending: 'Enviando a Chrome...',
      dlBtnSaved: 'Completado con Exito!',
      dlBtnRetry: 'Reintentar',
      dlBtnDownloadAgain: 'Descargar de Nuevo',
      dlErrRefresh: 'Actualice la pagina (F5) para activar el asistente de descarga en esta pestana.',
      dlHint: 'Motor V12: Descarga concurrente 12x HLS (M3U8 / AES-128) y MP4/WebM directo',
      aboutArchTitle: 'Arquitectura Open Source v2.2.0',
      aboutArchBody: 'My Quality 4k desbloquea el limite interno de 35 MB (16s) de YouTube SABR a 512 MB, permitiendo pre-cargar 1, 2 o 3 minutos completos en 4K (2160p) con decodificacion de hardware VP9 SDR e integra el motor V12 de 12 conexiones para descarga de videos HLS (M3U8 / AES-128) y MP4.',
      aboutAiTitle: 'Nota de Desarrollo Asistido por IA (Gemini 4 Argon)',
      aboutAiBody: 'Antes de los creditos principales, se registra de forma transparente que el desbloqueador SABR 512 MB, el pre-calentamiento asincrono V12 de CDN y claves AES-128, la intercepcion de codecs y la arquitectura del proyecto contaron con el Desarrollo Asistido por IA Gemini 4 Argon (Google Antigravity).',
      aboutCreditsTitle: 'Creditos, Autoria y Licencia',
      creditAuthor: 'Autor Creador y Mantenedor: Joao Vitor Magalhaes Alves',
      creditRepo: 'Repositorio Oficial en GitHub:',
      creditAi: 'Desarrollo Asistido por IA: Gemini 4 Argon (Google Antigravity) — Co-arquitectura del motor SABR 512 MB, descargador V12 HLS y estabilizacion MSE.',
      creditI18n: 'Idiomas Soportados (Zero-Overhead): English (EN - Predeterminado), Portugues (PT) y Espanol (ES) con deteccion automatica del navegador.',
      creditLicense: 'Licencia Open Source: GNU General Public License v3.0 (GPL-3.0 Copyleft) — Codigo 100% abierto, libre y auditable.',
      creditVersion: 'Version: 2.2.0 (Manifest V3 — Motor SABR 512 MB, Hardware VP9 SDR y Descargador V12 HLS/MP4).',
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
    smartDropGuard: true
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
  let activeTabInfo = null;
  const activeDownloads = new Map();

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

  const elMetricResolution = document.getElementById('metric-resolution');
  const elMetricCodec = document.getElementById('metric-codec');
  const elMetricBuffer = document.getElementById('metric-buffer');
  const elBufferBarFill = document.getElementById('buffer-bar-fill');

  const elDownloaderCountBadge = document.getElementById('downloader-count-badge');
  const elDownloaderTabHost = document.getElementById('downloader-tab-host');
  const elBtnRefreshMedia = document.getElementById('btn-refresh-media');
  const elDownloaderEmptyState = document.getElementById('downloader-empty-state');
  const elDownloaderMediaList = document.getElementById('downloader-media-list');

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
    elToggleDropGuard
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
   * Escapes HTML special characters for safe DOM insertion
   * @param {string} str
   * @returns {string}
   */
  function escapeHtml(str) {
    if (!str) {
      return '';
    }
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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
    loadTabMedia();
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
        if (targetId === 'tab-downloader') {
          loadTabMedia();
        }
      });
    });
  }

  /**
   * Initializes collapsible dropdown menu for the 9 buffer & codec features
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
   * Updates the X/9 active features badge on the dropdown header
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
      smartDropGuard: elToggleDropGuard ? elToggleDropGuard.checked : true
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
      'smartDropGuard'
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
   * Updates the Green/Red switch-style indicator next to "Apply Now"
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
    }
  }

  // =========================================================================
  // TAB 2: Web Video & V12 HLS Downloader Controller
  // =========================================================================

  /**
   * Updates the media count badge on the Downloader tab button
   * @param {number} count
   */
  function updateDownloaderBadge(count) {
    if (!elDownloaderCountBadge) {
      return;
    }
    if (count > 0) {
      elDownloaderCountBadge.textContent = String(count);
      elDownloaderCountBadge.style.display = 'inline-block';
    } else {
      elDownloaderCountBadge.style.display = 'none';
    }
  }

  /**
   * Renders empty state when no downloadable videos are found on the active tab
   */
  function renderEmptyMedia() {
    updateDownloaderBadge(0);
    if (elDownloaderEmptyState) {
      elDownloaderEmptyState.style.display = 'flex';
    }
    if (elDownloaderMediaList) {
      elDownloaderMediaList.style.display = 'none';
      elDownloaderMediaList.innerHTML = '';
    }
  }

  /**
   * Renders detected video/HLS stream cards
   * @param {Array<object>} items
   */
  function renderMediaList(items) {
    if (!elDownloaderMediaList || !elDownloaderEmptyState) {
      return;
    }

    updateDownloaderBadge(items.length);
    elDownloaderEmptyState.style.display = 'none';
    elDownloaderMediaList.style.display = 'flex';
    elDownloaderMediaList.innerHTML = '';

    items.forEach(function (item, index) {
      const card = document.createElement('div');
      card.className = 'media-card';
      card.id = `card-${item.id}`;

      const isHls = item.type === 'hls';
      const badgeClass = isHls ? 'hls' : 'mp4';
      const badgeText = isHls ? 'HLS M3U8' : item.ext ? item.ext.toUpperCase() : 'VIDEO';

      let displayTitle = item.title;
      if (!displayTitle || displayTitle === 'Detected Video' || displayTitle === 'Vídeo detectado') {
        displayTitle =
          activeTabInfo && activeTabInfo.title
            ? activeTabInfo.title.replace(/\s*[-–|•]\s*.*$/, '').trim()
            : `Video ${index + 1}`;
      }

      card.innerHTML = `
        <div class="media-header">
          <span class="media-title" title="${escapeHtml(displayTitle)}">${escapeHtml(displayTitle)}</span>
          <span class="badge-tag ${badgeClass}">${badgeText}</span>
        </div>
        <div class="media-url" title="${escapeHtml(item.url)}">${escapeHtml(item.url)}</div>
        <button type="button" class="btn-download" id="btn-${item.id}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          <span>${escapeHtml(t('dlBtnDownload'))}</span>
        </button>
        <div class="progress-container" id="prog-wrap-${item.id}">
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" id="prog-fill-${item.id}"></div>
          </div>
          <div class="progress-meta">
            <span class="progress-status-text" id="prog-text-${item.id}">...</span>
            <span id="prog-pct-${item.id}">0%</span>
          </div>
        </div>
        <div class="status-error" id="err-${item.id}" style="display: none;"></div>
      `;

      const btn = card.querySelector(`#btn-${item.id}`);
      if (btn) {
        btn.addEventListener('click', function () {
          handleDownloadClick(item, displayTitle);
        });
      }

      elDownloaderMediaList.appendChild(card);
    });
  }

  /**
   * Displays an error message inside a media card
   * @param {string} itemId
   * @param {string} message
   */
  function showDownloadError(itemId, message) {
    const errBox = document.getElementById(`err-${itemId}`);
    if (errBox) {
      errBox.textContent = message;
      errBox.style.display = 'block';
    }
  }

  /**
   * Initiates a V12 12-worker HLS download or direct MP4/WebM download
   * @param {object} item
   * @param {string} displayTitle
   */
  function handleDownloadClick(item, displayTitle) {
    if (!activeTabInfo || typeof activeTabInfo.id !== 'number') {
      return;
    }

    const btn = document.getElementById(`btn-${item.id}`);
    const progWrap = document.getElementById(`prog-wrap-${item.id}`);
    const progFill = document.getElementById(`prog-fill-${item.id}`);
    const progText = document.getElementById(`prog-text-${item.id}`);
    const progPct = document.getElementById(`prog-pct-${item.id}`);
    const errBox = document.getElementById(`err-${item.id}`);

    if (errBox) {
      errBox.style.display = 'none';
    }

    if (item.type === 'hls') {
      if (btn) {
        btn.disabled = true;
        const span = btn.querySelector('span');
        if (span) {
          span.textContent = t('dlBtnDownloading');
        }
      }
      if (progWrap) {
        progWrap.style.display = 'block';
      }
      if (progFill) {
        progFill.style.width = '2%';
      }
      if (progPct) {
        progPct.textContent = '2%';
      }
      if (progText) {
        progText.textContent = t('dlBtnDownloading');
      }

      activeDownloads.set(item.url, item.id);

      chrome.tabs.sendMessage(
        activeTabInfo.id,
        {
          action: 'START_HLS_DOWNLOAD',
          url: item.url,
          title: displayTitle
        },
        function (response) {
          if (chrome.runtime.lastError) {
            showDownloadError(item.id, t('dlErrRefresh'));
            if (btn) {
              btn.disabled = false;
              const span = btn.querySelector('span');
              if (span) {
                span.textContent = t('dlBtnDownload');
              }
            }
          } else if (response && !response.success) {
            showDownloadError(item.id, response.error || 'Download failed to start.');
            if (btn) {
              btn.disabled = false;
              const span = btn.querySelector('span');
              if (span) {
                span.textContent = t('dlBtnDownload');
              }
            }
          }
        }
      );
    } else {
      if (btn) {
        btn.disabled = true;
        const span = btn.querySelector('span');
        if (span) {
          span.textContent = t('dlBtnSending');
        }
      }

      const safeFilename =
        (typeof DownloaderUtils !== 'undefined'
          ? DownloaderUtils.sanitizeFilename(displayTitle)
          : 'video') +
        '.' +
        (item.ext || 'mp4');

      chrome.runtime.sendMessage(
        {
          action: 'DOWNLOAD_DIRECT_FILE',
          url: item.url,
          filename: safeFilename
        },
        function (response) {
          if (response && response.success) {
            if (btn) {
              const span = btn.querySelector('span');
              if (span) {
                span.textContent = t('dlBtnSaved');
              }
              setTimeout(function () {
                btn.disabled = false;
                if (span) {
                  span.textContent = t('dlBtnDownloadAgain');
                }
              }, 4000);
            }
          } else {
            showDownloadError(
              item.id,
              response && response.error ? response.error : 'Direct download failed.'
            );
            if (btn) {
              btn.disabled = false;
              const span = btn.querySelector('span');
              if (span) {
                span.textContent = t('dlBtnRetry');
              }
            }
          }
        }
      );
    }
  }

  /**
   * Queries the active tab and loads its detected media list from the Service Worker
   */
  function loadTabMedia() {
    if (!chrome || !chrome.tabs || !chrome.runtime) {
      return;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (chrome.runtime.lastError || !tabs || !tabs[0]) {
        renderEmptyMedia();
        return;
      }

      activeTabInfo = tabs[0];

      if (elDownloaderTabHost) {
        try {
          const urlObj = new URL(activeTabInfo.url || '');
          elDownloaderTabHost.textContent = urlObj.hostname || 'Active Page';
        } catch (e) {
          elDownloaderTabHost.textContent = 'Active Page';
        }
      }

      chrome.runtime.sendMessage(
        {
          action: 'GET_TAB_MEDIA',
          tabId: activeTabInfo.id
        },
        function (response) {
          if (chrome.runtime.lastError || !response || !Array.isArray(response.list)) {
            renderEmptyMedia();
            return;
          }

          if (response.list.length === 0) {
            renderEmptyMedia();
          } else {
            renderMediaList(response.list);
          }
        }
      );
    });
  }

  // Listen for real-time HLS download progress from Content Controller
  if (chrome && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function (msg) {
      if (!msg || !msg.url) {
        return;
      }
      const itemId = activeDownloads.get(msg.url);
      if (!itemId) {
        return;
      }

      const btn = document.getElementById(`btn-${itemId}`);
      const progFill = document.getElementById(`prog-fill-${itemId}`);
      const progText = document.getElementById(`prog-text-${itemId}`);
      const progPct = document.getElementById(`prog-pct-${itemId}`);

      if (msg.action === 'HLS_DOWNLOAD_PROGRESS' && msg.progress) {
        const p = msg.progress;
        if (progFill) {
          progFill.style.width = `${p.percent}%`;
        }
        if (progPct) {
          progPct.textContent = `${p.percent}%`;
        }
        if (progText) {
          progText.textContent = p.text || t('dlBtnDownloading');
        }
      }

      if (msg.action === 'HLS_DOWNLOAD_COMPLETE') {
        if (progFill) {
          progFill.style.width = '100%';
        }
        if (progPct) {
          progPct.textContent = '100%';
        }
        if (progText) {
          progText.textContent = t('dlBtnSaved');
        }
        if (btn) {
          const span = btn.querySelector('span');
          if (span) {
            span.textContent = t('dlBtnSaved');
          }
          setTimeout(function () {
            btn.disabled = false;
            if (span) {
              span.textContent = t('dlBtnDownloadAgain');
            }
          }, 5000);
        }
        activeDownloads.delete(msg.url);
      }

      if (msg.action === 'HLS_DOWNLOAD_ERROR') {
        showDownloadError(itemId, msg.error || 'Download error.');
        if (btn) {
          btn.disabled = false;
          const span = btn.querySelector('span');
          if (span) {
            span.textContent = t('dlBtnRetry');
          }
        }
        activeDownloads.delete(msg.url);
      }
    });
  }

  if (elBtnRefreshMedia) {
    elBtnRefreshMedia.addEventListener('click', loadTabMedia);
  }

  /**
   * Requests fresh state from the Background Service Worker and active YouTube tab
   */
  function refreshTelemetry() {
    if (!chrome || !chrome.runtime) {
      return;
    }

    const tabId = activeTabInfo && typeof activeTabInfo.id === 'number' ? activeTabInfo.id : undefined;

    chrome.runtime.sendMessage({ type: 'MQ4K_GET_DASHBOARD_STATE', tabId: tabId }, function (response) {
      if (chrome.runtime.lastError || !response || !response.ok) {
        return;
      }
      if (typeof response.mediaCount === 'number') {
        updateDownloaderBadge(response.mediaCount);
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
                    files: [
                      'src/core/utils.js',
                      'src/core/hls-downloader.js',
                      'src/content/content-controller.js'
                    ],
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
    elToggleDropGuard
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
  loadTabMedia();

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
