# 00631L 選擇權避險策略計算機 - 開發規劃書

## 1. 專案目標 (Project Objective)
建立一個現代化、視覺優美的網頁應用程式，專門用於計算和視覺化 **00631L (元大台灣50正2)** 持有者利用 **臺指選擇權 (TXO)** 進行避險時的損益情況。
特色功能是提供一個 **損益分析表 (PnL Analysis Table)**，針對大盤指數上下約 1500 點的波動範圍，展示合併損益，幫助使用者快速找到損益平衡點。

## 2. 核心功能需求 (Acceptance Criteria)

### 2.1 投資組合輸入設定 (Portfolio Settings)
- **現貨部位 (00631L)**
  - 持有張數 (預設: 6.8 張)
  - 平均成本
  - 目前市價 (可手動輸入或預留 API 欄位)
- **避險部位 (選擇權 Options)**
  - 類型: Buy Put / Sell Call (主要避險手段) 或其他組合
  - 履約價 (Strike Price)
  - 權利金 (Premium)
  - 口數 (Quantity)
- **市場參數**
  - 加權指數基準點 (Reference Index Level)

### 2.2 核心計算邏輯 (Calculation Engine)
- **00631L 價格估算模型**:
  由於 00631L 為兩倍槓桿，假設大盤漲跌 1%，ETF 約漲跌 2%。
  - `預估 ETF 價格 = 基準 ETF 價格 * (1 + (指數變動幅度% * 2))`
  - *註: 此為當日估算簡化模型，實際長期持有會有耗損與複利效應，但在短天期避險評估中足夠準確。*
- **選擇權結算損益**:
  - `Buy Put PnL = Max(Strike - Index, 0) - Premium`
  - `Sell Call PnL = Premium - Max(Index - Strike, 0)`
  - 支援複式單計算 (若需要)。

### 2.3 分析圖表與表格 (Analysis & Visualization)
- **損益分析表 (Interactive PnL Table)**
  - **範圍**: 基準指數 ± 750 點 (共 1500 點區間)
  - **間距**: 每 50 或 100 點一階
  - **欄位**:
    1. 加權指數 (Index)
    2. 指數漲跌幅 (%)
    3. 預估 00631L 損益
    4. 選擇權損益
    5. **淨損益 (Net PnL)** - *重點高亮顯示*
- **損益走勢圖 (PnL Chart)**
  - 使用 Chart.js 繪製 X 軸為指數位置，Y 軸為損益金額的折線圖。
  - 視覺化損益兩平點 (Break-even Point)。

## 3. 技術架構 (Wait Stack)
- **前端框架**: HTML5, Vanilla JavaScript (輕量高效), CSS3
- **樣式設計**: Custom CSS (不依賴龐大框架，確保設計獨特性與效能)
  - **風格**: "FinTech Dark Mode" - 深色背景，霓虹色數據展示 (綠漲紅跌)，玻璃擬態 (Glassmorphism) 卡片設計。
- **圖表庫**: Chart.js (繪製損益曲線)

## 4. 介面設計規劃 (UI/UX Design)
- **Layout**: 左側/上方為參數設定面板 (Settings Panel)，右側/下方為即時分析儀表板 (Dashboard)。
- **互動性**: 修改參數時，表格與圖表即時更新 (Real-time calculation)。
- **視覺重點**: 
  - 淨利潤為正顯示鮮豔綠色/金色，虧損顯示紅色/灰色。
  - 使用 Slider 或 Input 讓使用者快速調整「預期波動範圍」。

## 5. 開發步驟 (Implementation Steps)
1. **環境建置**: 建立基礎 HTML/CSS 結構。
2. **核心邏輯開發**: 編寫 JavaScript 計算引擎 (ETF 模擬與選擇權定價)。
3. **UI 組件開發**: 製作輸入表單與響應式表格。
4. **資料視覺化**: 整合 Chart.js 呈現損益圖。
5. **美化與優化**: 調整 CSS 配色、動畫與 RWD 手機版適配。

此規劃書確認後，將立即開始進行程式碼編寫。
