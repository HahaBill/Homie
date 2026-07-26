import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function Default() {
  return <Input placeholder="07700 900123" className="w-72" />;
}

export function WithLabel() {
  return (
    <div className="flex w-72 flex-col gap-1.5">
      <Label htmlFor="phone">mobile number</Label>
      <Input id="phone" type="tel" placeholder="07700 900123" />
    </div>
  );
}

export function Disabled() {
  return <Input disabled value="saved" className="w-72" readOnly />;
}
