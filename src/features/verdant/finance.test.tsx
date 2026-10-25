import {
  createRootRoute,
  createRouter,
  createMemoryHistory,
  RouterProvider,
} from '@tanstack/react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { FinancePage } from './finance'
import {
  financeTemplate,
  type FinanceData,
  type FinanceEntry,
} from './finance-data'

const auth = vi.hoisted(() => ({ role: ['admin'] }))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ auth: { user: auth } }),
}))

const entry: FinanceEntry = {
  id: 'finance-1',
  externalId: '',
  type: 'payable',
  category: 'general',
  description: 'Aluguel do espaço',
  counterparty: 'Fornecedor local',
  beneficiaryId: '',
  eventId: '',
  amountCents: 12345,
  dueDate: '2026-10-25',
  status: 'pending',
  settledDate: '',
  paymentMethod: '',
  notes: 'Contrato',
  createdAt: '2026-10-01T12:00:00Z',
  updatedAt: '2026-10-01T12:00:00Z',
  history: [
    { action: 'created', actor: 'Administrador', at: '2026-10-01T12:00:00Z' },
  ],
}
const data = (): FinanceData => ({
  revision: 1,
  entries: [{ ...entry }],
  beneficiaries: [
    { id: 'team:1', name: 'Ana', kind: 'team', pixKey: 'pix-privado' },
  ],
  events: [{ id: 'event:1', name: 'Festa de outubro', date: '2026-10-25' }],
})
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  auth.role = ['admin']
  fetchMock = vi.fn().mockResolvedValue(json(data()))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

