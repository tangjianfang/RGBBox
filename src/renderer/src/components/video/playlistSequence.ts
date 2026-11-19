/**
 * playlistSequence — R334 播放列表树与播放序列纯函数（树形展示 / 自动连播 /
 * 上一集 / 下一集共用）。
 *
 * 分组字符串即树路径：`'A/B/C'` 表示 A 根下 B 子夹下 C 子夹（主进程
 * videoOpenFolder 递归扫描产出，'/' 为层级分隔符；旧数据 / 手动添加的
 * 无分隔符分组是深度 1 根节点——天然向后兼容）。
 *
 * 播放序列 = 树的先序拉平（节点直接条目 → 子节点递归，同级按名称数字
 * 感知排序）：文件夹（节点）播完自然接续下一个文件夹的第一个条目。
 * 纯数据搬运，无 DOM / Electron 依赖。
 */

/** 列表条目最小结构（VideoItem 子集）。 */
export interface SequenceItemLike {
  group: string
  url?: string
  missing?: boolean
}

/** 播放列表树节点。 */
export interface PlaylistTreeNode {
  /** 节点显示名（路径最后一段）。 */
  name: string
  /** 完整分组路径（'A/B'，与 VideoGroup.name 同构，折叠态按它存取）。 */
  path: string
  /** 直接归属本节点的条目索引（组内按列表加入序）。 */
  indices: number[]
  /** 子文件夹节点（按名称数字感知排序）。 */
  children: PlaylistTreeNode[]
}

/** 数字感知排序（S2 < S10；locale 感知中文）。 */
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/**
 * 由列表条目构建播放列表树：条目 group 按 '/' 切层级；无直接条目的
 * 中间祖先（只含子夹的根）隐式生成；无任何条目的空分组不出现。
 */
export function buildPlaylistTree(items: SequenceItemLike[]): PlaylistTreeNode[] {
  // 1) 按完整路径收集条目索引
  const indicesByPath = new Map<string, number[]>()
  items.forEach((v, i) => {
    const list = indicesByPath.get(v.group)
    if (list) list.push(i)
    else indicesByPath.set(v.group, [i])
  })
  // 2) 展开所有祖先路径（含无直接条目的中间节点）
  const allPaths = new Set<string>()
  for (const p of indicesByPath.keys()) {
    const segs = p.split('/')
    for (let d = 1; d <= segs.length; d++) allPaths.add(segs.slice(0, d).join('/'))
  }
  // 3) 建节点并挂到父节点（父必然先于子存在于 allPaths——祖先展开保证）
  const nodes = new Map<string, PlaylistTreeNode>()
  const roots: PlaylistTreeNode[] = []
  for (const path of allPaths) {
    nodes.set(path, {
      name: path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path,
      path,
      indices: indicesByPath.get(path) ?? [],
      children: [],
    })
  }
  for (const path of allPaths) {
    const node = nodes.get(path)!
    const cut = path.lastIndexOf('/')
    if (cut === -1) roots.push(node)
    else nodes.get(path.slice(0, cut))!.children.push(node)
  }
  // 4) 同级排序（根与子夹统一按名称数字感知）+ 组内索引保序列表序
  const sortRec = (n: PlaylistTreeNode): void => {
    n.children.sort((a, b) => collator.compare(a.name, b.name))
    n.children.forEach(sortRec)
  }
  roots.sort((a, b) => collator.compare(a.name, b.name))
  roots.forEach(sortRec)
  return roots
}

/** 树的先序拉平：节点直接条目 → 各子节点递归（连播 / 上下集共用序）。 */
export function flattenTreeOrder(nodes: PlaylistTreeNode[]): number[] {
  const out: number[] = []
  const walk = (n: PlaylistTreeNode): void => {
    out.push(...n.indices)
    n.children.forEach(walk)
  }
  nodes.forEach(walk)
  return out
}

/** 节点条目总数（含子孙）——分组头的计数角标。 */
export function countTreeItems(node: PlaylistTreeNode): number {
  return node.indices.length + node.children.reduce((sum, c) => sum + countTreeItems(c), 0)
}

/**
 * 沿播放序列找 from 的上 / 下一个可播条目（isPlayable 判定，跳过
 * missing / 无 url 等）；from 不在序列中或方向上再无可播条目（首 / 尾
 * 或全被跳过）返回 -1。
 */
export function stepPlayableIndex(
  order: number[],
  from: number,
  dir: 1 | -1,
  isPlayable: (index: number) => boolean,
): number {
  const pos = order.indexOf(from)
  if (pos === -1) return -1
  for (let p = pos + dir; p >= 0 && p < order.length; p += dir) {
    if (isPlayable(order[p])) return order[p]
  }
  return -1
}
