import { Slider } from "@/components/ui/slider";

export function Default() {
  return (
    <div className="w-64">
      <Slider defaultValue={[60]} max={100} step={1} />
    </div>
  );
}

export function Disabled() {
  return (
    <div className="w-64">
      <Slider defaultValue={[30]} max={100} step={1} disabled />
    </div>
  );
}
