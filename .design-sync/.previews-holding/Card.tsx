import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function Default() {
  return (
    <Card className="w-[380px]">
      <CardHeader>
        <CardTitle>your mobile number</CardTitle>
        <CardDescription>
          the thread runs on your phone. saving it here puts your texts,
          calls and this page in one place.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Homie will use this for texts, calls and your record.
        </p>
      </CardContent>
      <CardFooter>
        <Button className="w-full">save my number</Button>
      </CardFooter>
    </Card>
  );
}
