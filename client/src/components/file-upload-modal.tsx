import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
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
import { apiRequest } from "@/lib/queryClient";

const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_UPLOAD_EXTENSIONS = [
  ".pdf", ".jpg", ".jpeg", ".png", ".gif", ".webp",
  ".doc", ".docx", ".xls", ".xlsx", ".txt"
];
const ALLOWED_UPLOAD_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain"
];
const ACCEPTED_UPLOAD_TYPES = ALLOWED_UPLOAD_EXTENSIONS.join(",");

interface FauBoardMember {
  id: number;
  name: string;
  role: string;
  sortOrder: number;
}

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

  // Fetch FAU board members for the dropdown
  const { data: boardMembers = [] } = useQuery<FauBoardMember[]>({
    queryKey: ["/api/secure-settings?resource=board-members"],
  });

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
      const extension = `.${data.file.name.split(".").pop()?.toLowerCase() || ""}`;
      if (!ALLOWED_UPLOAD_EXTENSIONS.includes(extension) || !ALLOWED_UPLOAD_MIME_TYPES.includes(data.file.type)) {
        throw new Error(language === "no" ? "Filtypen er ikke tillatt" : "File type is not allowed");
      }

      if (data.file.size > MAX_UPLOAD_SIZE_BYTES) {
        throw new Error(language === "no" ? "Filen er større enn 10 MB" : "File is larger than 10 MB");
      }

      // 1. Sign — apiRequest handles credentials + CSRF.
      const signResponse = await apiRequest("POST", "/api/upload?action=sign", {
        action: "sign",
        filename: data.file.name,
        mimeType: data.file.type,
        size: data.file.size,
      });
      const signatureData = await signResponse.json();

      // 2. Upload directly to Cloudinary (external host — plain fetch).
      // Send only the parameters that were signed server-side; otherwise
      // Cloudinary's canonical-string check fails with "Invalid Signature".
      const cloudinaryForm = new globalThis.FormData();
      cloudinaryForm.append("file", data.file);
      cloudinaryForm.append("api_key", signatureData.apiKey);
      cloudinaryForm.append("timestamp", String(signatureData.timestamp));
      cloudinaryForm.append("signature", signatureData.signature);
      cloudinaryForm.append("folder", signatureData.folder);
      cloudinaryForm.append("public_id", signatureData.publicId);
      cloudinaryForm.append("allowed_formats", signatureData.allowedFormats);

      const cloudinaryResponse = await fetch(signatureData.uploadUrl, {
        method: "POST",
        body: cloudinaryForm
      });

      if (!cloudinaryResponse.ok) {
        const error = await cloudinaryResponse.text();
        throw new Error(error || "Cloudinary upload failed");
      }

      const uploadResult = await cloudinaryResponse.json();

      // 3. Persist metadata — server validates the cloud_name on the URL.
      const metadataResponse = await apiRequest("POST", "/api/upload", {
        title: data.title,
        category: data.category,
        description: data.description || "",
        uploadedBy: data.uploadedBy,
        filename: data.file.name,
        fileUrl: uploadResult.secure_url,
        publicId: uploadResult.public_id,
        fileSize: uploadResult.bytes || data.file.size,
        mimeType: data.file.type,
      });
      return metadataResponse.json();
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
    if (file) {
      const extension = `.${file.name.split(".").pop()?.toLowerCase() || ""}`;
      if (!ALLOWED_UPLOAD_EXTENSIONS.includes(extension) || !ALLOWED_UPLOAD_MIME_TYPES.includes(file.type)) {
        toast({
          title: t.documents.uploadError,
          description: language === "no" ? "Filtypen er ikke tillatt" : "File type is not allowed",
          variant: "destructive"
        });
        return;
      }

      if (file.size > MAX_UPLOAD_SIZE_BYTES) {
        toast({
          title: t.documents.uploadError,
          description: language === "no" ? "Filen er større enn 10 MB" : "File is larger than 10 MB",
          variant: "destructive"
        });
        return;
      }
    }

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
                          : "border-neutral-300 dark:border-neutral-700 hover:border-primary"
                      }`}
                      onDragEnter={handleDrag}
                      onDragLeave={handleDrag}
                      onDragOver={handleDrag}
                      onDrop={handleDrop}
                    >
                      {selectedFile ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-center space-x-2">
                            <span className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
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
                          <p className="text-xs text-neutral-500 dark:text-neutral-400">
                            {formatFileSize(selectedFile.size)}
                          </p>
                        </div>
                      ) : (
                        <>
                          <CloudUpload className="h-8 w-8 text-neutral-400 dark:text-neutral-500 mx-auto mb-2" />
                          <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-2">
                            {t.documents.dragDropText}
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => document.getElementById("file-input")?.click()}
                          >
                            {t.documents.orClickToSelect}
                          </Button>
                          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-2">
                            {t.documents.maxFileSize}
                          </p>
                        </>
                      )}
                      <input
                        id="file-input"
                        type="file"
                        className="hidden"
                        accept={ACCEPTED_UPLOAD_TYPES}
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
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t.documents.uploadedByPlaceholder} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {boardMembers.map((member) => (
                        <SelectItem key={member.id} value={member.name}>
                          {member.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
