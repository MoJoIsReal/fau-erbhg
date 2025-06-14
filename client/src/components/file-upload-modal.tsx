import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { CloudUpload, X } from "lucide-react";
import { z } from "zod";
import { useLanguage } from "@/contexts/LanguageContext";

interface FormData {
  title: string;
  category: string;
  description?: string;
  uploadedBy: string;
  file: File;
}

interface FileUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function FileUploadModal({ isOpen, onClose }: FileUploadModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const { language, t } = useLanguage();

  // Create form schema with translations
  const formSchema = z.object({
    title: z.string().min(1, t.common.required),
    category: z.string().min(1, t.common.required),
    description: z.string().optional(),
    uploadedBy: z.string().min(1, t.common.required),
    file: z.instanceof(File, { message: t.common.required })
  });
  
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      category: "",
      description: "",
      uploadedBy: ""
    }
  });

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        throw new Error('No authentication token found');
      }

      // Convert file to base64
      const fileBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(data.file);
      });

      const payload = {
        title: data.title,
        category: data.category,
        description: data.description || "",
        uploadedBy: data.uploadedBy,
        filename: data.file.name,
        fileData: fileBase64
      };

      // Use upload endpoint specifically
      const apiUrl = import.meta.env.DEV 
        ? "http://localhost:5000/api/upload" 
        : "/api/upload";
        
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || "Upload failed");
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: t.documents.uploadSuccess,
        description: t.documents.uploadSuccessDesc,
      });
      form.reset();
      setSelectedFile(null);
      onClose();
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
    },
    onError: (error: any) => {
      toast({
        title: t.documents.uploadError,
        description: error.message || t.documents.uploadErrorDesc,
        variant: "destructive"
      });
    }
  });

  const handleFileChange = (file: File | null) => {
    setSelectedFile(file);
    if (file) {
      form.setValue("file", file);
      // Auto-fill title if empty
      if (!form.getValues("title")) {
        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
        form.setValue("title", nameWithoutExt);
      }
    } else {
      form.setValue("file", undefined as any);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const files = e.dataTransfer.files;
    if (files && files[0]) {
      handleFileChange(files[0]);
    }
  };

  const onSubmit = (data: FormData) => {
    mutation.mutate(data);
  };

  const handleClose = () => {
    form.reset();
    setSelectedFile(null);
    onClose();
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t.documents.uploadDocument}</DialogTitle>
          <DialogDescription>
            {t.documents.uploadDescription}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.documents.documentType} *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t.documents.selectType} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="protokoll">{t.documents.categories.protocol}</SelectItem>
                      <SelectItem value="vedtekter">{t.documents.categories.regulations}</SelectItem>
                      <SelectItem value="budsjett">{t.documents.categories.budget}</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.documents.fileName} *</FormLabel>
                  <FormControl>
                    <Input placeholder={t.documents.fileNamePlaceholder} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="file"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.common.file} *</FormLabel>
                  <FormControl>
                    <div
                      className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
                        dragActive 
                          ? "border-primary bg-primary/5" 
                          : "border-neutral-300 hover:border-primary"
                      }`}
                      onDragEnter={handleDrag}
                      onDragLeave={handleDrag}
                      onDragOver={handleDrag}
                      onDrop={handleDrop}
                    >
                      {selectedFile ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-center space-x-2">
                            <span className="text-sm font-medium text-neutral-900">
                              {selectedFile.name}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleFileChange(null)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                          <p className="text-xs text-neutral-500">
                            {formatFileSize(selectedFile.size)}
                          </p>
                        </div>
                      ) : (
                        <>
                          <CloudUpload className="h-8 w-8 text-neutral-400 mx-auto mb-2" />
                          <p className="text-sm text-neutral-600 mb-2">
                            {t.documents.dragDropText}
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => document.getElementById("file-input")?.click()}
                          >
                            {t.documents.orClickToSelect}
                          </Button>
                          <p className="text-xs text-neutral-500 mt-2">
                            {t.documents.maxFileSize}
                          </p>
                        </>
                      )}
                      <input
                        id="file-input"
                        type="file"
                        className="hidden"
                        accept=".pdf,.doc,.docx,.xls,.xlsx"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          handleFileChange(file || null);
                        }}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="uploadedBy"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.documents.uploadedByLabel} *</FormLabel>
                  <FormControl>
                    <Input placeholder={t.documents.uploadedByPlaceholder} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.documents.description}</FormLabel>
                  <FormControl>
                    <Textarea 
                      rows={2} 
                      placeholder={t.documents.descriptionPlaceholder}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex space-x-3 pt-4">
              <Button type="button" variant="outline" onClick={handleClose} className="flex-1">
                {t.common.cancel}
              </Button>
              <Button 
                type="submit" 
                className="flex-1 bg-primary hover:bg-primary/90"
                disabled={mutation.isPending}
              >
                {mutation.isPending ? t.common.uploading : t.common.upload}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
