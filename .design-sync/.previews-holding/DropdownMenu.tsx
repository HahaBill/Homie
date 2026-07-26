import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export function Default() {
  return (
    <DropdownMenu defaultOpen modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost">your account</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <span className="block text-sm text-muted-foreground">
            signed in as
          </span>
          <span className="block truncate text-base text-foreground">
            you@example.com
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>the thread</DropdownMenuItem>
        <DropdownMenuItem>your record</DropdownMenuItem>
        <DropdownMenuItem>settings and consent</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
