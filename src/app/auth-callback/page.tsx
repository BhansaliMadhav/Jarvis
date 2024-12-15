"use client";
import { useRouter, useSearchParams } from "next/navigation";
import React, { useEffect } from "react";
import { trpc } from "../_trpc/client";
import { Loader2 } from "lucide-react";

function Page() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const origin = searchParams.get("origin");

  const query = trpc.authCallback.useQuery(undefined, {
    retry: true,
    retryDelay: 500,
  });

  // Check for errors in the query result
  if (query.error) {
    const errData = query.error.data;
    if (errData?.code === "UNAUTHORIZED") {
      router.push("/sign-in");
    } else {
      // Handle other types of errors
      console.error("An error occurred:", query.error);
    }
  }
  // Continue with other logic based on the query result
  if (query.data?.success) {
    router.push(origin ? `/${origin}` : "/dashboard");
  }
  return (
    <div className="w-full mt-24 flex justify-center">
      <div className="flex flex-col items-center gap-2">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-800" />
        <h3 className="font-semibold text-xl">Setting up your account ....</h3>
        <p>You will be redirected automatically.Please don&apos;t refresh.</p>
      </div>
    </div>
  );
}

export default Page;
