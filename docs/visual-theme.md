# VibeETL UI/UX Visual Theme & Architecture Specification

This document defines the unified visual design language, layout hierarchy, and interface design token standards for the **VibeETL** platform. All frontend components, themes, node definitions, and styling mechanisms must adhere strictly to these constraints to deliver a professional, enterprise-grade ETL experience mirroring production standards.

---

## 1. Typography Hierarchy

To maintain clarity and distinct readability for structural metadata, interface configurations, and data rendering, a three-tiered typography system is implemented:

| Font Family | Applied Elements | Font Weight & Sizing Rules |
| :--- | :--- | :--- |
| **'Outfit', sans-serif** | Dashboard Headers, Section Titles, Canvas Tool Labels, Primary Action Buttons, Brand Logos. | `700` for Brand, `600` for Section Headers (`13px`-`15px`), `500` for Buttons/Labels. |
| **'Inter', sans-serif** | Workspace Panel Body text, Input Controls, Sidebar Labels, Table Headers, Contextual Hints, Dropdown Options. | `400` Regular for descriptions, `500` Medium for interactive states, `600` Semi-Bold for table column headers. |
| **'JetBrains Mono', monospace** | Execution Engine Logs, Data Cell Matrix Values, File Name Pills, Expression Editor Scripts, Code Viewports. | `400` Regular, explicitly constrained to `11px` to `12px` for tight information density. |

---

## 2. Global Core Theme Palette (Light-Mode First)

The platform relies on a strict set of semantic tokens. Hardcoded hex values must not be used inside independent components; always reference these global theme variables:

```css
:root {
  /* Layout Backgrounds */
  --bg-primary: #ffffff;      /* Panel bodies, main cards, modal foregrounds */
  --bg-secondary: #f9fafb;    /* Sidebar headers, tool category labels, active tab fill */
  --bg-tertiary: #f3f4f6;     /* Structural tables, pill backgrounds, inactive buttons */
  
  /* Layout Dividers */
  --border-color: #e5e7eb;    /* Standard subtle panel boundaries, grid separators */
  --border-dark: #d1d5db;     /* High-contrast element borders (inputs, selectors, inactive nodes) */
  
  /* Text Contrast Hierarchy */
  --text-primary: #111827;    /* Major headings, emphasis labels, primary content */
  --text-secondary: #4b5563;  /* Subtitles, standard descriptions, standard labels */
  --text-muted: #9ca3af;      /* Inactive statuses, field placeholders, row counter indices */
  
  /* Brand Actions & Engine Status Fills */
  --color-accent: #2563eb;     /* Selected node focus rings, active links, primary action focus */
  --color-success: #16a34a;    /* Workflow run success state indicator, executed logs, safe outputs */
  --color-error: #dc2626;      /* Failed node validation border, termination logs, block breaks */
  --color-warning: #ea580c;    /* Pipeline active compilation state, warning flags, modified unsaved settings */
}
```

---

## 3. Tool Category Color Coding System

VibeETL classification colors are systematically aligned with categorical functions, easing user readability during complex graph builds:

| Functional Category | Base Hex Code | Accent Glow / Hover State Ring | Intended Pipeline Operations |
| --- | --- | --- | --- |
| **In / Out** | `#2e7d32` (Green) | `rgba(46, 125, 50, 0.08)` | File Input, File Output, Cloud Storage Ingest, Data Stream Egress |
| **Preparation** | `#0288d1` (Blue) | `rgba(2, 136, 209, 0.08)` | Filter, Sort, Formula Builder, Field Split, Record Sample |
| **Join** | `#7b1fa2` (Purple) | `rgba(123, 31, 162, 0.08)` | Join (L/J/R), Union Stack, Append Fields, Fuzzy Matching Block |
| **Transform** | `#e65100` (Orange) | `rgba(230, 81, 0, 0.08)` | Select Columns, Summarize (GroupBy), Pivot / Transpose Matrix |

---

## 4. Canvas Node Dimensional Standards

To guarantee a clean, professional view that avoids visual bloating, canvas graph nodes must abide by the following programmatic constraints:

* **Bounding Dimensions**: Exactly `44px` × `44px` square wrapper container.
* **Structural Border**: `2px solid` mapped directly to the tool's respective functional category color token.
* **Corner Curvature**: `6px` border-radius for an integrated modern design aesthetic.
* **Node Icon Format**: Centered Lucide icon, explicitly configured to a scale size of `16`.
* **Status Overlay Indicator**: A top-right absolute-positioned `10px` × `10px` circle overlapping the bounding border (`top: -4px; right: -4px`). Uses operational colors (`--color-success`, `--color-warning`) paired with a `1.5px` white mask ring border.

### Label Stacking Hierarchy

Labels must never occupy the interior space of a node. They are arranged vertically directly **underneath** the node box container within a flex framework:

1. **Primary Node Action Label**: `11px` bold text using `--text-primary`.
2. **Sub-label Parameter Pill**: A pill-shaped dynamic component wrapped in a `border: 1px solid var(--border-color)` with a `var(--bg-secondary)` background. Font size restricted to `9px` medium using `--text-secondary` and `'JetBrains Mono'`. Maximum width locked at `120px` using CSS text truncation styles (`overflow: hidden; text-overflow: ellipsis; white-space: nowrap`) and `border-radius: 9999px`.

---

## 5. Network Graph Connections & Logic Handles

* **Standard Geometric Ports**: Connection terminals placed outside the lateral boundaries of nodes. Designed as minimal `8px` circles with a `2px solid var(--border-dark)` structure and `#ffffff` canvas fill.
* **Reactive Focus State**: On hover, ports scale smoothly up to `10px`, shifting their border target style to `var(--color-accent)`.
* **Conditional Filter Node Multi-Port Specification**:
  - **Left Boundary**: One dedicated single data input port (`input`).
  - **Right Boundary**: Split dual output terminals mapping programmatic evaluations:
    - **True Line (T)**: Set at `top: 30%` matching relative vertical height position.
    - **False Line (F)**: Set at `top: 70%` matching relative vertical height position.
  - **Internal Multi-Port Annotations**: Inline text labels `T` and `F` must be rendered crisp inside the right margin bounds of the node box precisely adjacent to their matching ports. These use an `8px` font size, ultra-bold text-weight, and use the category's theme accent color to maximize tool legibility.

---

## 6. Layout Composition & Interface Responsiveness

The VibeETL application operates on a zero-scrolling view layout structured around a 3-Panel Docking model:

### Top Navigation & Tool Drawer

* The structural header (`height: 48px` absolute bounds) houses identity assets and global trigger buttons (e.g., Run Workflow).
* The Tool Palette must utilize standard CSS flex wrapping wrappers. If screen width decreases below `850px`, the individual functional group folders stack vertically or shift down into hidden overflow slide-panels rather than pushing the canvas bounds outward.

### Workspace Split Framework

* **Left Dock: Configuration Bar**: Constrained to a fixed width of `256px`. This panel aggregates contextual parameter fields based on whichever node is clicked on the active canvas.
* **Center Window: Interactive Canvas**: Occupies the remainder of screen real estate with an infinite viewport grid background (`radial-gradient(#e5e7eb 1px, transparent 1px)` spaced precisely at `16px`).
* **Bottom Dock: Data Preview Matrix & Execution View**: A split panel constrained to `224px` height with separate absolute navigation tabs. Column records must conform to tight data rows styled with variable zebra stripes using alternate `--bg-primary` and `--bg-secondary` fills. All coordinate data and text cells inside the data viewer map to `'JetBrains Mono'` for precise cell value cross-alignment.