async function selectCsv(text: string) {
  const input = document.querySelector<HTMLInputElement>('#finance-file')!
  const transfer = new DataTransfer()
  transfer.items.add(new File([text], 'contas.csv', { type: 'text/csv' }))
  input.files = transfer.files
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

async function renderFinance() {
  const routeTree = createRootRoute({ component: FinancePage })
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  return render(<RouterProvider router={router} />)
}

describe('FinancePage', () => {
  it('restricts non-admin users without fetching financial data', async () => {
    auth.role = ['manager']
    const screen = await renderFinance()
    await expect
      .element(screen.getByText('Acesso restrito a administradores.'))
      .toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
    await expect
      .element(screen.getByRole('button', { name: 'Novo lançamento' }))
      .not.toBeInTheDocument()
  })

  it('does not show confirmed zero balances or enable mutations after load failure', async () => {
    fetchMock.mockResolvedValue(json({ error: 'Indisponível' }, 500))
    const screen = await renderFinance()
    await expect
      .element(
        screen.getByText(
          'Não há saldo confirmado. Operações bloqueadas até atualizar.'
        )
      )
      .toBeInTheDocument()
    await expect
      .element(screen.getByRole('button', { name: 'Novo lançamento' }))
      .toBeDisabled()
    await expect
      .element(screen.getByRole('heading', { name: 'Caixa registrado' }))
      .not.toBeInTheDocument()
    await expect
      .element(screen.getByText('R$ 0,00', { exact: true }))
      .not.toBeInTheDocument()
  })

  it('rejects malformed GET data without rendering a broken ledger', async () => {
    fetchMock.mockResolvedValue(
      json({ revision: 1, entries: [], beneficiaries: null, events: [] })
    )
    const screen = await renderFinance()
    await expect
      .element(
        screen.getByText(
          'Resposta financeira inválida. Saldos não confirmados.'
        )
      )
      .toBeInTheDocument()
    await expect
      .element(screen.getByRole('button', { name: 'Novo lançamento' }))
      .toBeDisabled()
    await expect
      .element(screen.getByRole('button', { name: 'Exportar CSV' }))
      .toBeDisabled()
  })

  it('reports unsafe totals and disables operations instead of crashing render', async () => {
    fetchMock.mockResolvedValue(
      json({
        ...data(),
        entries: [
          { ...entry, amountCents: Number.MAX_SAFE_INTEGER },
          { ...entry, id: 'finance-2', amountCents: Number.MAX_SAFE_INTEGER },
        ],
      })
    )
    const screen = await renderFinance()
    await expect
      .element(screen.getByText(/Relatório indisponível:/))
      .toBeInTheDocument()
    await expect
      .element(screen.getByRole('heading', { name: 'Caixa registrado' }))
      .not.toBeInTheDocument()
    await expect
      .element(screen.getByRole('button', { name: 'Novo lançamento' }))
      .toBeDisabled()
    await expect
      .element(screen.getByRole('button', { name: 'Exportar CSV' }))
      .toBeDisabled()
  })

  it('disables mutations and export for an invalid report period', async () => {
    const screen = await renderFinance()
    await expect
      .element(screen.getByRole('button', { name: 'Novo lançamento' }))
      .toBeEnabled()
    await userEvent.click(screen.getByText(/^Período:/))
    await userEvent.fill(
      screen.getByRole('textbox', { name: 'Data inicial' }),
      '2026-10-31'
    )
    await userEvent.fill(
      screen.getByRole('textbox', { name: 'Data final' }),
      '2026-10-01'
    )
    await expect
      .element(screen.getByText(/Relatório indisponível:/))
      .toBeInTheDocument()
    await expect
      .element(screen.getByRole('button', { name: 'Novo lançamento' }))
      .toBeDisabled()
    await expect
      .element(screen.getByRole('button', { name: 'Exportar CSV' }))
      .toBeDisabled()
  })

  it('preserves a manual id after an unknown mutation result and requires review before reapplying', async () => {
    let latest = data()
    const posts: { revision: number; entries: FinanceEntry[] }[] = []
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (!init?.method) return json(latest)
      const body = JSON.parse(init.body as string)
      posts.push(body)
      if (posts.length === 1) {
        latest = {
          ...latest,
          revision: 2,
          entries: [
            ...latest.entries,
            { ...entry, ...body.entries[0], id: 'saved-but-response-lost' },
          ],
        }
        throw new TypeError('Failed to fetch')
      }
      return json({ ...latest, imported: 0, skipped: 1 })
    })
    const screen = await renderFinance()
    await userEvent.click(
      screen.getByRole('button', { name: 'Novo lançamento' })
    )
    const id = screen.getByLabelText('ID externo (automático)')
    await expect.element(id).toHaveAttribute('readonly')
    await userEvent.fill(
      screen.getByLabelText('Descrição', { exact: true }),
      'Registro seguro'
    )
    await userEvent.fill(
      screen.getByLabelText('Favorecido / contraparte'),
      'Loja'
    )
    await userEvent.fill(
      screen.getByLabelText('Valor (R$)', { exact: true }),
      '50,00'
    )
    await userEvent.fill(
      screen.getByLabelText('Vencimento', { exact: true }),
      '2026-10-25'
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Salvar lançamento' })
    )
    await expect
      .element(
        screen.getByRole('button', {
          name: 'Revisar versão atual do formulário',
        })
      )
      .toBeEnabled()
    expect(posts).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(posts[0].entries[0].externalId).toMatch(/^manual:/)
    await expect
      .element(screen.getByRole('button', { name: 'Salvar lançamento' }))
      .toBeDisabled()
    await userEvent.click(
      screen.getByRole('button', { name: 'Revisar versão atual do formulário' })
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Salvar lançamento' })
    )
    await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument()
    expect(posts).toHaveLength(2)
    expect(posts[1].entries[0].externalId).toBe(posts[0].entries[0].externalId)
    expect(posts[1].revision).toBe(2)
  })

  it('creates a localized manual account only on explicit save', async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (!init?.method) return json(data())
      const body = JSON.parse(init.body as string)
      return json({
        revision: 2,
        entries: [{ ...entry, ...body.entries[0], id: 'new' }],
        imported: 1,
        skipped: 0,
      })
    })
    const screen = await renderFinance()
    await userEvent.click(
      screen.getByRole('button', { name: 'Novo lançamento' })
    )
    await userEvent.fill(
      screen.getByLabelText('Descrição', { exact: true }),
      'Compra de materiais'
    )
    await userEvent.fill(
      screen.getByLabelText('Favorecido / contraparte'),
      'Loja'
    )
    await userEvent.fill(
      screen.getByLabelText('Valor (R$)', { exact: true }),
      '1.234,56'
    )
    await userEvent.fill(
      screen.getByLabelText('Vencimento', { exact: true }),
      '2026-10-25'
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await userEvent.click(
      screen.getByRole('button', { name: 'Salvar lançamento' })
    )
    await expect
      .element(
        screen.getByRole('button', { name: 'Detalhes de Compra de materiais' })
      )
      .toBeInTheDocument()
    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe('/api/finance')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toMatchObject({
      revision: 1,
      entries: [
        {
          description: 'Compra de materiais',
          amountCents: 123456,
          status: 'pending',
          dueDate: '2026-10-25',
        },
      ],
    })
  })

  it('settles an existing account preserving financial fields and requires date and method', async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (!init?.method) return json(data())
      const body = JSON.parse(init.body as string)
      return json({ revision: 2, entries: [{ ...entry, ...body }] })
    })
    const screen = await renderFinance()
    await userEvent.click(
      screen.getByRole('button', { name: 'Baixar Aluguel do espaço' })
    )
    await expect
      .element(screen.getByRole('heading', { name: 'Registrar baixa' }))
      .toBeInTheDocument()
    await expect
      .element(screen.getByText(/Administrador ·/))
      .toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('button', { name: 'Confirmar baixa' })
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await userEvent.fill(screen.getByLabelText('Data da baixa'), '2026-10-22')
    await userEvent.selectOptions(
      screen.getByLabelText('Forma de pagamento'),
      'pix'
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Confirmar baixa' })
    )
    await expect
      .element(
        screen.getByRole('button', { name: 'Reabrir Aluguel do espaço' })
      )
      .toBeInTheDocument()
    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe('/api/finance/finance-1')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body)).toMatchObject({
      revision: 1,
      description: entry.description,
      amountCents: 12345,
      dueDate: entry.dueDate,
      status: 'settled',
      settledDate: '2026-10-22',
      paymentMethod: 'pix',
      notes: 'Contrato',
    })
  })

  it('keeps settled fields read-only and explicitly reopens without changing their values', async () => {
    const settled = {
      ...entry,
      status: 'settled' as const,
      settledDate: '2026-10-22',
      paymentMethod: 'pix' as const,
    }
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (!init?.method) return json({ ...data(), entries: [settled] })
      const body = JSON.parse(init.body as string)
      return json({ revision: 2, entries: [{ ...settled, ...body }] })
    })
    const screen = await renderFinance()
    await userEvent.click(
      screen.getByRole('button', { name: 'Detalhes de Aluguel do espaço' })
    )
    await expect
      .element(screen.getByLabelText('Valor (R$)', { exact: true }))
      .toBeDisabled()
    await expect
      .element(screen.getByRole('button', { name: 'Salvar lançamento' }))
      .not.toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('button', { name: 'Fechar formulário' })
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Reabrir Aluguel do espaço' })
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await userEvent.click(
      screen.getByRole('button', { name: 'Confirmar reabertura' })
    )
    await expect
      .element(screen.getByRole('button', { name: 'Baixar Aluguel do espaço' }))
      .toBeInTheDocument()
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      status: 'pending',
      amountCents: settled.amountCents,
      description: settled.description,
      counterparty: settled.counterparty,
      settledDate: '',
      paymentMethod: '',
    })
  })

  it('shows selected beneficiary Pix only to the administrator and creates team payables', async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (!init?.method) return json(data())
      return json({ revision: 2, entries: [entry], imported: 1, skipped: 0 })
    })
    const screen = await renderFinance()
    await expect
      .element(screen.getByText(/pix-privado/))
      .not.toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('button', { name: 'Novo lançamento' })
    )
    await userEvent.selectOptions(
      screen.getByLabelText('Categoria', { exact: true }),
      'team'
    )
    await userEvent.selectOptions(
      screen.getByLabelText('Beneficiário', { exact: true }),
      'team:1'
    )
    await expect
      .element(screen.getByText(/Pix do beneficiário selecionado: pix-privado/))
      .toBeInTheDocument()
    await expect
      .element(screen.getByLabelText('Favorecido / contraparte'))
      .toHaveValue('Ana')
    await userEvent.fill(
      screen.getByLabelText('Descrição', { exact: true }),
      'Diária'
    )
    await userEvent.fill(
      screen.getByLabelText('Valor (R$)', { exact: true }),
      '200,00'
    )
    await userEvent.fill(
      screen.getByLabelText('Vencimento', { exact: true }),
      '2026-10-25'
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Salvar lançamento' })
    )
    await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument()
    expect(
      JSON.parse(fetchMock.mock.calls[1][1].body).entries[0]
    ).toMatchObject({
      category: 'team',
      type: 'payable',
      counterparty: 'Ana',
      beneficiaryId: 'team:1',
    })
    expect(fetchMock.mock.calls[1][1].body).not.toContain('pix-privado')
  })

  it('reopens a cancelled account without claiming a bank reversal', async () => {
    const cancelled = { ...entry, status: 'cancelled' as const }
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (!init?.method) return json({ ...data(), entries: [cancelled] })
      return json({
        revision: 2,
        entries: [{ ...cancelled, ...JSON.parse(init.body as string) }],
      })
    })
    const screen = await renderFinance()
    await userEvent.click(
      screen.getByRole('button', { name: 'Reabrir Aluguel do espaço' })
    )
    await expect
      .element(
        screen.getByRole('heading', { name: 'Reabrir lançamento cancelado' })
      )
      .toBeInTheDocument()
    await expect
      .element(screen.getByText(/Nenhum estorno bancário será realizado/))
      .toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await userEvent.click(
      screen.getByRole('button', { name: 'Confirmar reabertura' })
    )
    await expect
      .element(screen.getByRole('button', { name: 'Baixar Aluguel do espaço' }))
      .toBeInTheDocument()
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      status: 'pending',
      settledDate: '',
      paymentMethod: '',
      amountCents: cancelled.amountCents,
    })
  })

  it('preserves historical person and event references missing from current options', async () => {
    const historical = {
      ...entry,
      category: 'team' as const,
      beneficiaryId: 'team:historical',
      counterparty: 'Pessoa histórica',
      eventId: 'event:historical',
    }
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (!init?.method) return json({ ...data(), entries: [historical] })
      return json({
        revision: 2,
        entries: [{ ...historical, ...JSON.parse(init.body as string) }],
      })
    })
    const screen = await renderFinance()
    await userEvent.click(
      screen.getByRole('button', { name: 'Detalhes de Aluguel do espaço' })
    )
    const beneficiary = screen.getByLabelText('Beneficiário', { exact: true })
    const event = screen.getByLabelText('Vincular evento (opcional)')
    await expect.element(beneficiary).toHaveValue('team:historical')
    await expect.element(event).toHaveValue('event:historical')
    await expect
      .element(
        screen.getByRole('option', {
          name: 'Pessoa histórica · team:historical (cadastro histórico indisponível)',
        })
      )
      .toBeInTheDocument()
    await expect
      .element(
        screen.getByRole('option', {
          name: 'Evento histórico · event:historical (fora do cadastro)',
        })
      )
      .toBeInTheDocument()
    await userEvent.selectOptions(beneficiary, 'team:1')
    await userEvent.selectOptions(beneficiary, 'team:historical')
    await expect
      .element(screen.getByLabelText('Favorecido / contraparte'))
      .toHaveValue('Pessoa histórica')
    await userEvent.fill(
      screen.getByLabelText('Descrição', { exact: true }),
      'Diária histórica corrigida'
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Salvar lançamento' })
    )
    await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument()
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      beneficiaryId: historical.beneficiaryId,
      eventId: historical.eventId,
      counterparty: historical.counterparty,
      description: 'Diária histórica corrigida',
    })
  })

  it('uses due dates in the ledger and settlement dates in cash reports', async () => {
    fetchMock.mockResolvedValue(
      json({
        ...data(),
        entries: [
          {
            ...entry,
            status: 'settled',
            dueDate: '2026-09-01',
            settledDate: '2026-10-22',
            paymentMethod: 'cash',
          },
        ],
      })
    )
    const screen = await renderFinance()
    await expect
      .element(screen.getByRole('button', { name: 'Novo lançamento' }))
      .toBeEnabled()
    await userEvent.click(screen.getByText(/^Período:/))
    await userEvent.fill(
      screen.getByRole('textbox', { name: 'Data inicial' }),
      '2026-10-01'
    )
    await userEvent.fill(
      screen.getByRole('textbox', { name: 'Data final' }),
      '2026-10-31'
    )
    await expect
      .element(
        screen.getByRole('button', { name: 'Detalhes de Aluguel do espaço' })
      )
      .not.toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('button', { name: 'Caixa / relatório' })
    )
    await expect
      .element(
        screen.getByRole('button', { name: 'Detalhes de Aluguel do espaço' })
      )
      .toBeInTheDocument()
  })

  it('previews CSV without posting and imports only after confirmation', async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (!init?.method) return json(data())
      return json({ revision: 2, entries: [entry], imported: 1, skipped: 0 })
    })
    const screen = await renderFinance()
    await userEvent.click(
      screen.getByText('Importar dados · Produção, equipe e financeiro', {
        exact: true,
      })
    )
    await expect
      .element(screen.getByRole('button', { name: 'Novo lançamento' }))
      .toBeEnabled()
    await selectCsv(financeTemplate())
    await expect
      .element(screen.getByRole('heading', { name: 'Prévia: 1 lançamento(s)' }))
      .toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(
      document.querySelector<HTMLInputElement>('#finance-file')!.value
    ).toBe('')
    await userEvent.click(
      screen.getByRole('button', { name: 'Confirmar importação' })
    )
    await expect
      .element(
        screen.getByText(
          '1 lançamento(s) incluído(s); 0 duplicado(s) ignorado(s).'
        )
      )
      .toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(
      JSON.parse(fetchMock.mock.calls[1][1].body).entries[0]
    ).toMatchObject({ externalId: 'planilha-001', amountCents: 15000 })
  })

  it('reports CSV line errors without changing or uploading the ledger', async () => {
    const screen = await renderFinance()
    await expect
      .element(screen.getByRole('button', { name: 'Novo lançamento' }))
      .toBeEnabled()
    await selectCsv(
      'id_externo;tipo;descricao;favorecido;valor;vencimento\n1;pagar;Falha;Loja;abc;2026-10-25'
    )
    await expect
      .element(screen.getByText(/Linha 2: Valor inválido/))
      .toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await expect
      .element(
        screen.getByRole('button', { name: 'Detalhes de Aluguel do espaço' })
      )
      .toBeInTheDocument()
    await expect
      .element(screen.getByRole('button', { name: 'Confirmar importação' }))
      .not.toBeInTheDocument()
  })

  it('previews known historical duplicates alongside new valid rows without requiring archived references', async () => {
    const historical = {
      ...entry,
      externalId: 'old-csv-1',
      category: 'team' as const,
      beneficiaryId: 'team:archived',
      eventId: 'event:archived',
      counterparty: 'Pessoa arquivada',
    }
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (!init?.method) return json({ ...data(), entries: [historical] })
      const body = JSON.parse(init.body as string)
      return json({
        revision: 2,
        imported: 1,
        skipped: 1,
        entries: [
          historical,
          { ...entry, ...body.entries[1], id: 'new-csv-1' },
        ],
      })
    })
    const screen = await renderFinance()
    await userEvent.click(
      screen.getByText('Importar dados · Produção, equipe e financeiro', {
        exact: true,
      })
    )
    await expect
      .element(screen.getByRole('button', { name: 'Novo lançamento' }))
      .toBeEnabled()
    await selectCsv(
      [
        'id_externo;tipo;categoria;descricao;favorecido;valor;vencimento;evento_id;beneficiario_id',
        'old-csv-1;pagar;equipe;Histórico repetido;Pessoa arquivada;123,45;2026-10-25;event:archived;team:archived',
        'new-csv-1;receber;geral;Nova receita;Cliente;50,00;2026-10-25;event:1;',
      ].join('\n')
    )
    await expect
      .element(screen.getByRole('heading', { name: 'Prévia: 2 lançamento(s)' }))
      .toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await userEvent.click(
      screen.getByRole('button', { name: 'Confirmar importação' })
    )
    await expect
      .element(
        screen.getByText(
          '1 lançamento(s) incluído(s); 1 duplicado(s) ignorado(s).'
        )
      )
      .toBeInTheDocument()
    const body = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(body.entries[0]).toMatchObject({
      externalId: historical.externalId,
      beneficiaryId: historical.beneficiaryId,
      eventId: historical.eventId,
      description: historical.description,
    })
    expect(body.entries[1]).toMatchObject({
      externalId: 'new-csv-1',
      eventId: 'event:1',
      amountCents: 5000,
    })
  })

  it('still rejects new imported rows referencing an unknown event', async () => {
    const screen = await renderFinance()
    await expect
      .element(screen.getByRole('button', { name: 'Novo lançamento' }))
      .toBeEnabled()
    await selectCsv(
      'id_externo;tipo;descricao;favorecido;valor;vencimento;evento_id\nnew-csv-1;pagar;Nova conta;Loja;20,00;2026-10-25;event:unknown'
    )
    await expect
      .element(screen.getByText('Linha 2: evento_id não encontrado.'))
      .toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await expect
      .element(screen.getByRole('button', { name: 'Confirmar importação' }))
      .not.toBeInTheDocument()
  })

  it('reloads conflicts without retrying the mutation and blocks reapplication until review', async () => {
    let gets = 0
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method) return json({ error: 'Conflito' }, 409)
      gets++
      return json({ ...data(), revision: gets })
    })
    const screen = await renderFinance()
    await userEvent.click(
      screen.getByRole('button', { name: 'Cancelar Aluguel do espaço' })
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Confirmar cancelamento' })
    )
    await expect
      .element(screen.getByRole('button', { name: 'Confirmar cancelamento' }))
      .toBeDisabled()
    await userEvent.click(
      screen.getByRole('button', { name: 'Voltar', exact: true })
    )
    await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument()
    await expect
      .element(
        screen.getByRole('button', {
          name: 'Revisar dados atualizados antes de reaplicar',
        })
      )
      .toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(3)
    await expect
      .element(screen.getByRole('button', { name: 'Novo lançamento' }))
      .toBeDisabled()
    await userEvent.click(
      screen.getByRole('button', {
        name: 'Revisar dados atualizados antes de reaplicar',
      })
    )
    await expect
      .element(screen.getByRole('button', { name: 'Novo lançamento' }))
      .toBeEnabled()
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
