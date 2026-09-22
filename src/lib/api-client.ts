import type { ApiResponse, ConvertResult } from "@/lib/api-contract";

export async function postJson<TRequest, TResponse>(url: string, body: TRequest): Promise<ApiResponse<TResponse>> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  return (await response.json()) as ApiResponse<TResponse>;
}

export async function convertDocument(file: File): Promise<ApiResponse<ConvertResult>> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/convert", {
    method: "POST",
    body: formData,
    cache: "no-store",
  });

  return (await response.json()) as ApiResponse<ConvertResult>;
}
