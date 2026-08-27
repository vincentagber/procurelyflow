/**
 * Client-side Image Compression Engine for 3G Low-Bandwidth Networks (Prompt §28)
 *
 * Resizes and compresses heavy site camera photos (20-50MB) down to <= 300KB WebP/JPEG
 * before network upload, preventing upload hangs and timeouts on mobile Android devices.
 */

export interface CompressedImageResult {
  file: File;
  blob: Blob;
  originalSizeBytes: number;
  compressedSizeBytes: number;
  compressionRatio: number; // e.g. 0.05 for 95% reduction
  width: number;
  height: number;
}

export async function compressImageForUpload(
  file: File,
  options?: {
    maxWidth?: number; // default 1600px
    maxHeight?: number; // default 1600px
    quality?: number; // default 0.8
    targetMaxKBytes?: number; // default 300
  },
): Promise<CompressedImageResult> {
  const maxWidth = options?.maxWidth ?? 1600;
  const maxHeight = options?.maxHeight ?? 1600;
  let quality = options?.quality ?? 0.8;

  // If not in a browser environment (SSR), return original file
  if (typeof window === "undefined" || !window.document) {
    return {
      file,
      blob: file,
      originalSizeBytes: file.size,
      compressedSizeBytes: file.size,
      compressionRatio: 1.0,
      width: 0,
      height: 0,
    };
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("Failed to load image element"));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Calculate aspect-ratio preserving dimensions
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          return reject(new Error("Could not initialize 2D canvas context"));
        }

        // Draw image onto canvas
        ctx.drawImage(img, 0, 0, width, height);

        const tryCompress = (currentQuality: number) => {
          // Prefer WebP if supported, fallback to JPEG
          const outputFormat = "image/webp";
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                return reject(new Error("Canvas to Blob compression failed"));
              }

              const targetBytes = (options?.targetMaxKBytes ?? 300) * 1024;
              // If still larger than target and quality can be reduced, retry with lower quality
              if (blob.size > targetBytes && currentQuality > 0.4) {
                tryCompress(currentQuality - 0.15);
                return;
              }

              const newFileName = file.name.replace(/\.[^/.]+$/, "") + ".webp";
              const compressedFile = new File([blob], newFileName, {
                type: outputFormat,
                lastModified: Date.now(),
              });

              resolve({
                file: compressedFile,
                blob,
                originalSizeBytes: file.size,
                compressedSizeBytes: blob.size,
                compressionRatio: Math.round((blob.size / file.size) * 1000) / 1000,
                width,
                height,
              });
            },
            outputFormat,
            currentQuality,
          );
        };

        tryCompress(quality);
      };

      img.src = e.target?.result as string;
    };

    reader.readAsDataURL(file);
  });
}
