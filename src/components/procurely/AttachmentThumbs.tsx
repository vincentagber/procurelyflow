import { useEffect, useState } from "react";
import { X, Image as ImageIcon, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export type AttachmentItem = {
  path: string;
  name: string;
};

interface AttachmentThumbsProps {
  attachments: unknown;
  onRemove?: (path: string) => void;
  readOnly?: boolean;
}

export function AttachmentThumbs({
  attachments,
  onRemove,
  readOnly = true,
}: AttachmentThumbsProps) {
  const list = (attachments as AttachmentItem[] | null) ?? [];
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [openUrl, setOpenUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    list.forEach(async (att) => {
      if (!att.path) return;
      if (att.path.startsWith("blob:") || att.path.startsWith("data:")) {
        if (!cancelled) setUrls((prev) => ({ ...prev, [att.path]: att.path }));
        return;
      }
      try {
        const { data } = await supabase.storage
          .from("requisition-attachments")
          .createSignedUrl(att.path, 3600);
        if (!cancelled && data?.signedUrl) {
          setUrls((prev) => ({ ...prev, [att.path]: data.signedUrl }));
        }
      } catch {
        /* ignore signed URL fetch failure */
      }
    });
    return () => {
      cancelled = true;
    };
  }, [list]);

  if (!list.length) return null;

  return (
    <>
      <div className="mt-2 flex flex-wrap gap-2">
        {list.map((att) => {
          const previewUrl = urls[att.path];
          return (
            <div
              key={att.path}
              className="group relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-md border border-border bg-surface shadow-xs transition-colors hover:border-primary/50"
            >
              {previewUrl ? (
                <button
                  type="button"
                  onClick={() => setOpenUrl(previewUrl)}
                  className="h-full w-full focus:outline-hidden"
                  title={att.name}
                >
                  <img src={previewUrl} alt={att.name} className="h-full w-full object-cover" />
                </button>
              ) : (
                <div className="flex flex-col items-center justify-center p-1 text-center text-[10px] text-muted-foreground">
                  <ImageIcon className="h-4 w-4 text-muted-foreground/70" />
                  <span className="mt-0.5 max-w-[50px] truncate">{att.name}</span>
                </div>
              )}

              {!readOnly && onRemove && (
                <button
                  type="button"
                  aria-label="Remove photo"
                  onClick={() => onRemove(att.path)}
                  className="absolute right-1 top-1 rounded-full bg-background/80 p-1 text-foreground backdrop-blur-xs hover:bg-destructive hover:text-destructive-foreground transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {openUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4"
          onClick={() => setOpenUrl(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-lg border border-border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-2 bg-surface">
              <span className="text-xs font-medium">Attachment Preview</span>
              <div className="flex items-center gap-2">
                <a
                  href={openUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  Open original <ExternalLink className="h-3 w-3" />
                </a>
                <button
                  type="button"
                  onClick={() => setOpenUrl(null)}
                  className="rounded-md p-1 hover:bg-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="p-2 flex items-center justify-center max-h-[80vh]">
              <img
                src={openUrl}
                alt="Attachment"
                className="max-h-[75vh] max-w-full rounded-sm object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
