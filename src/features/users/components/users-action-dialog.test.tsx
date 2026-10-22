import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, type RenderResult } from 'vitest-browser-react'
import { type UserEvent, userEvent } from 'vitest/browser'
import { showSubmittedData } from '@/lib/show-submitted-data'
import { type User } from '../data/schema'
import { UsersActionDialog } from './users-action-dialog'

const VALIDATION_MESSAGES = {
  firstName: 'Informe o nome.',
  lastName: 'Informe o sobrenome.',
  username: 'Informe o nome de usuário.',
  phoneNumber: 'Informe o telefone.',
  email: 'Informe o e-mail.',
  role: 'Selecione uma permissão.',
  password: 'Informe uma senha.',
  passwordMismatch: 'As senhas não coincidem.',
  passwordLength: 'A senha deve ter pelo menos 8 caracteres.',
  passwordNumber: 'A senha deve conter pelo menos um número.',
  passwordLowercase: 'A senha deve conter pelo menos uma letra minúscula.',
} as const

const MOCK_USER: User = {
  id: 'alex_uuid',
  firstName: 'Alex',
  lastName: 'Smith',
  username: 'alex_smith',
  email: 'alex@smith.com',
  phoneNumber: '+19999999999',
  status: 'active',
  role: 'superadmin',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-02-02'),
}

vi.mock('@/lib/show-submitted-data', () => ({ showSubmittedData: vi.fn() }))

