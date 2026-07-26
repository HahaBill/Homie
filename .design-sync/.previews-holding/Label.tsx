import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export function Default() {
  return (
    <div className="flex w-72 flex-col gap-1.5">
      <Label htmlFor="label-demo-phone">mobile number</Label>
      <Input id="label-demo-phone" type="tel" placeholder="07700 900123" />
    </div>
  );
}
