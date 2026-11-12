(() => {
  "use strict";

  // @zxing/browser 0.2.1 (MIT), loaded on demand for camera decoding.
  const inputSelector = "input[data-ean-camera-input]";
  const sources = [
    "https://cdn.jsdelivr.net/npm/@zxing/browser@0.2.1/umd/zxing-browser.min.js",
    "https://unpkg.com/@zxing/browser@0.2.1/umd/zxing-browser.min.js",
  ];
  const state = {
    dialog: null,
    video: null,
    status: null,
    retry: null,
    activeInput: null,
    reader: null,
    controls: null,
    session: 0,
    libraryPromise: null,
    scanning: false,
    nativeDetector: null,
    scanTimer: null,
    nativeStartedAt: 0,
    torchButton: null,
    torchEnabled: false,
  };

  function setStatus(message, tone) {
    if (!state.status) return;
    state.status.textContent = message;
    if (tone) state.status.dataset.tone = tone;
    else delete state.status.dataset.tone;
  }

  function ensureDialog() {
    if (state.dialog && state.dialog.isConnected) return state.dialog;
    const dialog = document.createElement("dialog");
    dialog.className = "ean-camera-dialog";
    dialog.setAttribute("aria-labelledby", "ean-camera-title");
    dialog.innerHTML =
      '<div class="ean-camera-panel">' +
        '<header class="ean-camera-header">' +
          '<div><h2 id="ean-camera-title">Ler código EAN</h2><p>Aponte a câmera para o código de barras. A busca começa automaticamente.</p></div>' +
          '<button class="ean-camera-close-icon" type="button" data-ean-camera-close aria-label="Fechar câmera">×</button>' +
        '</header>' +
        '<div class="ean-camera-preview"><video muted playsinline aria-label="Imagem da câmera para leitura do código de barras"></video><span class="ean-camera-guide" aria-hidden="true"></span></div>' +
        '<p class="ean-camera-status" role="status" aria-live="polite">Preparando leitor…</p>' +
        '<div class="ean-camera-actions"><button class="ean-camera-action-button" type="button" data-ean-camera-retry hidden>Tentar novamente</button><button class="ean-camera-action-button" type="button" data-ean-camera-torch hidden aria-label="Ativar lanterna" aria-pressed="false">Ativar lanterna</button><button class="ean-camera-action-button is-primary" type="button" data-ean-camera-close>Fechar câmera</button></div>' +
      '</div>';
    document.body.appendChild(dialog);
    state.dialog = dialog;
    state.video = dialog.querySelector("video");
    state.status = dialog.querySelector(".ean-camera-status");
    state.retry = dialog.querySelector("[data-ean-camera-retry]");
    state.torchButton = dialog.querySelector("[data-ean-camera-torch]");

    dialog.querySelectorAll("[data-ean-camera-close]").forEach((button) => {
      button.addEventListener("click", closeScanner);
    });
    state.retry.addEventListener("click", retryScanner);
    state.torchButton.addEventListener("click", () => { void toggleTorch(); });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) closeScanner();
    });
    dialog.addEventListener("close", () => {
      invalidateSession();
    });
    return dialog;
  }

  function stopCamera(extraControls) {
    if (state.scanTimer !== null) {
      window.clearTimeout(state.scanTimer);
      state.scanTimer = null;
    }
    state.nativeDetector = null;
    state.nativeStartedAt = 0;
    state.torchEnabled = false;
    if (state.torchButton) {
      state.torchButton.hidden = true;
      state.torchButton.textContent = "Ativar lanterna";
      state.torchButton.setAttribute("aria-label", "Ativar lanterna");
      state.torchButton.setAttribute("aria-pressed", "false");
    }
    const controlsToStop = new Set([extraControls, state.controls].filter(Boolean));
    controlsToStop.forEach((controls) => {
      try { controls.stop(); } catch (_) {}
    });
    state.controls = null;
    try { state.reader?.reset(); } catch (_) {}
    state.reader = null;
    const stream = state.video?.srcObject;
    if (stream && typeof stream.getTracks === "function") {
      stream.getTracks().forEach((track) => {
        try { track.stop(); } catch (_) {}
      });
    }
    if (state.video) state.video.srcObject = null;
  }

  function invalidateSession() {
    state.session += 1;
    stopCamera();
    state.activeInput = null;
    state.scanning = false;
  }

  function closeScanner() {
    if (!state.dialog) return;
    invalidateSession();
    if (state.dialog.open) state.dialog.close();
    if (state.retry) state.retry.hidden = true;
  }

  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = url;
      script.async = true;
      script.crossOrigin = "anonymous";
      script.referrerPolicy = "no-referrer";
      script.onload = () => {
        script.remove();
        if (window.ZXingBrowser?.BrowserMultiFormatReader) resolve(window.ZXingBrowser);
        else reject(new Error("scanner_library_missing"));
      };
      script.onerror = () => {
        script.remove();
        reject(new Error("scanner_library_unavailable"));
      };
      document.head.appendChild(script);
    });
  }

  async function loadReaderLibrary() {
    if (window.ZXingBrowser?.BrowserMultiFormatReader) return window.ZXingBrowser;
    if (state.libraryPromise) return state.libraryPromise;
    state.libraryPromise = (async () => {
      for (const url of sources) {
        try {
          return await loadScript(url);
        } catch (_) {}
      }
      throw new Error("scanner_library_unavailable");
    })();
    try {
      return await state.libraryPromise;
    } catch (error) {
      state.libraryPromise = null;
      throw error;
    }
  }

  function explainCameraError(error) {
    const name = String(error?.name || error?.constructor?.name || "");
    if (!window.isSecureContext) return "A câmera funciona somente em uma página segura (HTTPS).";
    if (!navigator.mediaDevices?.getUserMedia) return "Este navegador não permite acessar a câmera nesta página.";
    if (/NotAllowed|PermissionDenied|Security/i.test(name)) return "Permita o acesso à câmera nas configurações do navegador e tente novamente.";
    if (/NotFound|DevicesNotFound/i.test(name)) return "Nenhuma câmera foi encontrada neste aparelho.";
    if (/NotReadable|TrackStart/i.test(name)) return "A câmera está em uso por outro aplicativo. Feche-o e tente novamente.";
    if (/Overconstrained/i.test(name)) return "Não foi possível selecionar uma câmera compatível. Tente novamente.";
    if (name === "scanner_library_unavailable") return "Não foi possível carregar o leitor de EAN. Verifique a conexão e tente novamente.";
    return "Não foi possível iniciar a câmera. Verifique a permissão e tente novamente.";
  }

  function showStartError(error, session) {
    if (session !== state.session || !state.dialog?.open) return;
    stopCamera();
    state.session += 1;
    state.scanning = false;
    setStatus(explainCameraError(error), "error");
    if (state.retry) state.retry.hidden = false;
  }

  function isValidEan(value) {
    return /^\d{8,14}$/.test(String(value || "").trim());
  }

  function dispatchSearch(input, ean) {
    input.value = ean;
    input.focus({ preventScroll: true });
    try {
      input.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType: "insertFromPaste",
        data: ean,
      }));
    } catch (_) {
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    if (input.dataset.eanCameraSubmit !== "false" && input.form && typeof input.form.requestSubmit === "function") {
      input.form.requestSubmit();
    }
  }

  function acceptEan(ean, scanControls) {
    if (state.scanning || !isValidEan(ean)) return;
    state.scanning = true;
    const input = state.activeInput;
    state.session += 1;
    stopCamera(scanControls);
    state.activeInput = null;
    if (state.dialog?.open) state.dialog.close();
    if (state.retry) state.retry.hidden = true;
    if (input && input.isConnected && !input.disabled && !input.readOnly) dispatchSearch(input, ean);
  }

  function cameraConstraints() {
    return {
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30 },
      },
    };
  }

  async function createNativeDetector() {
    const Detector = window.BarcodeDetector;
    if (typeof Detector !== "function" || typeof Detector.getSupportedFormats !== "function") return null;
    try {
      const supported = await Detector.getSupportedFormats();
      const formats = ["ean_13", "ean_8", "upc_a", "upc_e", "itf", "code_128"]
        .filter((format) => supported.includes(format));
      return formats.length ? new Detector({ formats }) : null;
    } catch (_) {
      return null;
    }
  }

  function zxingHints(ZXing) {
    const hints = new Map();
    const formatNames = ["EAN_13", "EAN_8", "UPC_A", "UPC_E", "ITF", "CODE_128"];
    const formats = formatNames.map((name) => ZXing.BarcodeFormat?.[name]).filter(Boolean);
    if (formats.length && ZXing.DecodeHintType?.POSSIBLE_FORMATS) {
      hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, formats);
    }
    if (ZXing.DecodeHintType?.TRY_HARDER) {
      hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
    }
    return hints;
  }

  async function tuneCameraTrack() {
    const track = state.video?.srcObject?.getVideoTracks?.()[0];
    if (!track) return;
    try {
      const modes = track.getCapabilities?.().focusMode;
      if (Array.isArray(modes) && modes.includes("continuous")) {
        await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] });
      }
    } catch (_) {}
    syncTorchButton();
  }

  function syncTorchButton() {
    if (!state.torchButton) return;
    let supported = false;
    try {
      const track = state.video?.srcObject?.getVideoTracks?.()[0];
      supported = track?.getCapabilities?.().torch === true;
    } catch (_) {}
    state.torchButton.hidden = !supported;
    state.torchButton.disabled = !supported;
  }

  async function toggleTorch() {
    const button = state.torchButton;
    const track = state.video?.srcObject?.getVideoTracks?.()[0];
    if (!button || !track) return;
    const enabled = !state.torchEnabled;
    try {
      await track.applyConstraints({ advanced: [{ torch: enabled }] });
      state.torchEnabled = enabled;
      button.textContent = enabled ? "Desligar lanterna" : "Ativar lanterna";
      button.setAttribute("aria-label", enabled ? "Desativar lanterna" : "Ativar lanterna");
      button.setAttribute("aria-pressed", enabled ? "true" : "false");
    } catch (_) {
      button.hidden = true;
      setStatus("Lanterna indisponível. Mantenha o código em local bem iluminado.", "error");
    }
  }

  function handleScanResult(rawValue, scanControls, session) {
    if (session !== state.session || !state.dialog?.open || state.scanning) return false;
    const ean = String(rawValue || "").trim();
    if (!isValidEan(ean)) return false;
    setStatus("EAN lido. Buscando produto…", "success");
    acceptEan(ean, scanControls);
    return true;
  }

  async function startZXingCamera(input, session) {
    stopCamera();
    const ZXing = await loadReaderLibrary();
    if (session !== state.session || !state.dialog?.open) return;
    const reader = new ZXing.BrowserMultiFormatReader(zxingHints(ZXing));
    state.reader = reader;
    const controls = await reader.decodeFromConstraints(
      cameraConstraints(),
      state.video,
      (result, error, scanControls) => {
        if (session !== state.session || !state.dialog?.open || state.scanning || !result) return;
        const rawValue = typeof result.getText === "function" ? result.getText() : "";
        handleScanResult(rawValue, scanControls, session);
      },
    );
    if (session !== state.session || !state.dialog?.open) {
      controls.stop();
      return;
    }
    state.controls = controls;
    await tuneCameraTrack();
    setStatus("Leitor compatível ativo. Aproxime o código até as barras preencherem a faixa.");
  }

  function scanWithNativeDetector(detector, input, session) {
    const scanFrame = async () => {
      if (session !== state.session || !state.dialog?.open || state.scanning) return;
      if (state.video?.readyState >= 2) {
        try {
          const results = await detector.detect(state.video);
          for (const result of results || []) {
            if (handleScanResult(result.rawValue, null, session)) return;
          }
        } catch (_) {
          if (session !== state.session || !state.dialog?.open) return;
          setStatus("Ativando leitor compatível para este código…");
          void startZXingCamera(input, session).catch((error) => showStartError(error, session));
          return;
        }
      }
      if (session !== state.session || !state.dialog?.open || state.scanning) return;
      if (state.nativeStartedAt && Date.now() - state.nativeStartedAt >= 8000) {
        setStatus("Ativando leitura de maior compatibilidade…");
        void startZXingCamera(input, session).catch((error) => showStartError(error, session));
        return;
      }
      state.scanTimer = window.setTimeout(scanFrame, 120);
    };
    void scanFrame();
  }

  async function startCamera(input, session) {
    setStatus("Preparando câmera e leitor de códigos…");
    if (!window.isSecureContext) {
      showStartError(new Error("insecure_context"), session);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      showStartError(new Error("camera_unavailable"), session);
      return;
    }

    try {
      const detector = await createNativeDetector();
      if (session !== state.session || !state.dialog?.open) return;
      if (detector) {
        const stream = await navigator.mediaDevices.getUserMedia(cameraConstraints());
        if (session !== state.session || !state.dialog?.open) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        state.video.srcObject = stream;
        await state.video.play();
        if (session !== state.session || !state.dialog?.open) {
          stopCamera();
          return;
        }
        state.nativeDetector = detector;
        state.nativeStartedAt = Date.now();
        await tuneCameraTrack();
        setStatus("Leitor rápido ativo. Mantenha o EAN dentro da faixa e aproxime se necessário.");
        scanWithNativeDetector(detector, input, session);
        return;
      }
      await startZXingCamera(input, session);
    } catch (error) {
      showStartError(error, session);
    }
  }
  function openScanner(input) {
    if (!input || !input.isConnected || input.disabled || input.readOnly) return;
    const dialog = ensureDialog();
    if (dialog.open) return;
    state.session += 1;
    state.activeInput = input;
    state.scanning = false;
    state.retry.hidden = true;
    setStatus("Preparando leitor…");
    dialog.showModal();
    void startCamera(input, state.session);
  }

  function retryScanner() {
    const input = state.activeInput;
    if (!input || !input.isConnected || input.disabled || input.readOnly) {
      closeScanner();
      return;
    }
    state.session += 1;
    state.scanning = false;
    state.retry.hidden = true;
    void startCamera(input, state.session);
  }

  function syncCameraButton(input) {
    const button = input.closest(".ean-camera-control")?.querySelector(".ean-camera-button");
    if (button) button.disabled = input.disabled || input.readOnly;
  }

  function enhanceInput(input) {
    if (!(input instanceof HTMLInputElement) || input.dataset.eanCameraEnhanced === "true") return;
    const parent = input.parentElement;
    if (!parent) return;
    let wrapper = input.closest(".ean-camera-control");
    if (!wrapper) {
      wrapper = document.createElement("span");
      wrapper.className = "ean-camera-control";
      parent.insertBefore(wrapper, input);
      wrapper.appendChild(input);
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ean-camera-button";
    button.setAttribute("aria-label", "Abrir câmera para ler o EAN do produto");
    button.title = "Ler EAN com a câmera";
    button.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
        '<path d="M4 7.5h3l1.3-2h7.4l1.3 2h3A1.5 1.5 0 0 1 21.5 9v9A1.5 1.5 0 0 1 20 19.5H4A1.5 1.5 0 0 1 2.5 18V9A1.5 1.5 0 0 1 4 7.5Z"/>' +
        '<circle cx="12" cy="13.5" r="3.5"/>' +
      '</svg><span class="ean-camera-visually-hidden">Ler código EAN pela câmera</span>';
    wrapper.appendChild(button);
    input.dataset.eanCameraEnhanced = "true";
    syncCameraButton(input);
  }

  function enhanceNode(node) {
    if (!(node instanceof Element)) return;
    if (node.matches(inputSelector)) enhanceInput(node);
    node.querySelectorAll(inputSelector).forEach(enhanceInput);
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest(".ean-camera-button");
    if (!button) return;
    const input = button.closest(".ean-camera-control")?.querySelector(inputSelector);
    if (input) openScanner(input);
  });

  enhanceNode(document.documentElement);
  const observer = new MutationObserver((records) => {
    records.forEach((record) => {
      if (record.type === "attributes") {
        if (record.target instanceof HTMLInputElement && record.target.matches(inputSelector)) {
          syncCameraButton(record.target);
        }
        return;
      }
      record.addedNodes.forEach(enhanceNode);
    });
  });
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["disabled", "readonly"],
  });
  window.addEventListener("pagehide", closeScanner);
})();