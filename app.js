const inputs = {
    marketIndex: document.getElementById('market-index'),
    etfShares: document.getElementById('etf-shares'),
    etfPrice: document.getElementById('etf-price'),
    etfCost: document.getElementById('etf-cost'),
    // Dynamic options container
    optionsContainer: document.getElementById('options-container'),
    addOptionBtn: document.getElementById('add-option-btn'),
    // Fetch buttons
    fetchIndexBtn: document.getElementById('fetch-index-btn'),
    fetchEtfBtn: document.getElementById('fetch-etf-btn'),
    // Import/Export buttons
    exportBtn: document.getElementById('export-btn'),
    importBtn: document.getElementById('import-btn'),
    importFile: document.getElementById('import-file'),

    simRange: document.getElementById('sim-range'),
    rangeLabel: document.getElementById('range-val')
};

const outputs = {
    currentAssetVal: document.getElementById('current-asset-val'),
    maxHedgeCost: document.getElementById('max-hedge-cost'),
    breakEvenPoint: document.getElementById('break-even-point'),
    tableBody: document.querySelector('#pnl-table tbody')
};

const chartCtx = document.getElementById('pnlChart').getContext('2d');
let pnlChart = null;

// State
let state = {
    marketIndex: 23000,
    etf: { shares: 6.8, price: 242, cost: 328.5 }, // Updated default cost
    // Support multiple option legs
    options: [
        { id: 1, type: 'buy_put', strike: 22500, premium: 350, qty: 1, multiplier: 50 }
    ],
    sim: { range: 1500, step: 50 },
    nextOptionId: 2,
    isFirstLoad: true
};

// Yahoo Finance Fetch Functions with multiple proxy fallback
async function fetchYahooPrice(symbol) {
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;

    // Try multiple CORS proxies
    const proxies = [
        `https://corsproxy.io/?${encodeURIComponent(yahooUrl)}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(yahooUrl)}`,
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(yahooUrl)}`
    ];

    let lastError = null;

    for (const proxyUrl of proxies) {
        try {
            const response = await fetch(proxyUrl, {
                headers: { 'Accept': 'application/json' }
            });
            if (!response.ok) continue;

            const data = await response.json();
            const result = data.chart?.result?.[0];
            if (result) {
                const meta = result.meta;
                const price = meta.regularMarketPrice || meta.previousClose;
                if (price) return price;
            }
        } catch (error) {
            lastError = error;
            console.warn(`Proxy failed: ${proxyUrl}`, error);
            continue;
        }
    }

    throw lastError || new Error('All proxies failed');
}

async function handleFetchIndex() {
    const btn = inputs.fetchIndexBtn;
    btn.classList.add('loading');
    btn.classList.remove('success', 'error');

    try {
        const price = await fetchYahooPrice('%5ETWII'); // ^TWII encoded
        inputs.marketIndex.value = Math.round(price);
        updateStateFromDOM();
        calculateAndRender();

        btn.classList.remove('loading');
        btn.classList.add('success');
        setTimeout(() => btn.classList.remove('success'), 2000);
    } catch (error) {
        btn.classList.remove('loading');
        btn.classList.add('error');
        setTimeout(() => btn.classList.remove('error'), 2000);
        alert('無法抓取加權指數，請稍後再試或手動輸入');
    }
}

async function handleFetchEtf() {
    const btn = inputs.fetchEtfBtn;
    btn.classList.add('loading');
    btn.classList.remove('success', 'error');

    try {
        const price = await fetchYahooPrice('00631L.TW');
        inputs.etfPrice.value = price.toFixed(2);
        updateStateFromDOM();
        calculateAndRender();

        btn.classList.remove('loading');
        btn.classList.add('success');
        setTimeout(() => btn.classList.remove('success'), 2000);
    } catch (error) {
        btn.classList.remove('loading');
        btn.classList.add('error');
        setTimeout(() => btn.classList.remove('error'), 2000);
        alert('無法抓取 00631L 股價，請稍後再試或手動輸入');
    }
}

// Export/Import Functions
function handleExport() {
    const exportData = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        marketIndex: state.marketIndex,
        etf: state.etf,
        options: state.options,
        sim: state.sim,
        nextOptionId: state.nextOptionId
    };

    const jsonStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    a.href = url;
    a.download = `00631L_避險倉位_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function handleImport() {
    inputs.importFile.click();
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = JSON.parse(e.target.result);

            // Validate data
            if (!data.etf || !data.options) {
                throw new Error('Invalid file format');
            }

            // Load data into state
            state.marketIndex = data.marketIndex || state.marketIndex;
            state.etf = data.etf;
            state.options = data.options;
            state.sim = data.sim || state.sim;
            state.nextOptionId = data.nextOptionId || (Math.max(...data.options.map(o => o.id)) + 1);

            // Update DOM
            inputs.marketIndex.value = state.marketIndex;
            inputs.etfShares.value = state.etf.shares;
            inputs.etfPrice.value = state.etf.price;
            inputs.etfCost.value = state.etf.cost;
            inputs.simRange.value = state.sim.range;
            inputs.rangeLabel.textContent = state.sim.range;

            // Re-render
            renderOptionInputs();
            calculateAndRender();

            alert('✅ 倉位資料匯入成功！');
        } catch (error) {
            console.error('Import error:', error);
            alert('❌ 匯入失敗：檔案格式不正確');
        }
    };
    reader.readAsText(file);

    // Reset file input
    event.target.value = '';
}

