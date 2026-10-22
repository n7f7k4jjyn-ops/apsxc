// One function per demo employee, ten employees for each registration function.
const functions = ['Caixa','Bar','Limpeza','Segurança','Cozinha','Bombeiro']
export function testStaff(createdAt = new Date().toISOString()) {
  return Array.from({length:60},(_,index)=>{
    const number=String(index+1).padStart(2,'0')
    return {id:`team-test-${number}`,name:`Funcionário Teste ${number}`,whatsapp:'',pixKey:'',roles:[functions[Math.floor(index/10)]],availability:['Quinta-feira','Sexta-feira','Sábado','Domingo'],source:'test',testStaffVersion:2,createdAt}
  })
}
export function testStaffChanges(existing) {
  const byId=new Map(existing.map(row=>[row.id,row]))
  const insert=[],update=[]
  for(const member of testStaff()) {
    const previous=byId.get(member.id)
    if(!previous)insert.push(member)
    else if(previous.source==='test' && previous.testStaffVersion!==2)update.push({...previous,roles:member.roles,testStaffVersion:2})
  }
  return {insert,update}
}
