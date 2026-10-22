import {chromium} from 'playwright'
import assert from 'node:assert/strict'
import test from 'node:test'
import {mkdtemp,writeFile,rm} from 'node:fs/promises'
import {scryptSync} from 'node:crypto'
import {tmpdir} from 'node:os'
import {spawn} from 'node:child_process'
import {createServer} from 'node:net'
import {once} from 'node:events'
import {setTimeout as delay} from 'node:timers/promises'
test('roster creation, download, duplication, activation and compact public forms', {timeout:120000}, async()=>{
const listener=createServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));const base=`http://127.0.0.1:${port}`
const directory=await mkdtemp(tmpdir()+'/verdant-roster-ui-')
const salt=Buffer.from('local-roster-test-only')
const passwordHash=`scrypt$16384$8$1$${salt.toString('hex')}$${scryptSync('local-test-password',salt,64).toString('hex')}`
const env={...process.env,NODE_ENV:'test',PORT:String(port),VERDANT_USERS_JSON:JSON.stringify([{username:'qa-admin',passwordHash,role:'admin',active:true}])}
for(const key of ['DB_HOST','DB_NAME','DB_USER','DB_PASSWORD'])delete env[key]
for(const key of ['DATA','TASKS','PREFERENCES','TEAM_USERS','CHATS','CUSTOMERS','SESSIONS','INTEGRATIONS','JOB_APPLICATIONS','TEAM_REGISTRATIONS','OPERATIONS'])env[`VERDANT_${key}_FILE`]=`${directory}/${key}.json`
await writeFile(env.VERDANT_TEAM_REGISTRATIONS_FILE,JSON.stringify([{id:'team-qa1',name:'Ana Exemplo',whatsapp:'41999999999',roles:['Segurança'],source:'test',availability:['Domingo'],pixKey:'local@example.com',createdAt:'2026-10-17T12:00:00Z'},{id:'team-qa2',name:'Carlos Exemplo',whatsapp:'41999999998',roles:['Segurança'],source:'test',availability:['Sábado'],pixKey:'local2@example.com',createdAt:'2026-10-17T12:00:00Z'}]))
await writeFile(env.VERDANT_OPERATIONS_FILE,JSON.stringify({teamStatuses:{'ana exemplo|41999999999':{status:'active'},'carlos exemplo|41999999998':{status:'active'}},rosters:[]}))

const child=spawn(process.execPath,['server.mjs'],{env,stdio:['ignore','pipe','pipe']})
let browser
try {
 let ready=false
 for(let i=0;i<100;i++){try{const response=await fetch(base+'/api/health');if(response.ok){ready=true;break}}catch{}await delay(100)}
 assert.ok(ready,'Local test server must start')
browser=await chromium.launch({headless:true})
const context=await browser.newContext({viewport:{width:1440,height:1100}})
const login=await context.request.post(`${base}/api/auth/login`,{data:{username:'qa-admin',password:'local-test-password'}})
assert.equal(login.status(),200)
const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message))
await page.goto(`${base}/verdant/escalas`);await page.getByRole('button',{name:'Nova escala',exact:true}).click()
await page.getByLabel('Data',{exact:true}).fill('2026-10-18')
await page.getByLabel('Adicionar Segurança',{exact:true}).selectOption('team-qa1')
await page.getByText('Selecionar postos',{exact:true}).click()
await page.getByLabel('Revista',{exact:true}).check();await page.getByLabel('SKY - Pista',{exact:true}).check()
await page.getByLabel('Entrada',{exact:true}).fill('18:00');await page.getByLabel('Saída',{exact:true}).fill('04:00')
await page.getByLabel('Disponibilidade para adicionar',{exact:true}).selectOption('')
await page.getByLabel('Adicionar Segurança',{exact:true}).selectOption('team-qa2')
const second=page.locator('.roster-entry').filter({hasText:'Carlos Exemplo'})
await second.getByLabel('Entrada',{exact:true}).fill('19:00');await second.getByLabel('Saída',{exact:true}).fill('04:00')
await page.getByRole('button',{name:'Subir Carlos Exemplo',exact:true}).click()
assert.ok((await page.locator('.roster-entry').first().textContent()).includes('Carlos Exemplo'))

await page.setViewportSize({width:390,height:844});
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Mobile must not overflow')
await page.getByRole('button',{name:'Finalizar escala',exact:true}).click();await page.getByText('Escala finalizada e salva.',{exact:true}).waitFor()
const saved=await (await context.request.get(base+'/api/rosters')).json();assert.deepEqual(saved.rosters[0].entries.map(row=>row.memberId),['team-qa2','team-qa1'])
const download=page.waitForEvent('download');await page.getByRole('button',{name:'Gerar PDF do rascunho salvo',exact:true}).click();await (await download).saveAs(directory+'/roster.pdf')
await page.getByRole('button',{name:'Voltar',exact:true}).click();await page.getByRole('button',{name:'Duplicar',exact:true}).click();assert.equal(await page.getByLabel('Data',{exact:true}).inputValue(),'')
await page.getByRole('button',{name:'Voltar',exact:true}).click()
await page.goto(`${base}/verdant/cadastros?category=team`);await page.getByLabel('Status de Ana Exemplo',{exact:true}).selectOption('inactive');await page.getByLabel('Status de Ana Exemplo',{exact:true}).selectOption('active')
for(const path of ['/equipe','/trabalhe-conosco','/lovers','/aniversario','/djs','/influencers','/vip']){await page.goto(base+path);await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Mobile overflow ${path}`)}
await page.goto(`${base}/equipe`);;await page.setViewportSize({width:1440,height:1100});
assert.deepEqual(errors,[]);console.log('UI: create/finalize/PDF/duplicate/team activation + seven public forms mobile checks passed')
await browser.close()

} finally {if(browser)await browser.close();const exited=once(child,'exit');child.kill('SIGTERM');await exited;await rm(directory,{recursive:true,force:true})}
})
