import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Mapeamento eNotas status → status interno
const STATUS_MAP: Record<string, string> = {
  'Autorizada': 'paid',
  'Negada':     'rejected',
  'Cancelada':  'cancelled',
}

serve(async (req) => {
  try {
    const payload = await req.json()
    const { idExterno, status, linkDownloadPDF, linkDownloadXML, numero } = payload

    if (!idExterno) return new Response('ok', { status: 200 })

    const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

    const updates: Record<string, unknown> = { enotas_status: status }
    if (STATUS_MAP[status])  updates.status  = STATUS_MAP[status]
    if (linkDownloadPDF)     updates.pdf_url = linkDownloadPDF
    if (linkDownloadXML)     updates.xml_url = linkDownloadXML
    if (numero)              updates.numero  = numero

    await sb.from('notas_fiscais').update(updates).eq('id', idExterno)

    return new Response('ok', { status: 200 })
  } catch (err) {
    return new Response(String(err), { status: 500 })
  }
})
