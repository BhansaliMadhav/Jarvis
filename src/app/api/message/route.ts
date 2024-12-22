import { db } from "@/db";
import { sendMessageValidator } from "@/lib/validators/sendMessageValidator";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { OpenAI } from "openai";
import { StreamingTextResponse } from "ai";
import { NextRequest } from "next/server";

const client = new OpenAI({
  baseURL: "https://api-inference.huggingface.co/v1/",
  apiKey: process.env.HUGGINGFACEHUB_API_KEY,
});

export const POST = async (req: NextRequest) => {
  // Parse the request body
  const body = await req.json();
  const { getUser } = getKindeServerSession();
  const user = getUser();
  const { id: userId } = user;
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const { fileId, message } = sendMessageValidator.parse(body);

  // Verify file access
  const file = await db.file.findFirst({
    where: {
      id: fileId,
      userId,
    },
  });
  if (!file) return new Response("Not found", { status: 404 });

  // Save user message to the database
  await db.message.create({
    data: {
      text: message,
      isUserMessage: true,
      userId,
      fileId,
    },
  });

  // Create a stream that collects the response and updates the database
  let completionText = ""; // Collect the streamed output

  const readableStream = new ReadableStream({
    async start(controller) {
      const stream = await client.chat.completions.create({
        model: "google/gemma-2-2b-it",
        messages: [
          {
            role: "user",
            content: message,
          },
        ],
        max_tokens: 500,
        stream: true,
        max_completion_tokens: 1500,
      });

      // Process the stream in chunks
      for await (const chunk of stream) {
        if (chunk.choices && chunk.choices.length > 0) {
          const newContent = chunk.choices[0].delta.content;
          completionText += newContent; // Append to completionText
          controller.enqueue(new TextEncoder().encode(newContent!)); // Enqueue data for streaming
        }
      }

      controller.close();

      // Save the completion message to the database after streaming
      await db.message.create({
        data: {
          text: completionText,
          isUserMessage: false,
          fileId,
          userId,
        },
      });
    },
  });

  // Return the readable stream wrapped in a StreamingTextResponse
  return new StreamingTextResponse(readableStream);
};

// 1: vectorize message
// const embeddings = new OpenAIEmbeddings({
//   openAIApiKey: process.env.OPENAI_API_KEY,
// });

// const pineconeIndex = pinecone.Index("jarvis");
// const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
//   pineconeIndex,
//   namespace: file.id,
// });
// const results = await vectorStore.similaritySearch(message, 4);
// const prevMessages = await db.message.findMany({
//   where: {
//     fileId,
//   },
//   orderBy: {
//     createdAt: "asc",
//   },
//   take: 6,
// });

// const formattedPrevMessages = prevMessages.map((msg) => ({
//   role: msg.isUserMessage ? ("user" as const) : ("assistant" as const),
//   content: msg.text,
// }));
// const respone = await openai.chat.completions.create({
//   model: "gpt-4",
//   temperature: 0,
//   stream: true,
//   messages: [
//     {
//       role: "system",
//       content:
//         "Use the following pieces of context (or previous conversaton if needed) to answer the users question in markdown format.",
//     },
//     {
//       role: "user",
//       content: `Use the following pieces of context (or previous conversaton if needed) to answer the users question in markdown format. \nIf you don't know the answer, just say that you don't know, don't try to make up an answer.

// \n----------------\n

// PREVIOUS CONVERSATION:
// ${formattedPrevMessages.map((message) => {
//   if (message.role === "user") return `User: ${message.content}\n`;
//   return `Assistant: ${message.content}\n`;
// })}

// \n----------------\n

// CONTEXT:
// ${results.map((r) => r.pageContent).join("\n\n")}

// USER INPUT: ${message}`,
//     },
//   ],
// });
// const stream = OpenAIStream(respone, {
//   async onCompletion(completion) {
//     await db.message.create({
//       data: {
//         text: completion,
//         isUserMessage: false,
//         fileId,
//         userId,
//       },
//     });
//   },
// });
// return new StreamingTextResponse(stream);
