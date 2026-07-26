import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export function States() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Checkbox id="c-unchecked" />
        <Label htmlFor="c-unchecked">text me a morning check-in</Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="c-checked" checked />
        <Label htmlFor="c-checked">share this with my clinician</Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="c-disabled" disabled />
        <Label htmlFor="c-disabled">call me instead (coming soon)</Label>
      </div>
    </div>
  );
}