// Initialization
function init() {
    console.log("Initializing App...");
    renderOptionInputs(); // Build initial option inputs
    attachListeners();
    updateStateFromDOM(); // Load values
    calculateAndRender();
}

// Event Listeners
function attachListeners() {
    // Static Inputs
    [inputs.marketIndex, inputs.etfShares, inputs.etfPrice, inputs.etfCost, inputs.simRange].forEach(el => {
        if (el) el.addEventListener('input', handleGlobalInput);
    });

    // Add Option Button
    if (inputs.addOptionBtn) {
        inputs.addOptionBtn.addEventListener('click', () => {
            addOption();
        });
    }

    // Fetch Buttons
    if (inputs.fetchIndexBtn) {
        inputs.fetchIndexBtn.addEventListener('click', handleFetchIndex);
    }
    if (inputs.fetchEtfBtn) {
        inputs.fetchEtfBtn.addEventListener('click', handleFetchEtf);
    }

    // Export/Import Buttons
    if (inputs.exportBtn) {
        inputs.exportBtn.addEventListener('click', handleExport);
    }
    if (inputs.importBtn) {
        inputs.importBtn.addEventListener('click', handleImport);
    }
    if (inputs.importFile) {
        inputs.importFile.addEventListener('change', handleFileSelect);
    }
}

function handleGlobalInput(e) {
    if (e.target === inputs.simRange) {
        inputs.rangeLabel.textContent = e.target.value;
    }
    updateStateFromDOM();
    calculateAndRender();
}

// Dynamic Option Management
function renderOptionInputs() {
    inputs.optionsContainer.innerHTML = '';

    state.options.forEach((opt, index) => {
        const div = document.createElement('div');
        div.className = 'option-leg-row';
        div.dataset.id = opt.id;
        div.innerHTML = `
            <div class="leg-header">
                <span>避險 # ${index + 1}</span>
                <button class="btn-remove" onclick="removeOption(${opt.id})">✕</button>
            </div>
            <div class="row">
                <label>
                    <span>類型</span>
                    <select class="opt-input" data-field="type">
                        <option value="buy_put" ${opt.type === 'buy_put' ? 'selected' : ''}>Buy Put (看跌)</option>
                        <option value="sell_call" ${opt.type === 'sell_call' ? 'selected' : ''}>Sell Call (看不漲)</option>
                        <option value="buy_call" ${opt.type === 'buy_call' ? 'selected' : ''}>Buy Call (看漲)</option>
                        <option value="sell_put" ${opt.type === 'sell_put' ? 'selected' : ''}>Sell Put (看不跌)</option>
                    </select>
                </label>
                <label>
                    <span>履約價</span>
                    <input type="number" class="opt-input" data-field="strike" value="${opt.strike}" step="100">
                </label>
            </div>
            <div class="row">
                 <label>
                    <span>權利金</span>
                    <input type="number" class="opt-input" data-field="premium" value="${opt.premium}" step="1">
                </label>
                <label>
                    <span>口數</span>
                    <input type="number" class="opt-input" data-field="qty" value="${opt.qty}" step="1">
                </label>
                 <label>
                    <span>乘數</span>
                    <input type="number" class="opt-input" data-field="multiplier" value="${opt.multiplier}" step="10">
                </label>
            </div>
        `;
        inputs.optionsContainer.appendChild(div);
    });

    // Re-attach listeners to new inputs
    document.querySelectorAll('.opt-input').forEach(el => {
        el.addEventListener('input', () => {
            updateStateFromDOM();
            calculateAndRender();
        });
    });
}

