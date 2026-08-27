# Pilot-ready mobile field flow

## Goal
Make Procurely Flow usable on a phone on a construction site so that pilot customers can raise, approve and track procurement requests without a laptop. A smoother mobile experience is the fastest way to get field teams and site managers to adopt the tool during sales-led pilots.

## What we will build

### 1. Mobile-first requisition creation
- Refactor `/requisitions/new` so it works well on a 390 px phone screen: larger touch targets, stacked layouts, and a sticky "Add item" button.
- Add a photo-attachment field to requisition items so site staff can photograph what they need instead of typing long descriptions.
- Surface the selected project and estimated total prominently; warn when the request would exceed the project's remaining budget.

### 2. One-tap approvals on mobile
- Redesign `/approvals` as a card-based queue for small screens, with swipe-friendly approve/reject actions and a required comment for rejections.
- Add push-style browser/email notifications so approvers know when something is waiting on them.
- Add a "Pending approvals" widget to the mobile dashboard that jumps straight to the next decision.

### 3. Project budget visibility
- Show committed vs remaining budget on the project list and on each requisition form.
- Block or warn when a new requisition would push a project over budget, based on already-approved requisitions and issued POs.
- Add a simple project detail view with a spend summary.

### 4. Sales-ready pilot polish
- Add email notifications for key events: submitted for approval, approved/rejected, quote received, PO issued, PO acknowledged.
- Add PDF export for purchase orders and requisitions so they can be shared offline with finance or site managers.
- Improve the onboarding empty state so the first user sees a clear checklist (invite team, add suppliers, create a project, raise a request).

## Technical approach
- Keep the existing TanStack Start + Lovable Cloud stack; no new backend needed.
- Use the existing `notifications` table and add a server function that sends email via Lovable Email for the events above.
- Store requisition item photos in a new `requisition-attachments` storage bucket with RLS scoped to the organization.
- Use Tailwind responsive utilities and shadcn Sheet/Drawer for mobile filters and forms.
- Reuse the existing approval-rule and audit-log engine; only the UI layer changes.

## Out of scope for this phase
- Offline/PWA support (can be added once mobile UX is proven).
- Native mobile apps or app-store distribution.
- Automated supplier payments or accounting integrations.
- Public pricing page or Stripe self-serve billing.

## Success criteria
- A user can raise a requisition with a photo on a phone in under 90 seconds.
- An approver can approve or reject from their phone without horizontal scrolling.
- Pilot admins can see project budget status before approving spend.
- Key lifecycle events trigger an email within a few minutes.
