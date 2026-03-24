import { PageHeader } from "@repo/ui";
import { FileText } from "lucide-react";
import { useMemo } from "react";
import Markdown from "react-markdown";
import { useNavigate, useParams } from "react-router-dom";
import remarkGfm from "remark-gfm";
import cliproxyapiSetup from "../../../../../docs/cliproxyapi-setup.md?raw";

interface WikiEntry {
  slug: string;
  title: string;
  content: string;
}

const wikiPages: WikiEntry[] = [
  {
    slug: "cliproxyapi-setup",
    title: "CLIProxyAPI Setup",
    content: cliproxyapiSetup,
  },
];

export function WikiPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const activePage = useMemo(() => {
    if (slug) {
      return wikiPages.find((p) => p.slug === slug) ?? wikiPages[0];
    }
    return wikiPages[0];
  }, [slug]);

  if (!activePage) {
    return (
      <div className="p-4 md:p-6 overflow-auto h-full">
        <PageHeader title="Wiki" description="No wiki pages available yet." />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 overflow-auto h-full" data-testid="wiki-page">
      <PageHeader
        title="Wiki"
        description="Guides, references, and documentation for Assistline."
      />

      <div className="mt-6 flex flex-col md:flex-row gap-6">
        {/* Sidebar */}
        <nav
          className="shrink-0 md:w-56"
          aria-label="Wiki pages"
          data-testid="wiki-sidebar"
        >
          <ul className="flex md:flex-col gap-1">
            {wikiPages.map((page) => {
              const isActive = page.slug === activePage.slug;
              return (
                <li key={page.slug}>
                  <button
                    type="button"
                    onClick={() => navigate(`/wiki/${page.slug}`)}
                    data-testid={`wiki-link-${page.slug}`}
                    className={`flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                        : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200"
                    }`}
                  >
                    <FileText className="h-4 w-4 shrink-0" />
                    {page.title}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Content */}
        <article
          className="flex-1 min-w-0 wiki-prose"
          data-testid="wiki-content"
        >
          <Markdown remarkPlugins={[remarkGfm]}>{activePage.content}</Markdown>
        </article>
      </div>
    </div>
  );
}
