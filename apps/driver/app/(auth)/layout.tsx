export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen max-w-[430px] mx-auto relative bg-background">
      {children}
    </div>
  )
}
