
type AuthLayoutProps = {
  children: React.ReactNode
  variant?: 'default' | 'login'
}

export function AuthLayout({ children, variant = 'default' }: AuthLayoutProps) {
  const isLogin = variant === 'login'

  return (
    <div className={`container relative grid ${isLogin ? 'min-h-svh py-4 verdant-login-page' : 'h-svh'} max-w-none items-center justify-center`}>
      <div className={`mx-auto flex w-full flex-col justify-center space-y-2 py-8 sm:p-8 ${isLogin ? 'max-w-5xl py-2 sm:py-3 verdant-login-content' : ''}`}>
        <div className={`flex items-center justify-center ${isLogin ? 'mb-2 verdant-login-brand' : 'mb-4'}`}>
          <img src='/images/verdant-logo-colorida.webp' width={640} height={349} alt='Verdant' className={`${isLogin ? 'h-20' : 'h-16'} w-auto object-contain`} />
        </div>
        {children}
      </div>
    </div>
  )
}

