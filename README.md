# Module Search Service

最小可用的模組搜尋 Proxy，從 `CATALOG_URL` 指向的 catalog.json 讀取群組與路徑，
再抓取各群組的 `*_modules_all.json` 聚合後做搜尋。

## 必填環境變數
- `CATALOG_URL`：你的 catalog.json RAW 連結  
  例：`https://raw.githubusercontent.com/danny7117/webapp-ai-module-registry/main/modules/catalog.json?v=20250909-1`

### 可選環境變數
- `MODULES_GROUPS`：只用特定群組（逗號分隔 group id），不填代表全部  
  例：`brandcraft_all,crawler_all,cardbattle_all,cryptopark_all`

## 測試
- `GET /api/search?q=cryptopark&limit=5`
- `GET /api/search?q=caption&limit=5`
- `GET /api/search?q=thumbnail&limit=5`

建議在網址尾端加 `_ts` 參數避開 CDN 快取：`&_ts=1690000000`
