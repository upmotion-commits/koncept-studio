"use client"

import * as React from "react"
import { IconMoon, IconSun } from "@tabler/icons-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function ThemeToggle() {
  const { setTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="h-11 w-11" aria-label="Changer de thème">
          <IconSun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <IconMoon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Changer de thème</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function SimpleThemeToggle() {
  const { setTheme, theme } = useTheme()

  return (
    <Button
      variant="outline"
      size="icon"
      className="h-11 w-11"
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
    >
      <IconSun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <IconMoon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Changer de thème</span>
    </Button>
  )
}

export function SidebarThemeToggle() {
  const { setTheme, theme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  
  React.useEffect(() => {
    setMounted(true)
  }, [])
  
  const toggleTheme = () => {
    setTheme(theme === "light" ? "dark" : "light")
  }
  
  // Avoid hydration mismatch by not rendering theme-specific content until mounted
  if (!mounted) {
    return (
      <Button
        variant="ghost"
        className="flex items-center gap-3 w-full justify-start px-3 py-2 text-sm h-auto"
        disabled
      >
        <div className="h-4 w-4" /> {/* Placeholder to maintain layout */}
        <span>Thème</span>
      </Button>
    )
  }
  
  return (
    <Button
      variant="ghost"
      onClick={toggleTheme}
      className="flex items-center gap-3 w-full justify-start px-3 py-2 text-sm h-auto"
    >
      {theme === "light" ? (
        <>
          <IconSun className="h-4 w-4" />
          <span>Thème clair</span>
        </>
      ) : (
        <>
          <IconMoon className="h-4 w-4" />
          <span>Thème sombre</span>
        </>
      )}
    </Button>
  )
}