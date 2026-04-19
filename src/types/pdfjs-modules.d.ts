// 为 pdfjs-dist 核心库提供类型声明
// 解决 TS 无法识别 legacy 版本 ES 模块的问题
declare module 'pdfjs-dist/legacy/build/pdf.mjs'

// 为以 ?url 形式导入的 PDF 工作线程文件声明类型
// 让 TS 识别该模块默认导出为字符串类型的 URL 地址
declare module 'pdfjs-dist/build/pdf.worker?url' {
  // PDF 工作线程脚本的 URL 地址
  const workerUrl: string
  // 导出工作线程 URL 供 PDF.js 初始化使用
  export default workerUrl
}