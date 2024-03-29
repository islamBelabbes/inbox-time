import { tryCatch } from "@/lib/utils";
import prisma from "@/lib/prisma";
import {
  sendCreated,
  sendNoContent,
  sendOk,
  sendServerError,
  sendToManyRequests,
} from "@/lib/responseHelper";
import { countMessages, getMessages } from "@/lib/db";
import { pusherServer } from "@/lib/pusher";
import { ratelimit } from "@/lib/upstach";

export const GET = async (req) => {
  const url = new URL(req.url);
  const limit = +url.searchParams.get("limit") || 5;
  const page = +url.searchParams.get("page") || 1;

  const query = {
    skip: (page - 1) * limit,
    take: limit,
    where: {
      type: "Inbox",
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  };

  // pagination
  const [countNext, countNextError] = await tryCatch(
    countMessages({ ...query, skip: page * limit })
  );

  if (countNextError) return sendServerError();

  const pagination = {
    hasNext: countNext > 0,
    limit,
    page,
  };

  const [data, error] = await tryCatch(getMessages(query));

  if (error) return sendServerError();

  return sendOk({
    data,
    message: "Messages fetched successfully",
    pagination,
  });
};

export const POST = async (req) => {
  // rate limiter start
  const { success } = await ratelimit.limit("ip");
  if (!success) return sendToManyRequests();
  // rate limiter end

  const { message, sender } = await req.json();

  const [data, error] = await tryCatch(
    prisma.message.create({
      data: {
        message,
        sender,
      },
    })
  );

  if (error) return sendServerError();

  await pusherServer.trigger("inbox-time", "new-message", {
    message: "hello world",
  });

  return sendCreated({
    data,
    message: "Message sent successfully",
  });
};

export const PUT = async (req) => {
  const { ids } = await req.json();

  const [__, error] = await tryCatch(
    prisma.message.updateMany({
      where: {
        id: {
          in: ids,
        },
      },
      data: {
        type: "Archive",
      },
    })
  );

  if (error) return sendServerError();
  return sendNoContent();
};
