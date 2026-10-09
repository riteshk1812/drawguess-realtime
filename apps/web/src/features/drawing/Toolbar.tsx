export const COLORS = ['#1c1917', '#e11d48', '#f97316', '#eab308', '#16a34a', '#0284c7', '#7c3aed', '#ffffff']
export const SIZES = [4, 10, 18, 32]

export function Toolbar({
  color,
  size,
  tool,
  canDraw,
  onColor,
  onSize,
  onTool,
  onUndo,
  onClear,
}: {
  color: string
  size: number
  tool: 'pen' | 'eraser' | 'fill'
  canDraw: boolean
  onColor: (color: string) => void
  onSize: (size: number) => void
  onTool: (tool: 'pen' | 'eraser' | 'fill') => void
  onUndo: () => void
  onClear: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Drawing toolbar">
      {(['pen', 'eraser', 'fill'] as const).map((item) => (
        <button key={item} type="button" className={`btn-ghost capitalize ${tool === item ? 'ring-2 ring-coral' : ''}`} aria-pressed={tool === item} disabled={!canDraw} onClick={() => onTool(item)}>
          {item}
        </button>
      ))}
      <div className="flex gap-1" aria-label="Colors">
        {COLORS.map((swatch) => (
          <button
            key={swatch}
            type="button"
            aria-label={`Color ${swatch}`}
            disabled={!canDraw}
            onClick={() => onColor(swatch)}
            className={`h-8 w-8 rounded-full border border-black/20 ${color === swatch ? 'ring-2 ring-gold' : ''}`}
            style={{ background: swatch }}
          />
        ))}
      </div>
      {SIZES.map((value) => (
        <button key={value} type="button" className={`btn-ghost ${size === value ? 'ring-2 ring-coral' : ''}`} disabled={!canDraw} onClick={() => onSize(value)} aria-label={`Brush ${value}`}>
          {value}
        </button>
      ))}
      <button type="button" className="btn-ghost" disabled={!canDraw} onClick={onUndo}>Undo</button>
      <button type="button" className="btn-ghost" disabled={!canDraw} onClick={onClear}>Clear</button>
    </div>
  )
}
