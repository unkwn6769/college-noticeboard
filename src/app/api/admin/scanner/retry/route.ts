import { NextResponse } from "next/server";
import { requireAdmin } from "@/src/lib/auth/session";
import { retryLegacyScannerItem } from "@/src/lib/legacy-scanner";
import { assertSameOrigin } from "@/src/lib/security";
import { jsonError, publicErrorMessage, authorizationErrorStatus } from "@/src/lib/http";
export const runtime="nodejs";
export async function POST(request:Request){try{assertSameOrigin(request);const user=await requireAdmin();const body=await request.json() as {id?:string};if(!body.id||body.id.length>64)return jsonError("Invalid scanner item",400);await retryLegacyScannerItem(body.id,user.id);return NextResponse.json({ok:true});}catch(e){return jsonError(publicErrorMessage(e,"Retry could not be started."),authorizationErrorStatus(e,400))}}
