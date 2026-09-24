# Design system

The rules the web UI follows. Tokens live in `src/styles.css`; this file says
what they mean and when to use them. The visual reference is the "BirdNET-Book
Design System" canvas on claude.ai.

## Principles

- **Paper for content.** Content sits on `feature-card`s (white, `--line`
  hairline, 4px radius) on the paper ground. Cards never nest: a figure row
  inside a card uses `PageHeaderStats inline`, not more cards.
- **The sidebar is an inset card** on desktop (`site-sidebar.tsx`), with paper
  around it. Page content fills the remaining width; no max-width column.
- **Show the bird.** Any list of species uses the species-row idiom:
  `SpeciesThumbnail` + `illustrationUrlFor(sciName)`, common name over an
  italic binomial, `odd:bg-[var(--meadow)]` zebra, no label→value rows.
- **One instrument.** Every figure is the same size, face and weight
  (`PageHeaderCard` stats: kicker label + 20px semibold tabular value).
- **Stable under the cursor.** Fixed slots and floored line boxes, so data
  arriving never shifts a control.

## Color

Nine named colors: `--paper` `#fbfdf6`, `--paper-raised` `#fff`, `--meadow`
`#f8faf2`, `--sage` `#c5ccb6`, `--sand` `#c69a58`, `--clay` `#9c4a34`,
`--bark` `#472f1d`, `--moss` `#203b14`, `--ink` `#0a1d08`.

Everything else is a `color-mix(in oklab, …)` of those. Use the named token
for a meaning; don't write a new mix inline when one exists:

| Token | Use |
| --- | --- |
| `--line` | every border and hairline (moss 15%) |
| `--track` | unfilled remainder of a bar (moss 28%) |
| `--hover-line` | border of a linked card on hover |
| `--focus-ring` | keyboard focus, 2px outline, 2px offset |
| `--muted-foreground` | secondary text |
| `--icon-well` | round background behind a card's leading icon |
| `--row-selected` | a selected row in a list or table |
| `--live-fill` | the Live pill |
| `--confidence-high/mid/low` | confidence pills; text is moss / bark / ink |

Confidence tiers are fixed at ≥90%, ≥75% and below (`lib/confidence.ts`),
never a gradient. Destructive is clay. Single-series charts are moss.

## Type

Georgia for everything: headings, body, controls, figures. Numbers use
`.tabular-data`. Monospace only for code and paths.

- Page title: 20px bold (`display-title`)
- Figure: 20px semibold, tabular
- Count: `.count-figure`, 13px bold ink, tabular. Every count of birds or
  detections in running UI (a species row's total, a "117 detections · 30
  species" readout) uses it. Headline stats stay Figures; numbers drawn inside
  a chart (heatmap cells, bar labels) and table cells keep their own sizes.
- Body 16px, secondary 14px, species binomial 14px italic
- Kicker: `.island-kicker`, 11px, 700, uppercase, 0.16em tracking, moss
- Controls: 11–14px, weight 500

## Shape, spacing, motion

- Radius: 4px cards and buttons (`rounded-md`), 6px nav rows, 2px tooltips,
  pills fully round.
- Spacing: 16px is the unit for card padding, gaps between cards and the
  page gutter.
- Motion: 180ms ease for color/border/lift; `.rise-in` 700ms on mount;
  `.flash-in` 2.4s sand highlight for new arrivals; charts 500ms.
  Only linked cards lift on hover (`feature-card-link`).

## Components

- **Button** (`ui/button.tsx`): the default size is `xs` (24px). Pass glyphs
  via `icon`, never as children, so padding stays constant.
- **Toggle group**: on = moss fill, white text; segments share borders.
- **Input**: focus is shown by a `--focus-ring` border, not the outline.
- **Nav rows**: active is marked by fill alone (a step deeper than the meadow
  hover), never bolder text. Gated pages stay listed with a lock icon.
- **Empty states**: `EmptyNote` inside a populated page; `EmptyState` only
  when the whole page is empty.
- **Chart tooltip**: one line, "6 AM — 1,284 detections", only the bucket bold.
