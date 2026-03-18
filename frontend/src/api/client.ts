import axios from 'axios'

export const apiClient = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const detail = error.response?.data?.detail
    const message = Array.isArray(detail)
      ? detail.map((d: { msg?: string }) => d.msg ?? JSON.stringify(d)).join(', ')
      : (typeof detail === 'string' ? detail : null)
        ?? error.response?.data?.message
        ?? error.message
        ?? 'An unexpected error occurred'
    return Promise.reject(new Error(message))
  },
)

export async function apiGet<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const response = await apiClient.get<T>(url, { params })
  return response.data
}

export async function apiPost<T>(url: string, data?: unknown): Promise<T> {
  const response = await apiClient.post<T>(url, data)
  return response.data
}

export async function apiPut<T>(url: string, data?: unknown): Promise<T> {
  const response = await apiClient.put<T>(url, data)
  return response.data
}

export async function apiDelete<T>(url: string, data?: unknown): Promise<T> {
  const response = await apiClient.delete<T>(url, data !== undefined ? { data } : undefined)
  return response.data
}

export async function apiPatch<T>(url: string, data?: unknown): Promise<T> {
  const response = await apiClient.patch<T>(url, data)
  return response.data
}
