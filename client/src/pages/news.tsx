import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar, Loader2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";

interface BlogPost {
  id: number;
  title: string;
  content: string;
  publishedDate: string;
  author?: string;
}

export default function News() {
  const { language } = useLanguage();

  // Fetch all published blog posts
  const { data: blogPosts = [], isLoading } = useQuery<BlogPost[]>({
    queryKey: ["/api/secure-settings?resource=blog-posts"],
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-neutral-800">
          {language === "no" ? "Nyheter" : "News"}
        </h1>
        <p className="text-neutral-600 mt-2">
          {language === "no"
            ? "Siste nyheter og informasjon fra FAU Erdal Barnehage"
            : "Latest news and information from FAU Erdal Kindergarten"}
        </p>
      </div>

      {blogPosts.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Calendar className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-neutral-900 mb-2">
              {language === "no" ? "Ingen nyheter ennå" : "No news yet"}
            </h3>
            <p className="text-neutral-600">
              {language === "no"
                ? "Sjekk tilbake senere for oppdateringer og informasjon."
                : "Check back later for updates and information."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {blogPosts.map((post) => (
            <Card key={post.id}>
              <CardContent className="p-6">
                <h2 className="text-2xl font-semibold text-neutral-900 mb-3">
                  {post.title}
                </h2>
                <div className="flex items-center text-sm text-neutral-500 mb-4">
                  <Calendar className="h-4 w-4 mr-2" />
                  <time dateTime={post.publishedDate}>
                    {new Date(post.publishedDate).toLocaleDateString("no-NO", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </time>
                  {post.author && (
                    <span className="ml-2">
                      • {language === "no" ? "av" : "by"} {post.author}
                    </span>
                  )}
                </div>
                <div className="prose prose-neutral max-w-none text-neutral-700">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeSanitize]}
                    components={{
                      a: ({ node, ...props }) => (
                        <a
                          {...props}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 underline"
                        />
                      ),
                    }}
                  >
                    {post.content}
                  </ReactMarkdown>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
