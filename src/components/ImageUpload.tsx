import { useState, useCallback, useEffect, useRef } from "react";
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
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Revoke object URL when the component unmounts or the preview URL changes
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
      setProgress(0);

      uploadFile(file);
    },
    [],
  );

  const uploadFile = async (file: File) => {
    // Verify the user is authenticated before uploading.
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      setError("You must be signed in to upload an image.");
      setUploading(false);
      onChange(null);
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split(".").pop() ?? "jpg";
      // Unique, safe path inside the existing `resource-images` bucket.
      // The bucket name is NOT duplicated in the object path.
      const filePath = `${user.id}/${crypto.randomUUID()}.${fileExt.toLowerCase()}`;

      const { error: uploadError } = await supabase.storage
        .from("resource-images")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type,
        });

      if (uploadError) {
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
      setProgress(100);
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
    setProgress(0);
    onChange(null);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (disabled) return;
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleClick = () => {
    if (disabled) return;
    fileInputRef.current?.click();
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
            onClick={handleClick}
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
              ref={fileInputRef}
              type="file"
              accept={accept}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
                // Reset so the same file can be selected again.
                e.target.value = "";
              }}
            />
          </div>
        )}
      </div>
      {uploading && (
        <div className="text-xs text-forest text-center">
          Uploading image… {progress > 0 ? `${progress}%` : ""}
        </div>
      )}
      {error && (
        <div className="p-3 rounded bg-rose-50 text-rose-700 text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}
    </div>
  );
}
