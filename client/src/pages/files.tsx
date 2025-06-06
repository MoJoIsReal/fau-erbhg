import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Gavel, Calendar, Upload, Download, Plus, Edit, FileSpreadsheet, FileIcon, Trash2 } from "lucide-react";
import FileUploadModal from "@/components/file-upload-modal";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Document } from "@shared/schema";

export default function Files() {
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const { isAuthenticated } = useAuth();
  const { language, t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const categories = [
    { 
      id: "protokoll", 
      name: t.documents.categories.protocol, 
      icon: FileText, 
      color: "bg-primary/20 text-primary",
      description: t.documents.categories.protocolDesc
    },
    { 
      id: "vedtekter", 
      name: t.documents.categories.regulations, 
      icon: Gavel, 
      color: "bg-secondary/20 text-secondary",
      description: t.documents.categories.regulationsDesc
    },
    { 
      id: "budsjett", 
      name: t.documents.categories.budget, 
      icon: Calendar, 
      color: "bg-accent/20 text-accent",
      description: t.documents.categories.budgetDesc
    }
  ];

  const { data: allDocuments = [], isLoading, error } = useQuery<Document[]>({
    queryKey: ["/api/documents"]
  });

  const deleteDocumentMutation = useMutation({
    mutationFn: (documentId: number) => 
      apiRequest("DELETE", `/api/secure-documents?id=${documentId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      toast({
        title: language === 'no' ? "Dokument slettet" : "Document deleted",
        description: language === 'no' ? "Dokumentet ble slettet." : "The document was deleted successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: language === 'no' ? "Feil" : "Error",
        description: language === 'no' ? 
          "Kunne ikke slette dokumentet. Prøv igjen." : 
          "Could not delete document. Please try again.",
        variant: "destructive",
      });
    },
  });

  const getFileIcon = (mimeType: string) => {
    if (mimeType?.includes('pdf')) return FileText;
    if (mimeType?.includes('word')) return FileIcon;
    if (mimeType?.includes('sheet') || mimeType?.includes('excel')) return FileSpreadsheet;
    return FileIcon;
  };

  const formatFileSize = (bytes: number | null | undefined) => {
    if (!bytes) return "Ukjent størrelse";
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('no-NO', { 
      day: 'numeric', 
      month: 'long', 
      year: 'numeric' 
    });
  };

  const getDocumentsByCategory = (categoryId: string) => {
    return allDocuments.filter(doc => doc.category === categoryId);
  };

  const recentActivity = allDocuments
    .slice(0, 3)
    .map(doc => ({
      type: "upload",
      user: doc.uploadedBy,
      document: doc.title,
      date: doc.uploadedAt
    }));

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-neutral-200 rounded animate-pulse"></div>
        <div className="grid md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-6 bg-neutral-200 rounded mb-4"></div>
                <div className="space-y-3">
                  <div className="h-4 bg-neutral-200 rounded"></div>
                  <div className="h-4 bg-neutral-200 rounded"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-red-800 font-medium">Failed to load documents</h3>
          <p className="text-red-600 text-sm mt-1">{error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="font-heading font-bold text-3xl text-neutral-900 mb-2">{t.documents.title}</h2>
          <p className="text-neutral-600">{t.documents.subtitle}</p>
        </div>
        {isAuthenticated && (
          <div className="mt-4 md:mt-0">
            <Button 
              onClick={() => setIsUploadModalOpen(true)}
              className="bg-primary hover:bg-primary/90 text-white"
            >
              <Upload className="h-4 w-4 mr-2" />
              {t.documents.upload}
            </Button>
          </div>
        )}
      </div>

      {/* Document Categories */}
      <div className="grid md:grid-cols-3 gap-6">
        {categories.map((category) => {
          const Icon = category.icon;
          const documents = getDocumentsByCategory(category.id);
          
          return (
            <Card key={category.id}>
              <CardContent className="p-6">
                <div className="flex items-center mb-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center mr-4 ${category.color}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="font-heading font-semibold text-lg text-neutral-900">{category.name}</h3>
                </div>
                
                <div className="space-y-3">
                  {documents.length === 0 ? (
                    <p className="text-sm text-neutral-500 italic">{t.documents.noDocuments}</p>
                  ) : (
                    documents.slice(0, 3).map((doc) => {
                      const FileIcon = getFileIcon(doc.mimeType || "");
                      return (
                        <div key={doc.id} className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg hover:bg-neutral-100 transition-colors">
                          <div className="flex items-center flex-1 min-w-0">
                            <FileIcon className="h-4 w-4 text-red-500 mr-3 flex-shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-sm text-neutral-900 truncate">{doc.title}</p>
                              <p className="text-xs text-neutral-600">
                                {formatDate(doc.uploadedAt)} • {language === 'no' ? 'Lastet opp av' : 'Uploaded by'} {doc.uploadedBy}
                              </p>
                              {doc.description && (
                                <p className="text-xs text-neutral-500 mt-1 line-clamp-2">{doc.description}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="text-primary hover:text-primary/90"
                              onClick={() => window.open(`/api/download?id=${doc.id}`, '_blank')}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            {isAuthenticated && (
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="text-red-500 hover:text-red-600 hover:bg-red-50"
                                onClick={() => deleteDocumentMutation.mutate(doc.id)}
                                disabled={deleteDocumentMutation.isPending}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {documents.length > 3 && (
                  <Button 
                    variant="ghost" 
                    className="w-full mt-4 text-primary hover:text-primary/90 text-sm font-medium"
                    onClick={() => setSelectedCategory(category.id)}
                  >
                    {t.documents.seeAll} {category.name.toLowerCase()} →
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Recent Activity */}
      <Card>
        <CardContent className="p-6">
          <h3 className="font-heading font-semibold text-xl text-neutral-900 mb-6">{t.documents.recentActivity}</h3>
          
          {recentActivity.length === 0 ? (
            <p className="text-neutral-500 text-center py-8">{t.documents.noRecentActivity}</p>
          ) : (
            <div className="space-y-4">
              {recentActivity.map((activity, index) => (
                <div key={index} className="flex items-start">
                  <div className="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center mr-4 flex-shrink-0 mt-1">
                    <Upload className="h-3 w-3 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-neutral-900">
                      <span className="font-medium">{activity.user}</span> lastet opp{" "}
                      <span className="font-medium">"{activity.document}"</span>
                    </p>
                    <p className="text-xs text-neutral-600 mt-1">
                      {formatDate(activity.date)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* File Upload Modal */}
      <FileUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
      />

      {/* Category Detail Modal (if needed) */}
      {selectedCategory && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-4xl max-h-[90vh] overflow-hidden">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-heading font-semibold text-xl text-neutral-900">
                  {categories.find(c => c.id === selectedCategory)?.name}
                </h3>
                <Button variant="ghost" onClick={() => setSelectedCategory(null)}>
                  ✕
                </Button>
              </div>
              
              <div className="max-h-96 overflow-y-auto space-y-3">
                {getDocumentsByCategory(selectedCategory).map((doc) => {
                  const FileIcon = getFileIcon(doc.mimeType || "");
                  return (
                    <div key={doc.id} className="flex items-center justify-between p-4 border border-neutral-200 rounded-lg">
                      <div className="flex items-center flex-1">
                        <FileIcon className="h-5 w-5 text-red-500 mr-3" />
                        <div className="flex-1">
                          <p className="font-medium text-neutral-900">{doc.title}</p>
                          <p className="text-sm text-neutral-600">
                            {formatDate(doc.uploadedAt)} • {formatFileSize(doc.fileSize)}
                          </p>
                          <p className="text-sm text-neutral-500">
                            {language === 'no' ? 'Lastet opp av' : 'Uploaded by'} {doc.uploadedBy}
                          </p>
                          {doc.description && (
                            <p className="text-sm text-neutral-500 mt-2 bg-neutral-50 p-2 rounded border-l-2 border-neutral-200">
                              {doc.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => window.open(`/api/download?id=${doc.id}`, '_blank')}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Last ned
                        </Button>
                        {isAuthenticated && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="text-red-500 hover:text-red-600 border-red-200 hover:border-red-300 hover:bg-red-50"
                            onClick={() => deleteDocumentMutation.mutate(doc.id)}
                            disabled={deleteDocumentMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
