import { registryIdentity } from './registry.mjs'
export const rosterPosts = ['Saída principal','Revista','Apoio','LAND - Pista','SKY - Pista','SKY - Escada','Bombeiro - Entrada','Bombeiro - Saída','Saída de emergência','Terraço','VIP','Mezanino','Ronda']
export const rosterRoles = ['Caixa','Caixa-Bar','Chapelaria','Encarregado Bar','Líder de Bar','Bar','Limpeza','Segurança','Líder de Segurança','Cozinha','Bombeiro']
export const teamStatus = (row, operations) => operations.teamStatuses?.[registryIdentity(row)]?.status || (row.source === 'test' ? 'active' : 'pending')
const fail = (message, status=400) => { throw Object.assign(new Error(message),{status}) }
const clean = (v,max=160) => typeof v === 'string' && v.length<=max && !/[\u0000-\u001f\u007f]/.test(v) ? v.trim() : ''
export function validateRoster(value, team, operations, events) {
  if (!value || !['security','staff'].includes(value.kind) || !['draft','finalized'].includes(value.status) || ![1,2,3,4].includes(value.template)) fail('Tipo, status ou template inválido.')
  const date = clean(value.date,10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date+'T12:00:00Z')) || new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date) fail('Informe uma data válida.')
  const eventId = clean(value.eventId,100)
  const event = eventId ? events.find(row=>row.id===eventId) : null
  if (eventId && (!event || event.date!==date)) fail('O evento deve corresponder à data da escala.')
  if (!Array.isArray(value.entries) || value.entries.length>300 || (value.status==='finalized' && !value.entries.length)) fail('Adicione profissionais antes de finalizar (máximo de 300).')
  const seen = new Set()
  const entries = value.entries.map(row=>{
    if (!row || typeof row !== 'object') fail('Profissional inválido.')
    const person = team.find(p=>p.id===row.memberId)
    if (!person || teamStatus(person,operations)!=='active') fail('Selecione somente profissionais ativos. Atualize a equipe e tente novamente.',409)
    if (seen.has(person.id)) fail('Um profissional não pode aparecer duas vezes. Selecione vários postos no mesmo cadastro.')
    seen.add(person.id)
    if (!rosterRoles.includes(row.role) || (value.kind==='security' ? !['Segurança','Líder de Segurança','Bombeiro'].includes(row.role) : ['Segurança','Líder de Segurança','Bombeiro'].includes(row.role))) fail('Função incompatível com o tipo da escala.')
    const role = ['Caixa-Bar','Chapelaria'].includes(row.role) ? 'Caixa' : ['Encarregado Bar','Líder de Bar'].includes(row.role) ? 'Bar' : row.role.startsWith('Líder de Segurança') ? 'Segurança' : row.role
    if (!person.roles?.includes(role)) fail(`${person.name} não possui a função escolhida no cadastro.`)
    if (!Array.isArray(row.posts) || row.posts.length>rosterPosts.length+1 || row.posts.some(p=>!rosterPosts.includes(p==='Porta' ? 'Revista' : p))) fail('Posto inválido.')
    const entry = clean(row.entry,5), exit = clean(row.exit,5)
    const validTime = time => /^([01]\d|2[0-3]):[0-5]\d$/.test(time)
    if ((entry && !validTime(entry)) || (exit && !validTime(exit)) || (entry && entry===exit) || (value.status==='finalized' && (!entry || !exit))) fail('Informe horários de entrada e saída diferentes e válidos.')
    const exitDate = !entry || !exit ? '' : exit<entry ? new Date(Date.parse(date+'T12:00:00Z')+86400000).toISOString().slice(0,10) : date
    return {memberId:person.id,name:person.name,role:row.role,posts:[...new Set(row.posts.map(p=>p==='Porta' ? 'Revista' : p))],availability:[...(person.availability || [])],entry,exit,exitDate}
  })
  return {kind:value.kind,status:value.status,template:value.template,date,eventId,eventName:event?.name || 'Verdant CWB',entries}
}
