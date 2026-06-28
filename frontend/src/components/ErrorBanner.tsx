interface Props {
  message: string
}

export function ErrorBanner({ message }: Props) {
  return (
    <div
      style={{
        background: '#fef2f2',
        border: '1px solid #fca5a5',
        borderRadius: 6,
        padding: '10px 14px',
        marginBottom: 12,
        color: '#991b1b',
        fontSize: 14,
      }}
    >
      {message}
    </div>
  )
}
