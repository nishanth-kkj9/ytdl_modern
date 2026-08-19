interface LayoutProps {
  main: React.ReactNode;
}

export function Layout({ main }: LayoutProps) {
  return (
    <div className="flex min-h-screen bg-bg">
      <main id="main" className="min-w-0 flex-1">{main}</main>
    </div>
  );
}
