// R334: 播放列表树 / 播放序列纯函数（自动连播 / 上一集 / 下一集共用）。
// 序列契约：树的先序拉平——节点直接条目先播，再递归子节点（同级名称数字
// 感知排序），文件夹节点播完自然接续下一个文件夹的第一个条目。
import { describe, it, expect } from 'vitest'
import {
  buildPlaylistTree, countTreeItems, flattenTreeOrder, stepPlayableIndex,
} from '../../../src/renderer/src/components/video/playlistSequence'

function itemsOf(groups: string[]): Array<{ id: string; name: string; group: string; url: string }> {
  return groups.map((g, i) => ({ id: `v${i}`, name: `n${i}.mp4`, group: g, url: `media://local?p=${i}` }))
}

describe('renderer/components/playlistSequence (R334)', () => {
  it('builds a tree from slash-separated group paths', () => {
    // 列表序刻意乱序（加入序与树序无关）
    const items = itemsOf(['Anime/S2', 'Movies', 'Anime', 'Anime/S1'])
    const tree = buildPlaylistTree(items)
    // 根级数字感知排序：Anime < Movies
    expect(tree.map(n => n.name)).toEqual(['Anime', 'Movies'])
    const anime = tree[0]
    // 子级数字感知排序：S1 < S2（字典序会得到 S10<S2 的反例见下一条）
    expect(anime.children.map(c => c.name)).toEqual(['S1', 'S2'])
    // 直接条目归属：Anime 只挂自己的 v2，S1/S2 各挂自己的
    expect(anime.indices).toEqual([2])
    expect(anime.children[0].indices).toEqual([3])
    expect(anime.children[1].indices).toEqual([0])
    // 完整路径与显示名分离（VideoGroup 折叠态按完整路径存取）
    expect(anime.children[0].path).toBe('Anime/S1')
    expect(anime.children[0].name).toBe('S1')
  })

  it('numeric-aware sibling order: S2 sorts before S10', () => {
    const tree = buildPlaylistTree(itemsOf(['Show/S10', 'Show/S2']))
    expect(tree[0].children.map(c => c.name)).toEqual(['S2', 'S10'])
  })

  it('generates implicit ancestors for deep-only paths (files-first then children)', () => {
    // 只有 'X/Y/Z' 有条目 → X、Y 为隐式中间节点（无直接条目但不丢树形）
    const items = itemsOf(['X/Y/Z', 'X/Y/Z'])
    const tree = buildPlaylistTree(items)
    expect(tree.map(n => n.path)).toEqual(['X'])
    const y = tree[0].children[0]
    expect(tree[0].indices).toEqual([])
    expect(y.indices).toEqual([])
    expect(y.children[0].indices).toEqual([0, 1])
    expect(countTreeItems(tree[0])).toBe(2)
  })

  it('flattenTreeOrder: DFS with node files first — folder finishes, next folder starts at its first item', () => {
    const items = itemsOf([
      'A',        // 0
      'A/S1',     // 1
      'A',        // 2
      'A/S2',     // 3
      'B',        // 4
    ])
    const order = flattenTreeOrder(buildPlaylistTree(items))
    // A 的直接条目(0,2) → A/S1(1) → A/S2(3) → B(4)
    expect(order).toEqual([0, 2, 1, 3, 4])
  })

  it('flattenTreeOrder: root folders sorted numerically as siblings', () => {
    const items = itemsOf(['S10', 'S2', 'Extras/SP'])
    const order = flattenTreeOrder(buildPlaylistTree(items))
    // 根排序 Extras < S2 < S10（数字感知 2 < 10）
    expect(order).toEqual([2, 1, 0])
  })

  it('stepPlayableIndex: walks the order in both directions and returns -1 at the ends', () => {
    const order = [0, 1, 2, 3]
    expect(stepPlayableIndex(order, 1, 1, () => true)).toBe(2)
    expect(stepPlayableIndex(order, 2, -1, () => true)).toBe(1)
    expect(stepPlayableIndex(order, 0, -1, () => true)).toBe(-1)
    expect(stepPlayableIndex(order, 3, 1, () => true)).toBe(-1)
    // from 不在序列（-1 = 非列表来源，如直接打开的文件/URL）
    expect(stepPlayableIndex(order, -1, 1, () => true)).toBe(-1)
  })

  it('stepPlayableIndex: skips unplayable entries (missing / no url)', () => {
    const order = [0, 1, 2, 3]
    const playable = (i: number) => i !== 1 && i !== 2
    expect(stepPlayableIndex(order, 0, 1, playable)).toBe(3)
    expect(stepPlayableIndex(order, 3, -1, playable)).toBe(0)
    // 方向上全被跳过 → -1
    expect(stepPlayableIndex(order, 3, 1, () => false)).toBe(-1)
  })

  it('legacy flat group names are depth-1 roots (backward compatible)', () => {
    const tree = buildPlaylistTree(itemsOf(['Default', '下载']))
    // 无 '/' 的旧分组 = 深度 1 根节点（集合断言，避免 locale 排序差异）
    expect(new Set(tree.map(n => n.name))).toEqual(new Set(['Default', '下载']))
    expect(tree.every(n => n.children.length === 0)).toBe(true)
  })
})
