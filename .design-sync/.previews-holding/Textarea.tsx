import { Textarea } from "@/components/ui/textarea";

export function Default() {
  return (
    <Textarea
      className="w-72"
      placeholder="anything else worth noting today?"
    />
  );
}

export function Disabled() {
  return (
    <Textarea
      className="w-72"
      disabled
      value="submitted for this check-in"
      readOnly
    />
  );
}
