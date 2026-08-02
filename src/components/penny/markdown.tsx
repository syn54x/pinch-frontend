import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Penny's prose. react-markdown never renders raw HTML (its default — the
// sanitization decision in PRD #45), so the surface is markdown structure
// only: lists, emphasis, inline code, GFM tables. Styling stays inside the
// body scale (12.5–13px, DESIGN.md §3) — this is conversation, not a
// document viewer.
export function Markdown({ children }: { children: string }) {
  return (
    <div
      data-testid="assistant-text"
      className="space-y-2 text-[13px] leading-relaxed [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-px [&_code]:font-mono [&_code]:text-[11.5px] [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-2 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:w-full [&_table]:border-collapse [&_td]:border-b [&_td]:py-1 [&_td]:pr-4 [&_th]:border-b [&_th]:py-1 [&_th]:pr-4 [&_th]:text-left [&_th]:font-semibold [&_ul]:list-disc [&_ul]:pl-5"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  )
}
