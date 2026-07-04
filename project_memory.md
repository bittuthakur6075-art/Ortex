# Project Memory: Ortex Industries Website

This document provides a comprehensive analysis and developer reference ("memory") for the Ortex Industries website codebase. It outlines the project's purpose, technology stack, directory structure, custom styles, page roles, and key configuration values to serve as context for subsequent development or maintenance tasks.

---

## 1. Project Overview & Business Context

**Ortex Industries** (Ortex Industries Private Limited) is a manufacturer specializing in premium customized products, OEM manufacturing, and white-label production.

*   **Primary Products**: MDF items (magnets, keychains, frames), Acrylic products (keychains, badges, stands), Custom printed lanyards & ID accessories, Examination boards, Customized clipboards, Corporate gifts, and Branding services.
*   **Target Industries**: Corporates, Educational institutions, Government departments, Healthcare facilities, Event management agencies, Retailers, and Marketing agencies.
*   **Service Logistics**: Offers **PAN India** delivery and **worldwide export** support.
*   **Key Business Contacts**:
    *   **Phone & WhatsApp Primary**: `+91-9211947188`
    *   **Phone Secondary**: `+91-8448663297`
    *   **Email**: `sales@ortexindustries.in`
    *   **Business Hours**: Mon–Sat: 9:00 AM – 6:00 PM (Sunday Closed)

---

## 2. Technology Stack & Dependencies

The project is built on a modern frontend React-based single-page application setup, powered by **Vite** and styled using **Tailwind CSS v4.0.0+**.

*   **Core Libraries**:
    *   **React 19** (`^19.2.7`) & **React DOM** (`^19.2.7`)
    *   **Vite 8** (`^8.1.1`) as the build tool and development server.
    *   **React Router DOM 7** (`^7.18.1`) for page navigation.
*   **Styling & Merging**:
    *   **Tailwind CSS 4** (`^4.3.2`) with Vite integration via `@tailwindcss/vite` (`^4.3.2`).
    *   `clsx` (`^2.1.1`) and `tailwind-merge` (`^3.6.0`) for dynamic CSS class utility parsing.
*   **Icons & Motion**:
    *   **Framer Motion 12** (`^12.42.2`) for scroll/fade animations and modal transitions.
    *   **Lucide React 1** (`^1.23.0`) for clean vector icons.
*   **UI Components / Utilities**:
    *   **Sonner** (`^2.0.7`) for rich, customizable toast alerts.
    *   **Oxlint** (`^1.71.0`) as the linter.

---

## 3. Directory Structure

```text
Ortex/
├── .git/
├── .gitignore
├── .oxlintrc.json
├── package.json
├── package-lock.json
├── README.md
├── index.html
├── vite.config.js
├── public/
└── src/
    ├── App.css
    ├── index.css
    ├── main.jsx
    ├── App.jsx
    ├── assets/
    ├── components/
    │   ├── Navbar.jsx          # Sticky header navigation, theme toggler + WhatsApp template configuration
    │   ├── Footer.jsx          # Bottom section containing links, contacts, and WhatsApp integration
    │   ├── ScrollToTop.jsx     # Auto-scrolls user to top on route updates
    │   ├── Hero.jsx            # Interactive hero landing component with KPI metrics
    │   └── Chatbot.jsx         # Custom integrated client chatbot component
    ├── hooks/
    │   └── useDocumentMetadata.js  # Dynamic SEO manager for titles & description tags
    ├── utils/
    │   └── cn.js               # Helper combining clsx and tailwind-merge
    └── pages/
        ├── Home.jsx            # Home wrapper rendering Hero, capabilities & CTA
        ├── About.jsx           # Mission statement, storytelling & differentiators
        ├── Products.jsx        # Grid of product offerings and custom service specs
        ├── Industries.jsx      # Targeted industry sectors & statistics counter
        ├── Portfolio.jsx       # Custom gallery with filters and detailed lightbox
        ├── Contact.jsx         # Pre-filled validation form from portfolio inquiries
        ├── QuoteCalculator.jsx # Step-by-step custom quote estimator & mock RFQ builder
        ├── Privacy.jsx         # Legal privacy statement
        └── Terms.jsx           # Legal terms of service
```

---

