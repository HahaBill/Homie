import { Badge } from "@/components/ui/badge";

export function Variants() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Badge variant="default">on track</Badge>
      <Badge variant="secondary">flare noted</Badge>
      <Badge variant="destructive">needs attention</Badge>
      <Badge variant="outline">draft</Badge>
    </div>
  );
}
