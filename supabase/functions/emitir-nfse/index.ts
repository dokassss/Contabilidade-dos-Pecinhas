import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ENOTAS_API   = 'https://api.enotasgw.com.br/v1'
const ENOTAS_KEY   = Deno.env.get('ENOTAS_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    // 1. Autenticar usuário
    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY)
    const { data: { user }, error: authErr } = await sb.auth.getUser(token)
    if (authErr || !user) return new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } })

    const { nf_id } = await req.json()

    // 2. Buscar nota e empresa
    const { data: nf } = await sb.from('notas_fiscais').select('*, companies(*)').eq('id', nf_id).single()
    if (!nf) return new Response(JSON.stringify({ error: 'Nota não encontrada' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } })

    const company = nf.companies
    const empresaId = company.enotas_empresa_id
    if (!empresaId) return new Response(JSON.stringify({ error: 'Empresa não cadastrada na eNotas' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })

    // 3. Montar payload
    const cpfCnpj = nf.cpf_cnpj_tomador?.replace(/\D/g, '')
    const payload = {
      tipo: 'NFS-e',
      ambienteEmissao: 'Homologacao', // trocar para 'Producao' quando pronto
      idExterno: nf.id,
      enviarPorEmail: true,
      cliente: {
        tipoPessoa: cpfCnpj?.length === 11 ? 'F' : 'J',
        nome: nf.cliente,
        email: nf.email_tomador,
        cpfCnpj,
      },
      servico: {
        descricao: nf.descricao_servico,
        aliquotaIss: company.aliquota_iss || 2,
        issRetidoFonte: false,
        itemListaServico: company.item_lista_servico,
        cnae: company.cnae,
        ufPrestacaoServico: company.uf || 'SP',
        municipioPrestacaoServico: company.cidade,
      },
      valorTotal: Number(nf.valor),
    }

    // 4. Chamar eNotas
    const res = await fetch(`${ENOTAS_API}/empresas/${empresaId}/nfes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + btoa(ENOTAS_KEY + ':'),
      },
      body: JSON.stringify(payload),
    })

    const result = await res.json()
    if (!res.ok) return new Response(JSON.stringify({ error: 'Erro eNotas', detalhe: result }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } })

    // 5. Salvar nfeId na nota
    await sb.from('notas_fiscais').update({
      enotas_nfe_id: result.nfeId,
      enotas_status: 'AguardandoAutorizacao',
    }).eq('id', nf_id)

    return new Response(JSON.stringify({ ok: true, nfeId: result.nfeId }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } })

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
