# Procurely Flow

An enterprise-grade procurement management and approval orchestration platform built for high-throughput procurement operations.

## Features

- **Multi-Tenant Procurement Workflows**: Requisition submission, multi-tier budget approvals, purchase order generation, and delivery verification.
- **Cryptographic Audit Ledger**: Tamper-evident hash-chained audit logging for regulatory compliance and audit trails.
- **Automated Communication**: Notification dispatchers for email, SMS, and WhatsApp alerts.
- **Multi-Gateway Payment Integration**: Direct settlement tracking with Monnify, Paystack, and manual bank transfer verification workflows.
- **Role-Based Access Control (RBAC)**: Fine-grained permissions across Requestors, Approvers, Procurement Officers, and Finance Managers.

## Tech Stack

- **Framework**: TanStack Start + React 19 + TypeScript
- **Styling**: Tailwind CSS v4 + Radix UI + Lucide Icons
- **Backend & Auth**: Supabase (PostgreSQL, Realtime, Row Level Security)
- **Deployment**: Render / Node.js Server

## Development

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Run test suite
npm test

# Build for production
npm run build

# Start production server
npm start
```
