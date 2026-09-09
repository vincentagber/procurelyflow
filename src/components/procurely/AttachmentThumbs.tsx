import { useEffect, useState } from "react";
import {
  X,
  Image as ImageIcon,
  FileText,
  FileSpreadsheet,
  FileArchive,
  File,
  ExternalLink,
  Download,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export type AttachmentItem = {
  path: string;
  name: string;
};

interface AttachmentThumbsProps {
  attachments: unknown;
  onRemove?: (path: string) => void;
  readOnly?: boolean;
  bucket?: string;
}

function getFileInfo(filename: string) {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  const isImage = ["jpg", "jpeg", "png", "webp", "gif", "svg", "bmp", "avif"].includes(ext);
  const isPdf = ext === "pdf";
  const isSheet = ["xls", "xlsx", "csv"].includes(ext);
  const isDoc = ["doc", "docx", "rtf", "odt", "txt"].includes(ext);
  const isArchive = ["zip", "rar", "7z", "tar", "gz"].includes(ext);

  let badgeColor = "bg-slate-100 text-slate-700 border-slate-200";
  let label = ext.toUpperCase() || "FILE";

  if (isPdf) {
    badgeColor = "bg-rose-50 text-rose-700 border-rose-200";
    label = "PDF";
  } else if (isSheet) {
    badgeColor = "bg-emerald-50 text-emerald-700 border-emerald-200";
    label = ext === "csv" ? "CSV" : "EXCEL";
  } else if (isDoc) {
    badgeColor = "bg-blue-50 text-blue-700 border-blue-200";
    label = "WORD";
  } else if (isArchive) {
    badgeColor = "bg-purple-50 text-purple-700 border-purple-200";
    label = "ZIP";
  }

  return { ext, isImage, isPdf, isSheet, isDoc, isArchive, badgeColor, label };
}

export function AttachmentThumbs({
  attachments,
  onRemove,
  readOnly = true,
  bucket = "requisition-attachments",
}: AttachmentThumbsProps) {
  const list = (attachments as AttachmentItem[] | null) ?? [];
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [openImageUrl, setOpenImageUrl] = useState<{ url: string; name: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    list.forEach(async (att) => {
      if (!att.path) return;
      if (att.path.startsWith("blob:") || att.path.startsWith("data:") || att.path.startsWith("http")) {
        if (!cancelled) setUrls((prev) => ({ ...prev, [att.path]: att.path }));
        return;
      }
      try {
        const { data } = await supabase.storage
          .from(bucket)
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
  }, [list, bucket]);

  if (!list.length) return null;

  return (
    <>
      <div className="mt-2 flex flex-wrap gap-2.5">
        {list.map((att) => {
          const fileInfo = getFileInfo(att.name);
          const fileUrl = urls[att.path];

          // 1. Image Thumbnail
          if (fileInfo.isImage) {
            return (
              <div
                key={att.path}
                className="group relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xs transition-all hover:border-[#0B1457]/40"
              >
                {fileUrl ? (
                  <button
                    type="button"
                    onClick={() => setOpenImageUrl({ url: fileUrl, name: att.name })}
                    className="h-full w-full focus:outline-hidden cursor-pointer"
                    title={att.name}
                  >
                    <img
                      src={fileUrl}
                      alt={att.name}
                      className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                    />
                  </button>
                ) : (
                  <div className="flex flex-col items-center justify-center p-1 text-center text-[10px] text-slate-400">
                    <ImageIcon className="h-4 w-4 text-slate-400" />
                    <span className="mt-0.5 max-w-[50px] truncate">{att.name}</span>
                  </div>
                )}

                {!readOnly && onRemove && (
                  <button
                    type="button"
                    aria-label="Remove attachment"
                    onClick={() => onRemove(att.path)}
                    className="absolute right-1 top-1 rounded-full bg-slate-900/80 p-1 text-white shadow-xs backdrop-blur-xs hover:bg-rose-600 transition-colors cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          }

          // 2. Document Card (PDF, Excel, Word, ZIP, etc.)
          return (
            <div
              key={att.path}
              className="group relative flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-2xs transition-all hover:border-[#0B1457]/40 hover:bg-slate-50/70"
            >
              <div className="flex shrink-0 items-center justify-center">
                {fileInfo.isPdf ? (
                  <FileText className="h-5 w-5 text-rose-600" />
                ) : fileInfo.isSheet ? (
                  <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                ) : fileInfo.isDoc ? (
                  <FileText className="h-5 w-5 text-blue-600" />
                ) : fileInfo.isArchive ? (
                  <FileArchive className="h-5 w-5 text-purple-600" />
                ) : (
                  <File className="h-5 w-5 text-slate-600" />
                )}
              </div>

              <div className="min-w-0 max-w-[150px] sm:max-w-[200px]">
                {fileUrl ? (
                  <a
                    href={fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    download={att.name}
                    className="flex items-center gap-1 font-medium text-slate-800 hover:text-[#0001FF] truncate transition-colors"
                    title={att.name}
                  >
                    <span className="truncate">{att.name}</span>
                    <ExternalLink className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </a>
                ) : (
                  <span className="font-medium text-slate-800 truncate block" title={att.name}>
                    {att.name}
                  </span>
                )}
                <span
                  className={`mt-0.5 inline-block rounded px-1.5 py-0.2 text-[9px] font-semibold tracking-wider uppercase border ${fileInfo.badgeColor}`}
                >
                  {fileInfo.label}
                </span>
              </div>

              {!readOnly && onRemove && (
                <button
                  type="button"
                  aria-label="Remove attachment"
                  onClick={() => onRemove(att.path)}
                  className="ml-1 rounded-full p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Image Full-screen Preview Modal */}
      {openImageUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4 animate-in fade-in duration-150"
          onClick={() => setOpenImageUrl(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 bg-slate-50">
              <span className="text-xs font-semibold text-slate-800 truncate max-w-[300px]">
                {openImageUrl.name}
              </span>
              <div className="flex items-center gap-3">
                <a
                  href={openImageUrl.url}
                  target="_blank"
                  rel="noreferrer"
                  download={openImageUrl.name}
                  className="text-xs font-medium text-slate-600 hover:text-[#0001FF] flex items-center gap-1.5 transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download</span>
                </a>
                <button
                  type="button"
                  onClick={() => setOpenImageUrl(null)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 transition-colors cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="p-3 flex items-center justify-center max-h-[80vh] bg-slate-950/5">
              <img
                src={openImageUrl.url}
                alt={openImageUrl.name}
                className="max-h-[75vh] max-w-full rounded-lg object-contain shadow-xs"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
