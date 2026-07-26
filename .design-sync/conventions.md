## Using the Homie components

These are Homie's real shadcn/ui-based primitives — no separate design-system package exists; they ship straight from `components/ui/` in the Next.js app. Read `styles.css` (and its imports) before styling anything; it is the real, compiled stylesheet, not a summary.

### Setup

No provider or wrapper is required. Every component here is either a plain styled element (`Button`, `Input`, `Badge`, `Textarea`, `Card`) or a self-contained Radix UI primitive (`Avatar`, `Checkbox`, `DropdownMenu`, `Select`, `Separator`, `Slider`, `Label`) that manages its own state, portals, and accessibility — none read from external context. Just import and render.

### Styling idiom: Tailwind utilities aliased to real CSS variables

Style with Tailwind utility classes, never inline styles or ad-hoc hex values — every semantic color utility below resolves to one of Homie's actual custom properties (defined in `styles.css`), not Tailwind's defaults:

| Utility | Resolves to | Use for |
|---|---|---|
| `bg-background` / `text-foreground` | `--oat` / `--ink` | page background / body text |
| `bg-card` | `--milk` | raised surfaces (Card) |
| `bg-secondary` | `--panel` | secondary surfaces, panels |
| `bg-muted` / `text-muted-foreground` | `--well` / `--muted` | muted backgrounds, helper text |
| `bg-accent` | `--peach` | hover states, highlighted rows |
| `bg-primary` / `text-primary` | `--apricot` | the one brand accent — primary actions |
| `bg-destructive` | `--clay` | destructive actions, errors |
| `border-border` / `border-input` | `--edge` | hairlines, input borders |
| `rounded-lg` | `--r-card` (24px) | card corners |
| `font-display` | Fredoka | headings only |
| `font-sans` | Nunito | body text (the default) |
| `font-mono` | JetBrains Mono | code/monospace |

Tailwind's preflight reset is OFF — bare `<textarea>`/`<input>` elements do not automatically inherit `font-sans`; add it explicitly if a new composition needs it (existing components rely on their own utility classes, not preflight).

Compose new UI from these utilities the same way `components/ui/card.tsx` and `components/ui/button.tsx` do: semantic color/spacing utilities, never raw hex or px-perfect one-offs.

### Example: a save-and-continue card

```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

<Card className="w-[380px]">
  <CardHeader>
    <CardTitle>your mobile number</CardTitle>
    <CardDescription>
      the thread runs on your phone. saving it here puts your texts, calls
      and this page in one place.
    </CardDescription>
  </CardHeader>
  <CardContent>
    <p className="text-sm text-muted-foreground">
      Homie will use this for texts, calls and your record.
    </p>
  </CardContent>
  <CardFooter>
    <Button className="w-full">save my number</Button>
  </CardFooter>
</Card>
```
