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
    // Asset Tracking buttons
    recordHighBtn: document.getElementById('record-high-btn'),
    clearRecordsBtn: document.getElementById('clear-records-btn'),

    simRange: document.getElementById('sim-range'),
    rangeLabel: document.getElementById('range-val'),
    hedgeBasisInput: document.getElementById('hedge-basis-index'),
    hedgeFund: document.getElementById('hedge-fund-val')
};

const outputs = {
    currentAssetVal: document.getElementById('current-asset-val'),
    maxHedgeCost: document.getElementById('max-hedge-cost'),
    breakEvenPoint: document.getElementById('break-even-point'),
    tableBody: document.querySelector('#pnl-table tbody'),
    // Asset Tracking outputs
    totalAssetVal: document.getElementById('total-asset-val'),
    allTimeHigh: document.getElementById('all-time-high'),
    distanceFromHigh: document.getElementById('distance-from-high'),
    recordsStatus: document.getElementById('records-status'),
    recordsList: document.getElementById('records-list')
};

const chartCtx = document.getElementById('pnlChart').getContext('2d');
const assetHistoryChartCtx = document.getElementById('assetHistoryChart')?.getContext('2d');
let pnlChart = null;
let assetHistoryChart = null;

// Firebase Initialization
const firebaseConfig = {
    apiKey: "AIzaSyCuwjfBCY9xc0VK6zddUQHuiDQNEgnQz_Q",
    authDomain: "l-op-bf09b.firebaseapp.com",
    databaseURL: "https://l-op-bf09b-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "l-op-bf09b",
    storageBucket: "l-op-bf09b.firebasestorage.app",
    messagingSenderId: "524848036456",
    appId: "1:524848036456:web:f8d9f2e3e914141f2519dd",
    measurementId: "G-GV6C805CGB"
};

// Initialize
try {
    firebase.initializeApp(firebaseConfig);
    console.log("Firebase initialized");
} catch (e) {
    console.error("Firebase init failed:", e);
}
const db = firebase.database();
let debounceTimer = null;

// Default strategy template
function createDefaultStrategy(name = '策略 A') {
    return {
        name: name,
        options: [
            { id: 1, type: 'buy_put', strike: 22500, premium: 350, qty: 1, multiplier: 50, expirationDate: '' }
        ],
        nextOptionId: 2
    };
}

// Multi-Strategy State
let state = {
    currentStrategyIndex: 0,
    strategies: [
        createDefaultStrategy('策略 A'),
        createDefaultStrategy('策略 B'),
        createDefaultStrategy('策略 C')
    ],
    // Shared across strategies
    marketIndex: 23000,
    hedgeBasisIndex: 23000,
    hedgeFund: 0,
    etf: { shares: 6.8, price: 242, cost: 328.5 },
    sim: { range: 1500, step: 100 },
    isFirstLoad: true,
    scenarioHighlight: null, // For scenario button highlight
    // Asset Tracking
    assetRecords: [] // Array of { date: 'YYYY-MM-DD', value: number, timestamp: ISO string }
};

// Convenience getter for current strategy
function getCurrentStrategy() {
    return state.strategies[state.currentStrategyIndex];
}

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
        version: '2.0',
        exportDate: new Date().toISOString(),
        marketIndex: state.marketIndex,
        etf: state.etf,
        strategies: state.strategies,
        currentStrategyIndex: state.currentStrategyIndex,
        sim: state.sim,
        hedgeBasisIndex: state.hedgeBasisIndex,
        hedgeFund: state.hedgeFund
    };

    const jsonStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    a.href = url;
    a.download = `00631L_避險策略_${dateStr}.json`;
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

            // Handle both v1.0 and v2.0 formats
            if (data.version === '2.0' && data.strategies) {
                // New format with multi-strategy
                state.marketIndex = data.marketIndex || state.marketIndex;
                state.hedgeBasisIndex = data.hedgeBasisIndex || state.hedgeBasisIndex;
                state.hedgeFund = data.hedgeFund || 0;
                state.etf = data.etf;
                state.strategies = data.strategies;
                state.currentStrategyIndex = data.currentStrategyIndex || 0;
                state.sim = data.sim || state.sim;
            } else if (data.etf && data.options) {
                // Old format - migrate to new format
                state.marketIndex = data.marketIndex || state.marketIndex;
                state.hedgeBasisIndex = data.hedgeBasisIndex || state.hedgeBasisIndex;
                state.hedgeFund = data.hedgeFund || 0;
                state.etf = data.etf;
                state.strategies[0].options = data.options;
                state.strategies[0].nextOptionId = data.nextOptionId || (Math.max(...data.options.map(o => o.id)) + 1);
                state.sim = data.sim || state.sim;
            } else {
                throw new Error('Invalid file format');
            }

            // Update DOM
            inputs.marketIndex.value = state.marketIndex;
            inputs.hedgeBasisInput.value = state.hedgeBasisIndex;
            if (inputs.hedgeFund) inputs.hedgeFund.value = state.hedgeFund;
            inputs.etfShares.value = state.etf.shares;
            inputs.etfPrice.value = state.etf.price;
            inputs.etfCost.value = state.etf.cost;
            inputs.simRange.value = state.sim.range;
            inputs.rangeLabel.textContent = state.sim.range;

            // Update strategy tabs
            updateStrategyTabs();

            // Re-render
            renderOptionInputs();
            calculateAndRender();

            alert('✅ 策略資料匯入成功！');
        } catch (error) {
            console.error('Import error:', error);
            alert('❌ 匯入失敗：檔案格式不正確');
        }
    };
    reader.readAsText(file);

    // Reset file input
    event.target.value = '';
}

