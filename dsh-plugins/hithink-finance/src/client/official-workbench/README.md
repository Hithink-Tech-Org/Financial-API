# 官网动态看板

页面外壳、图表样式及视图取自金融数据文档站仓库的 `apps/docs/static/best-practices/dynamic-pages/`，基线提交为 `ccaac64`。七个 HTML 和 `styles.css` 保留官网源文件，`app.js` 与 `charts.js` 处理工作台查询结果和缺失数据。

插件构建将页面、样式及脚本打入客户端，`runtime.js` 通过隔离页面的消息通道请求宿主。宿主查询契约位于 `src/host/official-cases.js`。
