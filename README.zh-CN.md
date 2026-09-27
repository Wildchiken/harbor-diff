# HarborDiff

**网站改版后，网络请求到底变了什么？**

[打开网页工具](https://Wildchiken.github.io/harbor-diff/) · [English](README.md)

把改版前后的两份 HAR 网络记录放进来，查看新增请求、HTTP 错误、响应体大小、重复调用和耗时变化，再复制一份适合贴进 issue 的 Markdown 摘要。

文件在浏览器本地处理，无需账号或 API key。默认导出的报告用 R001 等编号代替网址，不含原始文件名、请求头、Cookie 或响应正文。你可以主动选择加入 URL 路径，但路径本身可能包含私人信息，分享前请检查。

## 立即体验

打开[网页工具](https://Wildchiken.github.io/harbor-diff/)，点击 **Try the demo**。示例是人工构造的商店页面抓包：一张图片变大、API 被重复调用，并出现新的 HTTP 错误。

也可以在浏览器开发者工具的 Network 面板导出自己的 HAR 文件，分别放入 Before 和 After。尽量使用相同操作流程、设备、网络和缓存设置。

## 命令行

需要 Node.js 20 或更新版本，无第三方运行依赖。

```sh
git clone https://github.com/Wildchiken/harbor-diff.git
cd harbor-diff
node bin/harbor-diff.js --demo
node bin/harbor-diff.js before.har after.har --format json
```

本地启动网页：

```sh
npm start
```

然后访问 `http://127.0.0.1:4173`。运行测试使用 `npm test`。

## 怎样理解结果

工具按 HTTP 方法和 URL 分组；重复调用会保留次数。查询参数按名称排序，同名参数的值顺序仍保留；参数值默认参与匹配，可以主动忽略明确无关的版本参数。相同 URL 的 POST 请求会被归为一组，第一版不比较请求体。

大小使用 HAR 的 `response.bodySize`，不等于全部网络传输字节。缺失数据保持未知，不按零处理。耗时使用同组请求的中位数，不是页面加载时间。两次抓包只能说明观察到的差异，不能直接证明变慢的原因。

更多细节见 [English README](README.md)。欢迎通过 issue 提供具体使用反馈，请使用合成或仔细脱敏的例子。MIT 开源。
