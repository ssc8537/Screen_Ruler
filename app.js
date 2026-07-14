(function() {
    // ==================== DOM 元素 ====================
    const canvas = document.getElementById('main-canvas');
    const ctx = canvas.getContext('2d');
    const infoDisplay = document.getElementById('info-display');
    const calibrationOverlay = document.getElementById('calibration-overlay');
    const helpOverlay = document.getElementById('help-overlay');

    const btnRuler = document.getElementById('btn-ruler');
    const btnRect = document.getElementById('btn-rect');
    const btnResetRuler = document.getElementById('btn-reset-ruler');
    const btnCalibrate = document.getElementById('btn-calibrate');
    const btnMeasureScreen = document.getElementById('btn-measure-screen');
    const btnMeasureDiagonal = document.getElementById('btn-measure-diagonal');
    const btnHelp = document.getElementById('btn-help');

    // ==================== 状态变量 ====================
    let pixelsPerCm = null;
    let currentMode = 'ruler';
    let calibrationDone = false;

    // 直尺状态
    let rulerOrigin = { x: 0, y: 0 };
    let rulerEnd = { x: 0, y: 0 };
    let rulerDragging = null;
    let rulerDragOffset = { x: 0, y: 0 };

    // 矩形框状态
    let rectTopLeft = { x: 0, y: 0 };
    let rectBottomRight = { x: 0, y: 0 };
    let rectDragging = null;
    let rectDragOffset = { x: 0, y: 0 };
    let rectDragStart = { x: 0, y: 0 };
    let rectDragStartTL = { x: 0, y: 0 };
    let rectDragStartBR = { x: 0, y: 0 };

    // 通用
    let shiftHeld = false;
    let cursorPos = { x: 0, y: 0 };
    let hoveredHandle = null;
    let activePointerId = null; // 用于 pointer capture

    // ==================== 常量 ====================
    const HANDLE_RADIUS = 11;
    const RULER_BODY_WIDTH = 34;
    const RECT_HANDLE_SIZE = 14;
    const ANGLE_SNAP = 7.5;
    const SNAP_ANGLES = [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180,
        195, 210, 225, 240, 255, 270, 285, 300, 315, 330, 345, 360
    ];
    const CARD_WIDTH_CM = 8.56;
    const CARD_HEIGHT_CM = 5.398;
    const CARD_ASPECT = CARD_WIDTH_CM / CARD_HEIGHT_CM;
    const ID_WIDTH_CM = 8.56;
    const ID_HEIGHT_CM = 5.4;
    const ID_ASPECT = ID_WIDTH_CM / ID_HEIGHT_CM;
    const A4_WIDTH_CM = 21;
    const A4_HEIGHT_CM = 29.7;
    const A4_ASPECT = A4_WIDTH_CM / A4_HEIGHT_CM;
    const COIN_DIAMETER_CM = 2.5;

    // ==================== 本地存储 ====================
    function saveCalibration() {
        try {
            localStorage.setItem('screen-measure-pixelsPerCm', JSON.stringify({
                value: pixelsPerCm,
                timestamp: Date.now(),
                screenWidth: window.screen.width,
                screenHeight: window.screen.height,
                innerWidth: window.innerWidth,
                innerHeight: window.innerHeight,
                devicePixelRatio: window.devicePixelRatio,
            }));
        } catch (e) {}
    }

    function loadCalibration() {
        try {
            const raw = localStorage.getItem('screen-measure-pixelsPerCm');
            if (!raw) return null;
            const data = JSON.parse(raw);
            const sameScreen = Math.abs((window.innerWidth || 0) - (data.innerWidth || 0)) < 100 &&
                Math.abs(window.devicePixelRatio - (data.devicePixelRatio || 1)) < 0.3;
            if (!sameScreen && data.timestamp && Date.now() - data.timestamp > 86400000) {
                return null;
            }
            return data.value;
        } catch (e) {
            return null;
        }
    }

    // ==================== 校准逻辑 ====================
    function setCalibration(pxPerCm) {
        pixelsPerCm = pxPerCm;
        calibrationDone = true;
        saveCalibration();
        calibrationOverlay.classList.add('hidden');
        resetRulerToDefault();
        resetRectToDefault();
    }

    function estimatePixelsPerCm() {
        const dpi = 96;
        const cmPerInch = 2.54;
        return dpi / cmPerInch;
    }

    function resetRulerToDefault() {
        if (!pixelsPerCm) return;
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        const defaultLenCm = Math.min(60, window.innerWidth / pixelsPerCm * 0.9);
        const defaultLenPx = defaultLenCm * pixelsPerCm;
        rulerOrigin = { x: cx - defaultLenPx / 2, y: cy };
        rulerEnd = { x: cx + defaultLenPx / 2, y: cy };
    }
    
    // 一键测量整个屏幕的功能
    function measureEntireScreen() {
        if (!pixelsPerCm) return;
        
        // 切换到矩形模式
        switchToRect();
        
        // 设置矩形为整个屏幕
        rectTopLeft = { x: 0, y: 0 };
        rectBottomRight = { x: window.innerWidth, y: window.innerHeight };
        
        hoveredHandle = null;
        rulerDragging = null;
        rectDragging = null;
        updateCursor();
        updateInfoDisplay();
    }
    
    // 一键测量屏幕对角线的功能
    function measureScreenDiagonal() {
        if (!pixelsPerCm) return;
        
        // 切换到直尺模式
        switchToRuler();
        
        // 设置直尺从屏幕左上角到右下角
        rulerOrigin = { x: 0, y: 0 };
        rulerEnd = { x: window.innerWidth, y: window.innerHeight };
        
        hoveredHandle = null;
        rulerDragging = null;
        rectDragging = null;
        updateCursor();
        updateInfoDisplay();
    }

    function resetRectToDefault() {
        if (!pixelsPerCm) return;
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        const wPx = 16 * pixelsPerCm;
        const hPx = 10 * pixelsPerCm;
        rectTopLeft = { x: cx - wPx / 2, y: cy - hPx / 2 };
        rectBottomRight = { x: cx + wPx / 2, y: cy + hPx / 2 };
    }

    // ==================== 初始化校准 ====================
    function initCalibration() {
        // 强制每次打开都校准，不读取旧的校准值
        pixelsPerCm = estimatePixelsPerCm();
        calibrationDone = false;
        calibrationOverlay.classList.remove('hidden');
        updateCalibrationUI();
    }

    // ==================== 校准面板UI更新 ====================
    function updateCalibrationUI() {
        // 确保所有校准项都不会超出校准面板（校准面板最大宽度620px，还要留一些边距）
        const maxWidth = 400; // 安全的最大宽度，考虑到面板的padding
        
        // 银行卡
        const cardSlider = document.getElementById('card-slider');
        const cardRefRect = document.getElementById('card-ref-rect');
        const cardPxVal = document.getElementById('card-px-val');
        const estimatedPxCard = CARD_WIDTH_CM * (pixelsPerCm || estimatePixelsPerCm());
        const initPxCard = Math.round(Math.min(maxWidth, Math.max(100, estimatedPxCard)));

        if (cardSlider && !cardSlider.dataset.initialized) {
            cardSlider.value = initPxCard;
            cardSlider.dataset.initialized = '1';
        }
        if (cardRefRect) {
            const w = parseInt(cardSlider?.value || initPxCard);
            const h = Math.round(w / CARD_ASPECT);
            cardRefRect.style.width = w + 'px';
            cardRefRect.style.height = h + 'px';
        }
        if (cardPxVal) cardPxVal.textContent = cardSlider?.value || initPxCard;

        // 身份证
        const idSlider = document.getElementById('id-slider');
        const idRefRect = document.getElementById('id-ref-rect');
        const idPxVal = document.getElementById('id-px-val');
        const estimatedPxId = ID_WIDTH_CM * (pixelsPerCm || estimatePixelsPerCm());
        const initPxId = Math.round(Math.min(maxWidth, Math.max(100, estimatedPxId)));

        if (idSlider && !idSlider.dataset.initialized) {
            idSlider.value = initPxId;
            idSlider.dataset.initialized = '1';
        }
        if (idRefRect) {
            const w = parseInt(idSlider?.value || initPxId);
            const h = Math.round(w / ID_ASPECT);
            idRefRect.style.width = w + 'px';
            idRefRect.style.height = h + 'px';
        }
        if (idPxVal) idPxVal.textContent = idSlider?.value || initPxId;

        // A4纸
        const a4Slider = document.getElementById('a4-slider');
        const a4RefRect = document.getElementById('a4-ref-rect');
        const a4PxVal = document.getElementById('a4-px-val');
        // 对于A4纸，我们保守一点，初始值设小一点，确保不会超出
        const estimatedPxA4 = A4_WIDTH_CM * (pixelsPerCm || estimatePixelsPerCm());
        const initPxA4 = Math.round(Math.min(maxWidth, Math.max(200, Math.min(estimatedPxA4, 300)))); // 最大初始值300px

        if (a4Slider && !a4Slider.dataset.initialized) {
            a4Slider.value = initPxA4;
            a4Slider.dataset.initialized = '1';
        }
        if (a4RefRect) {
            const w = parseInt(a4Slider?.value || initPxA4);
            const h = Math.round(w / A4_ASPECT);
            a4RefRect.style.width = w + 'px';
            a4RefRect.style.height = h + 'px';
        }
        if (a4PxVal) a4PxVal.textContent = a4Slider?.value || initPxA4;

        // 硬币
        const coinSlider = document.getElementById('coin-slider');
        const coinInnerCircle = document.getElementById('coin-inner-circle');
        const coinOuterCircle = document.getElementById('coin-outer-circle');
        const coinPxVal = document.getElementById('coin-px-val');
        const estimatedPxCoin = COIN_DIAMETER_CM * (pixelsPerCm || estimatePixelsPerCm());
        const initPxCoin = Math.round(Math.min(100, Math.max(30, estimatedPxCoin)));

        if (coinSlider && !coinSlider.dataset.initialized) {
            coinSlider.value = initPxCoin;
            coinSlider.dataset.initialized = '1';
        }
        if (coinInnerCircle) {
            const d = parseInt(coinSlider?.value || initPxCoin);
            coinInnerCircle.style.width = d + 'px';
            coinInnerCircle.style.height = d + 'px';
        }
        if (coinOuterCircle) {
            const d = parseInt(coinSlider?.value || initPxCoin);
            const outerD = d + 30; // 外圈比内圈大30px
            coinOuterCircle.style.width = outerD + 'px';
            coinOuterCircle.style.height = outerD + 'px';
        }
        if (coinPxVal) coinPxVal.textContent = coinSlider?.value || initPxCoin;

        const manualLine = document.getElementById('manual-line');
        if (manualLine) {
            manualLine.style.width = '400px';
        }
    }

    // ==================== 事件监听：校准面板 ====================
    document.getElementById('card-slider')?.addEventListener('input', function() {
        const w = parseInt(this.value);
        const h = Math.round(w / CARD_ASPECT);
        const cardRefRect = document.getElementById('card-ref-rect');
        const cardPxVal = document.getElementById('card-px-val');
        if (cardRefRect) {
            cardRefRect.style.width = w + 'px';
            cardRefRect.style.height = h + 'px';
        }
        if (cardPxVal) cardPxVal.textContent = w;
    });

    document.getElementById('btn-card-confirm')?.addEventListener('click', function() {
        const w = parseInt(document.getElementById('card-slider').value);
        const pxPerCm = w / CARD_WIDTH_CM;
        setCalibration(pxPerCm);
        updateCalibrationUI();
    });

    document.getElementById('btn-manual-confirm')?.addEventListener('click', function() {
        const cmVal = parseFloat(document.getElementById('manual-cm-input').value);
        if (cmVal && cmVal > 0) {
            const pxPerCm = 400 / cmVal;
            setCalibration(pxPerCm);
            updateCalibrationUI();
        } else {
            alert('请输入有效的厘米数。');
        }
    });

    document.getElementById('btn-direct-confirm')?.addEventListener('click', function() {
        const widthCm = parseFloat(document.getElementById('direct-width-cm').value);
        const resX = parseInt(document.getElementById('direct-res-x').value);
        if (widthCm && widthCm > 0 && resX && resX > 0) {
            const pxPerCm = resX / widthCm;
            setCalibration(pxPerCm);
            updateCalibrationUI();
        } else {
            alert('请输入有效的数值。');
        }
    });

    // 身份证
    document.getElementById('id-slider')?.addEventListener('input', function() {
        const w = parseInt(this.value);
        const h = Math.round(w / ID_ASPECT);
        const idRefRect = document.getElementById('id-ref-rect');
        const idPxVal = document.getElementById('id-px-val');
        if (idRefRect) {
            idRefRect.style.width = w + 'px';
            idRefRect.style.height = h + 'px';
        }
        if (idPxVal) idPxVal.textContent = w;
    });

    document.getElementById('btn-id-confirm')?.addEventListener('click', function() {
        const w = parseInt(document.getElementById('id-slider').value);
        const pxPerCm = w / ID_WIDTH_CM;
        setCalibration(pxPerCm);
        updateCalibrationUI();
    });

    // A4纸
    document.getElementById('a4-slider')?.addEventListener('input', function() {
        const w = parseInt(this.value);
        const h = Math.round(w / A4_ASPECT);
        const a4RefRect = document.getElementById('a4-ref-rect');
        const a4PxVal = document.getElementById('a4-px-val');
        if (a4RefRect) {
            a4RefRect.style.width = w + 'px';
            a4RefRect.style.height = h + 'px';
        }
        if (a4PxVal) a4PxVal.textContent = w;
    });

    document.getElementById('btn-a4-confirm')?.addEventListener('click', function() {
        const w = parseInt(document.getElementById('a4-slider').value);
        const pxPerCm = w / A4_WIDTH_CM;
        setCalibration(pxPerCm);
        updateCalibrationUI();
    });

    // 硬币
    document.getElementById('coin-slider')?.addEventListener('input', function() {
        const innerD = parseInt(this.value);
        const outerD = innerD + 30; // 外圈比内圈大30px
        const coinInnerCircle = document.getElementById('coin-inner-circle');
        const coinOuterCircle = document.getElementById('coin-outer-circle');
        const coinPxVal = document.getElementById('coin-px-val');
        
        if (coinInnerCircle) {
            coinInnerCircle.style.width = innerD + 'px';
            coinInnerCircle.style.height = innerD + 'px';
        }
        if (coinOuterCircle) {
            coinOuterCircle.style.width = outerD + 'px';
            coinOuterCircle.style.height = outerD + 'px';
        }
        if (coinPxVal) coinPxVal.textContent = innerD;
    });

    document.getElementById('btn-coin-confirm')?.addEventListener('click', function() {
        const innerD = parseInt(document.getElementById('coin-slider').value);
        const pxPerCm = innerD / COIN_DIAMETER_CM;
        setCalibration(pxPerCm);
        updateCalibrationUI();
    });


    // 校准面板选项卡切换
    document.querySelectorAll('#calibration-panel .tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const tabId = this.dataset.tab;
            document.querySelectorAll('#calibration-panel .tab-btn').forEach(b => b
                .classList.remove('active'));
            document.querySelectorAll('#calibration-panel .tab-content').forEach(c => c
                .classList.remove('active'));
            this.classList.add('active');
            const content = document.getElementById(tabId);
            if (content) content.classList.add('active');
            updateCalibrationUI();
        });
    });

    // ==================== Canvas渲染 ====================
    function resizeCanvas() {
        const dpr = window.devicePixelRatio || 1;
        const w = window.innerWidth;
        const h = window.innerHeight;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
    }

    function drawBackground() {
        ctx.fillStyle = '#0d0d1a';
        ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

        if (pixelsPerCm && pixelsPerCm > 5) {
            ctx.strokeStyle = 'rgba(255,255,255,0.03)';
            ctx.lineWidth = 1;
            const gridSpacing = pixelsPerCm;
            for (let x = gridSpacing; x < window.innerWidth; x += gridSpacing) {
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, window.innerHeight);
                ctx.stroke();
            }
            for (let y = gridSpacing; y < window.innerHeight; y += gridSpacing) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(window.innerWidth, y);
                ctx.stroke();
            }
        }
    }

    function getRulerAngle() {
        const dx = rulerEnd.x - rulerOrigin.x;
        const dy = rulerEnd.y - rulerOrigin.y;
        return Math.atan2(dy, dx);
    }

    function getRulerLengthPx() {
        const dx = rulerEnd.x - rulerOrigin.x;
        const dy = rulerEnd.y - rulerOrigin.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function getRulerLengthCm() {
        if (!pixelsPerCm || pixelsPerCm <= 0) return 0;
        return getRulerLengthPx() / pixelsPerCm;
    }

    function drawRuler() {
        if (!pixelsPerCm || pixelsPerCm <= 0) return;

        const ox = rulerOrigin.x;
        const oy = rulerOrigin.y;
        const ex = rulerEnd.x;
        const ey = rulerEnd.y;
        const dx = ex - ox;
        const dy = ey - oy;
        const lengthPx = Math.sqrt(dx * dx + dy * dy);
        if (lengthPx < 0.5) return;

        const angle = Math.atan2(dy, dx);
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        const halfW = RULER_BODY_WIDTH / 2;

        const corners = [
            { x: ox - sinA * halfW, y: oy + cosA * halfW },
            { x: ox + sinA * halfW, y: oy - cosA * halfW },
            { x: ex + sinA * halfW, y: ey - cosA * halfW },
            { x: ex - sinA * halfW, y: ey + cosA * halfW },
        ];

        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 14;
        ctx.shadowOffsetX = 3;
        ctx.shadowOffsetY = 3;

        const grad = ctx.createLinearGradient(ox, oy, ex, ey);
        grad.addColorStop(0, '#fdf6e3');
        grad.addColorStop(0.3, '#fefcf5');
        grad.addColorStop(0.5, '#fdf3d0');
        grad.addColorStop(0.7, '#fefcf5');
        grad.addColorStop(1, '#fdf6e3');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        ctx.lineTo(corners[1].x, corners[1].y);
        ctx.lineTo(corners[2].x, corners[2].y);
        ctx.lineTo(corners[3].x, corners[3].y);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        ctx.lineTo(corners[1].x, corners[1].y);
        ctx.lineTo(corners[2].x, corners[2].y);
        ctx.lineTo(corners[3].x, corners[3].y);
        ctx.closePath();
        ctx.stroke();

        const perpX = -sinA;
        const perpY = cosA;
        const cmInPx = pixelsPerCm;
        const totalCm = lengthPx / cmInPx;
        const maxCm = Math.floor(totalCm);

        for (let cm = 0; cm <= maxCm; cm++) {
            const t = cm * cmInPx / lengthPx;
            const cx = ox + dx * t;
            const cy = oy + dy * t;

            const tickLen = halfW * 1.9;
            const tx1 = cx - perpX * tickLen;
            const ty1 = cy - perpY * tickLen;
            const tx2 = cx + perpX * tickLen;
            const ty2 = cy + perpY * tickLen;

            ctx.strokeStyle = 'rgba(0,0,0,0.7)';
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(tx1, ty1);
            ctx.lineTo(tx2, ty2);
            ctx.stroke();

            const textOffset = halfW + 16;
            const textX = cx + perpX * textOffset;
            const textY = cy + perpY * textOffset;
            ctx.fillStyle = '#000';
            ctx.font = 'bold 11px "Segoe UI","PingFang SC","Microsoft YaHei",sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            let textAngle = angle;
            if (Math.abs(angle) > Math.PI / 2 && Math.abs(angle) < Math.PI * 3 / 2) {
                textAngle = angle + Math.PI;
            }
            ctx.save();
            ctx.translate(textX, textY);
            ctx.rotate(textAngle);
            ctx.fillText(cm + '', 0, 0);
            ctx.restore();
        }

        for (let halfCm = 0.5; halfCm <= totalCm; halfCm += 1) {
            if (Math.abs(halfCm - Math.round(halfCm)) < 0.01) continue;
            const t = halfCm * cmInPx / lengthPx;
            const cx = ox + dx * t;
            const cy = oy + dy * t;
            const tickLen = halfW * 1.3;
            const tx1 = cx - perpX * tickLen;
            const ty1 = cy - perpY * tickLen;
            const tx2 = cx + perpX * tickLen;
            const ty2 = cy + perpY * tickLen;

            ctx.strokeStyle = 'rgba(0,0,0,0.45)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(tx1, ty1);
            ctx.lineTo(tx2, ty2);
            ctx.stroke();
        }

        if (cmInPx > 30) {
            for (let mm = 0.1; mm <= totalCm; mm += 0.1) {
                if (Math.abs(mm - Math.round(mm * 2) / 2) < 0.005) continue;
                const t = mm * cmInPx / lengthPx;
                const cx = ox + dx * t;
                const cy = oy + dy * t;
                const tickLen = halfW * 0.7;
                const tx1 = cx - perpX * tickLen;
                const ty1 = cy - perpY * tickLen;
                const tx2 = cx + perpX * tickLen;
                const ty2 = cy + perpY * tickLen;

                ctx.strokeStyle = 'rgba(0,0,0,0.2)';
                ctx.lineWidth = 0.5;
                ctx.beginPath();
                ctx.moveTo(tx1, ty1);
                ctx.lineTo(tx2, ty2);
                ctx.stroke();
            }
        }

        drawHandle(ox, oy, '#ef476f', 'origin', '起点 (0cm)');
        drawHandle(ex, ey, '#4cc9f0', 'end', '终点 (' + getRulerLengthCm().toFixed(2) + 'cm)');

        if (hoveredHandle === 'body' || rulerDragging === 'body') {
            ctx.strokeStyle = 'rgba(255,255,255,0.6)';
            ctx.lineWidth = 2.5;
            ctx.setLineDash([6, 3]);
            ctx.beginPath();
            ctx.moveTo(corners[0].x, corners[0].y);
            ctx.lineTo(corners[1].x, corners[1].y);
            ctx.lineTo(corners[2].x, corners[2].y);
            ctx.lineTo(corners[3].x, corners[3].y);
            ctx.closePath();
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    function drawHandle(x, y, color, id, tooltip) {
        const glowGrad = ctx.createRadialGradient(x, y, HANDLE_RADIUS * 0.3, x, y, HANDLE_RADIUS * 1.8);
        glowGrad.addColorStop(0, color);
        glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(x, y, HANDLE_RADIUS * 1.8, 0, Math.PI * 2);
        ctx.fill();

        const isHovered = hoveredHandle === id || rulerDragging === id;
        const bodyGrad = ctx.createRadialGradient(x - 2, y - 2, HANDLE_RADIUS * 0.1, x, y, HANDLE_RADIUS);
        bodyGrad.addColorStop(0, '#ffffff');
        bodyGrad.addColorStop(0.6, color);
        bodyGrad.addColorStop(1, 'rgba(0,0,0,0.4)');
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.arc(x, y, HANDLE_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = isHovered ? '#fff' : 'rgba(255,255,255,0.6)';
        ctx.lineWidth = isHovered ? 3 : 2;
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(x, y, HANDLE_RADIUS * 0.35, 0, Math.PI * 2);
        ctx.fill();

        if (isHovered && tooltip) {
            ctx.fillStyle = 'rgba(0,0,0,0.85)';
            const tw = ctx.measureText(tooltip).width + 16;
            const th = 22;
            const tx = x - tw / 2;
            const ty = y - HANDLE_RADIUS - 28;
            ctx.beginPath();
            ctx.roundRect(tx, ty, tw, th, 6);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = '12px "Segoe UI","PingFang SC","Microsoft YaHei",sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(tooltip, x, ty + th / 2);
        }
    }

    function drawRectMeasure() {
        if (!pixelsPerCm || pixelsPerCm <= 0) return;
        const tl = rectTopLeft;
        const br = rectBottomRight;
        const tr = { x: br.x, y: tl.y };
        const bl = { x: tl.x, y: br.y };

        const wPx = br.x - tl.x;
        const hPx = br.y - tl.y;
        const wCm = Math.abs(wPx) / pixelsPerCm;
        const hCm = Math.abs(hPx) / pixelsPerCm;
        const diagCm = Math.sqrt(wCm * wCm + hCm * hCm);

        ctx.fillStyle = 'rgba(76,201,240,0.08)';
        ctx.fillRect(Math.min(tl.x, br.x), Math.min(tl.y, br.y), Math.abs(wPx), Math.abs(hPx));

        ctx.strokeStyle = 'rgba(76,201,240,0.7)';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([8, 3]);
        ctx.strokeRect(Math.min(tl.x, br.x), Math.min(tl.y, br.y), Math.abs(wPx), Math.abs(hPx));
        ctx.setLineDash([]);

        ctx.strokeStyle = 'rgba(247,37,133,0.5)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.moveTo(tl.x, tl.y);
        ctx.lineTo(br.x, br.y);
        ctx.stroke();
        ctx.setLineDash([]);

        const handles = [
            { x: tl.x, y: tl.y, id: 'tl' },
            { x: tr.x, y: tr.y, id: 'tr' },
            { x: bl.x, y: bl.y, id: 'bl' },
            { x: br.x, y: br.y, id: 'br' },
        ];
        handles.forEach(h => {
            drawRectHandle(h.x, h.y, h.id);
        });

        const midHandles = [
            { x: (tl.x + tr.x) / 2, y: tl.y, id: 'top' },
            { x: (bl.x + br.x) / 2, y: br.y, id: 'bottom' },
            { x: tl.x, y: (tl.y + bl.y) / 2, id: 'left' },
            { x: br.x, y: (tr.y + br.y) / 2, id: 'right' },
        ];
        midHandles.forEach(h => {
            drawRectMidHandle(h.x, h.y, h.id);
        });

        const cx = (tl.x + br.x) / 2;
        const cy = (tl.y + br.y) / 2;
        const infoText = [
            `宽: ${wCm.toFixed(2)} cm`,
            `高: ${hCm.toFixed(2)} cm`,
            `对角线: ${diagCm.toFixed(2)} cm`,
        ];
        const fontSize = 13;
        const lineHeight = 20;
        const totalH = infoText.length * lineHeight + 16;
        const maxTW = Math.max(...infoText.map(t => ctx.measureText(t).width));
        const bgW = maxTW + 24;
        const bgX = cx - bgW / 2;
        const bgY = cy - totalH / 2;

        ctx.fillStyle = 'rgba(0,0,0,0.78)';
        ctx.beginPath();
        ctx.roundRect(bgX, bgY, bgW, totalH, 10);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();

        infoText.forEach((t, i) => {
            ctx.fillStyle = i === 2 ? '#f72585' : '#4cc9f0';
            ctx.font = `bold ${fontSize}px "Segoe UI","PingFang SC","Microsoft YaHei",sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(t, cx, bgY + 12 + i * lineHeight);
        });
    }

    function drawRectHandle(x, y, id) {
        const isHovered = hoveredHandle === id || rectDragging === id;
        const size = RECT_HANDLE_SIZE;
        ctx.fillStyle = isHovered ? '#fff' : 'rgba(255,255,255,0.85)';
        ctx.strokeStyle = isHovered ? '#4cc9f0' : 'rgba(76,201,240,0.7)';
        ctx.lineWidth = isHovered ? 3 : 2;
        ctx.beginPath();
        ctx.roundRect(x - size / 2, y - size / 2, size, size, 4);
        ctx.fill();
        ctx.stroke();
        if (isHovered) {
            ctx.fillStyle = '#4cc9f0';
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function drawRectMidHandle(x, y, id) {
        const isHovered = hoveredHandle === id || rectDragging === id;
        const size = 10;
        ctx.fillStyle = isHovered ? '#fff' : 'rgba(255,255,255,0.6)';
        ctx.strokeStyle = isHovered ? '#f72585' : 'rgba(247,37,133,0.5)';
        ctx.lineWidth = isHovered ? 2.5 : 1.5;
        ctx.beginPath();
        ctx.roundRect(x - size / 2, y - size / 2, size, size, 3);
        ctx.fill();
        ctx.stroke();
    }

    function render() {
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        drawBackground();

        // 只有校准完成后才渲染尺子
        if (calibrationDone) {
            if (currentMode === 'ruler') {
                drawRuler();
            } else if (currentMode === 'rect') {
                drawRectMeasure();
            }
        }
    }

    // ==================== 碰撞检测 ====================
    function distToSegmentSq(px, py, ax, ay, bx, by) {
        const dx = bx - ax;
        const dy = by - ay;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) return (px - ax) ** 2 + (py - ay) ** 2;
        let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        const cx = ax + t * dx;
        const cy = ay + t * dy;
        return (px - cx) ** 2 + (py - cy) ** 2;
    }

    function getRulerHoverTarget(mx, my) {
        const distOrigin = Math.hypot(mx - rulerOrigin.x, my - rulerOrigin.y);
        if (distOrigin <= HANDLE_RADIUS + 4) return 'origin';

        const distEnd = Math.hypot(mx - rulerEnd.x, my - rulerEnd.y);
        if (distEnd <= HANDLE_RADIUS + 4) return 'end';

        const distBodySq = distToSegmentSq(mx, my, rulerOrigin.x, rulerOrigin.y, rulerEnd.x, rulerEnd.y);
        const halfW = RULER_BODY_WIDTH / 2 + 6;
        if (distBodySq <= halfW * halfW) return 'body';

        return null;
    }

    function getRectHoverTarget(mx, my) {
        const tl = rectTopLeft;
        const br = rectBottomRight;
        const tr = { x: br.x, y: tl.y };
        const bl = { x: tl.x, y: br.y };
        const halfS = RECT_HANDLE_SIZE / 2 + 4;

        const corners = [
            { x: tl.x, y: tl.y, id: 'tl' },
            { x: tr.x, y: tr.y, id: 'tr' },
            { x: bl.x, y: bl.y, id: 'bl' },
            { x: br.x, y: br.y, id: 'br' },
        ];
        for (const c of corners) {
            if (Math.abs(mx - c.x) <= halfS && Math.abs(my - c.y) <= halfS) return c.id;
        }

        const midHalfS = 7;
        const mids = [
            { x: (tl.x + tr.x) / 2, y: tl.y, id: 'top' },
            { x: (bl.x + br.x) / 2, y: br.y, id: 'bottom' },
            { x: tl.x, y: (tl.y + bl.y) / 2, id: 'left' },
            { x: br.x, y: (tr.y + br.y) / 2, id: 'right' },
        ];
        for (const m of mids) {
            if (Math.abs(mx - m.x) <= midHalfS && Math.abs(my - m.y) <= midHalfS) return m.id;
        }

        const minX = Math.min(tl.x, br.x);
        const maxX = Math.max(tl.x, br.x);
        const minY = Math.min(tl.y, br.y);
        const maxY = Math.max(tl.y, br.y);
        const borderThresh = 8;
        const insideX = mx >= minX - borderThresh && mx <= maxX + borderThresh;
        const insideY = my >= minY - borderThresh && my <= maxY + borderThresh;
        const onBorder = (Math.abs(my - minY) <= borderThresh || Math.abs(my - maxY) <= borderThresh ||
            Math.abs(mx - minX) <= borderThresh || Math.abs(mx - maxX) <= borderThresh);
        if (insideX && insideY && onBorder) return 'body';

        if (mx >= minX && mx <= maxX && my >= minY && my <= maxY) return 'body';

        return null;
    }

    function updateHoveredHandle(mx, my) {
        if (rulerDragging || rectDragging) return;
        if (currentMode === 'ruler') {
            hoveredHandle = getRulerHoverTarget(mx, my);
        } else if (currentMode === 'rect') {
            hoveredHandle = getRectHoverTarget(mx, my);
        } else {
            hoveredHandle = null;
        }
        updateCursor();
    }

    function updateCursor() {
        if (rulerDragging || rectDragging) {
            if (rulerDragging === 'body' || rectDragging === 'body') {
                canvas.style.cursor = 'move';
            } else if (rulerDragging === 'origin' || rulerDragging === 'end') {
                canvas.style.cursor = 'grab';
            } else if (rectDragging && ['tl', 'tr', 'bl', 'br'].includes(rectDragging)) {
                canvas.style.cursor = 'nwse-resize';
            } else if (rectDragging && ['top', 'bottom'].includes(rectDragging)) {
                canvas.style.cursor = 'ns-resize';
            } else if (rectDragging && ['left', 'right'].includes(rectDragging)) {
                canvas.style.cursor = 'ew-resize';
            } else {
                canvas.style.cursor = 'grab';
            }
            return;
        }
        if (!hoveredHandle) {
            canvas.style.cursor = 'default';
            return;
        }
        switch (hoveredHandle) {
            case 'origin':
            case 'end':
                canvas.style.cursor = 'grab';
                break;
            case 'body':
                canvas.style.cursor = 'move';
                break;
            case 'tl':
            case 'br':
                canvas.style.cursor = 'nwse-resize';
                break;
            case 'tr':
            case 'bl':
                canvas.style.cursor = 'nesw-resize';
                break;
            case 'top':
            case 'bottom':
                canvas.style.cursor = 'ns-resize';
                break;
            case 'left':
            case 'right':
                canvas.style.cursor = 'ew-resize';
                break;
            default:
                canvas.style.cursor = 'default';
        }
    }

    // ==================== 事件处理 ====================
    function getEventPos(e) {
        // 支持鼠标和触摸
        return { x: e.clientX, y: e.clientY };
    }

    function snapAngle(angleDeg) {
        let best = angleDeg;
        let bestDiff = 360;
        for (const sa of SNAP_ANGLES) {
            let diff = Math.abs(angleDeg - sa);
            if (diff > 180) diff = 360 - diff;
            if (diff < bestDiff) {
                bestDiff = diff;
                best = sa;
            }
        }
        if (bestDiff <= ANGLE_SNAP) return best * Math.PI / 180;
        return null;
    }

    function handlePointerDown(e) {
        if (calibrationOverlay && !calibrationOverlay.classList.contains('hidden')) return;
        if (helpOverlay && helpOverlay.style.display === 'flex') return;
        if (!calibrationDone) return;

        const pos = getEventPos(e);
        const mx = pos.x;
        const my = pos.y;

        // 获取捕获，保证拖拽可以超出窗口
        canvas.setPointerCapture(e.pointerId);
        activePointerId = e.pointerId;

        if (currentMode === 'ruler') {
            const target = getRulerHoverTarget(mx, my);
            if (target) {
                rulerDragging = target;
                rulerDragOffset = { x: mx, y: my };
                if (target === 'body') {
                    rulerDragOffset = { x: mx - rulerOrigin.x, y: my - rulerOrigin.y };
                }
                e.preventDefault();
                e.stopPropagation();
            } else {
                // 如果没有命中，释放捕获
                canvas.releasePointerCapture(e.pointerId);
                activePointerId = null;
            }
        } else if (currentMode === 'rect') {
            const target = getRectHoverTarget(mx, my);
            if (target) {
                rectDragging = target;
                rectDragStart = { x: mx, y: my };
                rectDragStartTL = { x: rectTopLeft.x, y: rectTopLeft.y };
                rectDragStartBR = { x: rectBottomRight.x, y: rectBottomRight.y };
                rectDragOffset = { x: mx - ((rectTopLeft.x + rectBottomRight.x) / 2), y: my - ((rectTopLeft
                        .y + rectBottomRight.y) / 2) };
                e.preventDefault();
                e.stopPropagation();
            } else {
                canvas.releasePointerCapture(e.pointerId);
                activePointerId = null;
            }
        }
        updateCursor();
    }

    function handlePointerMove(e) {
        const pos = getEventPos(e);
        const mx = pos.x;
        const my = pos.y;
        cursorPos = { x: mx, y: my };

        if (rulerDragging && currentMode === 'ruler') {
            if (rulerDragging === 'origin') {
                rulerOrigin = { x: mx, y: my };
            } else if (rulerDragging === 'end') {
                let newX = mx;
                let newY = my;
                if (shiftHeld) {
                    const dx = newX - rulerOrigin.x;
                    const dy = newY - rulerOrigin.y;
                    const angleDeg = Math.atan2(dy, dx) * 180 / Math.PI;
                    const snapped = snapAngle(angleDeg);
                    if (snapped !== null) {
                        const len = Math.sqrt(dx * dx + dy * dy);
                        newX = rulerOrigin.x + len * Math.cos(snapped);
                        newY = rulerOrigin.y + len * Math.sin(snapped);
                    }
                }
                rulerEnd = { x: newX, y: newY };
            } else if (rulerDragging === 'body') {
                const newOx = mx - rulerDragOffset.x;
                const newOy = my - rulerDragOffset.y;
                const dx = rulerEnd.x - rulerOrigin.x;
                const dy = rulerEnd.y - rulerOrigin.y;
                rulerOrigin = { x: newOx, y: newOy };
                rulerEnd = { x: newOx + dx, y: newOy + dy };
            }
        }

        if (rectDragging && currentMode === 'rect') {
            const dx = mx - rectDragStart.x;
            const dy = my - rectDragStart.y;
            let ntl = { x: rectDragStartTL.x, y: rectDragStartTL.y };
            let nbr = { x: rectDragStartBR.x, y: rectDragStartBR.y };

            switch (rectDragging) {
                case 'tl':
                    ntl = { x: rectDragStartTL.x + dx, y: rectDragStartTL.y + dy };
                    break;
                case 'tr':
                    nbr = { x: rectDragStartBR.x + dx, y: rectDragStartBR.y };
                    ntl = { x: rectDragStartTL.x, y: rectDragStartTL.y + dy };
                    break;
                case 'bl':
                    ntl = { x: rectDragStartTL.x + dx, y: rectDragStartTL.y };
                    nbr = { x: rectDragStartBR.x, y: rectDragStartBR.y + dy };
                    break;
                case 'br':
                    nbr = { x: rectDragStartBR.x + dx, y: rectDragStartBR.y + dy };
                    break;
                case 'top':
                    ntl = { x: rectDragStartTL.x, y: rectDragStartTL.y + dy };
                    break;
                case 'bottom':
                    nbr = { x: rectDragStartBR.x, y: rectDragStartBR.y + dy };
                    break;
                case 'left':
                    ntl = { x: rectDragStartTL.x + dx, y: rectDragStartTL.y };
                    break;
                case 'right':
                    nbr = { x: rectDragStartBR.x + dx, y: rectDragStartBR.y };
                    break;
                case 'body':
                    ntl = { x: rectDragStartTL.x + dx, y: rectDragStartTL.y + dy };
                    nbr = { x: rectDragStartBR.x + dx, y: rectDragStartBR.y + dy };
                    break;
            }
            rectTopLeft = ntl;
            rectBottomRight = nbr;
        }

        updateHoveredHandle(mx, my);
        updateInfoDisplay();
    }

    function handlePointerUp(e) {
        if (activePointerId !== null) {
            try { canvas.releasePointerCapture(activePointerId); } catch (ex) {}
            activePointerId = null;
        }
        rulerDragging = null;
        rectDragging = null;
        updateCursor();
        updateInfoDisplay();
    }

    function updateInfoDisplay() {
        if (!calibrationDone || !pixelsPerCm) {
            infoDisplay.classList.remove('visible');
            return;
        }
        let html = '';
        if (currentMode === 'ruler') {
            const lenCm = getRulerLengthCm();
            const angleDeg = (getRulerAngle() * 180 / Math.PI);
            const normDeg = ((angleDeg % 360) + 360) % 360;
            html = `<span class="highlight">📏 ${lenCm.toFixed(2)} cm</span> | 角度: ${normDeg.toFixed(1)}°`;
            if (rulerDragging) {
                html += ' | <span style="color:#f72585;">拖拽中...</span>';
            }
        } else if (currentMode === 'rect') {
            const wPx = Math.abs(rectBottomRight.x - rectTopLeft.x);
            const hPx = Math.abs(rectBottomRight.y - rectTopLeft.y);
            const wCm = wPx / pixelsPerCm;
            const hCm = hPx / pixelsPerCm;
            const diagCm = Math.sqrt(wCm * wCm + hCm * hCm);
            html =
                `宽: <span class="highlight">${wCm.toFixed(2)} cm</span> | 高: <span class="highlight">${hCm.toFixed(2)} cm</span> | <span class="highlight2">对角线: ${diagCm.toFixed(2)} cm</span>`;
        }
        if (html) {
            infoDisplay.innerHTML = html;
            infoDisplay.classList.add('visible');
        } else {
            infoDisplay.classList.remove('visible');
        }
    }

    // ==================== 键盘事件 ====================
    function handleKeyDown(e) {
        // 避免在输入框内触发快捷键
        if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement
                .tagName === 'TEXTAREA')) {
            return;
        }

        // 帮助和校准快捷键始终可用
        if (e.key === 'h' || e.key === 'H') {
            toggleHelp();
        }
        if (e.key === 'c' || e.key === 'C') {
            showCalibration();
        }
        if (e.key === 'Escape') {
            if (helpOverlay.style.display === 'flex') {
                helpOverlay.style.display = 'none';
            }
            rulerDragging = null;
            rectDragging = null;
            updateCursor();
        }

        // 其他快捷键只有校准完成后才可用
        if (!calibrationDone) {
            return;
        }

        if (e.key === 'Shift') {
            shiftHeld = true;
        }
        if (e.key === 'r' || e.key === 'R') {
            switchToRuler();
        }
        if (e.key === 'm' || e.key === 'M') {
            switchToRect();
        }
        if (e.key === '0' || e.key === 'Digit0') {
            // 重置当前工具的位置和大小
            if (currentMode === 'ruler') {
                resetRulerToDefault();
            } else if (currentMode === 'rect') {
                resetRectToDefault();
            }
            hoveredHandle = null;
            rulerDragging = null;
            rectDragging = null;
            updateCursor();
            updateInfoDisplay();
        }
        // 方向键微调（不按住 Shift 时）
        const step = shiftHeld ? 5 : 1;
        if (currentMode === 'ruler' && !rulerDragging) {
            if (e.key === 'ArrowLeft') rulerEnd.x -= step;
            if (e.key === 'ArrowRight') rulerEnd.x += step;
            if (e.key === 'ArrowUp') rulerEnd.y -= step;
            if (e.key === 'ArrowDown') rulerEnd.y += step;
        }
        if (currentMode === 'rect' && !rectDragging) {
            if (e.key === 'ArrowLeft') rectBottomRight.x -= step;
            if (e.key === 'ArrowRight') rectBottomRight.x += step;
            if (e.key === 'ArrowUp') rectBottomRight.y -= step;
            if (e.key === 'ArrowDown') rectBottomRight.y += step;
        }
        updateInfoDisplay();
    }

    function handleKeyUp(e) {
        if (e.key === 'Shift') {
            shiftHeld = false;
        }
    }

    function switchToRuler() {
        // 只有校准完成后才能切换模式
        if (!calibrationDone) return;
        
        currentMode = 'ruler';
        btnRuler.classList.add('active');
        btnRect.classList.remove('active');
        hoveredHandle = null;
        rectDragging = null;
        updateCursor();
        updateInfoDisplay();
    }

    function switchToRect() {
        // 只有校准完成后才能切换模式
        if (!calibrationDone) return;
        
        currentMode = 'rect';
        btnRect.classList.add('active');
        btnRuler.classList.remove('active');
        hoveredHandle = null;
        rulerDragging = null;
        updateCursor();
        updateInfoDisplay();
    }

    function showCalibration() {
        calibrationOverlay.classList.remove('hidden');
        updateCalibrationUI();
        rulerDragging = null;
        rectDragging = null;
        hoveredHandle = null;
        updateCursor();
        infoDisplay.classList.remove('visible');
    }

    function toggleHelp() {
        if (helpOverlay.style.display === 'flex') {
            helpOverlay.style.display = 'none';
        } else {
            helpOverlay.style.display = 'flex';
        }
    }

    // ==================== 工具栏按钮 ====================
    btnRuler.addEventListener('click', switchToRuler);
    btnRect.addEventListener('click', switchToRect);
    btnResetRuler.addEventListener('click', () => {
        // 只有校准完成后才能重置
        if (!calibrationDone) return;
        
        if (currentMode === 'ruler') resetRulerToDefault();
        if (currentMode === 'rect') resetRectToDefault();
        hoveredHandle = null;
        rulerDragging = null;
        rectDragging = null;
        updateCursor();
        updateInfoDisplay();
    });
    btnCalibrate.addEventListener('click', showCalibration);
    btnMeasureScreen.addEventListener('click', () => {
        // 只有校准完成后才能使用
        if (!calibrationDone) return;
        measureEntireScreen();
    });
    btnMeasureDiagonal.addEventListener('click', () => {
        // 只有校准完成后才能使用
        if (!calibrationDone) return;
        measureScreenDiagonal();
    });
    btnHelp.addEventListener('click', toggleHelp);
    document.getElementById('help-overlay').addEventListener('click', function(e) {
        if (e.target === this) this.style.display = 'none';
    });

    // ==================== 全局事件 ====================
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerUp);
    canvas.addEventListener('pointerleave', handlePointerUp); // 保险：离开画布也结束拖拽

    // 禁用双击缩放
    canvas.addEventListener('dblclick', function(e) { e.preventDefault(); });

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('resize', () => {
        resizeCanvas();
        updateInfoDisplay();
    });

    // 移除旧版触摸事件，统一使用 Pointer Events（已处理）

    // ==================== 动画循环 ====================
    function animationLoop() {
        resizeCanvas();
        updateHoveredHandle(cursorPos.x, cursorPos.y);
        render();
        requestAnimationFrame(animationLoop);
    }

    // ==================== 启动 ====================
    function boot() {
        resizeCanvas();
        initCalibration();
        if (calibrationDone && pixelsPerCm) {
            resetRulerToDefault();
            resetRectToDefault();
        }
        updateInfoDisplay();
        updateCursor();
        requestAnimationFrame(animationLoop);
    }

    // roundRect polyfill
    if (!ctx.roundRect) {
        ctx.roundRect = function(x, y, w, h, r) {
            if (typeof r === 'number') r = { tl: r, tr: r, br: r, bl: r };
            ctx.beginPath();
            ctx.moveTo(x + r.tl, y);
            ctx.lineTo(x + w - r.tr, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + r.tr);
            ctx.lineTo(x + w, y + h - r.br);
            ctx.quadraticCurveTo(x + w, y + h, x + w - r.br, y + h);
            ctx.lineTo(x + r.bl, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - r.bl);
            ctx.lineTo(x, y + r.tl);
            ctx.quadraticCurveTo(x, y, x + r.tl, y);
            ctx.closePath();
        };
    }

    boot();

    console.log('✅ 屏幕测量工具已就绪');
    console.log('   📏 直尺模式 - 拖拽红色起点/蓝色终点/尺身 (可拖出屏幕)');
    console.log('   ⬜ 矩形框模式 - 拖拽四角或边框');
    console.log('   ⌨ 快捷键: R=直尺 M=矩形框 C=校准 0=重置 Shift=角度吸附 H=帮助 Esc=取消');
})();
