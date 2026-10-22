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

describe('FinancePage', () => {
  it('restricts non-admin users without fetching financial data', async () => {
    auth.role = ['manager']
    const screen = await render(<FinancePage />)
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
    const screen = await render(<FinancePage />)
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
    const screen = await render(<FinancePage />)
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
    const screen = await render(<FinancePage />)
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
    const screen = await render(<FinancePage />)
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
    const screen = await render(<FinancePage />)
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
    const screen = await render(<FinancePage />)
    await expect
      .element(screen.getByRole('button', { name: 'Novo lançamento' }))
      .toBeEnabled()
    await userEvent.fill(screen.getByLabelText('Data inicial'), '2026-10-01')
    await userEvent.fill(screen.getByLabelText('Data final'), '2026-10-31')
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
    const screen = await render(<FinancePage />)
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
    const screen = await render(<FinancePage />)
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

  it('reloads conflicts without retrying the mutation and blocks reapplication until review', async () => {
    let gets = 0
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method) return json({ error: 'Conflito' }, 409)
      gets++
      return json({ ...data(), revision: gets })
    })
    const screen = await render(<FinancePage />)
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
