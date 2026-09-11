'use client';

/**
 * MotionArcade — touchless AR arcade gaming platform
 * Copyright (C) 2025-2026 Kartik Hawelikar, Sam Alex, Shubham Bolave, and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { Gamepad2 } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '../ui/button';
import { Sheet, SheetContent, SheetTrigger } from '../ui/sheet';
import { Menu } from 'lucide-react';
import { useState } from 'react';

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/games', label: 'Games' },
  { href: '/about', label: 'About' },
  { href: '/debug', label: 'Debug' },
];

export function Header() {
  const pathname = usePathname();
  const [isSheetOpen, setSheetOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  const closeSheet = () => setSheetOpen(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center">
        <Link href="/" className="group mr-6 flex items-center space-x-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-foreground/85 bg-gradient-to-br from-primary to-teal-400 text-white shadow-[2px_2px_0_0_rgba(20,35,40,0.85)] transition-transform group-hover:animate-wiggle">
            <Gamepad2 className="h-5 w-5" />
          </span>
          <span className="hidden font-bold sm:inline-block font-headline text-xl tracking-tight">
            Motion<span className="text-gradient-brand">Arcade</span>
          </span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center space-x-1.5 text-sm font-bold">
          {navLinks.map(({ href, label }) => (
            <Link
              key={label}
              href={href}
              className={cn(
                'rounded-full px-4 py-1.5 transition-all',
                isActive(href)
                  ? 'border-2 border-foreground/85 bg-amber-200 text-foreground shadow-[2px_2px_0_0_rgba(20,35,40,0.85)]'
                  : 'text-foreground/60 hover:bg-muted hover:text-foreground'
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
        
        {/* Mobile Navigation */}
        <div className="flex md:hidden ml-auto">
          <Sheet open={isSheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu />
                <span className="sr-only">Open menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left">
              <div className="flex flex-col gap-6 pt-10">
                <Link href="/" className="flex items-center space-x-2.5" onClick={closeSheet}>
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-foreground/85 bg-gradient-to-br from-primary to-teal-400 text-white shadow-[2px_2px_0_0_rgba(20,35,40,0.85)]">
                    <Gamepad2 className="h-5 w-5" />
                  </span>
                  <span className="font-bold font-headline text-xl tracking-tight">
                    Motion<span className="text-gradient-brand">Arcade</span>
                  </span>
                </Link>
                <nav className="flex flex-col gap-2.5">
                  {navLinks.map(({ href, label }) => (
                    <Link
                      key={label}
                      href={href}
                      onClick={closeSheet}
                      className={cn(
                        'rounded-full px-4 py-2 text-lg font-bold transition-all',
                        isActive(href)
                          ? 'border-2 border-foreground/85 bg-amber-200 text-foreground shadow-[2px_2px_0_0_rgba(20,35,40,0.85)]'
                          : 'text-foreground/60 hover:bg-muted hover:text-foreground'
                      )}
                    >
                      {label}
                    </Link>
                  ))}
                </nav>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
