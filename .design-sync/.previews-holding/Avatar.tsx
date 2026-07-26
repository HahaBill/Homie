import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

// Inline data URI so the story renders deterministically offline (no
// network fetch during the headless render check).
const SAMPLE_AVATAR =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="#D47A5A"/><circle cx="64" cy="52" r="24" fill="#FFF4EC"/><ellipse cx="64" cy="120" rx="40" ry="30" fill="#FFF4EC"/></svg>',
  );

export function WithImage() {
  return (
    <Avatar className="h-11 w-11 border border-border">
      <AvatarImage src={SAMPLE_AVATAR} alt="" />
      <AvatarFallback>H</AvatarFallback>
    </Avatar>
  );
}

export function Fallback() {
  return (
    <Avatar className="h-11 w-11 border border-border">
      <AvatarImage src="/broken-image.jpg" alt="" />
      <AvatarFallback className="bg-secondary font-sans text-base font-bold text-foreground">
        H
      </AvatarFallback>
    </Avatar>
  );
}
