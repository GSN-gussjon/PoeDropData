import { createClient } from '@supabase/supabase-js'

// Anon key jest publiczny z założenia — bezpieczeństwo zapewniają polityki RLS.
const URL = import.meta.env.VITE_SUPABASE_URL || 'https://jhxhexkpesanvezabuui.supabase.co'
const ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpoeGhleGtwZXNhbnZlemFidXVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ5OTE3NzAsImV4cCI6MjExMDU2Nzc3MH0.FSfPt1fnHhFw7to14IxPlASwZkFjWoGfFA-b_3ig3cg'

const OWNER_KEY = 'poe-boss-scrapper.owner-token'

function getOrCreateOwnerToken(): string {
  try {
    const existing = window.localStorage.getItem(OWNER_KEY)
    if (existing) return existing
    const token =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `owner-${Date.now()}-${Math.random().toString(36).slice(2)}`
    window.localStorage.setItem(OWNER_KEY, token)
    return token
  } catch {
    return ''
  }
}

export const ownerToken = getOrCreateOwnerToken()

export const supabase = createClient(URL, ANON_KEY, {
  global: { headers: { 'x-owner-token': ownerToken } },
  auth: { persistSession: false, autoRefreshToken: false }
})
