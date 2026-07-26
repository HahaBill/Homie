import { Separator } from "@/components/ui/separator";

export function Horizontal() {
  return (
    <div className="w-64">
      <p className="text-sm text-foreground">your record</p>
      <Separator className="my-3" />
      <p className="text-sm text-muted-foreground">shared with your clinician</p>
    </div>
  );
}

export function Vertical() {
  return (
    <div className="flex h-8 items-center gap-3 text-sm text-foreground">
      <span>the thread</span>
      <Separator orientation="vertical" />
      <span>your record</span>
      <Separator orientation="vertical" />
      <span>settings</span>
    </div>
  );
}
