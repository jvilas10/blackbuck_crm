import Link from "next/link";
import type { ReactNode } from "react";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <>
      <a className="skip-link" href="#content">Skip to content</a>
      <div className="shell">
        <header className="sidebar">
          <Link className="brand" href="/">BlackBuck <span>CRM</span></Link>
          <nav aria-label="Main navigation">
            <Link className="nav-link" href="/" aria-current="page">Overview</Link>
          </nav>
        </header>
        <main id="content" tabIndex={-1}>{children}</main>
      </div>
    </>
  );
}

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