## 4. Key Configurations & Styling System

### 4.1. Tailwind v4 `@theme` (in `src/index.css`)
The project utilizes Tailwind v4's direct CSS `@theme` configuration. The layout overrides standard Tailwind shadows to maintain a flat/flat-bordered aesthetic:

*   **Shadow overrides**: All default box shadows (`--shadow`, `--shadow-md`, `--shadow-lg`, etc.) are explicitly configured to `none`.
*   **Font Family**: Custom sans font defined as `"Inter", sans-serif`.
*   **Theme Color Tokens (HSL)**:
    *   `--background`: HSL `0 0% 100%` (Dark: `222 47% 11%`)
    *   `--foreground`: HSL `222 47% 11%` (Dark: `0 0% 98%`)
    *   `--primary`: HSL `217 91% 60%`
    *   `--secondary`: HSL `240 5% 96%` (Dark: `240 4% 16%`)
    *   `--accent`: HSL `217 91% 50%`
    *   `--whatsapp`: HSL `142 71% 49%` (Brand color helper for WhatsApp integration)

### 4.2. Layout Container Wrapper (`.lp-wrap`)
To control layout widths symmetrically, a custom container class `.lp-wrap` is implemented in `src/index.css` following Keystone specs:
```css
.lp-wrap {
  width: 100%;
  padding-left: 12px;
  padding-right: 12px;
  margin-left: auto;
  margin-right: auto;
}
/* Breakpoint Max Widths */
@media (min-width: 576px)  { .lp-wrap { max-width: 540px; } }
@media (min-width: 768px)  { .lp-wrap { max-width: 720px; } }
@media (min-width: 992px)  { .lp-wrap { max-width: 960px; } }
@media (min-width: 1200px) { .lp-wrap { max-width: 1140px; } }
@media (min-width: 1400px) { .lp-wrap { max-width: 1320px; } }
@media (min-width: 1590px) { .lp-wrap { max-width: 1440px; } }
```

---

## 5. Main Component & Page Logic

### 5.1. SEO Metadata Injection
The custom hook `src/hooks/useDocumentMetadata.js` dynamically updates `<title>` and `<meta name="description">` on mount. It is called at the beginning of each page component with specific descriptions to preserve good SEO practices.

### 5.2. Routing Context (`src/App.jsx`)
`App.jsx` handles routing using `react-router-dom`. It is wrapped in `<Router>` (BrowserRouter) and contains:
1.  `<ScrollToTop />` ensuring smooth transitions.
2.  `<Navbar />` (Sticky header).
3.  `<main className="flex-grow">` containing route paths: `/`, `/about`, `/products`, `/industries`, `/portfolio`, `/contact`, `/quote` (interactive quote builder), `/privacy`, and `/terms`.
4.  `<Footer />`
5.  `<Chatbot />` for automated helper guidance.
6.  `<Toaster />` from `sonner` for application notifications.

### 5.3. Contact Submissions Form (`src/pages/Contact.jsx`)
*   **Validation**: Validates inputs for name, email (regex matching), phone (digit checking), selected productInterest, and message length.
*   **Query Params**: On mount, if a `product` parameter is specified via URL search query, it pre-populates the messaging field with product-specific details and maps categories dynamically.
*   **Data Handling**: Saves mock JSON objects in local storage under key `"ortex_submissions"`.

### 5.4. Quote Calculator (`src/pages/QuoteCalculator.jsx`)
*   **Multi-step Wizard**: Guides B2B buyers through 4 stages: Product Selection, Custom Design Specs configuration (thickness, size, outer-shape cut, materials), Quantity definition (MOQ warnings & dynamic volume discounts), and Buyer Info capture.
*   **Pricing Engine**: Evaluates base costs + material specs additions * quantities, applying custom tier discounts (10% to 30%).
*   **Logo Attachment**: Supports file upload (SVGs, PDFs, High-Res PNGs) and saves structured RFQs to local storage key `"ortex_quotes"`.

### 5.5. Theme Switcher Context (`src/components/Navbar.jsx`)
*   Monitors `darkMode` state reading from local storage preferences or OS presets.
*   Fires side-effect to add/remove `.dark` class from `document.documentElement`, shifting global HSL variables instantly.
