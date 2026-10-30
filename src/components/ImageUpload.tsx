import { useState, useCallback, useEffect } from "react";
import { Upload, Trash2, AlertCircle } from "lucide-react";
import { supabase } from "../lib/supabase";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_SIZE = 5 * 1024 * 1024;

interface ImageUploadProps {
  value?: string | null;
  onChange: (url: string | null) => void;
  disabled?: boolean;
  accept?: string;
  label?: string;
}

export function ImageUpload({
  value,
  onChange,
  disabled = false,
  accept = "image/jpeg,image/png,image/webp,image/gif",
  label = "Upload image",
}: ImageUploadProps) {
  const [preview, setPreview] = useState<string | null>(value ?? null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Revoke object URL when preview changes
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFileSelect = useCallback(
    (file: File) => {
      setError("");
      if (!ALLOWED_TYPES.includes(file.type)) {
        setError("Only JPEG, PNG, WebP, and GIF images are allowed.");
        return;
      }
      if (file.size > MAX_SIZE) {
        setError("Image file size must be under 5MB.");
        return;
      }

      const objectUrl = URL.createObjectURL(file);
      setPreview(objectUrl);
      setPreviewUrl(objectUrl);

      uploadFile(file);
    },
    [],
  );

  const uploadFile = async (file: File) => {
    setUploading(true);
    try {
      const fileExt = file.name.split(".").pop() ?? "jpg";
      const fileName = `${crypto.randomUUID()}.${fileExt}`;
      const filePath = `resource-images/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("resource-images")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type,
        });

      if (uploadError) {
        // Provide actionable guidance for common Storage errors
        if (uploadError.message.includes("bucket") || uploadError.status === 404) {
          throw new Error(
            "Image storage bucket is not configured. Please contact an administrator to set up the 'resource-images' Storage bucket with public read access.",
          );
        }
        if (uploadError.status === 403 || /unauthorized/i.test(uploadError.message || "")) {
          throw new Error(
            "You do not have permission to upload images. Please sign in and try again.",
          );
        }
        throw uploadError;
      }

      const { data: urlData } = supabase.storage
        .from("resource-images")
        .getPublicUrl(filePath);

      const publicUrl = urlData.publicUrl;
      setPreview(publicUrl);
      setPreviewUrl(publicUrl);
      onChange(publicUrl);
    } catch (err: any) {
      setError(err.message || "Image upload failed");
      onChange(null);
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = () => {
    setPreview(null);
    setPreviewUrl(null);
    onChange(null);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        {preview ? (
          <>
            <img
              src={preview}
              alt="Preview"
              className="w-full h-48 object-cover rounded-lg border border-border"
            />
            <button
              onClick={handleRemove}
              className="absolute top-2 right-2 rounded-full bg-rose-500 text-white p-1.5 hover:bg-rose-600 transition-colors"
              aria-label="Remove image"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </>
        ) : (
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className={`w-full h-48 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors ${
              disabled ? "opacity-50 cursor-not-allowed" : "hover:border-forest hover:bg-forest/5"
            }`}
          >
            <Upload className="h-6 w-6 text-muted" />
            <p className="text-sm text-muted">{label}</p>
            <p className="text-xs text-muted">JPEG, PNG, WebP, GIF (max 5MB)</p>
            <input
              type="file"
              accept={accept}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
              }}
            />
          </div>
        )}
      </div>
      {error && (
        <div className="p-3 rounded bg-rose-50 text-rose-700 text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}
      {uploading && (
        <div className="text-xs text-forest text-center">
          Uploading image…
        </div>
      )}
    </div>
  );
}
