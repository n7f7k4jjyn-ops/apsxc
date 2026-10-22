export function ScopeConnectAttribution() {
  return (
    <div className='mx-2 flex flex-col items-center gap-1 border-t border-sidebar-border px-2 pt-3 pb-1 text-center'>
      <a href='https://www.instagram.com/scope.deal' target='_blank' rel='noreferrer' aria-label='Scope Connect no Instagram'>
        <img
          src='/images/scope-connect-colorida.webp'
          width={512}
          height={139}
          loading='lazy'
          decoding='async'
          alt='Scope Connect'
          className='h-auto w-[82px] object-contain opacity-90'
        />
      </a>
      <span className='text-[9px] leading-tight text-sidebar-foreground/55'>Desenvolvido por @scope.deal</span>
    </div>
  )
}
