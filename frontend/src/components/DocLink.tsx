import { BookOpen } from 'lucide-react'

export function DocLink({ path }: { path: string }) {
  return (
    <a
      href={`/manual/${path}`}
      target="_blank"
      rel="noopener noreferrer"
      title="Open documentation"
      className="text-slate-500 hover:text-slate-300 transition-colors"
    >
      <BookOpen className="w-4 h-4" />
    </a>
  )
}