function addOption() {
    state.options.push({
        id: state.nextOptionId++,
        type: 'buy_put',
        strike: state.marketIndex, // Default to ATM
        premium: 200,
        qty: 1,
        multiplier: 50
    });
    renderOptionInputs();
    updateStateFromDOM();
    calculateAndRender();
}

window.removeOption = function (id) {
    if (state.options.length <= 1) {
        alert("至少保留一個避險倉位");
        return;
    }
    state.options = state.options.filter(o => o.id !== id);
    renderOptionInputs();
    updateStateFromDOM();
    calculateAndRender();
};

// Update State
function updateStateFromDOM() {
    state.marketIndex = parseFloat(inputs.marketIndex.value) || 0;

    state.etf.shares = parseFloat(inputs.etfShares.value) || 0;
    state.etf.price = parseFloat(inputs.etfPrice.value) || 0;
    state.etf.cost = parseFloat(inputs.etfCost.value) || 0;
    state.sim.range = parseFloat(inputs.simRange.value) || 1500;

    // Update Options from DOM
    const rows = document.querySelectorAll('.option-leg-row');
    rows.forEach(row => {
        const id = parseInt(row.dataset.id);
        const opt = state.options.find(o => o.id === id);
        if (opt) {
            opt.type = row.querySelector('[data-field="type"]').value;
            opt.strike = parseFloat(row.querySelector('[data-field="strike"]').value) || 0;
            opt.premium = parseFloat(row.querySelector('[data-field="premium"]').value) || 0;
            opt.qty = parseFloat(row.querySelector('[data-field="qty"]').value) || 0;
            opt.multiplier = parseFloat(row.querySelector('[data-field="multiplier"]').value) || 50;
        }
    });
}

