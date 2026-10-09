export function HintWord({ hint }: { hint: string | null }) {
  if (!hint) return <p className="text-sm text-ink/60">Waiting for a word</p>
  return (
    <p className="font-display text-3xl tracking-[0.2em] text-ink sm:text-4xl" aria-label={`Hint ${hint}`}>
      {hint}
    </p>
  )
}
