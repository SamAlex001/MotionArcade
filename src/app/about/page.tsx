import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AboutPage() {
  return (
    <div className="flex-1 bg-dots">
      <div className="container mx-auto px-4 py-12 sm:py-16">
      <Card className="max-w-3xl mx-auto rounded-2xl border-2 border-foreground/85 shadow-[6px_6px_0_0_var(--tw-shadow-color)] shadow-teal-500">
        <CardHeader>
          <CardTitle className="font-headline text-3xl md:text-4xl">
            About <span className="text-gradient-brand animate-gradient-x">MotionArcade</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-lg text-muted-foreground">
            This section is currently under development. Stay tuned for more information about the MotionArcade project, its mission, and the team behind it.
          </p>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
