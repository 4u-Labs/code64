/**
 * 4U.IA.BR / CODE64 - Conversor de Imagens para Base64 & Data URI
 * Processamento 100% Client-side com Compressão Real via HTML5 Canvas
 */

class Base64Converter {
    constructor() {
        this.maxFiles = 30;
        this.maxFileSize = 25 * 1024 * 1024; // 25 MB
        this.supportedTypes = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'image/svg+xml', 'image/bmp', 'image/x-icon', 'image/avif'
        ];

        this.processedImages = 0;
        this.totalSize = 0;
        this.savedSize = 0;

        // Settings
        this.outputFormat = 'dataurl';
        this.compressionQuality = 0.85;
        this.maxDimension = null; // null = original
        this.items = []; // Store processed items

        this.initEventListeners();
        this.initSettings();
        this.initFormatSelector();
        this.initBackgroundSwitcher();
        this.initClipboardListener();
    }

    /* ----------------------------------------------------
       Event Listeners Initialization
       ---------------------------------------------------- */
    initEventListeners() {
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('fileInput');

        if (!uploadArea || !fileInput) return;

        ['dragover', 'dragenter'].forEach(eventName => {
            uploadArea.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                uploadArea.classList.add('dragover');
            });
        });

        ['dragleave', 'dragend'].forEach(eventName => {
            uploadArea.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!uploadArea.contains(e.relatedTarget)) {
                    uploadArea.classList.remove('dragover');
                }
            });
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            uploadArea.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files && files.length > 0) {
                this.handleFiles(files);
            }
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files.length > 0) {
                this.handleFiles(e.target.files);
                fileInput.value = ''; // Reset for re-selecting same file
            }
        });

        // Global drag-and-drop prevent default
        document.addEventListener('dragover', (e) => e.preventDefault());
        document.addEventListener('drop', (e) => e.preventDefault());
    }

    /* ----------------------------------------------------
       Global Clipboard (Ctrl+V) Support
       ---------------------------------------------------- */
    initClipboardListener() {
        window.addEventListener('paste', async (e) => {
            // If user is focused inside textarea or input, allow normal typing unless it's an image
            const activeTag = document.activeElement ? document.activeElement.tagName : '';
            const isInputActive = activeTag === 'TEXTAREA' || activeTag === 'INPUT';

            const items = e.clipboardData ? e.clipboardData.items : [];
            let imageFound = false;

            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.type && item.type.startsWith('image/')) {
                    const blob = item.getAsFile();
                    if (blob) {
                        e.preventDefault();
                        imageFound = true;
                        const ext = blob.type.split('/')[1] || 'png';
                        const pastedFile = new File([blob], `print-${Date.now()}.${ext}`, { type: blob.type });
                        this.showNotification('📸 Imagem colada da área de transferência!', 'success');
                        this.handleFiles([pastedFile]);
                        return;
                    }
                }
            }

            // If not an image and not inside an input, check if text is a Base64 string
            if (!imageFound && !isInputActive) {
                const text = e.clipboardData ? e.clipboardData.getData('text').trim() : '';
                if (text && (text.startsWith('data:image/') || text.length > 100)) {
                    const base64Input = document.getElementById('base64Input');
                    if (base64Input) {
                        base64Input.value = text;
                        this.showNotification('📋 Código Base64 colado automaticamente!', 'success');
                        this.decodeBase64();
                    }
                }
            }
        });
    }

    /* ----------------------------------------------------
       Manual Paste Image Button
       ---------------------------------------------------- */
    async pasteImageFromClipboard() {
        try {
            if (navigator.clipboard && navigator.clipboard.read) {
                const clipboardItems = await navigator.clipboard.read();
                let foundImage = false;

                for (const item of clipboardItems) {
                    const imageType = item.types.find(t => t.startsWith('image/'));
                    if (imageType) {
                        const blob = await item.getType(imageType);
                        const ext = imageType.split('/')[1] || 'png';
                        const pastedFile = new File([blob], `print-${Date.now()}.${ext}`, { type: imageType });
                        this.handleFiles([pastedFile]);
                        foundImage = true;
                        this.showNotification('📸 Imagem colada com sucesso!', 'success');
                        break;
                    }
                }

                if (!foundImage) {
                    this.showNotification('Nenhuma imagem encontrada na área de transferência. Use Ctrl+V após tirar um print.', 'error');
                }
            } else {
                this.showNotification('Pressione Ctrl+V no teclado para colar o print diretamente.', 'success');
            }
        } catch (err) {
            this.showNotification('Dica: Use o atalho Ctrl+V no teclado para colar.', 'success');
        }
    }

    /* ----------------------------------------------------
       Settings (Quality, Dimensions, Toggle)
       ---------------------------------------------------- */
    initSettings() {
        const toggle = document.getElementById('optimizeToggle');
        const controls = document.getElementById('optimizeControls');

        if (toggle && controls) {
            toggle.addEventListener('change', () => {
                controls.style.opacity = toggle.checked ? '1' : '0.4';
                controls.style.pointerEvents = toggle.checked ? 'auto' : 'none';
            });
        }

        // Quality Pills
        const qualityBtns = document.querySelectorAll('#qualitySelector .pill-btn');
        qualityBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                qualityBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.compressionQuality = parseFloat(btn.dataset.quality);
                this.showNotification(`Qualidade definida para: ${btn.textContent}`);
            });
        });

        // Resize Pills
        const resizeBtns = document.querySelectorAll('#resizeSelector .pill-btn');
        resizeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                resizeBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const max = btn.dataset.max;
                this.maxDimension = max === 'original' ? null : parseInt(max, 10);
                this.showNotification(`Resolução máxima: ${btn.textContent}`);
            });
        });
    }

    /* ----------------------------------------------------
       Format Selector & Live Previews
       ---------------------------------------------------- */
    initFormatSelector() {
        const formatBtns = document.querySelectorAll('.format-btn');
        formatBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                formatBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.outputFormat = btn.dataset.format;
                this.updateFormatPreview();
                this.updateAllResultsFormat();
                this.showNotification(`Formato de saída: ${btn.querySelector('.format-name')?.textContent || btn.textContent}`);
            });
        });
        this.updateFormatPreview();
    }

    updateFormatPreview() {
        const previewCode = document.getElementById('previewCode');
        const previewDesc = document.getElementById('previewDescription');
        const previewBadge = document.getElementById('previewBadge');

        const examples = {
            'dataurl': {
                badge: 'Data URL',
                code: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD...',
                desc: 'URL direta pronta para usar em tags <img>, CSS, JavaScript ou qualquer atributo src/href.'
            },
            'base64only': {
                badge: 'Apenas Base64',
                code: '/9j/4AAQSkZJRgABAQAAAQABAAD2wBDAAgGBgcGBQgH...',
                desc: 'String de dados pura, ideal para payloads JSON, envio para APIs ou armazenamento em banco de dados.'
            },
            'css': {
                badge: 'CSS Background',
                code: "background-image: url('data:image/jpeg;base64,/9j/4AAQ...');",
                desc: 'Regra CSS pronta para colar diretamente na folha de estilos (.css ou style inline).'
            },
            'html': {
                badge: 'HTML <img> Tag',
                code: '<img src="data:image/jpeg;base64,/9j/4AAQ..." alt="Imagem Base64">',
                desc: 'Tag HTML completa com atributos prontos para incorporar na página web.'
            },
            'markdown': {
                badge: 'Markdown',
                code: '![Imagem Base64](data:image/jpeg;base64,/9j/4AAQ...)',
                desc: 'Sintaxe Markdown padrão para usar em README.md, documentações e notas do GitHub.'
            },
            'js': {
                badge: 'JavaScript / TS',
                code: 'const imageBase64 = "data:image/jpeg;base64,/9j/4AAQ...";',
                desc: 'Declaração de constante pronta para importar em arquivos JS, TS, React ou Vue.'
            },
            'json': {
                badge: 'JSON Object',
                code: '{\n  "name": "foto.jpg",\n  "type": "image/jpeg",\n  "dataUrl": "data:image/jpeg;base64,/9j/..."\n}',
                desc: 'Objeto estruturado para configurações, fixtures de teste ou APIs REST.'
            }
        };

        const current = examples[this.outputFormat] || examples['dataurl'];
        if (previewCode) previewCode.textContent = current.code;
        if (previewDesc) previewDesc.textContent = current.desc;
        if (previewBadge) previewBadge.textContent = current.badge;
    }

    /* ----------------------------------------------------
       File Handling Pipeline
       ---------------------------------------------------- */
    handleFiles(files) {
        if (!files || files.length === 0) return;

        const filesArray = Array.from(files);

        if (filesArray.length > this.maxFiles) {
            this.showNotification(`Limite de até ${this.maxFiles} imagens por lote.`, 'error');
            return;
        }

        let validCount = 0;
        filesArray.forEach(file => {
            if (this.validateFile(file)) {
                this.processFile(file);
                validCount++;
            }
        });

        if (validCount > 0) {
            this.showNotification(`Processando ${validCount} imagem(ns)...`);
        }
    }

    validateFile(file) {
        // Permitir SVG, ICO e formatos comuns mesmo com extensões variadas
        const isSupported = this.supportedTypes.includes(file.type) || 
            file.name.match(/\.(jpg|jpeg|png|webp|gif|svg|bmp|ico|avif)$/i);

        if (!isSupported) {
            this.showNotification(`Formato não suportado: ${file.name}`, 'error');
            return false;
        }

        if (file.size > this.maxFileSize) {
            this.showNotification(`Arquivo muito grande: ${file.name} (${this.formatFileSize(file.size)}). Máximo 25 MB.`, 'error');
            return false;
        }

        return true;
    }

    /* ----------------------------------------------------
       Core Processing & Real Canvas Compression
       ---------------------------------------------------- */
    async processFile(file) {
        const resultDiv = this.createResultDiv(file);
        const progressBar = resultDiv.querySelector('.card-progress-bar');

        try {
            if (progressBar) progressBar.style.width = '30%';

            const shouldOptimize = document.getElementById('optimizeToggle')?.checked ?? true;
            let resultData;

            if (shouldOptimize && this.canCompressWithCanvas(file.type)) {
                if (progressBar) progressBar.style.width = '60%';
                resultData = await this.realCanvasCompression(file);
            } else {
                resultData = await this.readRawFileAsBase64(file);
            }

            if (progressBar) progressBar.style.width = '100%';

            // Store in items list
            const item = {
                id: 'img_' + Math.random().toString(36).substr(2, 9),
                file,
                name: file.name,
                originalSize: file.size,
                optimizedSize: resultData.size,
                width: resultData.width,
                height: resultData.height,
                mimeType: resultData.mimeType,
                dataUrl: resultData.dataUrl
            };
            this.items.push(item);

            this.displayResult(resultDiv, item);
            this.updateStats(file.size, resultData.size);
            this.updateBatchBar();
        } catch (error) {
            console.error('Erro ao processar imagem:', error);
            resultDiv.innerHTML = `
                <div class="result-details" style="color: #fca5a5;">
                    ❌ Erro ao converter <strong>${this.escapeHtml(file.name)}</strong>: ${this.escapeHtml(error.message || 'Falha de leitura')}
                </div>
            `;
        }
    }

    canCompressWithCanvas(type) {
        // SVG e GIF animado não devem passar por canvas para não perder vetor/frames
        return ['image/jpeg', 'image/png', 'image/webp', 'image/bmp'].includes(type);
    }

    /* Compressão Real via HTML5 Canvas */
    realCanvasCompression(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
            reader.onload = (e) => {
                const img = new Image();
                img.onerror = () => reject(new Error('Imagem inválida ou corrompida'));
                img.onload = () => {
                    let { width, height } = img;

                    // Redimensionamento proporcional se maxDimension estiver ativo
                    if (this.maxDimension && (width > this.maxDimension || height > this.maxDimension)) {
                        if (width > height) {
                            height = Math.round((height * this.maxDimension) / width);
                            width = this.maxDimension;
                        } else {
                            width = Math.round((width * this.maxDimension) / height);
                            height = this.maxDimension;
                        }
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');

                    // Manter qualidade de renderização
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    ctx.drawImage(img, 0, 0, width, height);

                    // Determinar melhor MIME para compressão
                    let outputMime = file.type;
                    if (file.type === 'image/jpeg') outputMime = 'image/jpeg';
                    else if (file.type === 'image/webp') outputMime = 'image/webp';
                    else if (file.type === 'image/png' && this.compressionQuality < 1.0) {
                        // Converter PNG para WebP proporciona compressão real com transparência
                        outputMime = 'image/webp';
                    }

                    let optimizedDataUrl = canvas.toDataURL(outputMime, this.compressionQuality);
                    let optimizedBytes = this.calcDataUrlBytes(optimizedDataUrl);

                    // Se a compressão ficou maior que o arquivo original, manter o original
                    if (optimizedBytes >= file.size && !this.maxDimension) {
                        resolve({
                            dataUrl: e.target.result,
                            size: file.size,
                            width: img.width,
                            height: img.height,
                            mimeType: file.type
                        });
                        return;
                    }

                    resolve({
                        dataUrl: optimizedDataUrl,
                        size: optimizedBytes,
                        width,
                        height,
                        mimeType: outputMime
                    });
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    readRawFileAsBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('Falha ao ler arquivo'));
            reader.onload = (e) => {
                const dataUrl = e.target.result;
                const img = new Image();
                img.onload = () => {
                    resolve({
                        dataUrl,
                        size: file.size,
                        width: img.width,
                        height: img.height,
                        mimeType: file.type
                    });
                };
                img.onerror = () => {
                    // Arquivos como SVG podem não disparar onload de Image tradicional de imediato
                    resolve({
                        dataUrl,
                        size: file.size,
                        width: 0,
                        height: 0,
                        mimeType: file.type
                    });
                };
                img.src = dataUrl;
            };
            reader.readAsDataURL(file);
        });
    }

    calcDataUrlBytes(dataUrl) {
        const head = dataUrl.indexOf(',');
        if (head === -1) return dataUrl.length;
        const base64 = dataUrl.slice(head + 1);
        return Math.round((base64.length * 3) / 4);
    }

    /* ----------------------------------------------------
       Results Rendering & DOM
       ---------------------------------------------------- */
    createResultDiv(file) {
        const resultsSection = document.getElementById('resultsSection');
        const resultDiv = document.createElement('div');
        resultDiv.className = 'image-result';
        resultDiv.innerHTML = `
            <div class="result-card-top">
                <div class="result-thumb-wrapper">
                    <span style="font-size: 1.5rem;">⏳</span>
                </div>
                <div class="result-details">
                    <div class="result-name">${this.escapeHtml(file.name)}</div>
                    <div class="result-meta">
                        <span>Original: ${this.formatFileSize(file.size)}</span>
                        <span>•</span>
                        <span>Processando compressão...</span>
                    </div>
                </div>
            </div>
            <div class="card-progress">
                <div class="card-progress-bar"></div>
            </div>
        `;
        resultsSection.prepend(resultDiv);
        return resultDiv;
    }

    displayResult(resultDiv, item) {
        const saved = item.originalSize - item.optimizedSize;
        const savingsPercent = item.originalSize > 0 && saved > 0
            ? ((saved / item.originalSize) * 100).toFixed(1)
            : '0.0';

        const isSaved = saved > 0;
        const dimensionsText = item.width && item.height ? `${item.width} × ${item.height}px` : 'Vetor';
        const formattedResult = this.formatOutput(item.dataUrl, item.name, item.mimeType, item.optimizedSize);

        resultDiv.dataset.itemId = item.id;
        resultDiv.dataset.dataUrl = item.dataUrl;
        resultDiv.dataset.name = item.name;
        resultDiv.dataset.mime = item.mimeType;
        resultDiv.dataset.size = item.optimizedSize;

        resultDiv.innerHTML = `
            <div class="result-card-top">
                <div class="result-thumb-wrapper">
                    <img class="result-thumb" src="${this.escapeHtml(item.dataUrl)}" alt="${this.escapeHtml(item.name)}"/>
                </div>
                <div class="result-details">
                    <div class="result-title-row">
                        <span class="result-name">${this.escapeHtml(item.name)}</span>
                        <span class="result-tag">${dimensionsText}</span>
                        <span class="result-tag">${item.mimeType.split('/')[1]?.toUpperCase() || 'IMG'}</span>
                    </div>
                    <div class="result-meta">
                        <span>Original: <strong>${this.formatFileSize(item.originalSize)}</strong></span>
                        <span>→</span>
                        <span>Final: <strong>${this.formatFileSize(item.optimizedSize)}</strong></span>
                        ${isSaved ? `<span class="meta-saved">⚡ Economia: ${this.formatFileSize(saved)} (${savingsPercent}%)</span>` : '<span style="color: var(--text-muted);">Tamanho original mantido</span>'}
                    </div>
                </div>
            </div>

            <div class="code-output-box" id="output_${item.id}">${this.escapeHtml(formattedResult)}</div>

            <div class="result-actions-row">
                <button type="button" class="btn btn-emerald btn-sm" onclick="converter.copyCardResult('${item.id}', this)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    <span>Copiar ${this.getFormatLabel()}</span>
                </button>
                <button type="button" class="btn btn-glass btn-sm" onclick="converter.downloadSingleImage('${item.id}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                    <span>Baixar Arquivo</span>
                </button>
                <button type="button" class="btn btn-outline btn-sm" onclick="converter.sendToDecoder('${item.id}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <span>Inspecionar no Decodificador</span>
                </button>
                <button type="button" class="btn btn-danger btn-sm" onclick="converter.removeResult('${item.id}', this.closest('.image-result'))" style="margin-left: auto;" title="Remover este resultado">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                </button>
            </div>
        `;
    }

    /* ----------------------------------------------------
       Format Converters
       ---------------------------------------------------- */
    formatOutput(dataUrl, fileName = 'image', mimeType = 'image/png', size = 0) {
        const cleanName = fileName.replace(/\.[^/.]+$/, "");
        const varName = cleanName.replace(/[^a-zA-Z0-9_]/g, '_') || 'image';

        switch (this.outputFormat) {
            case 'base64only':
                return dataUrl.split(',')[1] || dataUrl;

            case 'css':
                return `background-image: url('${dataUrl}');`;

            case 'html':
                return `<img src="${dataUrl}" alt="${cleanName}" />`;

            case 'markdown':
                return `![${cleanName}](${dataUrl})`;

            case 'js':
                return `export const ${varName} = "${dataUrl}";`;

            case 'json':
                return JSON.stringify({
                    name: fileName,
                    type: mimeType,
                    sizeBytes: size,
                    base64: dataUrl
                }, null, 2);

            case 'dataurl':
            default:
                return dataUrl;
        }
    }

    getFormatLabel() {
        const labels = {
            'dataurl': 'Data URL',
            'base64only': 'Base64 Puro',
            'css': 'CSS',
            'html': 'HTML Tag',
            'markdown': 'Markdown',
            'js': 'JavaScript',
            'json': 'JSON'
        };
        return labels[this.outputFormat] || 'Código';
    }

    updateAllResultsFormat() {
        const results = document.querySelectorAll('.image-result[data-item-id]');
        results.forEach(card => {
            const itemId = card.dataset.itemId;
            const dataUrl = card.dataset.dataUrl;
            const name = card.dataset.name;
            const mime = card.dataset.mime;
            const size = parseInt(card.dataset.size, 10) || 0;

            const box = document.getElementById(`output_${itemId}`);
            if (box && dataUrl) {
                box.textContent = this.formatOutput(dataUrl, name, mime, size);
            }

            const copyBtn = card.querySelector('.btn-emerald span');
            if (copyBtn) {
                copyBtn.textContent = `Copiar ${this.getFormatLabel()}`;
            }
        });
    }

    /* ----------------------------------------------------
       Copy, Download & Batch Actions
       ---------------------------------------------------- */
    copyCardResult(itemId, button) {
        const item = this.items.find(i => i.id === itemId);
        if (!item) return;

        const formatted = this.formatOutput(item.dataUrl, item.name, item.mimeType, item.optimizedSize);
        this.copyToClipboard(formatted, button);
    }

    copyAllResults() {
        if (this.items.length === 0) {
            this.showNotification('Nenhum resultado para copiar.', 'error');
            return;
        }

        let combined = '';
        if (this.outputFormat === 'json') {
            const allJSON = this.items.map(item => ({
                name: item.name,
                type: item.mimeType,
                sizeBytes: item.optimizedSize,
                base64: item.dataUrl
            }));
            combined = JSON.stringify(allJSON, null, 2);
        } else {
            combined = this.items.map(item => this.formatOutput(item.dataUrl, item.name, item.mimeType, item.optimizedSize)).join('\n\n');
        }

        this.copyToClipboard(combined);
        this.showNotification(`📋 ${this.items.length} código(s) copiados no formato ${this.getFormatLabel()}!`, 'success');
    }

    downloadAllJSON() {
        if (this.items.length === 0) return;

        const allJSON = this.items.map(item => ({
            name: item.name,
            type: item.mimeType,
            dimensions: `${item.width}x${item.height}`,
            originalSize: item.originalSize,
            finalSize: item.optimizedSize,
            dataUrl: item.dataUrl
        }));

        const blob = new Blob([JSON.stringify(allJSON, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `base64-export-${this.items.length}-images-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.showNotification('💾 Arquivo JSON exportado com sucesso!');
    }

    downloadSingleImage(itemId) {
        const item = this.items.find(i => i.id === itemId);
        if (!item) return;

        const ext = item.mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
        const a = document.createElement('a');
        a.href = item.dataUrl;
        a.download = `optimized-${item.name.replace(/\.[^/.]+$/, "")}.${ext}`;
        a.click();
        this.showNotification('📥 Download iniciado!');
    }

    sendToDecoder(itemId) {
        const item = this.items.find(i => i.id === itemId);
        if (!item) return;

        const base64Input = document.getElementById('base64Input');
        if (base64Input) {
            base64Input.value = item.dataUrl;
            this.decodeBase64();
            document.querySelector('.decode-section')?.scrollIntoView({ behavior: 'smooth' });
            this.showNotification('🔍 Imagem enviada para o decodificador!', 'success');
        }
    }

    removeResult(itemId, element) {
        this.items = this.items.filter(i => i.id !== itemId);
        element.style.transition = 'all 0.3s ease';
        element.style.opacity = '0';
        element.style.transform = 'translateY(10px)';
        setTimeout(() => element.remove(), 300);
        this.recalculateStats();
        this.updateBatchBar();
    }

    clearAllResults() {
        this.items = [];
        const resultsSection = document.getElementById('resultsSection');
        if (resultsSection) resultsSection.innerHTML = '';
        this.processedImages = 0;
        this.totalSize = 0;
        this.savedSize = 0;
        this.updateStatsDisplay();
        this.updateBatchBar();
        this.showNotification('🗑️ Resultados limpos!');
    }

    updateBatchBar() {
        const batchBar = document.getElementById('batchBar');
        const batchCount = document.getElementById('batchCount');
        if (!batchBar || !batchCount) return;

        if (this.items.length > 0) {
            batchBar.style.display = 'flex';
            batchCount.textContent = `${this.items.length} ${this.items.length === 1 ? 'imagem convertida' : 'imagens convertidas'}`;
        } else {
            batchBar.style.display = 'none';
        }
    }

    /* ----------------------------------------------------
       Decoder Engine (Base64 -> Image)
       ---------------------------------------------------- */
    decodeBase64() {
        const input = document.getElementById('base64Input');
        let str = input ? input.value.trim() : '';

        if (!str) {
            this.showNotification('Por favor, cole um código Base64 ou Data URI.', 'error');
            return;
        }

        // Remover aspas ou espaços extras
        str = str.replace(/^["']|["']$/g, '');

        let dataUrl = str;

        // Se for Base64 puro, identificar magic bytes
        if (!str.startsWith('data:image/')) {
            const detectedMime = this.detectMimeFromBase64(str);
            dataUrl = `data:${detectedMime};base64,${str}`;
        }

        this.renderDecodedPreview(dataUrl, str);
    }

    detectMimeFromBase64(base64) {
        const clean = base64.trim();
        if (clean.startsWith('iVBORw0KGgo')) return 'image/png';
        if (clean.startsWith('/9j/')) return 'image/jpeg';
        if (clean.startsWith('R0lGOD')) return 'image/gif';
        if (clean.startsWith('UklGR')) return 'image/webp';
        if (clean.startsWith('PHN2Zy') || clean.startsWith('PD94b') || clean.startsWith('<svg')) return 'image/svg+xml';
        if (clean.startsWith('Qk')) return 'image/bmp';
        if (clean.startsWith('AAABAA')) return 'image/x-icon';
        return 'image/png'; // Fallback seguro
    }

    renderDecodedPreview(dataUrl, originalRaw) {
        const resultDiv = document.getElementById('decodedResult');
        const img = document.getElementById('decodedImage');
        const detailsDiv = document.getElementById('decodedDetails');
        const badge = document.getElementById('decodedFormatBadge');

        const testImg = new Image();
        testImg.onload = () => {
            img.src = dataUrl;

            const mimeMatch = dataUrl.match(/data:image\/([^;]+);base64,/);
            const mimeType = mimeMatch ? mimeMatch[1] : 'PNG';
            const base64Data = dataUrl.split(',')[1] || originalRaw;
            const sizeInBytes = Math.round((base64Data.length * 3) / 4);

            if (badge) badge.textContent = mimeType.toUpperCase();

            detailsDiv.innerHTML = `
                <div class="info-item">
                    <span class="info-label">Formato Detectado:</span>
                    <span class="info-value">${mimeType.toUpperCase()}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Resolução:</span>
                    <span class="info-value">${testImg.width} × ${testImg.height} pixels</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Proporção (Aspect Ratio):</span>
                    <span class="info-value">${(testImg.width / testImg.height).toFixed(2)}:1</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Tamanho Estimado:</span>
                    <span class="info-value">${this.formatFileSize(sizeInBytes)}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Comprimento Base64:</span>
                    <span class="info-value">${base64Data.length.toLocaleString('pt-BR')} caracteres</span>
                </div>
            `;

            resultDiv.style.display = 'block';
            this.currentDecoded = {
                dataUrl,
                mimeType,
                width: testImg.width,
                height: testImg.height
            };

            this.showNotification('✅ Imagem decodificada com sucesso!');
        };

        testImg.onerror = () => {
            this.showNotification('Código Base64 inválido ou corrompido. Verifique o início e o fim da string.', 'error');
        };

        testImg.src = dataUrl;
    }

    initBackgroundSwitcher() {
        const buttons = document.querySelectorAll('.bg-btn');
        const box = document.getElementById('decodedBox');

        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                buttons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                if (box) {
                    box.className = 'decoded-preview-box bg-' + btn.dataset.bg;
                }
            });
        });
    }

    downloadDecodedImage() {
        if (!this.currentDecoded) return;
        const { dataUrl, mimeType, width, height } = this.currentDecoded;
        const ext = mimeType.replace('svg+xml', 'svg').replace('jpeg', 'jpg');

        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `decoded-${width}x${height}-${Date.now()}.${ext}`;
        a.click();
        this.showNotification('📥 Imagem baixada com sucesso!');
    }

    async copyDecodedImageToClipboard() {
        if (!this.currentDecoded) return;
        try {
            const res = await fetch(this.currentDecoded.dataUrl);
            const blob = await res.blob();
            // ClipboardItem só suporta PNG em quase todos os navegadores
            if (blob.type === 'image/png') {
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                this.showNotification('🖼️ Imagem copiada para a área de transferência!');
            } else {
                // Converter para PNG em canvas para colar
                const img = new Image();
                img.onload = async () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    canvas.toBlob(async (pngBlob) => {
                        await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
                        this.showNotification('🖼️ Imagem copiada para a área de transferência!');
                    }, 'image/png');
                };
                img.src = this.currentDecoded.dataUrl;
            }
        } catch (err) {
            this.showNotification('Use o botão "Baixar Arquivo" caso seu navegador restrinja copiar imagens diretamente.', 'error');
        }
    }

    clearBase64Input() {
        const input = document.getElementById('base64Input');
        const resultDiv = document.getElementById('decodedResult');
        if (input) input.value = '';
        if (resultDiv) resultDiv.style.display = 'none';
        this.currentDecoded = null;
        this.showNotification('Campo limpo!');
    }

    async pasteFromClipboard() {
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                const input = document.getElementById('base64Input');
                if (input) input.value = text;
                this.showNotification('Texto colado da área de transferência!');
                setTimeout(() => this.decodeBase64(), 200);
            } else {
                this.showNotification('A área de transferência está vazia.', 'error');
            }
        } catch (err) {
            this.showNotification('Pressione Ctrl+V diretamente na caixa de texto.', 'error');
        }
    }

    /* ----------------------------------------------------
       Statistics & Utilities
       ---------------------------------------------------- */
    updateStats(origSize, optSize) {
        this.processedImages++;
        this.totalSize += origSize;
        this.savedSize += Math.max(0, origSize - optSize);
        this.updateStatsDisplay();
    }

    recalculateStats() {
        this.processedImages = this.items.length;
        this.totalSize = this.items.reduce((acc, i) => acc + i.originalSize, 0);
        this.savedSize = this.items.reduce((acc, i) => acc + Math.max(0, i.originalSize - i.optimizedSize), 0);
        this.updateStatsDisplay();
    }

    updateStatsDisplay() {
        const ratio = this.totalSize > 0 ? ((this.savedSize / this.totalSize) * 100).toFixed(1) : '0';

        const elImages = document.getElementById('totalImages');
        const elTotal = document.getElementById('totalSize');
        const elSaved = document.getElementById('savedSize');
        const elRatio = document.getElementById('compressionRatio');

        if (elImages) elImages.textContent = this.processedImages;
        if (elTotal) elTotal.textContent = this.formatFileSize(this.totalSize);
        if (elSaved) elSaved.textContent = this.formatFileSize(this.savedSize);
        if (elRatio) elRatio.textContent = ratio + '%';
    }

    formatFileSize(bytes) {
        if (!bytes || bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    copyToClipboard(text, button = null) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                if (button) this.animateButton(button);
                this.showNotification('📋 Copiado para a área de transferência!');
            }).catch(() => {
                this.fallbackCopy(text, button);
            });
        } else {
            this.fallbackCopy(text, button);
        }
    }

    fallbackCopy(text, button) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            if (button) this.animateButton(button);
            this.showNotification('📋 Copiado para a área de transferência!');
        } catch {
            this.showNotification('Erro ao copiar automaticamente. Selecione e copie manualmente.', 'error');
        }
        document.body.removeChild(textarea);
    }

    animateButton(button) {
        const span = button.querySelector('span');
        const originalText = span ? span.textContent : button.textContent;
        if (span) span.textContent = 'Copiado!';
        else button.textContent = 'Copiado!';
        button.style.filter = 'brightness(1.2)';

        setTimeout(() => {
            if (span) span.textContent = originalText;
            else button.textContent = originalText;
            button.style.filter = '';
        }, 1800);
    }

    showNotification(message, type = 'success') {
        const notif = document.getElementById('notification');
        if (!notif) return;

        notif.textContent = message;
        notif.className = `notification ${type}`;
        notif.style.display = 'block';

        if (this.notifTimeout) clearTimeout(this.notifTimeout);
        this.notifTimeout = setTimeout(() => {
            notif.style.display = 'none';
        }, 3200);
    }

    escapeHtml(str) {
        return (str || '').toString().replace(/[&<>"']/g, m => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[m]));
    }
}

// Global instance
let converter;
document.addEventListener('DOMContentLoaded', () => {
    converter = new Base64Converter();
});