describe('UsersActionDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('add user', () => {
    it('renders title and description', async () => {
      const { getByRole, getByText } = await render(
        <UsersActionDialog open onOpenChange={vi.fn()} />
      )

      const title = getByRole('heading', {
        level: 2,
        name: /Adicionar pessoa à equipe/i,
      })
      const description = getByText(
        /Cadastre uma nova pessoa\. Salve para concluir\./i
      )

      await expect.element(title).toBeInTheDocument()
      await expect.element(description).toBeInTheDocument()
    })

    it('shows validation messages when the form is submitted with empty fields', async () => {
      const { getByRole, getByText } = await render(
        <UsersActionDialog open onOpenChange={vi.fn()} />
      )

      const submitButton = getByRole('button', { name: /Salvar alterações/i })
      await userEvent.click(submitButton)

      await expect
        .element(getByText(VALIDATION_MESSAGES.firstName))
        .toBeInTheDocument()
      await expect
        .element(getByText(VALIDATION_MESSAGES.lastName))
        .toBeInTheDocument()
      await expect
        .element(getByText(VALIDATION_MESSAGES.username))
        .toBeInTheDocument()
      await expect
        .element(getByText(VALIDATION_MESSAGES.phoneNumber))
        .toBeInTheDocument()
      await expect
        .element(getByText(VALIDATION_MESSAGES.email))
        .toBeInTheDocument()
      await expect
        .element(getByText(VALIDATION_MESSAGES.role))
        .toBeInTheDocument()
      await expect
        .element(getByText(VALIDATION_MESSAGES.password))
        .toBeInTheDocument()
    })

    it('keeps confirm password disabled until password field is touched', async () => {
      const { getByRole } = await render(
        <UsersActionDialog open onOpenChange={vi.fn()} />
      )

      const password = getByRole('textbox', { name: /^Senha$/i })
      const confirmPassword = getByRole('textbox', {
        name: /Confirmar senha/i,
      })
      await expect.element(confirmPassword).toBeDisabled()

      await userEvent.type(password, 'a')
      await expect.element(confirmPassword).toBeEnabled()
    })

    it('shows password validation messages when password is invalid', async () => {
      const { getByRole, getByText } = await render(
        <UsersActionDialog open onOpenChange={vi.fn()} />
      )

      const password = getByRole('textbox', { name: /^Senha$/i })
      const confirmPassword = getByRole('textbox', {
        name: /Confirmar senha/i,
      })
      await userEvent.type(password, 'a')
      await userEvent.type(confirmPassword, 'b')
      const submitButton = getByRole('button', { name: /Salvar alterações/i })

      await userEvent.click(submitButton)

      await expect
        .element(getByText(VALIDATION_MESSAGES.passwordMismatch))
        .toBeInTheDocument()

      await userEvent.fill(password, 'short')

      await expect
        .element(getByText(VALIDATION_MESSAGES.passwordLength))
        .toBeInTheDocument()

      await userEvent.fill(password, 'ONLYUPPERCASE')

      await expect
        .element(getByText(VALIDATION_MESSAGES.passwordLowercase))
        .toBeInTheDocument()

      await userEvent.fill(password, 'onlylowercase')

      await expect
        .element(getByText(VALIDATION_MESSAGES.passwordNumber))
        .toBeInTheDocument()

      await userEvent.fill(password, 'S3cur3P@ssw0rd')
      await userEvent.fill(confirmPassword, 'S3cur3P@ssw0rd')

      await expect
        .element(getByText(VALIDATION_MESSAGES.passwordMismatch))
        .not.toBeInTheDocument()
      await expect
        .element(getByText(VALIDATION_MESSAGES.passwordLength))
        .not.toBeInTheDocument()
      await expect
        .element(getByText(VALIDATION_MESSAGES.passwordNumber))
        .not.toBeInTheDocument()
    })

    it('shows the submitted data when the form is submitted successfully', async () => {
      const onOpenChange = vi.fn()

      const screen = await render(
        <UsersActionDialog open onOpenChange={onOpenChange} />
      )

      await fillRequiredProfileFields(userEvent, screen, MOCK_USER)

      await fillPasswords(userEvent, screen, 'S3cur3P@ssw0rd', 'S3cur3P@ssw0rd')

      const submitButton = screen.getByRole('button', { name: /Salvar alterações/i })
      await userEvent.click(submitButton)

      expect(onOpenChange).toHaveBeenCalledOnce()
      expect(onOpenChange).toHaveBeenCalledWith(false)

      expect(showSubmittedData).toHaveBeenCalledOnce()
      expect(showSubmittedData).toHaveBeenCalledWith({
        firstName: MOCK_USER.firstName,
        lastName: MOCK_USER.lastName,
        username: MOCK_USER.username,
        email: MOCK_USER.email,
        role: MOCK_USER.role,
        phoneNumber: MOCK_USER.phoneNumber,
        password: 'S3cur3P@ssw0rd',
        confirmPassword: 'S3cur3P@ssw0rd',
        isEdit: false,
      })
    })
  })

  describe('edit user', () => {
    it('renders title and description', async () => {
      const { getByRole, getByText } = await render(
        <UsersActionDialog open onOpenChange={vi.fn()} currentRow={MOCK_USER} />
      )

      const title = getByRole('heading', {
        level: 2,
        name: /Editar pessoa/i,
      })
      const description = getByText(
        /Atualize os dados desta pessoa\. Salve para concluir\./i
      )

      await expect.element(title).toBeInTheDocument()
      await expect.element(description).toBeInTheDocument()
    })

    it('submits without password changes', async () => {
      const onOpenChange = vi.fn()
      const screen = await render(
        <UsersActionDialog
          open
          onOpenChange={onOpenChange}
          currentRow={MOCK_USER}
        />
      )

      const submitButton = screen.getByRole('button', { name: /Salvar alterações/i })
      await userEvent.click(submitButton)

      expect(onOpenChange).toHaveBeenCalledOnce()
      expect(onOpenChange).toHaveBeenCalledWith(false)

      expect(showSubmittedData).toHaveBeenCalledOnce()
      expect(showSubmittedData).toHaveBeenCalledWith({
        firstName: MOCK_USER.firstName,
        lastName: MOCK_USER.lastName,
        username: MOCK_USER.username,
        email: MOCK_USER.email,
        phoneNumber: MOCK_USER.phoneNumber,
        role: MOCK_USER.role,
        password: '',
        confirmPassword: '',
        isEdit: true,
      })
    })

    it('requires confirm password when password is changed', async () => {
      const { getByRole, getByText } = await render(
        <UsersActionDialog open onOpenChange={vi.fn()} currentRow={MOCK_USER} />
      )

      const password = getByRole('textbox', { name: /^Senha$/i })
      const confirmPassword = getByRole('textbox', {
        name: /Confirmar senha/i,
      })

      await userEvent.fill(password, 'S3cur3P@ssw0rd')
      await expect.element(confirmPassword).toBeEnabled()

      const submitButton = getByRole('button', { name: /Salvar alterações/i })
      await userEvent.click(submitButton)

      await expect
        .element(getByText(VALIDATION_MESSAGES.passwordMismatch))
        .toBeInTheDocument()
    })

    it('shows the submitted data when the form is submitted successfully', async () => {
      const onOpenChange = vi.fn()
      const screen = await render(
        <UsersActionDialog
          open
          onOpenChange={onOpenChange}
          currentRow={MOCK_USER}
        />
      )

      const EDIT_SUCCESS_FIRST_NAME = 'John'
      const EDIT_SUCCESS_PASSWORD = 'S3cur3P@ssw0rd'

      await userEvent.fill(
        screen.getByPlaceholder('Ex.: Ana'),
        EDIT_SUCCESS_FIRST_NAME
      )
      await fillPasswords(
        userEvent,
        screen,
        EDIT_SUCCESS_PASSWORD,
        EDIT_SUCCESS_PASSWORD
      )

      const submitButton = screen.getByRole('button', { name: /Salvar alterações/i })
      await userEvent.click(submitButton)

      expect(onOpenChange).toHaveBeenCalledOnce()
      expect(onOpenChange).toHaveBeenCalledWith(false)

      expect(showSubmittedData).toHaveBeenCalledOnce()
      expect(showSubmittedData).toHaveBeenCalledWith({
        firstName: EDIT_SUCCESS_FIRST_NAME,
        lastName: MOCK_USER.lastName,
        username: MOCK_USER.username,
        email: MOCK_USER.email,
        phoneNumber: MOCK_USER.phoneNumber,
        role: MOCK_USER.role,
        password: EDIT_SUCCESS_PASSWORD,
        confirmPassword: EDIT_SUCCESS_PASSWORD,
        isEdit: true,
      })
    })
  })
})

