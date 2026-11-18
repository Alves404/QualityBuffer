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
      tabAbout: 'Sobre & Creditos',
      metricResLabel: 'Resolucao / Stream',
      metricWaiting: 'Aguardando...',
      metricBufLabel: 'Buffer & Estabilidade',
      labelTargetQuality: 'Qualidade Alvo do Player',
      btnApplyNow: 'Aplicar Agora',
      optQ2160: '2160p (4K Ultra HD) - Recomendado',
      optQ1440: '1440p (2K Quad HD)',
      optQ1080: '1080p (Full HD)',
      optQAuto: 'Automatico (Apenas Otimizar Codec/Estabilidade)',
      labelBufferHorizon: 'Perfil de Estabilidade de Reproducao',
      optBuf120: 'Equilibrado (VP9 Hardware + Protecao Auto - Recomendado)',
      optBuf180: 'Priorizar Qualidade (Manter Resolucao Alvo)',
      optBuf60: 'Economia de GPU & Rede (30fps + Step-Down Rapido)',
      dropdownTitle: 'Funcionalidades',
      activeCountSuffix: 'ativos',
      featPrefetchTitle: 'Warm-up Passivo de Conexao CDN',
      featPrefetchDesc: 'Pre-aquece nos de midia googlevideo.com via PerformanceObserver (dns-prefetch e preconnect).',
      featAv1Title: 'Preferir VP9 Hardware sobre AV1',
      featAv1Desc: 'Orienta o MediaCapabilities para decodificacao VP9 na GPU sem quebrar videos exclusivos em AV1.',
      featHdrTitle: 'Preferir SDR 8-bit sobre HDR 10-bit',
      featHdrDesc: 'Evita sobrecarga de tonemapping em GPUs de 4 GB VRAM mantendo resolucao 2160p fluida.',
      featFpsTitle: 'Preferir Streams a 30fps (Alivio de GPU)',
      featFpsDesc: 'Desprioriza 60fps no MediaCapabilities para reduzir pela metade a carga de decodificacao em PCs modestos.',
      featMseTitle: 'Recuperacao Conservadora de Micro-Gaps MSE',
      featMseDesc: 'Avanca lacunas de tempo no SourceBuffer apenas apos travamentos reais de multiplos segundos.',
      featAmbientTitle: 'Desativar Modo Ambiente (Economia de GPU)',
      featAmbientDesc: 'Remove o canvas de iluminacao desfocada do YouTube para liberar VRAM e GPU.',
      featDropTitle: 'Protecao Adaptativa de Queda e Rebuffer',
      featDropDesc: 'Reduz 1 nivel de resolucao automaticamente se houver perda severa de quadros ou engasgos repetidos.',
      dlSectionTitle: 'Download de Video',
      dlEmptyTitle: 'Nenhum video detectado',
      dlEmptyDesc: 'Inicie a reproducao de um video nesta aba para capturar streams HLS (M3U8 / AES-128) ou MP4/WebM automaticamente.',
      dlBtnDownload: 'Baixar Video',
      dlBtnDownloading: 'Acelerando MP4...',
      dlBtnSending: 'Enviando ao Chrome...',
      dlBtnSaved: 'Concluido com Sucesso!',
      dlBtnRetry: 'Tentar Novamente',
      dlBtnDownloadAgain: 'Baixar Novamente',
      dlErrRefresh: 'Atualize a pagina (F5) para ativar o assistente de download nesta aba.',
      aboutArchTitle: 'Arquitetura & Engenharia Humana v2.3.1',
      aboutArchBody: 'Idealizado, projetado e arquitetado por Joao Vitor Magalhaes Alves (Google Student Ambassador 2026). O QualityBuffer otimiza a reproducao 4K/HD no YouTube usando preferencia nao-destrutiva de hardware VP9 via MediaCapabilities, controle oficial de qualidade Ad-Safe, protecao adaptativa contra queda de quadros e o motor V12 de 12 conexoes para download de videos HLS (M3U8 / AES-128) e MP4 em sites externos.',
      aboutAiTitle: 'Nota de Desenvolvimento Assistido por IA (Gemini 4 Argon)',
      aboutAiBody: 'Este software foi concebido, arquitetado e direcionado por seu autor humano (Joao Vitor Magalhaes Alves). A implementacao tecnica dos modulos, otimizacoes de baixo nivel e documentacao contaram com o auxilio do assistente de programacao por IA Gemini 4 Argon (Google Antigravity), sob supervisao e diretrizes humanas.',
      aboutCreditsTitle: 'Creditos, Autoria e Licenca',
      creditAuthor: 'Autor Idealizador, Arquiteto de Software e Mantenedor: Joao Vitor Magalhaes Alves — Google Student Ambassador 2026',
      creditRepo: 'Repositorio Oficial no GitHub:',
      creditAi: 'Desenvolvimento Assistido por IA: Gemini 4 Argon (Google Antigravity) — Assistente de programacao para implementacao tecnica e otimizacoes sob direcao humana.',
      creditI18n: 'Idiomas Suportados (Zero-Overhead): English (EN - Padrao), Portugues (PT) e Espanol (ES) com deteccao automatica do navegador.',
      creditLicense: 'Licenca Open Source: GNU General Public License v3.0 (GPL-3.0 Copyleft) — Codigo 100% aberto, livre e auditavel.',
      creditVersion: 'Versao: 2.3.1 (Manifest V3 — Motor VP9 Hardware Seguro, Estabilidade Adaptativa & Downloader V12 HLS/MP4).',
      tooltipApplied: 'Verde: Alteracoes aplicadas',
      tooltipPending: 'Vermelho: Alteracoes nao aplicadas (clique em Aplicar Agora)',
      codecDefault: 'VP9 SDR (Padrao)',
      metricPaused: 'Pausado',
      metricIdle: 'Inativo',
      formatVideo: 'Vídeo (MP4)',
      formatAudio: 'Áudio (MP3)',
      dlBtnAudio: 'Baixar MP3',
      dlBtnDownloadingAudio: 'Acelerando MP3...',
      dlYtNoticeTitle: 'Downloads no YouTube Desativados',
      dlYtNoticeDesc: 'Em conformidade com as diretrizes da Chrome Web Store e os termos do YouTube, o download de mídia neste domínio foi desativado. A otimização 4K por GPU VP9 e proteção anti-travamento continuam 100% ativas.'
    }),
    en: Object.freeze({
      tabControls: 'Controls',
      tabAbout: 'About & Credits',
      metricResLabel: 'Resolution / Stream',
      metricWaiting: 'Waiting...',
      metricBufLabel: 'Buffer & Stability',
      labelTargetQuality: 'Target Player Quality',
      btnApplyNow: 'Apply Now',
      optQ2160: '2160p (4K Ultra HD) - Recommended',
      optQ1440: '1440p (2K Quad HD)',
      optQ1080: '1080p (Full HD)',
      optQAuto: 'Auto (Optimize Codec/Stability Only)',
      labelBufferHorizon: 'Playback Stability Profile',
      optBuf120: 'Balanced (Hardware VP9 & Auto Guard - Recommended)',
      optBuf180: 'Strict Quality (Hold Target Resolution)',
      optBuf60: 'GPU & Network Saver (30fps + Fast Step-Down)',
      dropdownTitle: 'Features',
      activeCountSuffix: 'active',
      featPrefetchTitle: 'Passive CDN Connection Warm-up',
      featPrefetchDesc: 'Pre-warms googlevideo.com media nodes via PerformanceObserver (dns-prefetch & preconnect).',
      featAv1Title: 'Prefer Hardware VP9 over AV1',
      featAv1Desc: 'Guides MediaCapabilities toward GPU VP9 decoding without breaking AV1-only videos.',
      featHdrTitle: 'Prefer 8-bit SDR over 10-bit HDR',
      featHdrDesc: 'Avoids heavy HDR shader tonemapping on 4 GB VRAM GPUs while keeping smooth 2160p.',
      featFpsTitle: 'Prefer 30fps Streams (GPU Relief)',
      featFpsDesc: 'Deprioritizes 60fps streams in MediaCapabilities to halve GPU decode load on modest PCs.',
      featMseTitle: 'Conservative MSE Micro-Gap Recovery',
      featMseDesc: 'Steps across buffered segment timestamp gaps only after genuine multi-second stalls.',
      featAmbientTitle: 'Disable Ambient Mode (GPU Saver)',
      featAmbientDesc: 'Removes YouTube blurred lighting canvas to free VRAM and GPU fill-rate.',
      featDropTitle: 'Adaptive Drop & Rebuffer Guard',
      featDropDesc: 'Steps down one resolution tier automatically if severe frame drops or repeated stalls occur.',
      dlSectionTitle: 'Video Download',
      dlEmptyTitle: 'No video streams detected',
      dlEmptyDesc: 'Play a video on the active page to capture HLS (M3U8 / AES-128) or direct MP4/WebM streams automatically.',
      dlBtnDownload: 'Download Video',
      dlBtnDownloading: 'Accelerating MP4...',
      dlBtnSending: 'Sending to Chrome...',
      dlBtnSaved: 'Completed Successfully!',
      dlBtnRetry: 'Retry Download',
      dlBtnDownloadAgain: 'Download Again',
      dlErrRefresh: 'Refresh the page (F5) to activate the download assistant on this tab.',
      aboutArchTitle: 'Human Architecture & System Design v2.3.0',
      aboutArchBody: 'Conceived, engineered, and architected by Joao Vitor Magalhaes Alves (Google Student Ambassador 2026). QualityBuffer optimizes 4K/HD YouTube playback using non-destructive MediaCapabilities hardware VP9 preference, ad-safe official player quality control, adaptive frame-drop protection, and the V12 12-worker HLS (M3U8 / AES-128) & MP4 web video downloader.',
      aboutAiTitle: 'AI-Assisted Development Notice (Gemini 4 Argon)',
      aboutAiBody: 'This software was conceived, architected, and directed by its human author (Joao Vitor Magalhaes Alves). The technical implementation, optimizations, and documentation were assisted by Gemini 4 Argon (Google Antigravity) acting strictly as an AI programming assistant under direct human supervision.',
      aboutCreditsTitle: 'Credits, Authorship & License',
      creditAuthor: 'Creator, Software Architect & Maintainer: Joao Vitor Magalhaes Alves — Google Student Ambassador 2026',
      creditRepo: 'Official Open Source Repository:',
      creditAi: 'AI-Assisted Development: Gemini 4 Argon (Google Antigravity) — Coding assistant for implementation, optimizations, and documentation under human direction.',
      creditI18n: 'Supported Languages (Zero-Overhead): English (EN - Default), Portugues (PT), and Espanol (ES) with automatic browser detection.',
      creditLicense: 'Open Source License: GNU General Public License v3.0 (GPL-3.0 Copyleft) — 100% free, open, and auditable source code.',
      creditVersion: 'Version: 2.3.0 (Manifest V3 — Safe Hardware VP9 Engine, Adaptive Stability Guard & V12 HLS/MP4 Downloader).',
      tooltipApplied: 'Green: Changes applied',
      tooltipPending: 'Red: Unapplied changes (click Apply Now)',
      codecDefault: 'VP9 SDR (Default)',
      metricPaused: 'Paused',
      metricIdle: 'Idle',
      formatVideo: 'Video (MP4)',
      formatAudio: 'Audio (MP3)',
      dlBtnAudio: 'Download MP3',
      dlBtnDownloadingAudio: 'Accelerating MP3...',
      dlYtNoticeTitle: 'YouTube Downloads Disabled',
      dlYtNoticeDesc: 'In compliance with Chrome Web Store policies and YouTube terms of service, media downloads are disabled on this domain. 4K hardware VP9 & anti-stutter optimizations remain 100% active.'
    }),
    es: Object.freeze({
      tabControls: 'Controles',
      tabAbout: 'Acerca y Creditos',
      metricResLabel: 'Resolucion / Stream',
      metricWaiting: 'Esperando...',
      metricBufLabel: 'Buffer y Estabilidad',
      labelTargetQuality: 'Calidad Objetivo del Reproductor',
      btnApplyNow: 'Aplicar Ahora',
      optQ2160: '2160p (4K Ultra HD) - Recomendado',
      optQ1440: '1440p (2K Quad HD)',
      optQ1080: '1080p (Full HD)',
      optQAuto: 'Automatico (Solo Optimizar Codec/Estabilidad)',
      labelBufferHorizon: 'Perfil de Estabilidad de Reproduccion',
      optBuf120: 'Equilibrado (VP9 Hardware + Proteccion Auto - Recomendado)',
      optBuf180: 'Priorizar Calidad (Mantener Resolucion Objetivo)',
      optBuf60: 'Ahorro de GPU y Red (30fps + Step-Down Rapido)',
      dropdownTitle: 'Funcionalidades',
      activeCountSuffix: 'activos',
      featPrefetchTitle: 'Warm-up Pasivo de Conexion CDN',
      featPrefetchDesc: 'Pre-calienta nodos de medios googlevideo.com via PerformanceObserver (dns-prefetch y preconnect).',
      featAv1Title: 'Preferir VP9 Hardware sobre AV1',
      featAv1Desc: 'Orienta MediaCapabilities hacia decodificacion VP9 en GPU sin romper videos exclusivos en AV1.',
      featHdrTitle: 'Preferir SDR 8-bit sobre HDR 10-bit',
      featHdrDesc: 'Evita la sobrecarga de tonemapping en GPUs de 4 GB VRAM manteniendo 2160p fluido.',
      featFpsTitle: 'Preferir Streams a 30fps (Alivio de GPU)',
      featFpsDesc: 'Desprioriza 60fps en MediaCapabilities para reducir a la mitad la carga de decodificacion en PCs modestos.',
      featMseTitle: 'Recuperacion Conservadora de Micro-Gaps MSE',
      featMseDesc: 'Avanza brechas de tiempo en el SourceBuffer solo tras pausas reales de varios segundos.',
      featAmbientTitle: 'Desactivar Modo Ambiente (Ahorro de GPU)',
      featAmbientDesc: 'Elimina el canvas de iluminacion difuminada de YouTube para liberar VRAM y GPU.',
      featDropTitle: 'Proteccion Adaptativa de Caida y Rebuffer',
      featDropDesc: 'Reduce 1 nivel de resolucion automaticamente si hay perdida severa de cuadros o pausas repetidas.',
      dlSectionTitle: 'Descarga de Video',
      dlEmptyTitle: 'Ningun video detectado',
      dlEmptyDesc: 'Inicie la reproduccion de un video en esta pestana para capturar streams HLS (M3U8 / AES-128) o MP4/WebM automaticamente.',
      dlBtnDownload: 'Descargar Video',
      dlBtnDownloading: 'Acelerando MP4...',
      dlBtnSending: 'Enviando a Chrome...',
      dlBtnSaved: 'Completado con Exito!',
      dlBtnRetry: 'Reintentar',
      dlBtnDownloadAgain: 'Descargar de Nuevo',
      dlErrRefresh: 'Actualice la pagina (F5) para activar el asistente de descarga en esta pestana.',
      aboutArchTitle: 'Arquitectura & Ingenieria Humana v2.3.0',
      aboutArchBody: 'Ideado, disenado y arquitectado por Joao Vitor Magalhaes Alves (Google Student Ambassador 2026). QualityBuffer optimiza la reproduccion 4K/HD en YouTube mediante preferencia no destructiva de hardware VP9 en MediaCapabilities, control oficial de calidad Ad-Safe, proteccion adaptativa contra caida de cuadros y el motor V12 de 12 conexiones para descarga de videos HLS (M3U8 / AES-128) y MP4.',
      aboutAiTitle: 'Nota de Desarrollo Asistido por IA (Gemini 4 Argon)',
      aboutAiBody: 'Este software fue concebido, arquitectado y dirigido por su autor humano (Joao Vitor Magalhaes Alves). La implementacion tecnica, optimizaciones y documentacion contaron con la asistencia de la herramienta de programacion por IA Gemini 4 Argon (Google Antigravity) bajo supervision y directrices humanas.',
      aboutCreditsTitle: 'Creditos, Autoria y Licencia',
      creditAuthor: 'Autor Creador, Arquitecto de Software y Mantenedor: Joao Vitor Magalhaes Alves — Google Student Ambassador 2026',
      creditRepo: 'Repositorio Oficial en GitHub:',
      creditAi: 'Desarrollo Asistido por IA: Gemini 4 Argon (Google Antigravity) — Asistente de programacion para implementacion tecnica y optimizaciones bajo direccion humana.',
      creditI18n: 'Idiomas Soportados (Zero-Overhead): English (EN - Predeterminado), Portugues (PT) y Espanol (ES) con deteccion automatica del navegador.',
      creditLicense: 'Licencia Open Source: GNU General Public License v3.0 (GPL-3.0 Copyleft) — Codigo 100% abierto, libre y auditable.',
      creditVersion: 'Version: 2.3.0 (Manifest V3 — Motor VP9 Hardware Seguro, Estabilidad Adaptativa y Descargador V12 HLS/MP4).',
      tooltipApplied: 'Verde: Cambios aplicados',
      tooltipPending: 'Rojo: Cambios no aplicados (clic en Aplicar Ahora)',
      codecDefault: 'VP9 SDR (Predeterminado)',
      metricPaused: 'Pausado',
      metricIdle: 'Inactivo',
      formatVideo: 'Video (MP4)',
      formatAudio: 'Audio (MP3)',
      dlBtnAudio: 'Descargar MP3',
      dlBtnDownloadingAudio: 'Acelerando MP3...',
      dlYtNoticeTitle: 'Descargas de YouTube Deshabilitadas',
      dlYtNoticeDesc: 'De acuerdo con las políticas de Chrome Web Store y los términos de YouTube, la descarga de medios está deshabilitada en este dominio. La optimización 4K por GPU VP9 y protección anti-pausas permanece 100% activa.'
    })
  });

  const DEFAULT_CONFIG = {
    enabled: true,
    lang: detectBrowserLanguage(),
    userSelectedLang: null,
    targetQuality: 'hd2160',
    stabilityProfile: 'balanced',
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
  let lastNetworkSummary = null;
  let activeTabInfo = null;
  let lastMediaCount = -1;
  const activeDownloads = new Map();
  const cardSelectedFormats = new Map();

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

  const elToggleParallelPrefetch = document.getElementById('toggle-parallel-prefetch');
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

  const elDownloaderTabHost = document.getElementById('downloader-tab-host');
  const elBtnRefreshMedia = document.getElementById('btn-refresh-media');
  const elDownloaderEmptyState = document.getElementById('downloader-empty-state');
  const elDownloaderYtNotice = document.getElementById('downloader-yt-notice');
  const elDownloaderMediaList = document.getElementById('downloader-media-list');

  const i18nElements = document.querySelectorAll('[data-i18n]');

  const featureToggleElements = [
    elToggleParallelPrefetch,
    elToggleBlockAv1,
    elToggleBlockHdr,
    elToggleBlock60fps,
    elToggleStabilizeBuffer,
    elToggleDisableAmbient,
    elToggleDropGuard
  ];

  /**
   * Normalizes legacy numeric buffer horizon values (60/120/180) into stabilityProfile
   * @param {string|number} val
   * @returns {string}
   */
  function normalizeStabilityProfile(val) {
    if (val === 'strict_quality' || val === '180' || val === 180) {
      return 'strict_quality';
    }
    if (val === 'gpu_saver' || val === '60' || val === 60) {
      return 'gpu_saver';
    }
    return 'balanced';
  }

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
        if (targetId === 'tab-dashboard') {
          loadTabMedia();
        }
      });
    });
  }

  /**
   * Initializes collapsible dropdown menu for the 7 stability & codec features
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
   * Updates the X/7 active features badge on the dropdown header
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
    const profile = elSelectBufferTarget
      ? normalizeStabilityProfile(elSelectBufferTarget.value)
      : 'balanced';
    return {
      enabled: elToggleEnabled ? elToggleEnabled.checked : true,
      lang: currentLang,
      userSelectedLang: appliedConfig.userSelectedLang || null,
      targetQuality: elSelectQuality ? elSelectQuality.value : 'hd2160',
      stabilityProfile: profile,
      parallelPrefetch: elToggleParallelPrefetch ? elToggleParallelPrefetch.checked : true,
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
      'stabilityProfile',
      'parallelPrefetch',
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
   * Updates the button indicator: when changes are pending, Apply button turns red
   */
  function updateApplyStatusIndicator() {
    const uiCfg = readConfigFromUI();
    currentConfig = uiCfg;
    updateDropdownActiveCountBadge();

    const isApplied = isConfigEqual(uiCfg, appliedConfig);

    if (elBtnForceNow) {
      if (isApplied) {
        elBtnForceNow.classList.remove('is-pending');
        elBtnForceNow.title = t('tooltipApplied');
      } else {
        elBtnForceNow.classList.add('is-pending');
        elBtnForceNow.title = t('tooltipPending');
      }
    }

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
      elSelectBufferTarget.value = normalizeStabilityProfile(
        cfg.stabilityProfile || cfg.targetBufferSec
      );
    }
    if (elToggleParallelPrefetch) {
      elToggleParallelPrefetch.checked = cfg.parallelPrefetch !== false;
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
   * Updates dashboard telemetry cards with live buffer cushion, frame drop rate, and CDN throughput
   */
  function renderDashboardState(data) {
    if (!data) {
      return;
    }
    if (data.networkSummary) {
      lastNetworkSummary = data.networkSummary;
    }
    lastDashboardData = data;

    const player = data.playerTelemetry;
    const net = data.networkSummary || lastNetworkSummary;

    if (!player || player.hasActiveVideo === false || player.resolution === 'N/A') {
      if (elMetricResolution) {
        elMetricResolution.textContent = t('metricIdle');
      }
      if (elMetricCodec) {
        elMetricCodec.textContent = 'Codec: N/A';
      }
      if (elMetricBuffer) {
        elMetricBuffer.textContent = `0.0s (${t('metricIdle')})`;
      }
      if (elBufferBarFill) {
        elBufferBarFill.style.width = '0%';
        elBufferBarFill.classList.remove('buffer-low');
      }
      return;
    }

    const qLabel = QUALITY_LABELS[player.currentQuality] || player.currentQuality || 'Auto';
    const isPaused = Boolean(player.isPaused);
    const bufSec = Math.max(0, Number(player.bufferAheadSec || 0));
    const dropPct = Math.max(0, Number(player.dropRatePercent || 0));
    const mbps = net && typeof net.avgThroughputMbps === 'number' ? net.avgThroughputMbps : 0;

    if (elMetricResolution) {
      const resText =
        player.resolution && player.resolution !== 'N/A'
          ? `${qLabel} (${player.resolution})`
          : qLabel;
      elMetricResolution.textContent = isPaused ? `${resText} [${t('metricPaused')}]` : resText;
    }

    if (elMetricCodec) {
      elMetricCodec.textContent = `Codec: ${formatCodecLabel(player.videoMimeType)}`;
    }

    if (elMetricBuffer) {
      if (isPaused) {
        elMetricBuffer.textContent = `${bufSec.toFixed(1)}s [${t('metricPaused')}]`;
      } else if (mbps > 0) {
        elMetricBuffer.textContent = `${bufSec.toFixed(1)}s • ${mbps.toFixed(1)} Mbps`;
      } else {
        elMetricBuffer.textContent = `${bufSec.toFixed(1)}s • Drops: ${dropPct.toFixed(1)}%`;
      }
    }

    if (elBufferBarFill) {
      const healthyHorizonSec = 25;
      const pct = Math.min(100, Math.max(0, Math.round((bufSec / healthyHorizonSec) * 100)));
      elBufferBarFill.style.width = `${pct}%`;
      elBufferBarFill.classList.toggle('buffer-low', !isPaused && bufSec < 4);
    }
  }

  // =========================================================================
  // Web Video & V12 HLS Downloader Controller (Integrated in Controls)
  // =========================================================================

  /**
   * Checks whether a URL belongs to YouTube domain
   * @param {string} url
   * @returns {boolean}
   */
  function isYouTubeDomain(url) {
    if (!url || typeof url !== 'string') {
      return false;
    }
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      return host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be';
    } catch (e) {
      return false;
    }
  }

  /**
   * Renders empty state when no downloadable videos are found on the active tab
   */
  function renderEmptyMedia() {
    if (elDownloaderYtNotice) {
      elDownloaderYtNotice.style.display = 'none';
    }
    if (elDownloaderEmptyState) {
      elDownloaderEmptyState.style.display = 'flex';
    }
    if (elDownloaderMediaList) {
      elDownloaderMediaList.style.display = 'none';
      elDownloaderMediaList.innerHTML = '';
    }
  }

  /**
   * Renders YouTube policy compliance notice when the active tab is YouTube
   */
  function renderYouTubeNotice() {
    if (elDownloaderYtNotice) {
      elDownloaderYtNotice.style.display = 'flex';
    }
    if (elDownloaderEmptyState) {
      elDownloaderEmptyState.style.display = 'none';
    }
    if (elDownloaderMediaList) {
      elDownloaderMediaList.style.display = 'none';
      elDownloaderMediaList.innerHTML = '';
    }
  }

  /**
   * Renders detected video/HLS stream cards without raw URLs, deduplicating
   * multiple streams (e.g. WEBM + MP4/M4A) of the same video into a single card.
   * @param {Array<object>} items
   */
  function renderMediaList(items) {
    if (!elDownloaderMediaList || !elDownloaderEmptyState) {
      return;
    }

    if (elDownloaderYtNotice) {
      elDownloaderYtNotice.style.display = 'none';
    }
    elDownloaderEmptyState.style.display = 'none';
    elDownloaderMediaList.style.display = 'flex';
    elDownloaderMediaList.innerHTML = '';

    const deduplicatedMap = new Map();
    items.forEach(function (rawItem, idx) {
      let cleanTitle = rawItem.title;
      if (!cleanTitle || cleanTitle === 'Detected Video' || cleanTitle === 'Vídeo detectado') {
        cleanTitle =
          activeTabInfo && activeTabInfo.title
            ? activeTabInfo.title
            : `Video ${idx + 1}`;
      }
      cleanTitle = String(cleanTitle)
        .replace(/^\(\d+\)\s*/, '')
        .replace(/\s*\[[^\]]*\]\s*$/, '')
        .replace(/\s*[-–|•]\s*.*$/, '')
        .trim() || `Video ${idx + 1}`;

      const key = cleanTitle.toLowerCase();
      const isAudioOnly =
        rawItem.quality === 'Audio' ||
        rawItem.ext === 'm4a' ||
        (rawItem.label && rawItem.label.toLowerCase().includes('áudio'));

      if (!deduplicatedMap.has(key)) {
        deduplicatedMap.set(
          key,
          Object.assign({}, rawItem, {
            displayTitle: cleanTitle,
            ext: rawItem.type === 'hls' ? 'mp4' : 'mp4',
            audioUrl: rawItem.audioUrl || (isAudioOnly ? rawItem.url : null)
          })
        );
      } else {
        const existing = deduplicatedMap.get(key);
        if (isAudioOnly) {
          if (!existing.audioUrl || rawItem.ext === 'm4a') {
            existing.audioUrl = rawItem.url;
          }
        } else {
          if (existing.quality === 'Audio' && !existing.audioUrl) {
            existing.audioUrl = existing.url;
          }
          existing.url = rawItem.url;
          existing.type = rawItem.type === 'hls' ? 'hls' : 'mp4';
          existing.ext = 'mp4';
          if (rawItem.quality && rawItem.quality !== 'Audio' && rawItem.quality !== 'Video') {
            existing.quality = rawItem.quality;
          }
        }
      }
    });

    const uniqueItems = Array.from(deduplicatedMap.values());

    uniqueItems.forEach(function (item) {
      const card = document.createElement('div');
      card.className = 'media-card';
      card.id = `card-${item.id}`;

      const isHls = item.type === 'hls';
      const badgeClass = isHls ? 'hls' : 'mp4';
      const extLabel = isHls ? 'HLS M3U8' : 'MP4';
      const hasValidQuality =
        item.quality && item.quality !== 'Audio' && item.quality !== 'Video';
      const badgeText = isHls
        ? 'HLS M3U8'
        : hasValidQuality
          ? `${extLabel} • ${item.quality}`
          : extLabel;

      const displayTitle = item.displayTitle;
      const currentFmt = cardSelectedFormats.get(item.id) || 'mp4';

      card.innerHTML = `
        <div class="media-header">
          <span class="media-title" title="${escapeHtml(displayTitle)}">${escapeHtml(displayTitle)}</span>
          <span class="badge-tag ${badgeClass}">${escapeHtml(badgeText)}</span>
        </div>
        <div class="media-actions-row">
          <div class="format-pill-group" role="group" aria-label="Format Selector">
            <button type="button" class="format-pill-btn ${currentFmt === 'mp4' ? 'active' : ''}" data-format="mp4" data-item-id="${item.id}">MP4</button>
            <button type="button" class="format-pill-btn ${currentFmt === 'mp3' ? 'active' : ''}" data-format="mp3" data-item-id="${item.id}">MP3</button>
          </div>
          <button type="button" class="btn-download" id="btn-${item.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span id="btn-text-${item.id}">${escapeHtml(currentFmt === 'mp3' ? t('dlBtnAudio') : t('dlBtnDownload'))}</span>
          </button>
        </div>
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

      const pillButtons = card.querySelectorAll('.format-pill-btn');
      pillButtons.forEach(function (pill) {
        pill.addEventListener('click', function () {
          const selectedFmt = pill.getAttribute('data-format') || 'mp4';
          cardSelectedFormats.set(item.id, selectedFmt);
          pillButtons.forEach(function (p) {
            p.classList.toggle('active', p === pill);
          });
          const btnTextSpan = card.querySelector(`#btn-text-${item.id}`);
          if (btnTextSpan) {
            btnTextSpan.textContent = selectedFmt === 'mp3' ? t('dlBtnAudio') : t('dlBtnDownload');
          }
        });
      });

      const btn = card.querySelector(`#btn-${item.id}`);
      if (btn) {
        btn.addEventListener('click', function () {
          const selectedFmt = cardSelectedFormats.get(item.id) || 'mp4';
          handleDownloadClick(item, displayTitle, selectedFmt);
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
   * Initiates a V12 12-worker HLS download or direct MP4/MP3 download
   * @param {object} item
   * @param {string} displayTitle
   * @param {string} [selectedFormat="mp4"]
   */
  function handleDownloadClick(item, displayTitle, selectedFormat = 'mp4') {
    if (!activeTabInfo || typeof activeTabInfo.id !== 'number') {
      return;
    }

    const isMp3 = selectedFormat === 'mp3';
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
          span.textContent = isMp3 ? t('dlBtnDownloadingAudio') : t('dlBtnDownloading');
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
        progText.textContent = isMp3 ? t('dlBtnDownloadingAudio') : t('dlBtnDownloading');
      }

      activeDownloads.set(item.url, item.id);

      chrome.tabs.sendMessage(
        activeTabInfo.id,
        {
          action: 'START_HLS_DOWNLOAD',
          url: item.url,
          title: displayTitle,
          format: selectedFormat
        },
        function (response) {
          if (chrome.runtime.lastError) {
            showDownloadError(item.id, t('dlErrRefresh'));
            if (btn) {
              btn.disabled = false;
              const span = btn.querySelector('span');
              if (span) {
                span.textContent = isMp3 ? t('dlBtnAudio') : t('dlBtnDownload');
              }
            }
          } else if (response && !response.success) {
            showDownloadError(item.id, response.error || 'Download failed to start.');
            if (btn) {
              btn.disabled = false;
              const span = btn.querySelector('span');
              if (span) {
                span.textContent = isMp3 ? t('dlBtnAudio') : t('dlBtnDownload');
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

      const fileExt = isMp3 ? 'mp3' : (item.ext || 'mp4');
      const safeFilename =
        (typeof DownloaderUtils !== 'undefined'
          ? DownloaderUtils.sanitizeFilename(displayTitle, isMp3 ? 'Audio' : 'Video')
          : (isMp3 ? 'audio' : 'video')) +
        '.' +
        fileExt;

      const targetUrl = isMp3 && item.audioUrl ? item.audioUrl : item.url;

      chrome.runtime.sendMessage(
        {
          action: 'DOWNLOAD_DIRECT_FILE',
          url: targetUrl,
          filename: safeFilename,
          format: selectedFormat
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

      // Prohibit YouTube media downloading in compliance with Chrome Web Store policies
      if (isYouTubeDomain(activeTabInfo.url)) {
        renderYouTubeNotice();
        return;
      }

      function queryTabMediaFromWorker() {
        chrome.runtime.sendMessage(
          {
            action: 'GET_TAB_MEDIA',
            tabId: activeTabInfo.id
          },
          function (response) {
            if (chrome.runtime.lastError || !response || !Array.isArray(response.list)) {
              lastMediaCount = 0;
              renderEmptyMedia();
              return;
            }

            lastMediaCount = response.list.length;
            if (response.list.length === 0) {
              renderEmptyMedia();
            } else {
              renderMediaList(response.list);
            }
          }
        );
      }

      // On non-YouTube web pages, execute content scripts on-demand via activeTab permission
      if (
        chrome.scripting &&
        typeof chrome.scripting.executeScript === 'function' &&
        activeTabInfo.id &&
        activeTabInfo.url &&
        activeTabInfo.url.startsWith('http')
      ) {
        chrome.scripting.executeScript(
          {
            target: { tabId: activeTabInfo.id, allFrames: false },
            files: [
              'src/core/utils.js',
              'src/core/hls-downloader.js',
              'src/content/content-controller.js'
            ]
          },
          function () {
            if (chrome.runtime.lastError) {
              // Ignore injection errors on restricted pages
            }
            chrome.tabs.sendMessage(
              activeTabInfo.id,
              { action: 'SCAN_MEDIA_NOW' },
              function () {
                if (chrome.runtime.lastError) {
                  // Ignore
                }
                setTimeout(queryTabMediaFromWorker, 120);
              }
            );
          }
        );
      } else {
        queryTabMediaFromWorker();
      }
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

    if (!chrome.tabs || !chrome.tabs.query) {
      const tabId = activeTabInfo && typeof activeTabInfo.id === 'number' ? activeTabInfo.id : undefined;
      chrome.runtime.sendMessage({ type: 'MQ4K_GET_DASHBOARD_STATE', tabId: tabId }, function (response) {
        if (!chrome.runtime.lastError && response && response.ok) {
          renderDashboardState(response);
        }
      });
      return;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (!chrome.runtime.lastError && tabs && tabs.length > 0) {
        activeTabInfo = tabs[0];
      }
      const tabId = activeTabInfo && typeof activeTabInfo.id === 'number' ? activeTabInfo.id : undefined;

      // 1. Direct query to active tab content script for immediate, zero-latency metrics
      if (typeof tabId === 'number') {
        chrome.tabs.sendMessage(tabId, { type: 'MQ4K_GET_TAB_METRICS' }, function (tabResp) {
          if (!chrome.runtime.lastError && tabResp && tabResp.ok && tabResp.metrics) {
            renderDashboardState({
              playerTelemetry: tabResp.metrics,
              config: appliedConfig
            });
          }
        });
      }

      // 2. Also query Background Service Worker for mediaCount and persistent state
      chrome.runtime.sendMessage({ type: 'MQ4K_GET_DASHBOARD_STATE', tabId: tabId }, function (response) {
        if (chrome.runtime.lastError || !response || !response.ok) {
          return;
        }
        if (response.networkSummary) {
          lastNetworkSummary = response.networkSummary;
        }
        if (
          typeof response.mediaCount === 'number' &&
          response.mediaCount !== lastMediaCount &&
          activeDownloads.size === 0
        ) {
          loadTabMedia();
        }
        if (response.playerTelemetry) {
          renderDashboardState(response);
        }
      });
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
    elToggleParallelPrefetch,
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
        appliedConfig.stabilityProfile = normalizeStabilityProfile(
          appliedConfig.stabilityProfile || appliedConfig.targetBufferSec
        );
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
