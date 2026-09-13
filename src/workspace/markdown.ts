import MarkdownIt from "markdown-it";

// No Obsidian transclusion processor, raw HTML, plugins, network resources or
// executable links. Source editing/navigation remains a separately checked host action.
const markdown = new MarkdownIt({ html: false, linkify: false, typographer: false, maxNesting: 20 });
markdown.renderer.rules.image = (tokens, index) => markdown.utils.escapeHtml(tokens[index].content);
markdown.renderer.rules.link_open = () => '<span class="kosmos-notes-link">';
markdown.renderer.rules.link_close = () => '</span>';

export function renderWorkspaceMarkdown(source: string): string {
  if (typeof source !== "string" || source.length > 200_000) throw new Error("WORKSPACE_PREVIEW_BUDGET");
  const html = markdown.render(source);
  if (html.length > 2_000_000) throw new Error("WORKSPACE_PREVIEW_BUDGET");
  return html;
}