// Core Logic
function calculateAndRender() {
    const { marketIndex, etf, options, sim } = state;

    // 1. Calculate Scenario Data Points
    const dataPoints = [];

    const startPoint = Math.floor((marketIndex - sim.range) / 100) * 100;
    const endPoint = Math.ceil((marketIndex + sim.range) / 100) * 100;

    for (let idx = startPoint; idx <= endPoint; idx += sim.step) {

        // A. Index Change
        const indexChangePct = (idx - marketIndex) / marketIndex;

        // B. ETF Price
        const estimatedEtfPrice = etf.price * (1 + (indexChangePct * 2));

        // C. ETF PnL
        const etfTotalValue = estimatedEtfPrice * etf.shares * 1000;
        const etfCostBasis = etf.cost * etf.shares * 1000;
        const etfPnL = etfTotalValue - etfCostBasis;

        // D. Calculate Option PnL (Sum of all legs)
        let totalOptPnL = 0;

        options.forEach(opt => {
            let legPayoff = 0;
            if (opt.type === 'buy_put') {
                legPayoff = (Math.max(opt.strike - idx, 0) - opt.premium) * opt.qty * opt.multiplier;
            } else if (opt.type === 'sell_call') {
                legPayoff = (opt.premium - Math.max(idx - opt.strike, 0)) * opt.qty * opt.multiplier;
            } else if (opt.type === 'buy_call') {
                legPayoff = (Math.max(idx - opt.strike, 0) - opt.premium) * opt.qty * opt.multiplier;
            } else if (opt.type === 'sell_put') {
                legPayoff = (opt.premium - Math.max(opt.strike - idx, 0)) * opt.qty * opt.multiplier;
            }
            totalOptPnL += legPayoff;
        });

        const netPnL = etfPnL + totalOptPnL;

        dataPoints.push({
            index: idx,
            indexChangeRaw: indexChangePct,
            etfPrice: estimatedEtfPrice,
            etfPnL: etfPnL,
            optPnL: totalOptPnL,
            netPnL: netPnL
        });
    }

    // 2. Update UI Summary
    const currentAssets = etf.price * etf.shares * 1000;
    const currentUnrealizedPnL = (etf.price - etf.cost) * etf.shares * 1000;

    // Format: $Value (PnL: $xxxx)
    const pnlClass = currentUnrealizedPnL >= 0 ? 'success' : 'warning';
    const pnlSign = currentUnrealizedPnL >= 0 ? '+' : '';

    outputs.currentAssetVal.innerHTML = `
        <div>${formatCurrency(currentAssets)}</div>
        <div style="font-size: 0.9rem; margin-top: 4px; color: var(--text-secondary);">
            損益: <span class="value ${pnlClass}" style="font-size: 1rem;">${pnlSign}${formatCurrency(currentUnrealizedPnL)}</span>
            <span style="font-size: 0.8rem">(${((etf.price - etf.cost) / etf.cost * 100).toFixed(2)}%)</span>
        </div>
    `;

    // 2.5 Update Strategy Bar (Chips)
    const strategyBar = document.getElementById('strategy-bar');
    if (strategyBar) {
        let html = '';

        // ETF Chip
        html += `
            <div class="chip chip-etf">
                <span class="chip-label">00631L 現貨</span>
                <span class="chip-val">${etf.shares} 張</span>
                <span class="chip-label" style="margin-left:8px;">Avg</span>
                <span class="chip-val">${etf.cost}</span>
            </div>
        `;

        // Option Chips
        options.forEach(opt => {
            const isPut = opt.type.includes('put');
            const typeLabel = opt.type.replace('_', ' ').toUpperCase(); // BUY PUT
            html += `
                <div class="chip chip-opt ${isPut ? 'put' : ''}">
                    <span class="chip-label">${typeLabel}</span>
                    <span class="chip-val">${opt.strike}</span>
                    <span class="chip-label" style="margin-left:8px;">Qty</span>
                    <span class="chip-val">x${opt.qty}</span>
                </div>
            `;
        });
        strategyBar.innerHTML = html;
    }

    // Hedge Cost Summary (Net Premium Paid/Received)
    let netPremium = 0;
    options.forEach(opt => {
        const legCost = opt.premium * opt.qty * opt.multiplier;
        if (opt.type.startsWith('buy')) netPremium -= legCost; // User pays
        else netPremium += legCost; // User receives
    });

    if (netPremium < 0) {
        outputs.maxHedgeCost.textContent = formatCurrency(netPremium); // Already negative
        outputs.maxHedgeCost.className = 'value warning';
    } else {
        outputs.maxHedgeCost.textContent = "+" + formatCurrency(netPremium);
        outputs.maxHedgeCost.className = 'value success';
    }

    // Find approximate break-even (where Net PnL crosses 0)
    // Simple scan
    let bep = "需觀察";
    for (let i = 0; i < dataPoints.length - 1; i++) {
        const curr = dataPoints[i];
        const next = dataPoints[i + 1];
        if ((curr.netPnL < 0 && next.netPnL >= 0) || (curr.netPnL > 0 && next.netPnL <= 0)) {
            bep = `~${Math.round(curr.index)}`;
            break;
        }
    }
    outputs.breakEvenPoint.textContent = bep;

    // 3. Update Chart
    renderChart(dataPoints);

    // 4. Update Table
    renderTable(dataPoints);

    // Force scroll to top of settings for visibility
    const settingsPanel = document.querySelector('.settings-panel');
    if (settingsPanel && state.isFirstLoad) {
        settingsPanel.scrollTop = 0;
        state.isFirstLoad = false;
    }
}

