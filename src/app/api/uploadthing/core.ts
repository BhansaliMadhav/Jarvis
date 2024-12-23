import { db } from "@/db";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { createUploadthing, type FileRouter } from "uploadthing/next";
import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import { getUserSubscriptionPlan } from "@/lib/stripe";
import { PLANS } from "@/config/stripe";

const f = createUploadthing();

const middleWare = async () => {
  const { getUser } = await getKindeServerSession();
  const user = getUser();
  if (!user || !user.id) throw new Error("Unauthorized");
  const subscriptionPlan = await getUserSubscriptionPlan();
  return { subscriptionPlan, userId: user.id };
};
const onUploadComplete = async ({
  metadata,
  file,
}: {
  metadata: Awaited<ReturnType<typeof middleWare>>;
  file: {
    key: string;
    name: string;
    url: string;
  };
}) => {
  const doesFileExist = await db.file.findFirst({
    where: {
      key: file.key,
    },
  });
  if (doesFileExist) return;
  const createdFile = await db.file.create({
    data: {
      userId: metadata.userId,
      key: file.key,
      name: file.name,
      url: file.url,
      uploadStatus: "PROCESSING",
    },
  });

  try {
    // Fetch and load PDF
    const response = await fetch(file.url);
    const blob = await response.blob();
    const loader = new PDFLoader(blob);
    const pageLevelDocs = await loader.load();
    const pagesAmt = pageLevelDocs.length;
    const { subscriptionPlan } = metadata;
    const { isSubscribed } = subscriptionPlan;
    const isProExceeded =
      pagesAmt > PLANS.find((plan) => plan.name === "Pro")!.pagesPerPdf;
    const isFreeExceeded =
      pagesAmt > PLANS.find((plan) => plan.name === "Free")!.pagesPerPdf;
    if ((isSubscribed && isProExceeded) || (!isSubscribed && isFreeExceeded)) {
      await db.file.update({
        where: {
          id: createdFile.id,
        },
        data: {
          uploadStatus: "FAILED",
        },
      });
    }
    // Initialize Pinecone and HuggingFace

    // Update file status to success
    await db.file.update({
      data: {
        uploadStatus: "SUCCESS",
      },
      where: {
        id: createdFile.id,
      },
    });
  } catch (error) {
    console.error("Error processing file:", error);

    await db.file.update({
      data: { uploadStatus: "FAILED" },
      where: {
        id: createdFile.id,
      },
    });
  }
};

export const ourFileRouter = {
  freePlanUploader: f({
    pdf: {
      maxFileSize: "4MB",
      maxFileCount: 1,
    },
  })
    .middleware(middleWare)
    .onUploadComplete(onUploadComplete),
  ProPlanUploader: f({
    pdf: {
      maxFileSize: "16MB",
      maxFileCount: 1,
    },
  })
    .middleware(middleWare)
    .onUploadComplete(onUploadComplete),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
