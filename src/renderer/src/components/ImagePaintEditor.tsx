import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useI18n } from '../i18n'

interface ImagePaintEditorProps {
  columns: number
  rows: number
  imageDataList: string[][]
  activeImageIndex: number
  transitionSpeed: number
  animateTransition: boolean
  onChange: (data: {
    imageDataList: string[][]
    activeImageIndex: number
    transitionSpeed: number
    animateTransition: boolean
  }) => void
}

/**
 * Resizes an image to grid dimensions (columns x rows) and extracts per-pixel hex colors.
 */
function imageToPixelGrid(img: HTMLImageElement, columns: number, rows: number): string[] {
  const canvas = document.createElement('canvas')
  canvas.width = columns
  canvas.height = rows
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, columns, rows)
  const imageData = ctx.getImageData(0, 0, columns, rows)
  const pixels: string[] = []
  for (let i = 0; i < imageData.data.length; i += 4) {
    const r = imageData.data[i]
    const g = imageData.data[i + 1]
    const b = imageData.data[i + 2]
    pixels.push(`#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`)
  }
  return pixels
}

function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = dataUrl
  })
}

export function ImagePaintEditor({ columns, rows, imageDataList, activeImageIndex, transitionSpeed, animateTransition, onChange }: ImagePaintEditorProps): JSX.Element {
  const { t } = useI18n()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const [thumbnails, setThumbnails] = useState<string[]>([])

  const cellSize = Math.min(Math.floor(480 / columns), Math.floor(280 / rows), 32)
  const canvasWidth = columns * cellSize
  const canvasHeight = rows * cellSize

  // Draw preview of active image
  useEffect(() => {
    const canvas = previewCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvasWidth, canvasHeight)

    const activePixels = imageDataList[activeImageIndex]
    if (!activePixels) return

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < columns; x++) {
        const idx = y * columns + x
        ctx.fillStyle = activePixels[idx] || '#000000'
        ctx.fillRect(x * cellSize, y * cellSize, cellSize - 1, cellSize - 1)
      }
    }
  }, [imageDataList, activeImageIndex, columns, rows, cellSize, canvasWidth, canvasHeight])

  const handleAddImage = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const newImages = [...imageDataList]
    const newThumbs = [...thumbnails]

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (!file.type.startsWith('image/')) continue

      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(file)
      })

      const img = await loadImageFromDataUrl(dataUrl)
      const pixels = imageToPixelGrid(img, columns, rows)
      newImages.push(pixels)

      // Generate a thumbnail for the list
      const thumbCanvas = document.createElement('canvas')
      thumbCanvas.width = 48
      thumbCanvas.height = 28
      const thumbCtx = thumbCanvas.getContext('2d')!
      thumbCtx.drawImage(img, 0, 0, 48, 28)
      newThumbs.push(thumbCanvas.toDataURL('image/jpeg', 0.7))
    }

    setThumbnails(newThumbs)
    onChange({
      imageDataList: newImages,
      activeImageIndex: newImages.length - 1,
      transitionSpeed,
      animateTransition
    })

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [imageDataList, thumbnails, columns, rows, transitionSpeed, animateTransition, onChange])

  const handleRemoveImage = useCallback((index: number) => {
    const newImages = imageDataList.filter((_, i) => i !== index)
    const newThumbs = thumbnails.filter((_, i) => i !== index)
    setThumbnails(newThumbs)
    const newActiveIndex = activeImageIndex >= newImages.length ? Math.max(0, newImages.length - 1) : activeImageIndex
    onChange({
      imageDataList: newImages,
      activeImageIndex: newActiveIndex,
      transitionSpeed,
      animateTransition
    })
  }, [imageDataList, thumbnails, activeImageIndex, transitionSpeed, animateTransition, onChange])

  const handleSelectImage = useCallback((index: number) => {
    onChange({ imageDataList, activeImageIndex: index, transitionSpeed, animateTransition })
  }, [imageDataList, transitionSpeed, animateTransition, onChange])

  const handleTransitionSpeedChange = useCallback((value: number) => {
    onChange({ imageDataList, activeImageIndex, transitionSpeed: value, animateTransition })
  }, [imageDataList, activeImageIndex, animateTransition, onChange])

  const handleToggleAnimate = useCallback(() => {
    onChange({ imageDataList, activeImageIndex, transitionSpeed, animateTransition: !animateTransition })
  }, [imageDataList, activeImageIndex, transitionSpeed, animateTransition, onChange])

  return (
    <div className="image-paint-editor">
      <h4 className="image-paint-title">{t('imagePaint.title' as Parameters<typeof t>[0])}</h4>

      <div className="image-paint-preview-wrapper">
        <canvas
          ref={previewCanvasRef}
          width={canvasWidth}
          height={canvasHeight}
          className="image-paint-preview-canvas"
        />
      </div>

      <div className="image-paint-image-list">
        {imageDataList.length === 0 && (
          <p className="image-paint-empty">{t('imagePaint.noImages' as Parameters<typeof t>[0])}</p>
        )}
        {imageDataList.map((_, index) => (
          <div
            key={index}
            className={`image-paint-thumb ${index === activeImageIndex ? 'active' : ''}`}
            onClick={() => handleSelectImage(index)}
          >
            {thumbnails[index] ? (
              <img src={thumbnails[index]} alt={`Image ${index + 1}`} />
            ) : (
              <span className="image-paint-thumb-placeholder">{index + 1}</span>
            )}
            <button
              type="button"
              className="image-paint-remove-btn"
              onClick={(e) => { e.stopPropagation(); handleRemoveImage(index) }}
              title={t('imagePaint.removeImage' as Parameters<typeof t>[0])}
            >
              <Trash2 size={10} />
            </button>
          </div>
        ))}
        <button type="button" className="image-paint-add-btn" onClick={handleAddImage}>
          <Plus size={14} />
          <span>{t('imagePaint.addImage' as Parameters<typeof t>[0])}</span>
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      <div className="image-paint-controls">
        <label className="image-paint-control-row">
          <span>{t('imagePaint.slideshow' as Parameters<typeof t>[0])}</span>
          <input
            type="checkbox"
            checked={animateTransition}
            onChange={handleToggleAnimate}
          />
        </label>
        {animateTransition && (
          <label className="image-paint-control-row">
            <span>{t('imagePaint.speed' as Parameters<typeof t>[0])}</span>
            <input
              type="range"
              min={1}
              max={10}
              step={0.5}
              value={transitionSpeed}
              onChange={(e) => handleTransitionSpeedChange(Number(e.target.value))}
            />
            <span className="image-paint-speed-value">{transitionSpeed}s</span>
          </label>
        )}
      </div>
    </div>
  )
}