// Helpers
const fmtMoney = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 0 });
const fmtPrice = new Intl.NumberFormat('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = new Intl.NumberFormat('zh-TW', { style: 'percent', minimumFractionDigits: 2 });

function formatCurrency(val) {
    return `$${fmtMoney.format(val)}`;
}

function getClassForVal(val) {
    if (val > 0) return 'text-green';
    if (val < 0) return 'text-red';
    return 'text-mute';
}

function renderTable(data) {
    // Clear
    outputs.tableBody.innerHTML = '';

    // Create Fragment
    const frag = document.createDocumentFragment();

    data.forEach(d => {
        const tr = document.createElement('tr');
        const isCurrentRow = Math.abs(d.index - state.marketIndex) < 25;

        // Highlight current index row
        if (isCurrentRow) {
            tr.className = 'current-price-row';
        }

        tr.innerHTML = `
            <td class="index-cell">
                ${isCurrentRow ? '<span class="current-marker">▶</span>' : ''}
                ${d.index}
                ${isCurrentRow ? '<span class="current-label">← 目前</span>' : ''}
            </td>
            <td class="${getClassForVal(d.indexChangeRaw)}">${fmtPct.format(d.indexChangeRaw)}</td>
            <td>${fmtPrice.format(d.etfPrice)}</td>
            <td class="${getClassForVal(d.etfPnL)}">
                ${formatCurrency(d.etfPnL)}
                <div style="font-size:0.75em; color: #8b949e;">${(d.etfPnL / (state.etf.cost * state.etf.shares * 1000) * 100).toFixed(2)}%</div>
            </td>
            <td class="${getClassForVal(d.optPnL)}">${formatCurrency(d.optPnL)}</td>
            <td class="${getClassForVal(d.netPnL)} font-bold">${formatCurrency(d.netPnL)}</td>
        `;
        frag.appendChild(tr);
    });

    outputs.tableBody.appendChild(frag);
}

function renderChart(data) {
    const labels = data.map(d => d.index);
    const netPnLData = data.map(d => d.netPnL);
    const etfPnLData = data.map(d => d.etfPnL);
    const optPnLData = data.map(d => d.optPnL); // Optional to show

    if (pnlChart) {
        pnlChart.data.labels = labels;
        pnlChart.data.datasets[0].data = netPnLData;
        pnlChart.data.datasets[1].data = etfPnLData;
        pnlChart.update('none'); // Efficient update
    } else {
        pnlChart = new Chart(chartCtx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: '淨損益 (Net PnL)',
                        data: netPnLData,
                        borderColor: '#f0f6fc',
                        backgroundColor: (context) => {
                            const ctx = context.chart.ctx;
                            const gradient = ctx.createLinearGradient(0, 0, 0, 400);
                            gradient.addColorStop(0, 'rgba(88, 166, 255, 0.5)');
                            gradient.addColorStop(1, 'rgba(88, 166, 255, 0)');
                            return gradient;
                        },
                        borderWidth: 3,
                        pointRadius: 0,
                        tension: 0.4,
                        fill: true
                    },
                    {
                        label: 'ETF 損益',
                        data: etfPnLData,
                        borderColor: 'rgba(255, 255, 255, 0.2)',
                        borderWidth: 1,
                        borderDash: [5, 5],
                        pointRadius: 0,
                        tension: 0.4,
                        fill: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    legend: {
                        labels: { color: '#8b949e' }
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    label += formatCurrency(context.parsed.y);
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: '#30363d' },
                        ticks: { color: '#8b949e' }
                    },
                    y: {
                        grid: { color: '#30363d' },
                        ticks: { color: '#8b949e' }
                    }
                }
            }
        });
    }
}

// Start
init();
