import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

export function AppShell() {
  const [mobileNav, setMobileNav] = useState(false)
  const location = useLocation()

  return (
    <div className="min-h-screen">
      <Sidebar mobileOpen={mobileNav} onClose={() => setMobileNav(false)} />
      <div className="lg:pl-[260px]">
        <Topbar onMenu={() => setMobileNav(true)} />
        <main key={location.pathname} className="animate-fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
