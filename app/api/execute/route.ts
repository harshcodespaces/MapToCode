import type { NextRequest } from "next/server";

export async function POST(request: NextRequest): Promise<Response> {
  try {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        { success: false, status: "invalid_request", message: "Malformed JSON payload." },
        { status: 400 }
      );
    }

    const apiUrl = process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000/api/v1";
    const clientIp = request.headers.get("x-forwarded-for")?.split(",")?.[0]?.trim() || "127.0.0.1";

    const res = await fetch(`${apiUrl.replace(/\/+$/, "")}/projects/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": clientIp,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({
      success: false,
      status: "service_error",
      message: "Invalid response from Python backend.",
    }));

    return Response.json(data, { status: res.status });
  } catch (error: any) {
    return Response.json(
      {
        success: false,
        status: "server_error",
        message: `Execution service unavailable: ${error?.message || "Check that the FastAPI backend is running on port 8000."}`,
      },
      { status: 502 }
    );
  }
}
