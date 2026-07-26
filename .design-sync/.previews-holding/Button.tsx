import { Button } from "@/components/ui/button";

export function Variants() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="default">save check-in</Button>
      <Button variant="secondary">not now</Button>
      <Button variant="outline">edit answer</Button>
      <Button variant="ghost">skip</Button>
      <Button variant="destructive">remove number</Button>
      <Button variant="link">view full record</Button>
    </div>
  );
}

export function Sizes() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="sm">small</Button>
      <Button size="default">default</Button>
      <Button size="lg">large</Button>
      <Button size="icon" aria-label="settings">
        ⚙
      </Button>
    </div>
  );
}

export function Disabled() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button disabled>saving…</Button>
      <Button variant="outline" disabled>
        unavailable
      </Button>
    </div>
  );
}
