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
    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY)
    const { data: { user }, error: authErr } = await sb.auth.getUser(token)
    if (authErr || !user) return new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } })

    const { company_id } = await req.json()

    // Buscar dados da empresa no banco
    const { data: company } = await sb.from('companies').select('*').eq('id', company_id).single()
    if (!company) return new Response(JSON.stringify({ error: 'Empresa não encontrada' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } })

    // Montar payload para a eNotas
    const payload = {
      cnpj: company.cnpj?.replace(/\D/g, ''),
      inscricaoMunicipal: company.inscricao_municipal,
      razaoSocial: company.name,
      nomeFantasia: company.name,
      optanteSimplesNacional: true,
      enviarEmailCliente: true,
      endereco: {
        codigoIbgeCidade: parseInt(company.codigo_ibge),
        uf: company.uf || 'SP',
        cidade: company.cidade,
        logradouro: 'A preencher',
        numero: 'S/N',
        bairro: 'Centro',
        cep: company.cep || '00000000',
      },
      itemListaServicoLC116: company.item_lista_servico,
      cnae: company.cnae,
      aliquotaIss: company.aliquota_iss || 2,
      configuracoesNFSeHomologacao: { sequencialNFe: 1, serieNFe: 'NF', sequencialLoteNFe: 1 },
      configuracoesNFSeProducao:    { sequencialNFe: 1, serieNFe: 'NF', sequencialLoteNFe: 1 },
    }

    const res = await fetch(`${ENOTAS_API}/empresas`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + btoa(ENOTAS_KEY + ':'),
      },
      body: JSON.stringify(payload),
    })

    const result = await res.json()
    if (!res.ok) return new Response(JSON.stringify({ error: 'Erro eNotas', detalhe: result }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } })

    // Salvar empresaId da eNotas no banco
    await sb.from('companies').update({ enotas_empresa_id: result.id }).eq('id', company_id)

    return new Response(JSON.stringify({ ok: true, enotas_empresa_id: result.id }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } })

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
