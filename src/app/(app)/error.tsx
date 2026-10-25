"use client";

import { ErrorState } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg py-16">
      <ErrorState title="This page couldn’t load" description={process.env.NODE_ENV === "development" ? error.message : "Try again. If it keeps happening, tell an administrator."} action={<Button onClick={reset}>Try again</Button>} />
    </div>
  );
}