// Strategy Tab Management
function updateStrategyTabs() {
    const tabs = document.querySelectorAll('.strategy-tab');
    tabs.forEach((tab, index) => {
        tab.classList.toggle('active', index === state.currentStrategyIndex);
    });
}

function handleStrategyTabClick(e) {
    const strategyIndex = parseInt(e.target.dataset.strategy);
    if (isNaN(strategyIndex)) return;

    // Save current strategy state first
    updateStateFromDOM();

    // Switch to new strategy
    state.currentStrategyIndex = strategyIndex;
    updateStrategyTabs();
    renderOptionInputs();
    calculateAndRender();
}

// Scenario Button Handlers
function handleScenarioClick(e) {
    const change = parseFloat(e.target.dataset.change);
    if (isNaN(change)) return;

    const targetIndex = Math.round(state.hedgeBasisIndex * (1 + change));
    state.scenarioHighlight = targetIndex;

    // Calculate scenario result
    const result = calculateScenarioResult(targetIndex);

    // Display result
    const resultDiv = document.getElementById('scenario-result');
    if (resultDiv) {
        const changeLabel = change > 0 ? `+${(change * 100).toFixed(0)}%` : `${(change * 100).toFixed(0)}%`;
        const netPnLClass = result.netPnL >= 0 ? 'success' : 'warning';

        resultDiv.innerHTML = `
            <div class="scenario-info">
                <span class="scenario-label">情境: ${changeLabel} (指數 ${targetIndex})</span>
            </div>
            <div class="scenario-details">
                <div class="scenario-item">
                    <span>現貨損益</span>
                    <span class="${result.etfPnL >= 0 ? 'text-green' : 'text-red'}">${formatCurrency(result.etfPnL)}</span>
                </div>
                <div class="scenario-item">
                    <span>選擇權損益</span>
                    <span class="${result.optPnL >= 0 ? 'text-green' : 'text-red'}">${formatCurrency(result.optPnL)}</span>
                </div>
                <div class="scenario-item net">
                    <span>淨損益</span>
                    <span class="${netPnLClass}">${formatCurrency(result.netPnL)}</span>
                </div>
            </div>
        `;
        resultDiv.style.display = 'block';
    }

    // Update chart with highlight
    calculateAndRender(true, true);

    // Update button states
    document.querySelectorAll('.scenario-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.change === e.target.dataset.change);
    });
}

function calculateScenarioResult(targetIndex) {
    const { etf } = state;
    const options = getCurrentStrategy().options;

    // Calculate ETF
    const indexChangePct = (targetIndex - state.marketIndex) / state.marketIndex;
    const estimatedEtfPrice = etf.price * (1 + (indexChangePct * 2));
    const etfTotalValue = estimatedEtfPrice * etf.shares * 1000;
    const etfCostBasis = etf.cost * etf.shares * 1000;
    const etfPnL = etfTotalValue - etfCostBasis;

    // Calculate Options
    let totalOptPnL = 0;
    options.forEach(opt => {
        let legPayoff = 0;
        if (opt.type === 'buy_put') {
            legPayoff = (Math.max(opt.strike - targetIndex, 0) - opt.premium) * opt.qty * opt.multiplier;
        } else if (opt.type === 'sell_call') {
            legPayoff = (opt.premium - Math.max(targetIndex - opt.strike, 0)) * opt.qty * opt.multiplier;
        } else if (opt.type === 'buy_call') {
            legPayoff = (Math.max(targetIndex - opt.strike, 0) - opt.premium) * opt.qty * opt.multiplier;
        } else if (opt.type === 'sell_put') {
            legPayoff = (opt.premium - Math.max(opt.strike - targetIndex, 0)) * opt.qty * opt.multiplier;
        }
        totalOptPnL += legPayoff;
    });

    return {
        etfPnL: etfPnL,
        optPnL: totalOptPnL,
        netPnL: etfPnL + totalOptPnL
    };
}

