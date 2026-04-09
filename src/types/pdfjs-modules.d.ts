declare module 'pdfjs-dist/legacy/build/pdf.mjs'

declare module 'pdfjs-dist/build/pdf.worker?url' {
  const workerUrl: string
  export default workerUrl
}
