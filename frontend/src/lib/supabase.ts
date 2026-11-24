import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const rawUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// Without these env vars the app keeps running on its built-in sample data.
export const supabase: SupabaseClient | null =
  rawUrl && anonKey ? createClient(new URL(rawUrl, window.location.origin).toString().replace(/\/$/, ''), anonKey) : null

export async function callFunction<T = any>(name: string, body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Backend not configured')
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    const ctx = (error as { context?: Response }).context
    const detail = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) : null
    throw new Error(detail?.error ?? error.message)
  }
  return data as T
}

export async function rpc<T = any>(fn: string, args: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Backend not configured')
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}
