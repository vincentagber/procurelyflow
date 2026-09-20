import React from "react";
import { cn } from "@/lib/utils";

export interface UserAvatarProps {
  name?: string | null | undefined;
  email?: string | null | undefined;
  avatarUrl?: string | null | undefined;
  className?: string | undefined;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | undefined;
}

const sizeClasses = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
  xl: "h-16 w-16 text-xl",
};

export function UserAvatar({ name, email, avatarUrl, className, size = "sm" }: UserAvatarProps) {
  const [imageError, setImageError] = React.useState(false);

  // Reset error if URL changes
  React.useEffect(() => {
    setImageError(false);
  }, [avatarUrl]);

  const initials = React.useMemo(() => {
    if (name && name.trim()) {
      const parts = name.trim().split(/\s+/);
      const first = parts[0];
      const second = parts[1];
      if (first && second && first[0] && second[0]) {
        return (first[0] + second[0]).toUpperCase();
      }
      return name.trim().slice(0, 2).toUpperCase();
    }
    if (email) {
      return email.slice(0, 2).toUpperCase();
    }
    return "U";
  }, [name, email]);

  if (avatarUrl && !imageError) {
    return (
      <div
        className={cn(
          "relative shrink-0 overflow-hidden rounded-full border border-slate-200/80 bg-slate-100 shadow-2xs",
          sizeClasses[size],
          className,
        )}
      >
        <img
          src={avatarUrl}
          alt={name || email || "User Avatar"}
          className="h-full w-full object-cover"
          onError={() => setImageError(true)}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-[#0001FF] font-semibold text-white uppercase shadow-2xs select-none",
        sizeClasses[size],
        className,
      )}
      title={name || email || "User"}
    >
      {initials}
    </div>
  );
}