// Expiration Date Handling
function checkExpirationDates() {
    const alertDiv = document.getElementById('expiration-alert');
    if (!alertDiv) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expiringOptions = [];
    const options = getCurrentStrategy().options;

    options.forEach((opt, index) => {
        if (opt.expirationDate) {
            const expDate = new Date(opt.expirationDate);
            expDate.setHours(0, 0, 0, 0);
            const daysUntil = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));

            if (daysUntil <= 7 && daysUntil >= 0) {
                expiringOptions.push({
                    index: index + 1,
                    type: opt.type.replace('_', ' ').toUpperCase(),
                    strike: opt.strike,
                    daysUntil: daysUntil,
                    date: opt.expirationDate
                });
            }
        }
    });

    if (expiringOptions.length > 0) {
        let html = '<div class="expiration-title">⚠️ 到期提醒</div><div class="expiration-list">';
        expiringOptions.forEach(exp => {
            const urgencyClass = exp.daysUntil <= 2 ? 'urgent' : exp.daysUntil <= 5 ? 'warning' : 'normal';
            html += `
                <div class="expiration-item ${urgencyClass}">
                    <span class="exp-label">避險 #${exp.index} ${exp.type} ${exp.strike}</span>
                    <span class="exp-days">${exp.daysUntil === 0 ? '今日到期！' : `${exp.daysUntil} 天後到期`}</span>
                </div>
            `;
        });
        html += '</div>';
        alertDiv.innerHTML = html;
        alertDiv.style.display = 'block';
    } else {
        alertDiv.style.display = 'none';
    }
}

// Strategy Comparison
function calculateStrategyMetrics(strategyIndex) {
    const strategy = state.strategies[strategyIndex];
    const { etf } = state;
    const options = strategy.options;

    // Net Premium
    let netPremium = 0;
    options.forEach(opt => {
        const legCost = opt.premium * opt.qty * opt.multiplier;
        if (opt.type.startsWith('buy')) netPremium -= legCost;
        else netPremium += legCost;
    });

    // Calculate -10% scenario
    const downScenario = calculateScenarioResultForStrategy(strategyIndex, state.hedgeBasisIndex * 0.9);

    // Find break-even
    const dataPoints = generateDataPoints(strategyIndex);
    let bep = "N/A";
    for (let i = 0; i < dataPoints.length - 1; i++) {
        const curr = dataPoints[i];
        const next = dataPoints[i + 1];
        if ((curr.netPnL < 0 && next.netPnL >= 0) || (curr.netPnL > 0 && next.netPnL <= 0)) {
            bep = `~${Math.round(curr.index)}`;
            break;
        }
    }

    return {
        netPremium,
        breakEven: bep,
        downScenarioPnL: downScenario.netPnL
    };
}

function calculateScenarioResultForStrategy(strategyIndex, targetIndex) {
    const { etf } = state;
    const options = state.strategies[strategyIndex].options;

    const indexChangePct = (targetIndex - state.marketIndex) / state.marketIndex;
    const estimatedEtfPrice = etf.price * (1 + (indexChangePct * 2));
    const etfTotalValue = estimatedEtfPrice * etf.shares * 1000;
    const etfCostBasis = etf.cost * etf.shares * 1000;
    const etfPnL = etfTotalValue - etfCostBasis;

    let totalOptPnL = 0;
    options.forEach(opt => {
        let legPayoff = 0;
        if (opt.type === 'buy_put') {
            legPayoff = (Math.max(opt.strike - targetIndex, 0) - opt.premium) * opt.qty * opt.multiplier;
        } else if (opt.type === 'sell_call') {
            legPayoff = (opt.premium - Math.max(targetIndex - opt.strike, 0)) * opt.qty * opt.multiplier;
        } else if (opt.type === 'buy_call') {
            legPayoff = (Math.max(targetIndex - opt.strike, 0) - opt.premium) * opt.qty * opt.multiplier;
        } else if (opt.type === 'sell_put') {
            legPayoff = (opt.premium - Math.max(opt.strike - targetIndex, 0)) * opt.qty * opt.multiplier;
        }
        totalOptPnL += legPayoff;
    });

    return { etfPnL, optPnL: totalOptPnL, netPnL: etfPnL + totalOptPnL };
}

function generateDataPoints(strategyIndex) {
    const { marketIndex, etf, sim } = state;
    const options = state.strategies[strategyIndex].options;
    const dataPoints = [];

    const startPoint = Math.floor((marketIndex - sim.range) / 100) * 100;
    const endPoint = Math.ceil((marketIndex + sim.range) / 100) * 100;

    for (let idx = startPoint; idx <= endPoint; idx += sim.step) {
        const indexChangePct = (idx - marketIndex) / marketIndex;
        const estimatedEtfPrice = etf.price * (1 + (indexChangePct * 2));
        const etfTotalValue = estimatedEtfPrice * etf.shares * 1000;
        const etfCostBasis = etf.cost * etf.shares * 1000;
        const etfPnL = etfTotalValue - etfCostBasis;

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

        dataPoints.push({
            index: idx,
            indexChangeRaw: indexChangePct,
            etfPrice: estimatedEtfPrice,
            etfPnL: etfPnL,
            optPnL: totalOptPnL,
            netPnL: etfPnL + totalOptPnL
        });
    }

    return dataPoints;
}

