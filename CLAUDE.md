# CLAUDE.md

This file provides guidance to AI coding assistants when working with code in this repository.

## Repository Overview

This repository contains the digital infrastructure for **Ortex Industries** (manufacturer of customized MDF/acrylic items, lanyards, corporate gifts, OEM/white-label production). It is split into three main applications:

1. **`Ortex.Web`**: The marketing/lead-gen single-page app (React + Vite + Tailwind CSS v4). Focuses on brand showcases, product catalog, and lead capture.
2. **`Ortex.Admin`**: The business admin dashboard (React + Vite + Tailwind CSS). Used for managing quotations, invoices, payments, and customers.
3. **`Ortex.Tally.Connector`**: Connector integrations for Tally ERP systems.

---

## Ortex.Web (Marketing Site)

### Commands
```bash
# From C:\Dev\Ortex\Ortex.Web
npm run dev       # Start Vite dev server with HMR
npm run build     # Compile production build to dist/
npm run preview   # Serve build output locally
npm run lint      # Run oxlint
```

### Architecture
* **Stack**: React 19 + Vite 8, Tailwind CSS v4, Router v7, Framer Motion.
* **Routing**: Defined in `src/App.jsx`. Top-level views are located in `src/pages/`.
* **State**: No server backend; form captures (e.g. Contact, Quote wizard) save locally to `localStorage` (`ortex_submissions`, `ortex_quotes`).
* **SEO**: Every page uses `useDocumentMetadata` at the top to set title tags and meta descriptions.

---

## Ortex.Admin (Admin Panel)

### Commands
```bash
# From C:\Dev\Ortex\Ortex.Admin
npm run dev       # Start Vite dev server with HMR
npm run build     # Compile production build to dist/
npm run preview   # Serve build output locally
npm run lint      # Run oxlint
```

### Architecture
* **Stack**: React, Vite, Tailwind CSS, Lucide icons, Sonner toasts.
* **Database & Auth**: Supabase integration. Remote calls map to `apiStore` when env vars are present; local demo mode is disabled, enforcing secure Supabase Auth.
* **Key Features**:
  * **Full-Page Editors**: Quotation and Invoice creators use clean full-page dashboards rather than modal views, layout utilizes a 2/3 (Details & Line Items) and 1/3 (Settings & Notes) split, with the Line Items input grid occupying a full-width section.
  * **Spacious Line Items Editor**: The `LineItemsEditor` uses a strict `table-fixed` layout with a `min-w-[1024px]` viewport, aligning the headers and input cells precisely using matched width tailwind classes (`w-24`, `w-20`, etc.).
  * **A4 Print Engine**: Integrated Print (`window.print()`) and PDF Download (`html2pdf.js`) flows. Documents are styled to fit standard A4 borders (`210mm x 297mm`) with computer-generated notes locked to the absolute bottom via CSS flex columns (`mt-auto`).
  * **Tally XML Import**: Invoices and Quotations modules support direct Tally XML file parsing and automated line item ingestion.

---

## Reference Docs
The `docs/` directory contains structured guidance:
* `docs/Architecture/ARCHITECTURE.md` — Narratives, directories, data flows, and design systems.
* `docs/PM/PRODUCT_BACKLOG.md` — Feature backlogs and release progress.
* `docs/guides/GETTING_STARTED.md` — Local setup instructions.
