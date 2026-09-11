/**
 * editorZh — react-filerobot-image-editor 中文语言包（PRD R75.4）。
 * 库内置语言无 zh；translations 按 key 深合并覆盖，缺 key 回退英文（预期内、可接受）。
 * key 名以库 en 默认语言为准，不存在的 key 会被忽略（无害）。
 */
export const editorZh: Record<string, string> = {
  // tabs
  adjust: '调整',
  annotate: '标注',
  filters: '滤镜',
  finetune: '微调',
  resize: '尺寸',
  watermark: '水印',
  // common actions
  save: '保存',
  saveAs: '另存为',
  close: '关闭',
  cancel: '取消',
  apply: '应用',
  reset: '重置',
  undo: '撤销',
  redo: '重做',
  // adjust tab
  crop: '裁剪',
  cropImage: '裁剪图片',
  rotate: '旋转',
  rotateLeft: '向左旋转',
  rotateRight: '向右旋转',
  flipHorizontal: '水平翻转',
  flipVertical: '垂直翻转',
  straighten: '校正',
  // annotate tools
  text: '文字',
  pen: '画笔',
  arrow: '箭头',
  rect: '矩形',
  ellipse: '椭圆',
  polygon: '多边形',
  image: '图片',
  line: '直线',
  colorPicker: '颜色',
  strokeWidth: '粗细',
  fill: '填充',
  opacity: '不透明度',
  // misc
  zoomIn: '放大',
  zoomOut: '缩小',
  actualSize: '实际大小',
  fitToView: '适应窗口',
}
