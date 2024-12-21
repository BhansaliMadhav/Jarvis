import { db } from "@/db";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { createUploadthing, type FileRouter } from "uploadthing/next";
import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import { pinecone } from "@/lib/pinecone";
import { PineconeStore } from "langchain/vectorstores/pinecone";
import { HuggingFaceInferenceEmbeddings } from "@langchain/community/embeddings/hf";
import { Document } from "langchain/document";

const f = createUploadthing();

// Helper function to chunk text and maintain metadata
function chunkDocument(doc: Document, chunkSize: number = 1000) {
  const text = doc.pageContent;
  const chunks: Document[] = [];

  for (let i = 0; i < text.length; i += chunkSize) {
    const chunk = text.slice(i, i + chunkSize);
    chunks.push(
      new Document({
        pageContent: chunk,
        metadata: {
          ...doc.metadata,
          chunk_index: Math.floor(i / chunkSize).toString(), // Convert to string
        },
      })
    );
  }

  return chunks;
}

export const ourFileRouter = {
  pdfUploader: f({
    pdf: {
      maxFileSize: "4MB",
      maxFileCount: 1,
    },
  })
    .middleware(async ({ req }) => {
      const { getUser } = await getKindeServerSession();
      const user = getUser();
      if (!user || !user.id) throw new Error("Unauthorized");
      return { userId: user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
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

        // Initialize Pinecone and HuggingFace
        const pineconeIndex = pinecone.Index("jarvis");
        const hfEmbeddings = new HuggingFaceInferenceEmbeddings({
          model: "sentence-transformers/all-MiniLM-L6-v2",
          apiKey: process.env.HUGGINGFACEHUB_API_KEY!,
        });

        // Process documents: chunk each page and prepare for embedding
        const processedDocs = pageLevelDocs.flatMap((doc, pageIndex) => {
          // Add page number to metadata
          doc.metadata = {
            pageNumber: (pageIndex + 1).toString(), // Convert to string
            fileId: createdFile.id,
            fileName: file.name,
          };

          // Chunk the document and maintain metadata
          return chunkDocument(doc);
        });

        // Prepare text for embeddings
        const textChunks = processedDocs.map((doc) => doc.pageContent);

        // Generate embeddings in batches to prevent memory issues
        const batchSize = 50;
        const vectors = [];

        for (let i = 0; i < textChunks.length; i += batchSize) {
          const batchTexts = textChunks.slice(i, i + batchSize);
          const batchEmbeddings = await hfEmbeddings.embedDocuments(batchTexts);

          // Create vectors for this batch with properly formatted metadata
          const batchVectors = batchEmbeddings.map((embedding, batchIndex) => {
            const currentDoc = processedDocs[i + batchIndex];
            return {
              id: `${createdFile.id}-${i + batchIndex}`,
              values: embedding,
              metadata: {
                text: currentDoc.pageContent,
                pageNumber: currentDoc.metadata.pageNumber,
                fileId: currentDoc.metadata.fileId,
                fileName: currentDoc.metadata.fileName,
                chunkIndex: (i + batchIndex).toString(),
              },
            };
          });

          vectors.push(...batchVectors);
        }

        // Upload vectors to Pinecone in batches
        const uploadBatchSize = 100;
        for (let i = 0; i < vectors.length; i += uploadBatchSize) {
          const batchVectors = vectors.slice(i, i + uploadBatchSize);
          await pineconeIndex.upsert(batchVectors);
        }

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
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
