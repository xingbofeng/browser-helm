# P2 真实场景

P2 是扩展覆盖和回归哨兵：主要覆盖第三方站点波动、长尾 adapter、更多文档/下载/视觉边界，以及不适合放入 P0/P1 的高维护成本场景。

## 当前 P2 场景

- `stackoverflow-search-or-block-dialogue`：真实页面可用时填写搜索框；Cloudflare/Just a moment 时总结阻塞状态。
- `download-metadata-read-dialogue`：列出真实下载元数据，不读取本地文件内容。
- `tab-context-selection-dialogue`：多 tab 列表、active tab 读取和按标题选目标 tab。
- `fixture-long-page-pagination-dialogue`：稳定 fixture 长页面读取、滚动、复读并总结新增内容。
