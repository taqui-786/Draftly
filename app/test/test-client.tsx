"use client";

import { useActionState } from "react";
import { LoaderCircle, Sparkles, WandSparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { runTweetPipelineAction, type TestActionState } from "./actions";

const STARTERS = [
  "A personal note on shipping before perfecting",
  "What solo builders should stop overthinking",
  "A tweet about consistency over motivation",
];

const initialState: TestActionState = {
  status: "idle",
};

export function TestClient() {
  const [state, formAction, pending] = useActionState(runTweetPipelineAction, initialState);

  return (
    <main className="flex-1 bg-gradient-magic">
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="mb-6">
          <Badge className="mb-3 gap-1 rounded-full bg-primary/12 text-primary ring-1 ring-primary/20">
            <Sparkles className="size-3.5" />
            Tool Pipeline Test
          </Badge>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">/test</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Directly calls <code>generateTweetWithToolPipeline</code> via Server Action.
          </p>
        </section>

        <Card className="rounded-2xl border border-border/60 bg-card/90 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Tweet Pipeline Runner</CardTitle>
            <CardDescription>Intent - Draft - User-Style Polish - Viral Adaptation</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form action={formAction} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="prompt">Tweet prompt</Label>
                <Textarea
                  id="prompt"
                  name="prompt"
                  required
                  minLength={5}
                  placeholder="Write what tweet you want..."
                  className="min-h-28 rounded-xl border-border/70 bg-background/70 text-sm"
                  defaultValue={state.prompt ?? ""}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {STARTERS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className="rounded-full border border-border/60 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    onClick={(event) => {
                      const form = event.currentTarget.closest("form");
                      const textarea = form?.querySelector<HTMLTextAreaElement>("#prompt");
                      if (textarea) textarea.value = item;
                    }}
                  >
                    {item}
                  </button>
                ))}
              </div>

              <Button type="submit" disabled={pending} className="h-10 rounded-xl px-5">
                {pending ? (
                  <>
                    <LoaderCircle className="size-4 animate-spin" />
                    Running pipeline
                  </>
                ) : (
                  <>
                    <WandSparkles className="size-4" />
                    Generate Tweet
                  </>
                )}
              </Button>
            </form>

            {state.status === "error" && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {state.message}
              </div>
            )}

            {state.status === "success" && (
              <>
                <Separator />
                <div className="space-y-4">
                  <Card className="rounded-xl border border-primary/20 bg-primary/5">
                    <CardHeader className="pb-2">
                      <CardTitle>Final Tweet</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">{state.tweet}</p>
                    </CardContent>
                  </Card>

                  <div className="grid gap-4 md:grid-cols-3">
                    <Card className="rounded-xl border border-border/60">
                      <CardHeader className="pb-2">
                        <CardTitle>1. Draft</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{state.draft}</p>
                      </CardContent>
                    </Card>

                    <Card className="rounded-xl border border-border/60">
                      <CardHeader className="pb-2">
                        <CardTitle>2. Polished</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{state.polished}</p>
                      </CardContent>
                    </Card>

                    <Card className="rounded-xl border border-border/60">
                      <CardHeader className="pb-2">
                        <CardTitle>3. Viral Style</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{state.viral}</p>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
