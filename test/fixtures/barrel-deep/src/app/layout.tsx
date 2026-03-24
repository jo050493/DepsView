// Next.js layout — should be excluded from orphan detection
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html><body>{children}</body></html>;
}