async function fillRequiredProfileFields(
  user: UserEvent,
  screen: RenderResult,
  overrides?: {
    firstName?: string
    lastName?: string
    username?: string
    email?: string
    roleOption?: string | RegExp
    phoneNumber?: string
  }
) {
  const entries = [
    ['Ex.: Ana', overrides?.firstName ?? 'John'],
    ['Ex.: Souza', overrides?.lastName ?? 'Doe'],
    ['ana.souza', overrides?.username ?? 'john_doe'],
    ['nome.sobrenome@exemplo.com', overrides?.email ?? 'a@b.co'],
    ['(41) 99999-9999', overrides?.phoneNumber ?? '+19999999999'],
  ] as const

  for (const [label, value] of entries) {
    const el = screen.getByPlaceholder(label)
    await expect.element(el).toBeInTheDocument()
    await user.fill(el, value)
  }

  const roleSelect = screen.getByRole('combobox', { name: /Permissão/i })
  await user.click(roleSelect)
  await user.click(
    screen.getByRole('option', { name: overrides?.roleOption ?? 'Superadministrador' })
  )
}

async function fillPasswords(
  user: UserEvent,
  screen: RenderResult,
  a: string,
  b: string
) {
  const password = screen.getByPlaceholder('Digite uma senha segura')
  const confirmPassword = screen.getByPlaceholder('Digite a senha novamente')
  await user.fill(password, a)
  await user.fill(confirmPassword, b)
}
