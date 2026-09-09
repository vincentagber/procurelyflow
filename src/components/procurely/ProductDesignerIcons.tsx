import React from "react";

interface IconProps {
  className?: string;
  size?: number;
}

/**
 * PciProtectionEmblemIcon
 * Bespoke Senior Product Designer Emblem for PCI-DSS & Local Currency Protection Guarantee.
 * Features:
 * - Multi-layer isometric / beveled security vault shield
 * - Specular radial lighting highlight
 * - Concentric biometric & NUBAN clearing security circuitry
 * - Dual-accent Nigerian Naira (₦) micro-emboss and hardened padlock shackle
 * - Corner verification diode seal with drop-shadow
 */
export function PciProtectionEmblemIcon({ className = "h-12 w-12", size }: IconProps) {
  return (
    <div
      style={size ? { width: size, height: size } : undefined}
      className={`relative flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#060B28] via-[#0B1457] to-[#14238A] p-2.5 shadow-[0_8px_20px_-4px_rgba(11,20,87,0.35),0_2px_6px_rgba(0,0,0,0.1)] ring-1 ring-white/20 select-none overflow-visible ${className}`}
    >
      {/* Specular Radial Sheen */}
      <div className="absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_25%_20%,rgba(255,255,255,0.22),transparent_60%)] pointer-events-none" />

      {/* SVG Vector Artwork */}
      <svg
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-full relative z-10 drop-shadow-[0_2px_4px_rgba(0,0,0,0.25)]"
      >
        <defs>
          {/* Shield Metallic Gradients */}
          <linearGradient id="shieldBg" x1="6" y1="4" x2="42" y2="44" gradientUnits="userSpaceOnUse">
            <stop stopColor="#1E3A8A" />
            <stop offset="0.45" stopColor="#0F172A" />
            <stop offset="1" stopColor="#0B1457" />
          </linearGradient>

          <linearGradient id="shieldBorder" x1="12" y1="4" x2="36" y2="44" gradientUnits="userSpaceOnUse">
            <stop stopColor="#60A5FA" stopOpacity="0.8" />
            <stop offset="0.5" stopColor="#38BDF8" stopOpacity="0.3" />
            <stop offset="1" stopColor="#10B981" stopOpacity="0.7" />
          </linearGradient>

          <linearGradient id="vaultPlate" x1="14" y1="16" x2="34" y2="38" gradientUnits="userSpaceOnUse">
            <stop stopColor="#F8FAFC" />
            <stop offset="0.5" stopColor="#E2E8F0" />
            <stop offset="1" stopColor="#94A3B8" />
          </linearGradient>

          <linearGradient id="goldAccent" x1="18" y1="14" x2="30" y2="34" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FDE047" />
            <stop offset="0.6" stopColor="#EAB308" />
            <stop offset="1" stopColor="#CA8A04" />
          </linearGradient>

          <linearGradient id="emeraldGlow" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#34D399" />
            <stop offset="1" stopColor="#059669" />
          </linearGradient>

          <filter id="glowFilter" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Outer Shield Bevel Silhouette */}
        <path
          d="M24 3L8 9V21.5C8 31.8 14.8 41.3 24 44C33.2 41.3 40 31.8 40 21.5V9L24 3Z"
          fill="url(#shieldBg)"
          stroke="url(#shieldBorder)"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />

        {/* Inner Faceted Contour Line */}
        <path
          d="M24 6.5L11 11.5V21.5C11 29.8 16.5 37.5 24 40.5C31.5 37.5 37 29.8 37 21.5V11.5L24 6.5Z"
          stroke="white"
          strokeOpacity="0.12"
          strokeWidth="1"
          fill="none"
        />

        {/* Background Concentric Radar Rings */}
        <circle cx="24" cy="23" r="10" stroke="#38BDF8" strokeOpacity="0.18" strokeDasharray="2 2" strokeWidth="1" />
        <circle cx="24" cy="23" r="6.5" stroke="#38BDF8" strokeOpacity="0.25" strokeWidth="0.8" />

        {/* Padlock Shackle */}
        <path
          d="M19 20V15C19 12.2386 21.2386 10 24 10C26.7614 10 29 12.2386 29 15V20"
          stroke="url(#goldAccent)"
          strokeWidth="2.4"
          strokeLinecap="round"
        />

        {/* Hardened Vault Body */}
        <rect
          x="16"
          y="19"
          width="16"
          height="14"
          rx="3"
          fill="url(#vaultPlate)"
          stroke="#0F172A"
          strokeWidth="1.2"
        />

        {/* Central Precision Keyhole & Currency Glyph */}
        <path
          d="M24 23.2C22.785 23.2 21.8 24.185 21.8 25.4C21.8 26.26 22.3 26.99 23.05 27.33L22.5 30H25.5L24.95 27.33C25.7 26.99 26.2 26.26 26.2 25.4C26.2 24.185 25.215 23.2 24 23.2Z"
          fill="#0B1457"
        />

        {/* Naira Double Crossbar Micro-engraving */}
        <line x1="22" y1="24.8" x2="26" y2="24.8" stroke="#38BDF8" strokeWidth="0.8" strokeLinecap="round" />
        <line x1="22" y1="26" x2="26" y2="26" stroke="#38BDF8" strokeWidth="0.8" strokeLinecap="round" />

        {/* Bottom Security Accent Line */}
        <path
          d="M16 38.5C18.4 39.7 21.1 40.5 24 40.8C26.9 40.5 29.6 39.7 32 38.5"
          stroke="url(#emeraldGlow)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>

      {/* Floating Verification Diode Badge */}
      <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-[0_2px_8px_rgba(16,185,129,0.5)] ring-2 ring-white">
        <svg viewBox="0 0 12 12" fill="none" className="h-3 w-3">
          <path
            d="M2.5 6.2L4.5 8.2L9.5 3.2"
            stroke="white"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}

