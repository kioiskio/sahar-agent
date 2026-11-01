export default function BrandMark({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 40 40" width="40" height="40" fill="none" aria-hidden="true">
    <path d="M6 29V18h5v11m5 0V8h5v21m5 0V15h5v14M4 33h32" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M11 12c2-4 6-6 10-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>;
}