function updateStrategyComparison() {
    for (let i = 0; i < 3; i++) {
        const metrics = calculateStrategyMetrics(i);

        const costEl = document.getElementById(`comp-cost-${i}`);
        const bepEl = document.getElementById(`comp-bep-${i}`);
        const downEl = document.getElementById(`comp-down-${i}`);

        if (costEl) {
            costEl.textContent = formatCurrency(metrics.netPremium);
            costEl.className = 'comp-val ' + (metrics.netPremium >= 0 ? 'text-green' : 'text-red');
        }
        if (bepEl) bepEl.textContent = metrics.breakEven;
        if (downEl) {
            downEl.textContent = formatCurrency(metrics.downScenarioPnL);
            downEl.className = 'comp-val ' + (metrics.downScenarioPnL >= 0 ? 'text-green' : 'text-red');
        }
    }
}

function toggleComparison(show) {
    const compSection = document.getElementById('strategy-comparison');
    const btnContainer = document.getElementById('compare-btn-container');

    if (compSection && btnContainer) {
        if (show) {
            updateStrategyComparison();
            compSection.style.display = 'block';
            btnContainer.style.display = 'none';
        } else {
            compSection.style.display = 'none';
            btnContainer.style.display = 'block';
        }
    }
}

// Initialization
function init() {
    console.log("Initializing App...");
    renderOptionInputs();
    attachListeners();
    syncFromFirebase();
}

function saveToFirebase() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        const data = {
            marketIndex: state.marketIndex,
            hedgeBasisIndex: state.hedgeBasisIndex,
            hedgeFund: state.hedgeFund,
            etf: state.etf,
            strategies: state.strategies,
            currentStrategyIndex: state.currentStrategyIndex,
            sim: state.sim,
            updatedAt: new Date().toISOString()
        };
        db.ref('users/default-user/hedge_positions_v2').set(data)
            .then(() => console.log('Saved to Firebase'))
            .catch(e => console.error('Save failed', e));
    }, 1000);
}

function syncFromFirebase() {
    db.ref('users/default-user/hedge_positions_v2').on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            console.log("Synced from Firebase", data);
            state.marketIndex = data.marketIndex ?? state.marketIndex;
            state.hedgeBasisIndex = data.hedgeBasisIndex ?? state.hedgeBasisIndex;
            state.hedgeFund = data.hedgeFund ?? 0;
            state.etf = data.etf ?? state.etf;
            state.strategies = data.strategies ?? state.strategies;
            state.currentStrategyIndex = data.currentStrategyIndex ?? 0;
            state.sim = data.sim ?? state.sim;

            // Sync DOM
            if (inputs.marketIndex) inputs.marketIndex.value = state.marketIndex;
            if (inputs.hedgeBasisInput) inputs.hedgeBasisInput.value = state.hedgeBasisIndex;
            if (inputs.hedgeFund) inputs.hedgeFund.value = state.hedgeFund;
            if (inputs.etfShares) inputs.etfShares.value = state.etf.shares;
            if (inputs.etfPrice) inputs.etfPrice.value = state.etf.price;
            if (inputs.etfCost) inputs.etfCost.value = state.etf.cost;
            if (inputs.simRange) {
                inputs.simRange.value = state.sim.range;
                if (inputs.rangeLabel) inputs.rangeLabel.textContent = state.sim.range;
            }

            updateStrategyTabs();
            renderOptionInputs();
            calculateAndRender(false);
        } else {
            // Try to migrate from old format
            db.ref('users/default-user/hedge_positions').once('value', (oldSnapshot) => {
                const oldData = oldSnapshot.val();
                if (oldData && oldData.options) {
                    console.log("Migrating from old format");
                    state.marketIndex = oldData.marketIndex ?? state.marketIndex;
                    state.hedgeBasisIndex = oldData.hedgeBasisIndex ?? state.hedgeBasisIndex;
                    state.hedgeFund = oldData.hedgeFund ?? 0;
                    state.etf = oldData.etf ?? state.etf;
                    state.strategies[0].options = oldData.options;
                    state.strategies[0].nextOptionId = oldData.nextOptionId ?? 2;
                    state.sim = oldData.sim ?? state.sim;

                    // Sync DOM
                    if (inputs.marketIndex) inputs.marketIndex.value = state.marketIndex;
                    if (inputs.hedgeBasisInput) inputs.hedgeBasisInput.value = state.hedgeBasisIndex;
                    if (inputs.hedgeFund) inputs.hedgeFund.value = state.hedgeFund;
                    if (inputs.etfShares) inputs.etfShares.value = state.etf.shares;
                    if (inputs.etfPrice) inputs.etfPrice.value = state.etf.price;
                    if (inputs.etfCost) inputs.etfCost.value = state.etf.cost;
                    if (inputs.simRange) {
                        inputs.simRange.value = state.sim.range;
                        if (inputs.rangeLabel) inputs.rangeLabel.textContent = state.sim.range;
                    }

                    renderOptionInputs();
                    calculateAndRender();
                } else {
                    updateStateFromDOM();
                    calculateAndRender();
                }
            });
        }
    });
}

