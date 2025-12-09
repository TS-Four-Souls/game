import { schemas, type Issuer } from "@/types/types";

export const playerEndpointHandler = async (
  request: Request,
  handler: (issuer: Issuer, body: unknown) => Response
) => {
  let body;
  try {
    body = await request.json();
  } catch (error) {
    return new Response("Invalid or missing JSON body", { status: 400 });
  }
  const result = schemas.userProtectedRequest.safeParse(body);
  if (!result.success) {
    return new Response("Invalid request", { status: 400 });
  }
  return handler(result.data.issuer, body);
};
