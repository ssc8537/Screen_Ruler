(() => {
  "use strict";

  const STORAGE_KEY = "physical-screen-ruler-calibration-v1";
  const REFERENCES = {
    "a4-half-width": {
      length: 10.5,
      hint: "把 A4 纸短边对折，使用折后的一半宽度。纸张越平整、对齐越仔细，结果越准。"
    },
    "a4-width": {
      length: 21,
      hint: "使用 A4 纸 21 cm 的短边。屏幕足够宽时优先用这个，长度越大，手动对齐误差越小。"
    },
    "a4-height": {
      length: 29.7,
      hint: "使用 A4 纸 29.7 cm 的长边。适合大屏或竖向校准，注意不要让纸张弯曲。"
    },
    "id-card-long": {
      length: 8.56,
      hint: "身份证、银行卡和多数交通卡都接近 ID-1 标准，长边为 8.56 cm。"
    },
    "id-card-short": {
      length: 5.398,
      hint: "身份证、银行卡和多数交通卡的短边约为 5.40 cm。边越短，误差影响越明显。"
    },
    "rmb-100-long": {
      length: 15.5,
      hint: "使用 100 元人民币长边。纸币要尽量铺平，卷边会影响对齐。"
    },
    "rmb-50-long": {
      length: 15,
      hint: "使用 50 元人民币长边。建议贴紧屏幕并保持纸币平直。"
    },
    "rmb-20-long": {
      length: 14.5,
      hint: "使用 20 元人民币长边。比卡片更长，通常更容易校准。"
    },
    "rmb-10-long": {
      length: 14,
      hint: "使用 10 元人民币长边。适合没有 A4 纸或卡片时校准。"
    },
    "rmb-5-long": {
      length: 13.5,
      hint: "使用 5 元人民币长边。新版 5 元纸币长度为 13.5 cm。"
    },
    "rmb-1-long": {
      length: 13,
      hint: "使用 1 元人民币纸币长边。不同磨损状态会影响边缘平直度。"
    },
    "coin-1y-2019": {
      length: 2.225,
      hint: "2019 年版 1 元硬币直径较短，仅适合作为应急校准；请多次对齐取稳定结果。"
    },
    "coin-1y-old": {
      length: 2.5,
      hint: "旧版 1 元硬币直径为 2.50 cm。硬币长度短，误差会被放大，建议仅应急使用。"
    },
    "coin-5jiao": {
      length: 2.05,
      hint: "5 角硬币直径为 2.05 cm。因为直径较短，建议优先使用纸张或纸币。"
    },
    "coin-1jiao": {
      length: 1.9,
      hint: "1 角硬币直径为 1.90 cm。只能作为兜底方案，手动误差会比较明显。"
    }
  };

  const elements = {
    referenceType: document.querySelector("#referenceType"),
    referenceHint: document.querySelector("#referenceHint"),
    customLengthWrap: document.querySelector("#customLengthWrap"),
    referenceLength: document.querySelector("#referenceLength"),
    referenceDisplay: document.querySelector("#referenceDisplay"),
    calibrationRange: document.querySelector("#calibrationRange"),
    calibrationRuler: document.querySelector("#calibrationRuler"),
    rulerEnd: document.querySelector("#rulerEnd"),
    pixelDisplay: document.querySelector("#pixelDisplay"),
    saveCalibration: document.querySelector("#saveCalibration"),
    resetCalibration: document.querySelector("#resetCalibration"),
    calibrationState: document.querySelector("#calibrationState"),
    refreshMeasurements: document.querySelector("#refreshMeasurements"),
    resultEmpty: document.querySelector("#resultEmpty"),
    resultContent: document.querySelector("#resultContent"),
    widthValue: document.querySelector("#widthValue"),
    heightValue: document.querySelector("#heightValue"),
    diagonalValue: document.querySelector("#diagonalValue"),
    diagonalInches: document.querySelector("#diagonalInches"),
    visualWidth: document.querySelector("#visualWidth"),
    visualHeight: document.querySelector("#visualHeight"),
    monitorVisual: document.querySelector("#monitorVisual"),
    resolutionValue: document.querySelector("#resolutionValue"),
    ratioValue: document.querySelector("#ratioValue"),
    scaleValue: document.querySelector("#scaleValue"),
    rulerEmpty: document.querySelector("#rulerEmpty"),
    screenRulerContent: document.querySelector("#screenRulerContent"),
    rulerLengthNumber: document.querySelector("#rulerLengthNumber"),
    rulerLengthRange: document.querySelector("#rulerLengthRange"),
    rulerLengthDisplay: document.querySelector("#rulerLengthDisplay"),
    screenRuler: document.querySelector("#screenRuler"),
    rulerTicks: document.querySelector("#rulerTicks"),
    rulerHelp: document.querySelector("#rulerHelp")
  };

  function getReferenceItem() {
    return REFERENCES[elements.referenceType.value] || null;
  }

  function getReferenceLength() {
    const reference = getReferenceItem();
    if (reference) return reference.length;
    const length = Number.parseFloat(elements.referenceLength.value);
    return Number.isFinite(length) && length > 0 ? length : NaN;
  }

  function getScreenInfo() {
    // screen.width/height and CSS layout pixels share the browser's coordinate system.
    // This makes a physical calibration valid even when Windows display scaling is enabled.
    const width = Number(window.screen?.width) || window.innerWidth;
    const height = Number(window.screen?.height) || window.innerHeight;
    return {
      width,
      height,
      ratio: width / height,
      dpr: window.devicePixelRatio || 1,
      signature: `${width}x${height}@${window.devicePixelRatio || 1}`
    };
  }

  function formatCm(value) {
    return `${value.toFixed(2)} cm`;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function getRatioLabel(width, height) {
    const candidates = [
      [16, 9], [16, 10], [3, 2], [4, 3], [21, 9], [32, 9], [5, 4]
    ];
    const ratio = width / height;
    const closest = candidates.reduce((best, candidate) => {
      const error = Math.abs(candidate[0] / candidate[1] - ratio);
      return error < best.error ? { candidate, error } : best;
    }, { candidate: candidates[0], error: Infinity });
    return closest.error < 0.025
      ? `${closest.candidate[0]} : ${closest.candidate[1]}`
      : `${width} : ${height}`;
  }

  function getCalibration() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved || !Number.isFinite(saved.pixelsPerCm) || saved.pixelsPerCm <= 0) return null;
      return saved;
    } catch {
      return null;
    }
  }

  function setState(message, success = false) {
    elements.calibrationState.textContent = message;
    elements.calibrationState.classList.toggle("is-success", success);
  }

  function getRulerLength() {
    const value = Number.parseFloat(elements.rulerLengthNumber.value);
    return Number.isFinite(value) ? clamp(value, 1, 80) : 15;
  }

  function syncRulerLength(value) {
    const length = clamp(Number(value), 1, 80);
    elements.rulerLengthNumber.value = length.toFixed(length % 1 === 0 ? 0 : 1);
    elements.rulerLengthRange.value = String(length);
    elements.rulerLengthDisplay.value = `${length.toFixed(1)} cm`;
    return length;
  }

  function buildRulerTicks(lengthCm, pixelsPerCm) {
    const totalMillimeters = Math.round(lengthCm * 10);
    const fragment = document.createDocumentFragment();

    elements.rulerTicks.textContent = "";
    for (let millimeter = 0; millimeter <= totalMillimeters; millimeter += 1) {
      const tick = document.createElement("span");
      const isCentimeter = millimeter % 10 === 0;
      const isHalfCentimeter = millimeter % 5 === 0;

      tick.className = isCentimeter ? "tick tick-cm" : isHalfCentimeter ? "tick tick-half" : "tick";
      tick.style.left = `${millimeter * pixelsPerCm / 10}px`;

      if (isCentimeter && millimeter > 0) {
        const label = document.createElement("em");
        label.textContent = String(millimeter / 10);
        tick.append(label);
      }
      fragment.append(tick);
    }
    elements.rulerTicks.append(fragment);
  }

  function updateScreenRuler(calibration) {
    if (!calibration) {
      elements.rulerEmpty.classList.remove("is-hidden");
      elements.screenRulerContent.classList.add("is-hidden");
      elements.rulerLengthNumber.disabled = true;
      elements.rulerLengthRange.disabled = true;
      return;
    }

    const length = syncRulerLength(getRulerLength());
    const rulerPixels = Math.max(1, Math.round(length * calibration.pixelsPerCm));

    elements.rulerEmpty.classList.add("is-hidden");
    elements.screenRulerContent.classList.remove("is-hidden");
    elements.rulerLengthNumber.disabled = false;
    elements.rulerLengthRange.disabled = false;
    elements.screenRuler.style.width = `${rulerPixels}px`;
    elements.screenRuler.setAttribute("aria-label", `真实长度 ${length.toFixed(1)} 厘米的屏幕直尺`);
    elements.rulerHelp.textContent = `当前直尺 ${length.toFixed(1)} cm，比例 ${calibration.pixelsPerCm.toFixed(2)} px/cm。把物品从 0 刻度开始贴着直尺边缘读取。`;
    buildRulerTicks(length, calibration.pixelsPerCm);
  }

  function updateCalibrationPreview() {
    const length = getReferenceLength();
    const pixels = Number(elements.calibrationRange.value);
    const valid = Number.isFinite(length);
    const label = valid ? `${length.toFixed(2)} cm` : "请输入长度";
    const reference = getReferenceItem();
    const isCustom = elements.referenceType.value === "custom";

    elements.customLengthWrap.classList.toggle("is-hidden", !isCustom);
    elements.referenceHint.textContent = reference
      ? reference.hint
      : "输入你亲自测量过的实物长度，例如绳子、木条、书本边长或两枚物品拼接后的长度。";
    elements.referenceDisplay.value = label;
    elements.rulerEnd.textContent = label;
    elements.pixelDisplay.value = `${pixels} px`;
    elements.calibrationRuler.style.width = `${pixels}px`;
    elements.saveCalibration.disabled = !valid;
  }

  function displayMeasurements(calibration, note = "") {
    const screen = getScreenInfo();
    const widthCm = screen.width / calibration.pixelsPerCm;
    const heightCm = screen.height / calibration.pixelsPerCm;
    const diagonalCm = Math.hypot(widthCm, heightCm);
    const diagonalInches = diagonalCm / 2.54;

    elements.widthValue.textContent = formatCm(widthCm);
    elements.heightValue.textContent = formatCm(heightCm);
    elements.diagonalValue.textContent = formatCm(diagonalCm);
    elements.diagonalInches.textContent = `${diagonalInches.toFixed(1)} 英寸`;
    elements.visualWidth.textContent = formatCm(widthCm);
    elements.visualHeight.textContent = formatCm(heightCm);
    elements.resolutionValue.textContent = `${screen.width} × ${screen.height}`;
    elements.ratioValue.textContent = getRatioLabel(screen.width, screen.height);
    elements.scaleValue.textContent = `${calibration.pixelsPerCm.toFixed(2)} px / cm`;
    elements.monitorVisual.style.aspectRatio = `${screen.width} / ${screen.height}`;
    elements.resultEmpty.classList.add("is-hidden");
    elements.resultContent.classList.remove("is-hidden");
    updateScreenRuler(calibration);

    const screenChanged = calibration.signature !== screen.signature;
    const savedAt = calibration.savedAt ? new Date(calibration.savedAt).toLocaleString("zh-CN", { hour12: false }) : "刚刚";
    if (screenChanged) {
      setState("检测到屏幕参数已变化。当前结果可供参考，建议重新校准以确保准确。", false);
    } else if (note) {
      setState(note, true);
    } else {
      setState(`已使用本机校准（保存于 ${savedAt}）。`, true);
    }
  }

  function saveCalibration() {
    const referenceLength = getReferenceLength();
    const rulerPixels = Number(elements.calibrationRange.value);
    if (!Number.isFinite(referenceLength) || referenceLength <= 0 || rulerPixels <= 0) {
      setState("请输入有效的参照物长度后再保存。", false);
      return;
    }

    const calibration = {
      pixelsPerCm: rulerPixels / referenceLength,
      referenceLength,
      referenceType: elements.referenceType.value,
      rulerPixels,
      signature: getScreenInfo().signature,
      savedAt: new Date().toISOString()
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(calibration));
      window.dispatchEvent(new CustomEvent("floating-ruler:calibration-changed"));
      displayMeasurements(calibration, "校准已保存，测量结果已更新。");
    } catch {
      displayMeasurements(calibration, "校准已应用；浏览器未允许保存，因此刷新后需要重新校准。");
    }
  }

  function resetCalibration() {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* local storage may be unavailable */ }
    window.dispatchEvent(new CustomEvent("floating-ruler:calibration-changed"));
    elements.resultContent.classList.add("is-hidden");
    elements.resultEmpty.classList.remove("is-hidden");
    updateScreenRuler(null);
    setState("本机校准已清除。请重新对齐实物后保存。", false);
  }

  function restoreCalibration() {
    const calibration = getCalibration();
    if (!calibration) return;
    const previewPixels = Math.round(calibration.rulerPixels || calibration.pixelsPerCm * calibration.referenceLength);
    elements.calibrationRange.value = Math.min(Number(elements.calibrationRange.max), Math.max(Number(elements.calibrationRange.min), previewPixels));
    if (calibration.referenceType && elements.referenceType.querySelector(`option[value="${calibration.referenceType}"]`)) {
      elements.referenceType.value = calibration.referenceType;
    } else if (Object.entries(REFERENCES).some(([, item]) => Math.abs(calibration.referenceLength - item.length) <= 0.001)) {
      const matched = Object.entries(REFERENCES).find(([, item]) => Math.abs(calibration.referenceLength - item.length) <= 0.001);
      elements.referenceType.value = matched[0];
    } else {
      elements.referenceType.value = "custom";
      elements.referenceLength.value = calibration.referenceLength.toFixed(2);
    }
    updateCalibrationPreview();
    displayMeasurements(calibration);
  }

  elements.referenceType.addEventListener("change", updateCalibrationPreview);
  elements.referenceLength.addEventListener("input", updateCalibrationPreview);
  elements.calibrationRange.addEventListener("input", updateCalibrationPreview);
  elements.saveCalibration.addEventListener("click", saveCalibration);
  elements.resetCalibration.addEventListener("click", resetCalibration);
  elements.rulerLengthNumber.addEventListener("input", () => updateScreenRuler(getCalibration()));
  elements.rulerLengthRange.addEventListener("input", () => {
    syncRulerLength(elements.rulerLengthRange.value);
    updateScreenRuler(getCalibration());
  });
  elements.refreshMeasurements.addEventListener("click", () => {
    const calibration = getCalibration();
    if (calibration) displayMeasurements(calibration, "已重新读取当前屏幕信息。");
    else setState("尚未校准。请先使用左侧的实物标尺完成校准。", false);
  });
  window.addEventListener("resize", () => {
    const calibration = getCalibration();
    if (calibration) displayMeasurements(calibration);
  });

  updateCalibrationPreview();
  updateScreenRuler(getCalibration());
  restoreCalibration();
})();