/**
 * ForensicGovernanceEmblemIcon
 * Bespoke Senior Product Designer Emblem for Governance & Forensic Audit Module (§FR-4.5, §FR-8.5).
 * Features:
 * - Geometric obsidian / emerald surveillance crest
 * - Concentric forensic crosshairs and radar sweep
 * - Balanced scales of justice & algorithmic anti-structuring detection shield
 * - Specular optical flare
 * - Status-responsive telemetry beacon (pulsing emerald when compliant, warning amber when flagged)
 */
export function ForensicGovernanceEmblemIcon({
  className = "h-11 w-11",
  size,
  hasAnomalies = false,
}: IconProps & { hasAnomalies?: boolean }) {
  return (
    <div
      style={size ? { width: size, height: size } : undefined}
      className={`relative flex shrink-0 items-center justify-center rounded-2xl p-2.5 shadow-[0_8px_20px_-4px_rgba(4,47,46,0.3),0_2px_6px_rgba(0,0,0,0.08)] ring-1 ring-slate-900/10 select-none overflow-visible transition-colors ${
        hasAnomalies
          ? "bg-gradient-to-br from-[#1C0A00] via-[#451A03] to-[#78350F] ring-amber-500/30"
          : "bg-gradient-to-br from-[#021F1B] via-[#063B34] to-[#0D544A] ring-emerald-400/20"
      } ${className}`}
    >
      {/* Specular Radial Sheen */}
      <div className="absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_25%_20%,rgba(255,255,255,0.2),transparent_60%)] pointer-events-none" />

      {/* SVG Vector Artwork */}
      <svg
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-full relative z-10 drop-shadow-[0_2px_4px_rgba(0,0,0,0.25)]"
      >
        <defs>
          <linearGradient id="forensicShield" x1="8" y1="4" x2="40" y2="44" gradientUnits="userSpaceOnUse">
            <stop stopColor={hasAnomalies ? "#9A3412" : "#047857"} />
            <stop offset="0.5" stopColor={hasAnomalies ? "#451A03" : "#022C22"} />
            <stop offset="1" stopColor="#0B132B" />
          </linearGradient>

          <linearGradient id="forensicBorder" x1="12" y1="4" x2="36" y2="44" gradientUnits="userSpaceOnUse">
            <stop stopColor={hasAnomalies ? "#FDBA74" : "#6EE7B7"} stopOpacity="0.8" />
            <stop offset="0.5" stopColor={hasAnomalies ? "#F59E0B" : "#10B981"} stopOpacity="0.4" />
            <stop offset="1" stopColor={hasAnomalies ? "#EA580C" : "#059669"} stopOpacity="0.7" />
          </linearGradient>

          <linearGradient id="scalesBeam" x1="16" y1="14" x2="32" y2="14" gradientUnits="userSpaceOnUse">
            <stop stopColor="#F8FAFC" />
            <stop offset="0.5" stopColor="#E2E8F0" />
            <stop offset="1" stopColor="#94A3B8" />
          </linearGradient>
        </defs>

        {/* Outer Heraldic Shield */}
        <path
          d="M24 3L7 9.5V22C7 32.5 14.3 41.8 24 44.5C33.7 41.8 41 32.5 41 22V9.5L24 3Z"
          fill="url(#forensicShield)"
          stroke="url(#forensicBorder)"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />

        {/* Optical Scanning Reticle Crosshairs */}
        <circle cx="24" cy="22" r="12" stroke={hasAnomalies ? "#F59E0B" : "#34D399"} strokeOpacity="0.18" strokeWidth="1" strokeDasharray="3 3" />
        <circle cx="24" cy="22" r="7" stroke={hasAnomalies ? "#F59E0B" : "#34D399"} strokeOpacity="0.25" strokeWidth="0.9" />
        <line x1="24" y1="8" x2="24" y2="13" stroke={hasAnomalies ? "#F59E0B" : "#34D399"} strokeOpacity="0.5" strokeWidth="1" strokeLinecap="round" />
        <line x1="24" y1="31" x2="24" y2="36" stroke={hasAnomalies ? "#F59E0B" : "#34D399"} strokeOpacity="0.5" strokeWidth="1" strokeLinecap="round" />
        <line x1="10" y1="22" x2="15" y2="22" stroke={hasAnomalies ? "#F59E0B" : "#34D399"} strokeOpacity="0.5" strokeWidth="1" strokeLinecap="round" />
        <line x1="33" y1="22" x2="38" y2="22" stroke={hasAnomalies ? "#F59E0B" : "#34D399"} strokeOpacity="0.5" strokeWidth="1" strokeLinecap="round" />

        {/* Balanced Scales of Justice / Governance Pillar */}
        {/* Central Upright Post */}
        <line x1="24" y1="13" x2="24" y2="31" stroke="url(#scalesBeam)" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="24" cy="13" r="1.8" fill="#F8FAFC" />

        {/* Horizontal Balance Beam */}
        <line x1="15" y1="16.5" x2="33" y2="16.5" stroke="url(#scalesBeam)" strokeWidth="1.6" strokeLinecap="round" />

        {/* Left Scale Pan */}
        <path d="M15 16.5L12 23M15 16.5L18 23" stroke="white" strokeOpacity="0.5" strokeWidth="0.8" />
        <path d="M11 23C11 25.2 12.8 27 15 27C17.2 27 19 25.2 19 23H11Z" fill="#38BDF8" fillOpacity="0.3" stroke="#F8FAFC" strokeWidth="1" />

        {/* Right Scale Pan */}
        <path d="M33 16.5L30 23M33 16.5L36 23" stroke="white" strokeOpacity="0.5" strokeWidth="0.8" />
        <path d="M29 23C29 25.2 30.8 27 33 27C35.2 27 37 25.2 37 23H29Z" fill="#38BDF8" fillOpacity="0.3" stroke="#F8FAFC" strokeWidth="1" />

        {/* Pedestal Base */}
        <path d="M19 31H29" stroke="url(#scalesBeam)" strokeWidth="2" strokeLinecap="round" />

        {/* Surveillance Radar Wave Arc */}
        <path
          d="M17 38C19.2 39.2 21.5 39.8 24 40C26.5 39.8 28.8 39.2 31 38"
          stroke={hasAnomalies ? "#F97316" : "#10B981"}
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>

      {/* Floating Status Indicator Diode */}
      <div
        className={`absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-white shadow-xs ${
          hasAnomalies
            ? "bg-gradient-to-br from-rose-500 to-amber-600 shadow-rose-500/40"
            : "bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-emerald-500/40"
        }`}
      >
        {hasAnomalies ? (
          <span className="h-2 w-2 rounded-full bg-white animate-ping" />
        ) : (
          <svg viewBox="0 0 12 12" fill="none" className="h-3 w-3">
            <path
              d="M2.5 6.2L4.5 8.2L9.5 3.2"
              stroke="white"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
    </div>
  );
}

/**
 * GovernanceVerifiedBadgeIcon
 * Bespoke Senior Product Designer Emblem for Corporate Governance Integrity Verified status.
 * Features:
 * - Jewel-cut emerald circular crest
 * - Laurel wreaths of statutory compliance
 * - Specular optical highlights
 * - Central bold tick mark
 */
export function GovernanceVerifiedBadgeIcon({ className = "h-11 w-11", size }: IconProps) {
  return (
    <div
      style={size ? { width: size, height: size } : undefined}
      className={`relative flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#064E3B] via-[#047857] to-[#10B981] p-2 shadow-[0_8px_20px_-4px_rgba(16,185,129,0.4),0_2px_6px_rgba(0,0,0,0.06)] ring-1 ring-emerald-300/40 select-none overflow-hidden ${className}`}
    >
      {/* Specular Radial Sheen */}
      <div className="absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_25%_20%,rgba(255,255,255,0.3),transparent_60%)] pointer-events-none" />

      <svg viewBox="0 0 40 40" fill="none" className="h-full w-full relative z-10 drop-shadow-[0_1px_2px_rgba(0,0,0,0.2)]">
        {/* Outer Circular Laurel / Shield Ring */}
        <circle cx="20" cy="20" r="16.5" stroke="white" strokeOpacity="0.25" strokeWidth="1" strokeDasharray="3 2" />

        {/* Inner Jewel-cut Hexagon Ring */}
        <path
          d="M20 5L32 12V28L20 35L8 28V12L20 5Z"
          stroke="white"
          strokeOpacity="0.35"
          strokeWidth="1.2"
          fill="white"
          fillOpacity="0.08"
        />

        {/* Central Crisp Shield with Verification Checkmark */}
        <path
          d="M20 9L29 13.5V21C29 26.5 25.2 31.5 20 33C14.8 31.5 11 26.5 11 21V13.5L20 9Z"
          fill="#064E3B"
          stroke="white"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />

        {/* Checkmark */}
        <path
          d="M16 20.5L18.8 23.5L24.5 16.5"
          stroke="#34D399"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