// Event Listeners
function attachListeners() {
    // Static Inputs
    [inputs.marketIndex, inputs.etfShares, inputs.etfPrice, inputs.etfCost, inputs.simRange, inputs.hedgeBasisInput, inputs.hedgeFund].forEach(el => {
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

    // Strategy Tabs
    document.querySelectorAll('.strategy-tab').forEach(tab => {
        tab.addEventListener('click', handleStrategyTabClick);
    });

    // Scenario Buttons
    document.querySelectorAll('.scenario-btn').forEach(btn => {
        btn.addEventListener('click', handleScenarioClick);
    });

    // Comparison Buttons
    const showCompBtn = document.getElementById('show-comparison-btn');
    const hideCompBtn = document.getElementById('toggle-comparison-btn');
    if (showCompBtn) showCompBtn.addEventListener('click', () => toggleComparison(true));
    if (hideCompBtn) hideCompBtn.addEventListener('click', () => toggleComparison(false));

    // Asset Tracking Buttons
    if (inputs.recordHighBtn) {
        inputs.recordHighBtn.addEventListener('click', handleRecordDailyHigh);
    }
    if (inputs.clearRecordsBtn) {
        inputs.clearRecordsBtn.addEventListener('click', handleClearRecords);
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
    const currentStrategy = getCurrentStrategy();

    currentStrategy.options.forEach((opt, index) => {
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
            <div class="row">
                <label class="full-width">
                    <span>到期日</span>
                    <input type="date" class="opt-input" data-field="expirationDate" value="${opt.expirationDate || ''}">
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
    const currentStrategy = getCurrentStrategy();
    currentStrategy.options.push({
        id: currentStrategy.nextOptionId++,
        type: 'buy_put',
        strike: state.marketIndex,
        premium: 200,
        qty: 1,
        multiplier: 50,
        expirationDate: ''
    });
    renderOptionInputs();
    updateStateFromDOM();
    calculateAndRender();
}

window.removeOption = function (id) {
    const currentStrategy = getCurrentStrategy();
    if (currentStrategy.options.length <= 1) {
        alert("至少保留一個避險倉位");
        return;
    }
    currentStrategy.options = currentStrategy.options.filter(o => o.id !== id);
    renderOptionInputs();
    updateStateFromDOM();
    calculateAndRender();
};

// Update State
function updateStateFromDOM() {
    state.marketIndex = parseFloat(inputs.marketIndex.value) || 0;
    state.hedgeBasisIndex = parseFloat(inputs.hedgeBasisInput.value) || 0;
    state.hedgeFund = parseFloat(inputs.hedgeFund.value) || 0;

    state.etf.shares = parseFloat(inputs.etfShares.value) || 0;
    state.etf.price = parseFloat(inputs.etfPrice.value) || 0;
    state.etf.cost = parseFloat(inputs.etfCost.value) || 0;
    state.sim.range = parseFloat(inputs.simRange.value) || 1500;

    // Update Options from DOM
    const currentStrategy = getCurrentStrategy();
    const rows = document.querySelectorAll('.option-leg-row');
    rows.forEach(row => {
        const id = parseInt(row.dataset.id);
        const opt = currentStrategy.options.find(o => o.id === id);
        if (opt) {
            opt.type = row.querySelector('[data-field="type"]').value;
            opt.strike = parseFloat(row.querySelector('[data-field="strike"]').value) || 0;
            opt.premium = parseFloat(row.querySelector('[data-field="premium"]').value) || 0;
            opt.qty = parseFloat(row.querySelector('[data-field="qty"]').value) || 0;
            opt.multiplier = parseFloat(row.querySelector('[data-field="multiplier"]').value) || 50;
            const expInput = row.querySelector('[data-field="expirationDate"]');
            opt.expirationDate = expInput ? expInput.value : '';
        }
    });
}

// Core Logic
function calculateAndRender(shouldSave = true, showScenarioLine = false) {
    const { marketIndex, etf, sim } = state;
    const options = getCurrentStrategy().options;

    // Save state on every calc (if triggered by user)
    if (shouldSave) saveToFirebase();

    // 1. Calculate Scenario Data Points
    const dataPoints = generateDataPoints(state.currentStrategyIndex);

    // 2. Update UI Summary
    const currentAssets = etf.price * etf.shares * 1000;
    const currentUnrealizedPnL = (etf.price - etf.cost) * etf.shares * 1000;

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

        // Strategy Name Badge
        html += `<div class="chip chip-strategy">${getCurrentStrategy().name || `策略 ${['A', 'B', 'C'][state.currentStrategyIndex]}`}</div>`;

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
            const typeLabel = opt.type.replace('_', ' ').toUpperCase();
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
        if (opt.type.startsWith('buy')) netPremium -= legCost;
        else netPremium += legCost;
    });

    if (netPremium < 0) {
        outputs.maxHedgeCost.textContent = formatCurrency(netPremium);
        outputs.maxHedgeCost.className = 'value warning';
    } else {
        outputs.maxHedgeCost.textContent = "+" + formatCurrency(netPremium);
        outputs.maxHedgeCost.className = 'value success';
    }

    // Find approximate break-even
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

    // 3. Update Chart with annotations
    renderChart(dataPoints, showScenarioLine);

    // 4. Update Table
    renderTable(dataPoints);

    // 5. Check expiration dates
    checkExpirationDates();

    // 6. Update Asset Tracking UI
    updateAssetTrackingUI();

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
    outputs.tableBody.innerHTML = '';

    const basisIndexChangePct = (state.hedgeBasisIndex - state.marketIndex) / state.marketIndex;
    const basisEtfPrice = state.etf.price * (1 + (basisIndexChangePct * 2));
    const basisEtfVal = basisEtfPrice * state.etf.shares * 1000;

    let closestBasisDiff = Infinity;
    data.forEach(d => {
        const diff = Math.abs(d.index - state.hedgeBasisIndex);
        if (diff < closestBasisDiff) closestBasisDiff = diff;
    });

    const frag = document.createDocumentFragment();

    data.forEach(d => {
        const tr = document.createElement('tr');
        const isCurrentRow = Math.abs(d.index - state.marketIndex) < 50;
        const isBasisRow = Math.abs(d.index - state.hedgeBasisIndex) === closestBasisDiff;
        const isScenarioRow = state.scenarioHighlight && Math.abs(d.index - state.scenarioHighlight) < 50;

        if (isScenarioRow && !isCurrentRow) {
            tr.className = 'scenario-highlight-row';
        } else if (isCurrentRow) {
            tr.className = 'current-price-row';
        } else if (isBasisRow) {
            tr.className = 'basis-price-row';
            tr.style.background = 'rgba(163, 113, 247, 0.1)';
        }

        const diff = d.index - state.hedgeBasisIndex;
        const displayIndexChangePct = (d.index - state.hedgeBasisIndex) / state.hedgeBasisIndex;
        const estimatedEtfVal = d.etfPrice * state.etf.shares * 1000;
        const spotChange = Math.round(estimatedEtfVal - basisEtfVal);

        tr.innerHTML = `
            <td class="index-cell">
                ${isCurrentRow ? '<span class="current-marker">▶</span>' : ''}
                ${isBasisRow && !isCurrentRow ? '<span class="current-marker" style="color: #d2a8ff;">★</span>' : ''}
                ${isScenarioRow && !isCurrentRow ? '<span class="current-marker" style="color: #ffb86c;">◆</span>' : ''}
                ${d.index}
                ${isCurrentRow ? '<span class="current-label">← 目前</span>' : ''}
                ${isBasisRow ? '<span class="basis-label">基準</span>' : ''}
            </td>
            <td class="${getClassForVal(diff)}">${diff > 0 ? '+' : ''}${diff}</td>
            <td class="${getClassForVal(displayIndexChangePct)}">${fmtPct.format(displayIndexChangePct)}</td>
            <td>${fmtPrice.format(d.etfPrice)}</td>
            <td class="${getClassForVal(d.etfPnL)}">
                ${formatCurrency(d.etfPnL)}
                <div style="font-size:0.75em; color: #8b949e;">${(d.etfPnL / (state.etf.cost * state.etf.shares * 1000) * 100).toFixed(2)}%</div>
            </td>
             <td class="${getClassForVal(spotChange)}">${formatCurrency(spotChange)}</td>
            <td class="${getClassForVal(d.optPnL)}">${formatCurrency(d.optPnL)}</td>
            <td class="${getClassForVal(d.netPnL)} font-bold">${formatCurrency(d.netPnL)}</td>
        `;
        frag.appendChild(tr);
    });

    outputs.tableBody.appendChild(frag);
}

function renderChart(data, showScenarioLine = false) {
    const labels = data.map(d => d.index);
    const netPnLData = data.map(d => d.netPnL);
    const etfPnLData = data.map(d => d.etfPnL);
    const optPnLData = data.map(d => d.optPnL);

    // Build annotations
    const annotations = {
        zeroLine: {
            type: 'line',
            yMin: 0,
            yMax: 0,
            borderColor: 'rgba(255, 255, 255, 0.3)',
            borderWidth: 1,
            borderDash: [5, 5]
        },
        currentIndex: {
            type: 'line',
            xMin: state.marketIndex,
            xMax: state.marketIndex,
            borderColor: 'rgba(255, 215, 0, 0.8)',
            borderWidth: 2,
            label: {
                display: true,
                content: '現價',
                position: 'start',
                backgroundColor: 'rgba(255, 215, 0, 0.8)',
                color: '#000',
                font: { size: 10 }
            }
        },
        basisIndex: {
            type: 'line',
            xMin: state.hedgeBasisIndex,
            xMax: state.hedgeBasisIndex,
            borderColor: 'rgba(163, 113, 247, 0.8)',
            borderWidth: 2,
            borderDash: [4, 4],
            label: {
                display: true,
                content: '基準',
                position: 'start',
                backgroundColor: 'rgba(163, 113, 247, 0.8)',
                color: '#fff',
                font: { size: 10 }
            }
        }
    };

    // Add scenario highlight line if active
    if (showScenarioLine && state.scenarioHighlight) {
        annotations.scenarioLine = {
            type: 'line',
            xMin: state.scenarioHighlight,
            xMax: state.scenarioHighlight,
            borderColor: 'rgba(255, 184, 108, 0.9)',
            borderWidth: 2,
            label: {
                display: true,
                content: '情境',
                position: 'end',
                backgroundColor: 'rgba(255, 184, 108, 0.9)',
                color: '#000',
                font: { size: 10 }
            }
        };
    }

    if (pnlChart) {
        pnlChart.data.labels = labels;
        pnlChart.data.datasets[0].data = netPnLData;
        pnlChart.data.datasets[1].data = etfPnLData;
        pnlChart.data.datasets[2].data = optPnLData;
        pnlChart.options.plugins.annotation.annotations = annotations;
        pnlChart.update('none');
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
                    },
                    {
                        label: '選擇權損益',
                        data: optPnLData,
                        borderColor: 'rgba(248, 81, 73, 0.6)',
                        borderWidth: 2,
                        borderDash: [3, 3],
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
                    },
                    annotation: {
                        annotations: annotations
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

// ===== Asset Tracking Functions =====

// Calculate current total asset value (spot market value + hedge fund)
function calculateTotalAsset() {
    const { etf, hedgeFund } = state;
    const spotMarketValue = etf.price * etf.shares * 1000;
    return spotMarketValue + hedgeFund;
}

// Get today's date string in YYYY-MM-DD format
function getTodayDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Format date for display
function formatDateDisplay(dateStr) {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parts[1]}/${parts[2]}`;
    }
    return dateStr;
}

// Handle record daily high button click
function handleRecordDailyHigh() {
    const today = getTodayDateString();
    const currentValue = calculateTotalAsset();

    // Check if we already have a record for today
    const existingIndex = state.assetRecords.findIndex(r => r.date === today);

    if (existingIndex >= 0) {
        // Update today's record only if current value is higher
        if (currentValue > state.assetRecords[existingIndex].value) {
            state.assetRecords[existingIndex].value = currentValue;
            state.assetRecords[existingIndex].timestamp = new Date().toISOString();
            showRecordsStatus('success', `✅ 今日最高點已更新！ ${formatCurrency(currentValue)}`);
        } else {
            showRecordsStatus('info', `ℹ️ 今日已有更高的記錄：${formatCurrency(state.assetRecords[existingIndex].value)}`);
        }
    } else {
        // Add new record
        state.assetRecords.push({
            date: today,
            value: currentValue,
            timestamp: new Date().toISOString()
        });
        showRecordsStatus('success', `✅ 已記錄今日最高點：${formatCurrency(currentValue)}`);
    }

    // Sort by date
    state.assetRecords.sort((a, b) => a.date.localeCompare(b.date));

    // Save to Firebase
    saveAssetRecordsToFirebase();

    // Update UI
    updateAssetTrackingUI();
}

// Handle clear records button click
function handleClearRecords() {
    if (state.assetRecords.length === 0) {
        showRecordsStatus('info', 'ℹ️ 沒有記錄可以清除');
        return;
    }

    if (confirm(`確定要清除所有 ${state.assetRecords.length} 筆記錄嗎？此操作無法復原。`)) {
        state.assetRecords = [];
        saveAssetRecordsToFirebase();
        updateAssetTrackingUI();
        showRecordsStatus('warning', '🗑️ 所有記錄已清除');
    }
}

// Show status message
function showRecordsStatus(type, message) {
    if (!outputs.recordsStatus) return;

    outputs.recordsStatus.className = `records-status ${type}`;
    outputs.recordsStatus.textContent = message;

    // Auto-hide after 3 seconds
    setTimeout(() => {
        outputs.recordsStatus.className = 'records-status';
    }, 3000);
}

// Save asset records to Firebase
function saveAssetRecordsToFirebase() {
    db.ref('users/default-user/asset_records').set(state.assetRecords)
        .then(() => console.log('Asset records saved to Firebase'))
        .catch(e => console.error('Failed to save asset records:', e));
}

// Sync asset records from Firebase
function syncAssetRecordsFromFirebase() {
    db.ref('users/default-user/asset_records').on('value', (snapshot) => {
        const data = snapshot.val();
        if (data && Array.isArray(data)) {
            state.assetRecords = data;
            console.log('Synced asset records from Firebase:', data.length, 'records');
        } else {
            state.assetRecords = [];
        }
        updateAssetTrackingUI();
    });
}

// Update all asset tracking UI elements
function updateAssetTrackingUI() {
    const currentTotal = calculateTotalAsset();

    // Update total asset display
    if (outputs.totalAssetVal) {
        outputs.totalAssetVal.textContent = formatCurrency(currentTotal);
    }

    // Find all-time high
    let allTimeHigh = currentTotal;
    state.assetRecords.forEach(record => {
        if (record.value > allTimeHigh) {
            allTimeHigh = record.value;
        }
    });

    // Update all-time high display
    if (outputs.allTimeHigh) {
        outputs.allTimeHigh.textContent = formatCurrency(allTimeHigh);
    }

    // Update distance from high
    if (outputs.distanceFromHigh) {
        const distance = currentTotal - allTimeHigh;
        const distancePct = allTimeHigh > 0 ? (distance / allTimeHigh * 100) : 0;

        if (distance >= 0) {
            outputs.distanceFromHigh.textContent = '🏆 新高！';
            outputs.distanceFromHigh.style.color = '#ffd700';
        } else {
            outputs.distanceFromHigh.textContent = `${formatCurrency(distance)} (${distancePct.toFixed(2)}%)`;
            outputs.distanceFromHigh.style.color = 'var(--accent-secondary)';
        }
    }

    // Update chart
    renderAssetHistoryChart();

    // Update records list
    renderRecordsList();
}

// Render asset history chart
function renderAssetHistoryChart() {
    if (!assetHistoryChartCtx) return;

    const records = state.assetRecords;

    if (records.length < 2) {
        // Not enough data for a meaningful chart
        if (assetHistoryChart) {
            assetHistoryChart.destroy();
            assetHistoryChart = null;
        }
        return;
    }

    const labels = records.map(r => formatDateDisplay(r.date));
    const dataValues = records.map(r => r.value);

    // Find max value for highlighting
    const maxValue = Math.max(...dataValues);

    // Create point colors (highlight max)
    const pointColors = dataValues.map(val =>
        val === maxValue ? '#ffd700' : 'rgba(63, 185, 80, 0.8)'
    );

    const pointRadii = dataValues.map(val =>
        val === maxValue ? 6 : 3
    );

    if (assetHistoryChart) {
        assetHistoryChart.data.labels = labels;
        assetHistoryChart.data.datasets[0].data = dataValues;
        assetHistoryChart.data.datasets[0].pointBackgroundColor = pointColors;
        assetHistoryChart.data.datasets[0].pointRadius = pointRadii;
        assetHistoryChart.update('none');
    } else {
        assetHistoryChart = new Chart(assetHistoryChartCtx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: '總資產',
                    data: dataValues,
                    borderColor: 'rgba(63, 185, 80, 0.8)',
                    backgroundColor: (context) => {
                        const ctx = context.chart.ctx;
                        const gradient = ctx.createLinearGradient(0, 0, 0, 150);
                        gradient.addColorStop(0, 'rgba(63, 185, 80, 0.3)');
                        gradient.addColorStop(1, 'rgba(63, 185, 80, 0)');
                        return gradient;
                    },
                    borderWidth: 2,
                    pointBackgroundColor: pointColors,
                    pointBorderColor: 'transparent',
                    pointRadius: pointRadii,
                    pointHoverRadius: 6,
                    tension: 0.3,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                return formatCurrency(context.parsed.y);
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(48, 54, 61, 0.5)' },
                        ticks: {
                            color: '#8b949e',
                            font: { size: 10 }
                        }
                    },
                    y: {
                        grid: { color: 'rgba(48, 54, 61, 0.5)' },
                        ticks: {
                            color: '#8b949e',
                            font: { size: 10 },
                            callback: function (value) {
                                return '$' + (value / 1000).toFixed(0) + 'K';
                            }
                        }
                    }
                }
            }
        });
    }
}

// Render records list
function renderRecordsList() {
    if (!outputs.recordsList) return;

    const records = state.assetRecords;

    if (records.length === 0) {
        outputs.recordsList.innerHTML = '<div class="records-list-empty">尚無記錄，點擊上方按鈕開始記錄！</div>';
        return;
    }

    // Find max value
    const maxValue = Math.max(...records.map(r => r.value));

    // Display records in reverse chronological order
    const reversedRecords = [...records].reverse();

    let html = '';
    reversedRecords.forEach((record, index) => {
        const isHigh = record.value === maxValue;
        const prevRecord = reversedRecords[index + 1];
        let changeHtml = '';

        if (prevRecord) {
            const change = record.value - prevRecord.value;
            const changePct = (change / prevRecord.value * 100).toFixed(2);
            const changeClass = change >= 0 ? 'positive' : 'negative';
            const changeSign = change >= 0 ? '+' : '';
            changeHtml = `<span class="record-change ${changeClass}">${changeSign}${formatCurrency(change)} (${changeSign}${changePct}%)</span>`;
        }

        html += `
            <div class="record-item ${isHigh ? 'is-high' : ''}">
                <span class="record-date">${record.date}</span>
                <span>
                    <span class="record-value">${formatCurrency(record.value)}</span>
                    ${changeHtml}
                </span>
            </div>
        `;
    });

    outputs.recordsList.innerHTML = html;
}

// Override init to also sync asset records
const originalInit = function () {
    console.log("Initializing App...");
    renderOptionInputs();
    attachListeners();
    syncFromFirebase();
    syncAssetRecordsFromFirebase();
};

// Start
originalInit();
